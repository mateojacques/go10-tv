import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

import pytest

import crawl_okru_albums as crawl
from crawl_okru_albums import Blocked, Crawler, Throttle, Transient, parse_albums, parse_stated

PROFILE = (
    '<a title="Shazzan HD" class="nav-side_i " href="/profile/573597292105/video/c55836233" hrefattrs="x">'
    '<a title="Pinky, Elvira y Cerebro" class="nav-side_i __ac" href="/profile/573597292105/video/c8584777">'
    '<a title="Shazzan HD" class="nav-side_i " href="/profile/573597292105/video/c55836233">'
)


def card(video_id, title="Ep"):
    return (f'<div class="video-card js-movie-card" data-id="{video_id}">'
            f'<a class="video-card_n ellip" title="{title} {video_id}"></a>'
            f'<div class="vid-card_duration">20:00</div>'
            f'<div class="video-card_info_i">1K</div></div>')


def album_page(ids, stated, cursor="111"):
    return (f'<div class="album-info_name textWrap">Show</div>'
            f'<div class="album-info-list_i">276&nbsp;подписчиков</div>'
            f'<div class="album-info-list_i">{stated} видео</div>'
            f'<div data-url="/video/c1?st.cmd=anonymVideo&amp;cmd=VideoAlbumBlock" '
            f'data-last-element="{cursor}">' + "".join(card(i) for i in ids) + "</div>")


class Clock:
    def __init__(self):
        self.now = 1_000_000.0
        self.slept = []

    def __call__(self):
        return self.now

    def sleep(self, seconds):
        self.slept.append(seconds)
        self.now += seconds


def make_throttle(clock, **state):
    return Throttle(state or None, hourly=300, clock=clock, sleep=clock.sleep, jitter=lambda: 1.0)


def test_parse_albums_dedupes_and_reads_profile():
    profile_id, albums = parse_albums(PROFILE)
    assert profile_id == "573597292105"
    assert albums == [{"album": "c55836233", "name": "Shazzan HD"},
                      {"album": "c8584777", "name": "Pinky, Elvira y Cerebro"}]


@pytest.mark.parametrize("text,count", [
    ('<div class="album-info-list_i">161 видео</div>', 161),
    ('<div class="album-info-list_i">0 видео</div>', 0),
    ('<div class="album-info-list_i">1&nbsp;234&nbsp;видео</div>', 1234),
    ('<div class="album-info-list_i">276&nbsp;подписчиков</div>', None),
])
def test_parse_stated(text, count):
    assert parse_stated(text) == count


def test_throttle_spaces_requests_by_delay():
    clock = Clock()
    throttle = make_throttle(clock)
    throttle.wait()
    clock.now += 1
    throttle.wait()
    assert clock.slept[-1] == pytest.approx(Throttle.START_DELAY - 1)


def test_throttle_respects_hourly_budget():
    clock = Clock()
    throttle = Throttle(None, hourly=3, clock=clock, sleep=clock.sleep, jitter=lambda: 0.0)
    for _ in range(3):
        throttle.wait()
    start = clock.now
    throttle.wait()
    assert clock.now - start > 3500


def test_throttle_speeds_up_after_clean_streak_and_slows_on_slow_responses():
    throttle = make_throttle(Clock())
    for _ in range(Throttle.CLEAN_STREAK):
        throttle.ok(1.0)
    assert throttle.state["delay"] == pytest.approx(Throttle.START_DELAY * 0.8)
    throttle.ok(Throttle.SLOW_SECONDS + 1)
    assert throttle.state["delay"] == pytest.approx(Throttle.START_DELAY * 0.8 * 1.5)


def test_throttle_recovers_faster_when_far_backed_off():
    throttle = make_throttle(Clock(), delay=60.0)
    for _ in range(5):
        throttle.ok(1.0)
    assert throttle.state["delay"] == pytest.approx(42.0)


def test_throttle_never_goes_below_floor():
    throttle = make_throttle(Clock(), delay=Throttle.MIN_DELAY)
    for _ in range(Throttle.CLEAN_STREAK * 5):
        throttle.ok(1.0)
    assert throttle.state["delay"] == Throttle.MIN_DELAY


def test_trip_cooldown_doubles_and_caps():
    throttle = make_throttle(Clock())
    cooldowns = [throttle.trip() for _ in range(6)]
    assert cooldowns[:4] == [1800, 3600, 7200, 14400]
    assert max(cooldowns) == Throttle.MAX_COOLDOWN


def test_wait_sleeps_through_cooldown():
    clock = Clock()
    throttle = make_throttle(clock)
    throttle.trip()
    throttle.wait()
    assert clock.slept[0] == 1800


class FakeServer:
    """Serves album page 1 by GET and later pages by POST, from a list of
    pages; a page may be an exception to raise instead.
    """

    def __init__(self, pages):
        self.pages = list(pages)
        self.calls = []

    def __call__(self, url, post=False):
        self.calls.append((url, post))
        page = self.pages.pop(0)
        if isinstance(page, Exception):
            raise page
        body, cursor = page
        return body, {"lastelem": cursor} if cursor else {}


def make_crawler(tmp_path, server, max_trips=3):
    clock = Clock()
    throttle = make_throttle(clock)
    return Crawler(str(tmp_path), throttle, request=server, log=lambda m: None, max_trips=max_trips)


def test_crawl_album_paginates_until_stated_count(tmp_path):
    server = FakeServer([
        (album_page(["1", "2"], stated=5), None),
        ("".join(card(i) for i in ["3", "4"]), "222"),
        (card("5"), "333"),
    ])
    crawler = make_crawler(tmp_path, server)
    used = crawler.crawl_album("c1", budget=10)
    record = crawler.load("albums", "c1")
    assert used == 3
    assert [v["video_id"] for v in record["videos"]] == ["1", "2", "3", "4", "5"]
    assert "short_by" not in record
    assert record["videos"][0]["duration_raw"] == "20:00"  # ok.ru's 2026-10 card markup
    assert "st.page=2&st.lastelem=111" in server.calls[1][0]
    assert "st.page=3&st.lastelem=222" in server.calls[2][0]
    assert not os.path.exists(crawler.path("partial", "c1"))


def test_crawl_album_records_shortfall_when_pages_run_dry(tmp_path):
    server = FakeServer([
        (album_page(["1", "2"], stated=4), None),
        (card("2"), "222"),  # nothing new
    ])
    crawler = make_crawler(tmp_path, server)
    crawler.crawl_album("c1", budget=10)
    assert crawler.load("albums", "c1")["short_by"] == 2


def test_crawl_album_empty_album_is_one_request(tmp_path):
    server = FakeServer([(album_page([], stated=0, cursor=""), None)])
    crawler = make_crawler(tmp_path, server)
    assert crawler.crawl_album("c1", budget=10) == 1
    assert crawler.load("albums", "c1")["videos"] == []


def test_crawl_album_resumes_mid_album_after_budget(tmp_path):
    pages = [
        (album_page(["1"], stated=3), None),
        (card("2"), "222"),
        (card("3"), "333"),
    ]
    crawler = make_crawler(tmp_path, FakeServer(pages[:2]))
    assert crawler.crawl_album("c1", budget=2) == 2
    assert crawler.load("albums", "c1") is None
    resumed = make_crawler(tmp_path, FakeServer(pages[2:]))
    assert resumed.crawl_album("c1", budget=10) == 1
    assert [v["video_id"] for v in resumed.load("albums", "c1")["videos"]] == ["1", "2", "3"]


def test_fetch_retries_transient_errors(tmp_path):
    server = FakeServer([Transient("timeout"), (album_page([], stated=0, cursor=""), None)])
    crawler = make_crawler(tmp_path, server)
    crawler.crawl_album("c1", budget=10)
    assert len(server.calls) == 2
    assert crawler.throttle.state["delay"] == Throttle.START_DELAY * 2


def test_block_cools_down_then_retries_same_request(tmp_path):
    server = FakeServer([Blocked("empty body"), (album_page([], stated=0, cursor=""), None)])
    crawler = make_crawler(tmp_path, server)
    crawler.crawl_album("c1", budget=10)
    assert server.calls[0] == server.calls[1]
    assert 1800 in crawler.throttle.sleep.__self__.slept


def test_three_transient_errors_in_a_row_count_as_a_block(tmp_path):
    server = FakeServer([Transient("a"), Transient("b"), Transient("c"),
                         (album_page([], stated=0, cursor=""), None)])
    crawler = make_crawler(tmp_path, server)
    crawler.crawl_album("c1", budget=10)
    assert crawler.throttle.state["trips"] == 1


def test_exits_after_max_trips(tmp_path):
    server = FakeServer([Blocked("x"), Blocked("y")])
    crawler = make_crawler(tmp_path, server, max_trips=2)
    with pytest.raises(SystemExit) as exit_info:
        crawler.crawl_album("c1", budget=10)
    assert exit_info.value.code == crawl.EXIT_TRIPPED
    assert crawler.load("", "throttle")["cooldown_until"] > 0
