"""Crawl every album (channel) of an ok.ru profile without tripping ok.ru's
rate limit, in resumable batches.

Run:
  python3 scripts/crawl_okru_albums.py crawl lacartoons-catalogo.html
  python3 scripts/crawl_okru_albums.py crawl lacartoons-catalogo.html --once
  python3 scripts/crawl_okru_albums.py sample lacartoons-catalogo.html
  python3 scripts/crawl_okru_albums.py status lacartoons-catalogo.html

The profile page is a browser save of the profile's video tab: its left
column lists every album. Albums are crawled one request at a time:

- Pacing: a jittered delay between requests (6s to start) that shrinks
  after every 15 clean requests and grows when responses slow down,
  under an hourly request budget.
- Batches: after --batch requests the crawler rests --rest minutes.
- Circuit breaker: a sign of blocking (an empty body, HTTP 403/429, a
  captcha) or three transient errors in a row stops all requests for a
  cooldown (30 min, doubling per trip, at most 4h); then one probe request
  must succeed before crawling resumes. After --max-trips trips it exits
  with status 75, for a human to look before going on.
- Resume: progress is saved after every page (albums/ and partial/ under
  the state dir), so a killed run, or the next batch, picks up mid-album.
- Completeness: an album is done when it has the "N видео" its page
  states, or when a further page adds nothing (recorded as `short_by`).

`sample` measures each finished album's first and last video in
the embed player (search_okru's `check`), under the same throttle. `status`
prints progress and sends no requests.

State lives in .cache/okru-crawl/<profile id>/ (gitignored).
"""
import argparse
import html
import json
import os
import random
import re
import socket
import sys
import time
import urllib.error
import urllib.request
from http.client import IncompleteRead

from search_okru import BASE_URL, USER_AGENT, parse_embed, parse_page

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
CACHE_DIR = os.path.join(ROOT, ".cache", "okru-crawl")

ALBUM_LINK_RE = re.compile(
    r'<a title="([^"]*)" class="nav-side_i[^"]*" href="/profile/(\d+)/video/(c\d+)"'
)
STATED_RE = re.compile(r'album-info-list_i">([^<]*?)\s*видео<')
DATA_URL_RE = re.compile(r'data-url="([^"]*VideoAlbumBlock[^"]*)"')
LAST_ELEMENT_RE = re.compile(r'data-last-element="([^"]*)"')

EXIT_TRIPPED = 75


class Blocked(Exception):
    """ok.ru is refusing us: stop everything and cool down."""


class Transient(Exception):
    """A request failed in a way worth retrying (timeout, cut-off body)."""


def parse_albums(profile_html):
    """A saved profile video tab -> (profile_id, [{"album", "name"}, ...])."""
    albums, seen, profile_id = [], set(), ""
    for name, profile, album in ALBUM_LINK_RE.findall(profile_html):
        profile_id = profile_id or profile
        if album not in seen:
            seen.add(album)
            albums.append({"album": album, "name": html.unescape(name)})
    return profile_id, albums


def parse_stated(page_html):
    """The "161 видео" an album page states, or None."""
    match = STATED_RE.search(page_html)
    if not match:
        return None
    digits = re.sub(r"\D", "", html.unescape(match.group(1)))
    return int(digits) if digits else None


class Throttle:
    """Paces requests and trips a circuit breaker; its state is plain JSON
    so it survives between runs.
    """

    START_DELAY = 6.0
    MIN_DELAY = 4.0
    MAX_DELAY = 60.0
    SLOW_SECONDS = 15.0
    CLEAN_STREAK = 15
    BASE_COOLDOWN = 30 * 60
    MAX_COOLDOWN = 4 * 60 * 60

    def __init__(self, state=None, hourly=300, clock=time.time, sleep=time.sleep, jitter=None):
        self.state = {
            "delay": self.START_DELAY, "streak": 0, "trips": 0,
            "cooldown_until": 0, "recent": [], "last": 0,
            **(state or {}),
        }
        self.hourly = hourly
        self.clock, self.sleep = clock, sleep
        self.jitter = jitter or (lambda: random.uniform(0.7, 1.3))

    def cooling_down(self):
        return max(0, self.state["cooldown_until"] - self.clock())

    def wait(self):
        """Sleep until the next request may go out."""
        remaining = self.cooling_down()
        if remaining:
            self.sleep(remaining)
        now = self.clock()
        recent = [t for t in self.state["recent"] if now - t < 3600]
        if len(recent) >= self.hourly:
            self.sleep(3600 - (now - recent[0]) + 1)
        gap = self.state["delay"] * self.jitter() - (self.clock() - self.state["last"])
        if gap > 0:
            self.sleep(gap)
        now = self.clock()
        self.state["recent"] = [t for t in recent if now - t < 3600] + [now]
        self.state["last"] = now

    def ok(self, elapsed):
        state = self.state
        if elapsed > self.SLOW_SECONDS:
            state["delay"] = min(self.MAX_DELAY, state["delay"] * 1.5)
            state["streak"] = 0
            return
        state["streak"] += 1
        # Far above the start, a short clean run is enough to come down:
        # at a 60s delay, 15 requests would be 15 minutes per step.
        backed_off = state["delay"] > 2 * self.START_DELAY
        if state["streak"] >= (5 if backed_off else self.CLEAN_STREAK):
            state["delay"] = max(self.MIN_DELAY, state["delay"] * (0.7 if backed_off else 0.8))
            state["streak"] = 0
            state["trips"] = 0

    def soft(self):
        self.state["delay"] = min(self.MAX_DELAY, self.state["delay"] * 2)
        self.state["streak"] = 0

    def trip(self):
        state = self.state
        state["trips"] += 1
        cooldown = min(self.MAX_COOLDOWN, self.BASE_COOLDOWN * 2 ** (state["trips"] - 1))
        state["cooldown_until"] = self.clock() + cooldown
        state["delay"] = max(state["delay"], self.START_DELAY * 2)
        state["streak"] = 0
        return cooldown


def http_request(url, post=False):
    """One request -> (body, headers). Raises Blocked or Transient."""
    request = urllib.request.Request(
        url,
        data=b"fetch=false" if post else None,
        headers={"User-Agent": USER_AGENT,
                 **({"Content-Type": "application/x-www-form-urlencoded"} if post else {})},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read().decode("utf-8", errors="replace")
            final_url, headers = response.geturl(), response.headers
    except urllib.error.HTTPError as error:
        if error.code in (403, 429):
            raise Blocked(f"HTTP {error.code}") from error
        raise Transient(f"HTTP {error.code}") from error
    except (IncompleteRead, socket.timeout, TimeoutError, ConnectionError, urllib.error.URLError) as error:
        raise Transient(repr(error)) from error
    if not body.strip():
        raise Blocked("empty body")
    if "captcha" in final_url.lower() or "anonymLogin" in final_url:
        raise Blocked(f"redirected to {final_url}")
    return body, headers


class Crawler:
    def __init__(self, state_dir, throttle, request=http_request, log=print, max_trips=3):
        self.state_dir = state_dir
        self.throttle = throttle
        self.request = request
        self.log = log
        self.max_trips = max_trips
        self.trips_this_run = 0
        self.requests = 0
        for sub in ("albums", "partial", "checks"):
            os.makedirs(os.path.join(state_dir, sub), exist_ok=True)

    # -- persistence -------------------------------------------------------

    def path(self, sub, name):
        return os.path.join(self.state_dir, sub, f"{name}.json")

    def load(self, sub, name):
        path = self.path(sub, name)
        if not os.path.exists(path):
            return None
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)

    def save(self, sub, name, data):
        path = self.path(sub, name)
        with open(path + ".tmp", "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False)
        os.replace(path + ".tmp", path)

    def save_throttle(self):
        self.save("", "throttle", self.throttle.state)

    # -- requests ----------------------------------------------------------

    def fetch(self, url, post=False):
        """One throttled request, retrying transient errors; on a block,
        cool down and retry it as the probe -- or exit after max_trips.
        """
        transient = 0
        while True:
            self.throttle.wait()
            started = time.time()
            try:
                body, headers = self.request(url, post)
            except Transient as error:
                transient += 1
                self.throttle.soft()
                self.log(f"  transient ({transient}/3): {error}; delay now {self.throttle.state['delay']:.0f}s")
                if transient < 3:
                    self.save_throttle()
                    continue
                error = Blocked(f"3 transient errors in a row ({error})")
                self.cool_down(error)
                transient = 0
                continue
            except Blocked as error:
                self.cool_down(error)
                continue
            finally:
                self.requests += 1
            self.throttle.ok(time.time() - started)
            self.save_throttle()
            return body, headers

    def cool_down(self, error):
        self.trips_this_run += 1
        cooldown = self.throttle.trip()
        self.save_throttle()
        if self.trips_this_run >= self.max_trips:
            self.log(f"BLOCKED ({error}); trip {self.trips_this_run} this run -- stopping. "
                     f"Cooldown until {time.ctime(self.throttle.state['cooldown_until'])}.")
            sys.exit(EXIT_TRIPPED)
        self.log(f"BLOCKED ({error}); cooling down {cooldown // 60:.0f} min "
                 f"(until {time.ctime(self.throttle.state['cooldown_until'])})")
        # The probe is the next request: fetch() retries the same URL once
        # the cooldown is over, and a block there trips again (doubling).

    # -- albums ------------------------------------------------------------

    def album_done(self, album):
        return self.load("albums", album) is not None

    def crawl_album(self, album, budget):
        """Fetch pages of `album` until it's complete or `budget` requests
        are spent. Returns the number of requests used.
        """
        used = 0
        partial = self.load("partial", album)
        if partial is None:
            body, _ = self.fetch(f"{BASE_URL}/video/{album}")
            used += 1
            page = parse_page(body, set(), "channel")
            data_url = DATA_URL_RE.search(body)
            cursor = LAST_ELEMENT_RE.search(body)
            partial = {
                "album": album,
                "name": page["channel_name"],
                "stated": parse_stated(body),
                "data_url": html.unescape(data_url.group(1)) if data_url else "",
                "cursor": cursor.group(1) if cursor else "",
                "page": 2,
                "videos": page["videos"],
            }
            self.save("partial", album, partial)

        while not self.finished(partial):
            if used >= budget:
                return used
            url = (f"{BASE_URL}{partial['data_url']}"
                   f"&st.page={partial['page']}&st.lastelem={partial['cursor']}")
            body, headers = self.fetch(url, post=True)
            used += 1
            known = {video["video_id"] for video in partial["videos"]}
            new = [v for v in parse_page(body, set(), "channel")["videos"] if v["video_id"] not in known]
            partial["videos"].extend(new)
            partial["page"] += 1
            partial["cursor"] = headers.get("lastelem") or ""
            if not new:
                partial["exhausted"] = True
            self.save("partial", album, partial)

        record = {key: partial[key] for key in ("album", "name", "stated", "videos")}
        stated = partial["stated"]
        if stated is not None and len(partial["videos"]) < stated:
            record["short_by"] = stated - len(partial["videos"])
        self.save("albums", album, record)
        os.remove(self.path("partial", album))
        return used

    @staticmethod
    def finished(partial):
        stated = partial["stated"]
        if stated is not None and len(partial["videos"]) >= stated:
            return True
        return bool(partial.get("exhausted")) or not partial["data_url"] or not partial["cursor"]

    def crawl(self, albums, batch, rest_minutes, once=False):
        todo = [a for a in albums if not self.album_done(a["album"])]
        self.log(f"{len(albums) - len(todo)}/{len(albums)} albums done, {len(todo)} to go")
        in_batch = 0
        for index, entry in enumerate(todo, 1):
            album = entry["album"]
            while not self.album_done(album):
                if in_batch >= batch:
                    if once:
                        self.log(f"batch of {batch} requests done; stopping (--once)")
                        return
                    self.log(f"batch of {batch} requests done; resting {rest_minutes} min")
                    time.sleep(rest_minutes * 60)
                    in_batch = 0
                in_batch += self.crawl_album(album, batch - in_batch)
            record = self.load("albums", album)
            short = f" (short by {record['short_by']})" if record.get("short_by") else ""
            self.log(f"[{index}/{len(todo)}] {album} {entry['name']}: "
                     f"{len(record['videos'])}/{record['stated']} videos{short}; "
                     f"delay {self.throttle.state['delay']:.1f}s, {self.requests} requests this run")

    # -- quality sampling ---------------------------------------------------

    def sample(self, albums, batch, rest_minutes, once=False):
        in_batch = 0
        for entry in albums:
            record = self.load("albums", entry["album"])
            if not record or not record["videos"]:
                continue
            videos = record["videos"]
            picks = {v["video_id"] for v in (videos[0], videos[-1])}
            results = []
            for video_id in sorted(picks):
                result = self.load("checks", video_id)
                if result is None:
                    if in_batch >= batch:
                        if once:
                            self.log(f"batch of {batch} requests done; stopping (--once)")
                            return
                        self.log(f"batch of {batch} requests done; resting {rest_minutes} min")
                        time.sleep(rest_minutes * 60)
                        in_batch = 0
                    body, _ = self.fetch(f"{BASE_URL}/videoembed/{video_id}")
                    in_batch += 1
                    result = {"video_id": video_id, **parse_embed(body)}
                    self.save("checks", video_id, result)
                results.append(result.get("resolution") or result.get("status"))
            self.log(f"{entry['album']} {entry['name']}: {results}")


def status(crawler, albums):
    done = [crawler.load("albums", a["album"]) for a in albums]
    done = [d for d in done if d]
    partial = [a for a in albums if crawler.load("partial", a["album"])]
    videos = sum(len(d["videos"]) for d in done)
    short = [d for d in done if d.get("short_by")]
    empty = [d for d in done if not d["videos"]]
    throttle = crawler.throttle
    print(f"albums: {len(done)}/{len(albums)} done, {len(partial)} in progress")
    print(f"videos: {videos} (empty albums: {len(empty)}, short albums: {len(short)})")
    for d in short:
        print(f"  short: {d['album']} {d['name']} {len(d['videos'])}/{d['stated']}")
    recent = [t for t in throttle.state["recent"] if time.time() - t < 3600]
    print(f"throttle: delay {throttle.state['delay']:.1f}s, {len(recent)} requests in the last hour, "
          f"trips {throttle.state['trips']}")
    if throttle.cooling_down():
        print(f"cooling down until {time.ctime(throttle.state['cooldown_until'])}")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["crawl", "sample", "status"])
    parser.add_argument("profile_html", help="saved profile video tab listing the albums")
    parser.add_argument("--batch", type=int, default=150, help="requests per batch (default 150)")
    parser.add_argument("--rest", type=float, default=15, help="minutes of rest between batches (default 15)")
    parser.add_argument("--hourly", type=int, default=300, help="max requests per rolling hour (default 300)")
    parser.add_argument("--max-trips", type=int, default=3, help="blocks per run before exiting (default 3)")
    parser.add_argument("--once", action="store_true", help="run one batch, then exit")
    args = parser.parse_args(argv)

    with open(args.profile_html, encoding="utf-8") as handle:
        profile_id, albums = parse_albums(handle.read())
    if not albums:
        sys.exit(f"no albums found in {args.profile_html}")
    state_dir = os.path.join(CACHE_DIR, profile_id)
    os.makedirs(state_dir, exist_ok=True)
    throttle_path = os.path.join(state_dir, "throttle.json")
    saved = json.load(open(throttle_path)) if os.path.exists(throttle_path) else None
    log = lambda message: print(f"{time.strftime('%H:%M:%S')} {message}", flush=True)
    crawler = Crawler(state_dir, Throttle(saved, hourly=args.hourly), log=log, max_trips=args.max_trips)

    if args.command == "status":
        status(crawler, albums)
    elif args.command == "crawl":
        crawler.crawl(albums, args.batch, args.rest, args.once)
    else:
        crawler.sample(albums, args.batch, args.rest, args.once)


if __name__ == "__main__":
    sys.exit(main())
