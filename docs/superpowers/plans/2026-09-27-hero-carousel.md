# Hero Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed Spidey hero on web and Android with an auto-advancing 5-slide carousel, picked at random per launch across five genre buckets, preferring titles with TMDB backdrop art.

**Architecture:** An offline Python script writes `apps/web/public/data/hero_art.json` (title key → TMDB backdrop). `@go10/core/hero/*` parses it, resolves art (local > TMDB > none) and picks the slides once per process. The web renders a `HeroCarousel` in `Home.tsx`; the mobile app loads the sidecar through `catalogStore` and renders its own `HeroCarousel` (phone pager / TV prop-swap) around the existing `Hero`.

**Tech Stack:** TypeScript, React 19, Vite + vitest + RTL (web, core), Expo / react-native-tvos + jest-expo + RNTL (mobile), Python 3 stdlib + pytest (script).

**Spec:** `docs/superpowers/specs/2026-09-27-hero-carousel-design.md` — read it before starting any task.

## Global Constraints

- Buckets, exactly and in this spelling: `Animación`, `Drama`, `Terror`, `Infantil`, `Anime`; a title qualifies by `genre` **or** `genre_secondary`.
- 5 slides max, one per bucket, no duplicate titles, `external` titles never picked.
- 8000 ms per slide (`SLIDE_MS = 8000`); any slide change restarts it; focus alone never pauses.
- TMDB image URLs: small `https://image.tmdb.org/t/p/w780<backdrop>`, large `https://image.tmdb.org/t/p/w1280<backdrop>`.
- Art precedence: `LOCAL_ART` (Spidey's webp pair) > TMDB > `null` (blurred thumbnail).
- Sidecar path `apps/web/public/data/hero_art.json`, shape `{ "schema_version": 1, "items": { "<key>": { "tmdb": "movie/123", "backdrop": "/abc.jpg" } } }`.
- Overrides path `data/hero_art_overrides.json`, shape `{ "pin": { "<key>": "tv/123" }, "block": ["<key>"] }`.
- Sidecar failure is never fatal on either app.
- Script: Python stdlib only; token from `TMDB_TOKEN`; tests never hit the network.
- Copy stays Spanish: `Destacado`, `Reproducir`, `Reanudar`, `Más información`, arrows `Anterior` / `Siguiente`, indicators `Ir a la diapositiva N`.
- Don't launch headless-browser checks; the user verifies web and phone manually. TV rendering is verified on hardware later.

## Review Focus

- **The catalog refreshes on mobile while Home is open** → the hero must keep its slides (only rows/strip change). Pinned in Task 6 (`buildHome` keeps the launch pick across a new `CatalogData`).
- **A slide's TMDB image 404s** → that slide falls back to the blurred layout; other slides are unaffected. Pinned in Task 4 (web `error` event) and Task 6 (`Hero` `onArtError`).
- **Remote user presses → on Más información repeatedly** → it cycles slides, wraps from last to first, focus stays on the same button. Pinned in Task 4 and Task 6 (`edgeStep`).
- **`hero_art.json` is an HTML fallback page (SPA 200)** → treated as `{}`, not a crash. Pinned in Task 2 (`parseHeroArt`) and Task 5 (store).
- **A catalog where no title matches any bucket** (e.g. tests, a trimmed catalog) → a single slide of `titles[0]`, no indicators, no timer. Pinned in Task 2 and Task 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/fetch_hero_art.py` (new) | TMDB matching, overrides, sidecar writer, report |
| `data/hero_art_overrides.json` (new) | hand-edited pins/blocks |
| `tests/test_fetch_hero_art.py` (new) | script tests with stubbed HTTP |
| `packages/core/src/hero/art.ts` (new) | `HeroArt`, `HeroArtIndex`, `LOCAL_ART`, `parseHeroArt`, `resolveArt` |
| `packages/core/src/hero/pickHero.ts` (new) | `HERO_BUCKETS`, `HeroSlide`, `pickHero`, `pickHeroOnce`, `resetHeroPickForTests` |
| `packages/core/src/featured.ts` (delete, Task 6) | superseded by `hero/art.ts` |
| `apps/web/src/catalog/useHeroArt.ts` (new) | fetch the sidecar once per page |
| `apps/web/src/screens/useCarousel.ts` (new) | index + timer + reduced motion + hidden-tab |
| `apps/web/src/screens/HeroCarousel.tsx` (new) | stages, stacked bodies, arrows, indicators, edge keys |
| `apps/web/src/screens/Home.tsx` / `Home.css` / `App.tsx` | wire it in |
| `apps/mobile/src/data/catalogStore.ts` | third resource `hero_art.json` |
| `apps/mobile/src/home/homeModel.ts` | `slides` instead of `featured`/`featuredArt` |
| `apps/mobile/src/components/HeroCarousel.tsx` (new) | phone pager, TV swap, timer, edge keys |
| `apps/mobile/src/components/heroEdge.ts` (new) | pure `edgeStep` for TV edge navigation |
| `apps/mobile/src/components/Hero.tsx` / `HomeView.tsx` | `onArtError`, focus reporting, render the carousel |

---

### Task 1: Offline TMDB art script

**Files:**
- Create: `scripts/fetch_hero_art.py`
- Create: `data/hero_art_overrides.json`
- Test: `tests/test_fetch_hero_art.py`

**Interfaces:**
- Produces: `apps/web/public/data/hero_art.json` in the Global Constraints shape (consumed by Tasks 2, 3, 5). Python functions `normalise(s) -> str`, `load_titles(csv_path) -> list[dict]` (dicts with `key`, `name`, `year` (int|None), `kind` ('movie'|'show')), `best_match(entry, results) -> dict|None`, `build_index(titles, get, overrides) -> (items, report)`, `write_index(path, items)`, `main(argv=None) -> int`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_fetch_hero_art.py
import csv
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

import fetch_hero_art as fha

FIELDS = ["catalog_index", "video_id", "type", "title", "series_id", "series_title", "year"]


def _csv(path, rows):
    with open(path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in FIELDS})


def test_normalise_strips_case_accents_and_punctuation():
    assert fha.normalise("  ¡Coraje, el Perro Cobarde!  ") == "coraje el perro cobarde"
    assert fha.normalise("Pokémon: La Película") == "pokemon la pelicula"


def test_load_titles_keys_like_build_titles(tmp_path):
    path = tmp_path / "catalog.csv"
    _csv(path, [
        {"video_id": "10", "type": "movie", "title": "Toy Story", "year": "1995"},
        {"video_id": "20", "type": "season", "series_id": "castlevania", "series_title": "Castlevania", "year": "2017"},
        {"video_id": "21", "type": "season", "series_id": "castlevania", "series_title": "Castlevania", "year": "2018"},
    ])
    titles = fha.load_titles(str(path))
    assert titles == [
        {"key": "10", "name": "Toy Story", "year": 1995, "kind": "movie"},
        {"key": "castlevania", "name": "Castlevania", "year": 2017, "kind": "show"},
    ]


def test_best_match_accepts_localized_or_original_title_and_prefers_closest_year():
    entry = {"key": "k", "name": "El Rey León", "year": 1994, "kind": "movie"}
    results = [
        {"id": 1, "title": "El rey león", "original_title": "The Lion King", "release_date": "2019-07-12", "backdrop_path": "/new.jpg"},
        {"id": 2, "title": "El Rey León", "original_title": "The Lion King", "release_date": "1994-06-23", "backdrop_path": "/old.jpg"},
        {"id": 3, "title": "Otra", "original_title": "Other", "release_date": "1994-01-01", "backdrop_path": "/x.jpg"},
    ]
    assert fha.best_match(entry, results)["id"] == 2
    by_original = {"key": "k", "name": "The Lion King", "year": None, "kind": "movie"}
    assert fha.best_match(by_original, results)["id"] == 1  # no year: TMDB's order


def test_best_match_ignores_results_without_a_backdrop_and_uses_tv_fields():
    entry = {"key": "k", "name": "Castlevania", "year": 2017, "kind": "show"}
    assert fha.best_match(entry, [{"id": 1, "name": "Castlevania", "first_air_date": "2017-07-07", "backdrop_path": None}]) is None
    assert fha.best_match(entry, [{"id": 2, "original_name": "Castlevania", "first_air_date": "2017-07-07", "backdrop_path": "/c.jpg"}])["id"] == 2


def _fake_get(responses):
    calls = []

    def get(path, params):
        calls.append((path, params))
        return responses[(path, params.get("query"))]

    get.calls = calls
    return get


def test_build_index_matches_pins_and_blocks():
    titles = [
        {"key": "10", "name": "Toy Story", "year": 1995, "kind": "movie"},
        {"key": "cast", "name": "Castlevania", "year": 2017, "kind": "show"},
        {"key": "zz", "name": "Nada", "year": None, "kind": "movie"},
        {"key": "blk", "name": "Toy Story", "year": 1995, "kind": "movie"},
    ]
    get = _fake_get({
        ("/search/movie", "Toy Story"): {"results": [{"id": 862, "title": "Toy Story", "release_date": "1995-11-22", "backdrop_path": "/toy.jpg"}]},
        ("/search/movie", "Nada"): {"results": []},
        ("/tv/999", None): {"id": 999, "backdrop_path": "/pinned.jpg"},
    })
    overrides = {"pin": {"cast": "tv/999"}, "block": ["blk"]}
    items, report = fha.build_index(titles, get, overrides)
    assert items == {
        "10": {"tmdb": "movie/862", "backdrop": "/toy.jpg"},
        "cast": {"tmdb": "tv/999", "backdrop": "/pinned.jpg"},
    }
    assert report["matched"] == 1 and report["pinned"] == 1 and report["blocked"] == 1
    assert report["unmatched"] == [("zz", "Nada")]
    # A pinned title is not searched; the search uses es-MX.
    assert all(path != "/search/tv" for path, _ in get.calls)
    assert all(params.get("language") == "es-MX" for path, params in get.calls if path.startswith("/search"))


def test_build_index_survives_a_network_error_on_one_title():
    titles = [{"key": "a", "name": "A", "year": None, "kind": "movie"}, {"key": "b", "name": "B", "year": None, "kind": "movie"}]

    def get(path, params):
        if params.get("query") == "A":
            raise OSError("boom")
        return {"results": [{"id": 5, "title": "B", "backdrop_path": "/b.jpg"}]}

    items, report = fha.build_index(titles, get, {"pin": {}, "block": []})
    assert items == {"b": {"tmdb": "movie/5", "backdrop": "/b.jpg"}}
    assert report["unmatched"] == [("a", "A")]


def test_build_index_warns_about_unknown_override_keys():
    _, report = fha.build_index([], _fake_get({}), {"pin": {"ghost": "movie/1"}, "block": ["ghost2"]})
    assert report["unknown_overrides"] == ["ghost", "ghost2"]


def test_write_index_is_sorted_and_versioned(tmp_path):
    path = tmp_path / "hero_art.json"
    fha.write_index(str(path), {"b": {"tmdb": "movie/2", "backdrop": "/b.jpg"}, "a": {"tmdb": "tv/1", "backdrop": "/a.jpg"}})
    text = path.read_text(encoding="utf-8")
    data = json.loads(text)
    assert data["schema_version"] == 1
    assert list(data["items"]) == ["a", "b"]
    assert text.endswith("\n")


def test_main_without_a_token_exits_1_and_writes_nothing(tmp_path, monkeypatch, capsys):
    monkeypatch.delenv("TMDB_TOKEN", raising=False)
    out = tmp_path / "hero_art.json"
    assert fha.main(["--output", str(out)]) == 1
    assert not out.exists()
    assert "TMDB_TOKEN" in capsys.readouterr().err
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_fetch_hero_art.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'fetch_hero_art'`

- [ ] **Step 3: Write the implementation**

```python
# scripts/fetch_hero_art.py
"""Match catalog titles to TMDB backdrops for the Home hero carousel.

Writes apps/web/public/data/hero_art.json (title key -> TMDB backdrop). Run by
hand when the catalog changes, with TMDB_TOKEN set to a TMDB v4 read access
token; the output is committed. Hand fixes go in data/hero_art_overrides.json:
{"pin": {"<key>": "tv/123"}, "block": ["<key>"]}.
"""
import argparse
import csv
import json
import os
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

from parse_catalog import ROOT

CATALOG_CSV = os.path.join(ROOT, "apps", "web", "public", "data", "catalog.csv")
OUTPUT_JSON = os.path.join(ROOT, "apps", "web", "public", "data", "hero_art.json")
OVERRIDES_JSON = os.path.join(ROOT, "data", "hero_art_overrides.json")
API = "https://api.themoviedb.org/3"


def normalise(text):
    decomposed = unicodedata.normalize("NFKD", text or "")
    kept = "".join(c for c in decomposed if not unicodedata.combining(c))
    cleaned = "".join(c if c.isalnum() else " " for c in kept.lower())
    return " ".join(cleaned.split())


def load_titles(csv_path):
    """One entry per title, keyed like buildTitles (series_id or video_id), in catalog order."""
    seen = {}
    with open(csv_path, encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            key = row.get("series_id") or row["video_id"]
            if key in seen:
                continue
            is_show = bool(row.get("series_id"))
            year = row.get("year") or ""
            seen[key] = {
                "key": key,
                "name": row["series_title"] if is_show else row["title"],
                "year": int(year) if year.isdigit() else None,
                "kind": "show" if is_show else "movie",
            }
    return list(seen.values())


def _year(result):
    date = result.get("release_date") or result.get("first_air_date") or ""
    return int(date[:4]) if date[:4].isdigit() else None


def best_match(entry, results):
    wanted = normalise(entry["name"])
    matches = [
        r for r in results
        if r.get("backdrop_path")
        and wanted in {normalise(r.get(f, "")) for f in ("title", "original_title", "name", "original_name")}
    ]
    if not matches:
        return None
    if entry["year"] is None:
        return matches[0]
    # sorted() is stable: equal distances keep TMDB's order.
    return sorted(matches, key=lambda r: abs((_year(r) or 9999) - entry["year"]))[0]


def build_index(titles, get, overrides):
    pins = overrides.get("pin", {})
    blocks = set(overrides.get("block", []))
    known = {t["key"] for t in titles}
    items = {}
    report = {"matched": 0, "pinned": 0, "blocked": 0, "unmatched": [],
              "unknown_overrides": sorted((set(pins) | blocks) - known)}
    for entry in titles:
        key = entry["key"]
        if key in blocks:
            report["blocked"] += 1
            continue
        try:
            if key in pins:
                detail = get(f"/{pins[key]}", {})
                if detail.get("backdrop_path"):
                    items[key] = {"tmdb": pins[key], "backdrop": detail["backdrop_path"]}
                    report["pinned"] += 1
                    continue
            else:
                media = "movie" if entry["kind"] == "movie" else "tv"
                found = get(f"/search/{media}", {"query": entry["name"], "language": "es-MX", "include_adult": "false"})
                match = best_match(entry, found.get("results", []))
                if match:
                    items[key] = {"tmdb": f"{media}/{match['id']}", "backdrop": match["backdrop_path"]}
                    report["matched"] += 1
                    continue
        except (OSError, ValueError):
            pass  # network or JSON trouble on one title: report it, keep going
        report["unmatched"].append((key, entry["name"]))
    return items, report


def write_index(path, items):
    data = {"schema_version": 1, "items": {k: items[k] for k in sorted(items)}}
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def tmdb_getter(token):
    def get(path, params):
        url = API + path + ("?" + urllib.parse.urlencode(params) if params else "")
        request = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
        for attempt in (1, 2):
            try:
                with urllib.request.urlopen(request, timeout=20) as response:
                    return json.load(response)
            except urllib.error.HTTPError as error:
                if error.code == 429 and attempt == 1:
                    time.sleep(float(error.headers.get("Retry-After", "2")))
                    continue
                raise
    return get


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--catalog", default=CATALOG_CSV)
    parser.add_argument("--output", default=OUTPUT_JSON)
    parser.add_argument("--overrides", default=OVERRIDES_JSON)
    args = parser.parse_args(argv)

    token = os.environ.get("TMDB_TOKEN")
    if not token:
        print("TMDB_TOKEN is not set (TMDB v4 read access token).", file=sys.stderr)
        return 1
    overrides = {"pin": {}, "block": []}
    if os.path.exists(args.overrides):
        with open(args.overrides, encoding="utf-8") as handle:
            overrides = json.load(handle)

    items, report = build_index(load_titles(args.catalog), tmdb_getter(token), overrides)
    write_index(args.output, items)

    print(f"matched {report['matched']} · pinned {report['pinned']} · blocked {report['blocked']} · unmatched {len(report['unmatched'])}")
    for key, name in report["unmatched"]:
        print(f"  unmatched  {key}  {name}")
    for key in report["unknown_overrides"]:
        print(f"  warning: override for unknown key {key}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

```json
// data/hero_art_overrides.json  (write without this comment line)
{
  "pin": {},
  "block": []
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_fetch_hero_art.py -v`
Expected: all PASS. Then `pytest` (whole suite) — PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch_hero_art.py data/hero_art_overrides.json tests/test_fetch_hero_art.py
git commit -m "feat(hero): offline TMDB backdrop matcher for the hero carousel"
```

The real run (`TMDB_TOKEN=… python3 scripts/fetch_hero_art.py`) is done by the user locally — TMDB may be unreachable from the agent sandbox. Until then no `hero_art.json` exists and both apps fall back to `{}` by design.

---

### Task 2: Core — art resolution and slide picking

**Files:**
- Create: `packages/core/src/hero/art.ts`
- Create: `packages/core/src/hero/pickHero.ts`
- Test: `packages/core/src/hero/art.test.ts`, `packages/core/src/hero/pickHero.test.ts`

**Interfaces:**
- Produces (used by Tasks 3–6):
  - `art.ts`: `interface HeroArt { small: string; large: string }`, `type HeroArtIndex = Record<string, { tmdb: string; backdrop: string }>`, `const LOCAL_ART: Record<string, HeroArt>`, `parseHeroArt(json: string): HeroArtIndex | null`, `resolveArt(key: string, index: HeroArtIndex): HeroArt | null`
  - `pickHero.ts`: `const HERO_BUCKETS`, `interface HeroSlide { title: Title; art: HeroArt | null }`, `pickHero(titles: Title[], index: HeroArtIndex, random?: () => number): HeroSlide[]`, `pickHeroOnce(titles: Title[], index: HeroArtIndex): HeroSlide[]`, `resetHeroPickForTests(): void`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/src/hero/art.test.ts
import { describe, it, expect } from 'vitest'
import { LOCAL_ART, parseHeroArt, resolveArt } from './art'

const SPIDEY = 'spidey-y-sus-sorprendentes-amigos'

describe('parseHeroArt', () => {
  it('reads a schema-1 sidecar', () => {
    const json = JSON.stringify({ schema_version: 1, items: { a: { tmdb: 'movie/1', backdrop: '/a.jpg' } } })
    expect(parseHeroArt(json)).toEqual({ a: { tmdb: 'movie/1', backdrop: '/a.jpg' } })
  })

  it('drops entries without a usable backdrop', () => {
    const json = JSON.stringify({ schema_version: 1, items: { a: { tmdb: 'movie/1', backdrop: '' }, b: { tmdb: 'tv/2' }, c: null, d: { tmdb: 'tv/3', backdrop: '/d.jpg' } } })
    expect(parseHeroArt(json)).toEqual({ d: { tmdb: 'tv/3', backdrop: '/d.jpg' } })
  })

  it('is null for anything that is not the sidecar', () => {
    expect(parseHeroArt('<!doctype html><html></html>')).toBeNull()
    expect(parseHeroArt('')).toBeNull()
    expect(parseHeroArt('[]')).toBeNull()
    expect(parseHeroArt(JSON.stringify({ schema_version: 2, items: {} }))).toBeNull()
    expect(parseHeroArt(JSON.stringify({ schema_version: 1, items: [] }))).toBeNull()
  })
})

describe('resolveArt', () => {
  const index = { a: { tmdb: 'movie/1', backdrop: '/a.jpg' }, [SPIDEY]: { tmdb: 'tv/9', backdrop: '/s.jpg' } }

  it('prefers local key art over TMDB', () => {
    expect(resolveArt(SPIDEY, index)).toBe(LOCAL_ART[SPIDEY])
    expect(LOCAL_ART[SPIDEY].large).toBe('assets/spidey/spidey-hero-1920.webp')
  })

  it('builds TMDB w780 / w1280 URLs', () => {
    expect(resolveArt('a', index)).toEqual({
      small: 'https://image.tmdb.org/t/p/w780/a.jpg',
      large: 'https://image.tmdb.org/t/p/w1280/a.jpg',
    })
  })

  it('is null without art', () => {
    expect(resolveArt('nope', index)).toBeNull()
  })
})
```

```ts
// packages/core/src/hero/pickHero.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { Title } from '../types'
import { HERO_BUCKETS, pickHero, pickHeroOnce, resetHeroPickForTests } from './pickHero'

function title(key: string, genre: string, genre_secondary = '', extra: Partial<Title> = {}): Title {
  return {
    key, kind: 'movie', title: key, year: null, studio: '', source: '', genre, genre_secondary,
    quality: '', language: '', subtitled: false, thumbnail: `catalogo_files/${key}.webp`, views: 0,
    durationSeconds: 0, catalogIndex: 0, seasons: [], ...extra,
  }
}

/** mulberry32: a deterministic `random` for tests. */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const art = (...keys: string[]) => Object.fromEntries(keys.map((k) => [k, { tmdb: `movie/${k}`, backdrop: `/${k}.jpg` }]))

const CATALOG = [
  title('ani1', 'Animación'), title('ani2', 'Animación'),
  title('dra1', 'Drama'), title('dra2', 'Comedia', 'Drama'),
  title('ter1', 'Terror'),
  title('inf1', 'Animación', 'Infantil'),
  title('anm1', 'Anime'), title('anm2', 'Anime'),
]

describe('pickHero', () => {
  it('picks one title per bucket, without duplicates', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const slides = pickHero(CATALOG, {}, seeded(seed))
      const keys = slides.map((s) => s.title.key)
      expect(new Set(keys).size).toBe(keys.length)
      expect(slides).toHaveLength(HERO_BUCKETS.length)
    }
  })

  it('counts the secondary genre', () => {
    const slides = pickHero([title('x', 'Comedia', 'Terror')], {}, seeded(1))
    expect(slides.map((s) => s.title.key)).toEqual(['x'])
  })

  it('prefers titles with art in every bucket', () => {
    const index = art('ani2', 'dra2', 'anm1')
    for (let seed = 1; seed <= 50; seed++) {
      const keys = pickHero(CATALOG, index, seeded(seed)).map((s) => s.title.key)
      expect(keys).toEqual(expect.arrayContaining(['ani2', 'dra2', 'anm1']))
      expect(keys).not.toContain('ani1')
      expect(keys).not.toContain('anm2')
    }
  })

  it('falls back to a title without art when a bucket has none, with art null', () => {
    const slide = pickHero(CATALOG, {}, seeded(3)).find((s) => s.title.key === 'ter1')
    expect(slide).toEqual({ title: expect.objectContaining({ key: 'ter1' }), art: null })
  })

  it('carries the resolved art', () => {
    const slide = pickHero([title('ter1', 'Terror')], art('ter1'), seeded(1))[0]
    expect(slide.art).toEqual({ small: 'https://image.tmdb.org/t/p/w780/ter1.jpg', large: 'https://image.tmdb.org/t/p/w1280/ter1.jpg' })
  })

  it('skips empty buckets and never picks external titles', () => {
    const slides = pickHero([title('d', 'Drama'), title('ext', 'Terror', '', { external: true })], {}, seeded(1))
    expect(slides.map((s) => s.title.key)).toEqual(['d'])
  })

  it('shuffles the bucket order', () => {
    const orders = new Set(Array.from({ length: 30 }, (_, i) => pickHero(CATALOG, {}, seeded(i + 1)).map((s) => s.title.genre + s.title.genre_secondary).join('|')))
    expect(orders.size).toBeGreaterThan(1)
  })

  it('falls back to the first title when nothing matches a bucket', () => {
    expect(pickHero([title('a', 'Comedia'), title('b', '')], {}, seeded(1)).map((s) => s.title.key)).toEqual(['a'])
  })

  it('is empty for an empty catalog', () => {
    expect(pickHero([], {})).toEqual([])
  })
})

describe('pickHeroOnce', () => {
  beforeEach(() => resetHeroPickForTests())

  it('keeps the first pick for the process', () => {
    const first = pickHeroOnce(CATALOG, {})
    expect(pickHeroOnce([title('other', 'Drama')], art('other'))).toBe(first)
  })

  it('does not lock in an empty catalog', () => {
    expect(pickHeroOnce([], {})).toEqual([])
    expect(pickHeroOnce([title('d', 'Drama')], {}).map((s) => s.title.key)).toEqual(['d'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @go10/core -- src/hero`
Expected: FAIL — cannot resolve `./art` / `./pickHero`

- [ ] **Step 3: Write the implementation**

```ts
// packages/core/src/hero/art.ts
/**
 * Hero art: local key art (full resolution, hand-made) beats a TMDB backdrop
 * (from the offline sidecar, scripts/fetch_hero_art.py), which beats none —
 * the blurred-thumbnail hero. Catalog thumbnails are only 368x210.
 */

export interface HeroArt { small: string; large: string }

/** apps/web/public/data/hero_art.json → items. */
export type HeroArtIndex = Record<string, { tmdb: string; backdrop: string }>

export const LOCAL_ART: Record<string, HeroArt> = {
  'spidey-y-sus-sorprendentes-amigos': {
    small: 'assets/spidey/spidey-hero-960.webp',
    large: 'assets/spidey/spidey-hero-1920.webp',
  },
}

const TMDB_IMAGES = 'https://image.tmdb.org/t/p'

/** The sidecar's items, or null for anything that isn't one (an HTML fallback page, a truncated download). */
export function parseHeroArt(json: string): HeroArtIndex | null {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const { schema_version, items } = raw as { schema_version?: unknown; items?: unknown }
  if (schema_version !== 1 || typeof items !== 'object' || items === null || Array.isArray(items)) return null
  const index: HeroArtIndex = {}
  for (const [key, entry] of Object.entries(items)) {
    const { tmdb, backdrop } = (entry ?? {}) as { tmdb?: unknown; backdrop?: unknown }
    if (typeof backdrop === 'string' && backdrop !== '' && typeof tmdb === 'string') index[key] = { tmdb, backdrop }
  }
  return index
}

export function resolveArt(key: string, index: HeroArtIndex): HeroArt | null {
  const local = LOCAL_ART[key]
  if (local) return local
  const entry = index[key]
  return entry ? { small: `${TMDB_IMAGES}/w780${entry.backdrop}`, large: `${TMDB_IMAGES}/w1280${entry.backdrop}` } : null
}
```

```ts
// packages/core/src/hero/pickHero.ts
import type { Title } from '../types'
import { resolveArt, type HeroArt, type HeroArtIndex } from './art'

/** How the hero spreads across the catalog. Never shown to the user. */
export const HERO_BUCKETS = ['Animación', 'Drama', 'Terror', 'Infantil', 'Anime'] as const

export interface HeroSlide { title: Title; art: HeroArt | null }

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

/**
 * One random title per bucket (by genre or genre_secondary), in shuffled
 * bucket order, preferring titles that have art. With no bucket matched, the
 * first title alone, so an odd catalog still has a hero.
 */
export function pickHero(titles: Title[], index: HeroArtIndex, random: () => number = Math.random): HeroSlide[] {
  const picked = new Set<string>()
  const slides: HeroSlide[] = []
  for (const bucket of shuffle([...HERO_BUCKETS], random)) {
    const candidates = titles.filter(
      (t) => !t.external && !picked.has(t.key) && (t.genre === bucket || t.genre_secondary === bucket),
    )
    if (candidates.length === 0) continue
    const withArt = candidates.filter((t) => resolveArt(t.key, index) !== null)
    const pool = withArt.length > 0 ? withArt : candidates
    const choice = pool[Math.floor(random() * pool.length)]
    picked.add(choice.key)
    slides.push({ title: choice, art: resolveArt(choice.key, index) })
  }
  if (slides.length === 0 && titles[0]) return [{ title: titles[0], art: resolveArt(titles[0].key, index) }]
  return slides
}

let launchPick: HeroSlide[] | null = null

/** The pick for this launch: made on the first call with titles, then fixed, so Home never reshuffles mid-session. */
export function pickHeroOnce(titles: Title[], index: HeroArtIndex): HeroSlide[] {
  if (launchPick === null && titles.length > 0) launchPick = pickHero(titles, index)
  return launchPick ?? []
}

export function resetHeroPickForTests(): void {
  launchPick = null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @go10/core -- src/hero` then `npm run typecheck -w @go10/core`
Expected: PASS (the existing `noPlatformGlobals` test must still pass — nothing here touches `window`/`fetch`).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/hero
git commit -m "feat(core): hero art resolution and genre-bucket slide picker"
```

---

### Task 3: Web — load the sidecar and the launch pick

**Files:**
- Create: `apps/web/src/catalog/useHeroArt.ts`
- Test: `apps/web/src/catalog/useHeroArt.test.ts`
- Modify: `apps/web/src/test/setup.ts` (reset module state before each test)

**Interfaces:**
- Consumes: `parseHeroArt`, `HeroArtIndex` (Task 2), `resetHeroPickForTests` (Task 2).
- Produces: `useHeroArt(): HeroArtIndex | null` (`null` = still loading), `resetHeroArtForTests(): void`. Task 4 calls `useHeroArt()` in `App.tsx`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/catalog/useHeroArt.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useHeroArt } from './useHeroArt'

afterEach(() => vi.unstubAllGlobals())

const SIDECAR = JSON.stringify({ schema_version: 1, items: { a: { tmdb: 'movie/1', backdrop: '/a.jpg' } } })

describe('useHeroArt', () => {
  it('is null while loading, then the index', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(SIDECAR) }))
    const { result } = renderHook(() => useHeroArt())
    expect(result.current).toBeNull()
    await waitFor(() => expect(result.current).toEqual({ a: { tmdb: 'movie/1', backdrop: '/a.jpg' } }))
    expect(fetch).toHaveBeenCalledWith('/data/hero_art.json')
  })

  it.each([
    ['a 404', () => Promise.resolve({ ok: false, text: () => Promise.resolve('') })],
    ['an HTML fallback page', () => Promise.resolve({ ok: true, text: () => Promise.resolve('<!doctype html>') })],
    ['a network error', () => Promise.reject(new Error('offline'))],
  ])('settles to {} on %s', async (_, response) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(response))
    const { result } = renderHook(() => useHeroArt())
    await waitFor(() => expect(result.current).toEqual({}))
  })

  it('fetches once per page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(SIDECAR) }))
    const first = renderHook(() => useHeroArt())
    await waitFor(() => expect(first.result.current).not.toBeNull())
    const second = renderHook(() => useHeroArt())
    expect(second.result.current).not.toBeNull() // already settled: no loading flash on remount
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w @go10/web -- src/catalog/useHeroArt`
Expected: FAIL — cannot resolve `./useHeroArt`

- [ ] **Step 3: Implement, and reset module state in the test setup**

```ts
// apps/web/src/catalog/useHeroArt.ts
import { useEffect, useState } from 'react'
import { parseHeroArt, type HeroArtIndex } from '@go10/core/hero/art'

// One request per page load; every Home mount after it reads the settled value.
let request: Promise<HeroArtIndex> | null = null
let settled: HeroArtIndex | null = null

function load(): Promise<HeroArtIndex> {
  request ??= fetch('/data/hero_art.json')
    .then((response) => (response.ok ? response.text() : ''))
    .then((text) => parseHeroArt(text) ?? {})
    .catch(() => ({}))
    .then((index) => (settled = index))
  return request
}

/** The hero art sidecar; null until the request settles, `{}` if it failed. Never fatal. */
export function useHeroArt(): HeroArtIndex | null {
  const [index, setIndex] = useState<HeroArtIndex | null>(settled)
  useEffect(() => {
    if (index) return
    let cancelled = false
    void load().then((value) => {
      if (!cancelled) setIndex(value)
    })
    return () => {
      cancelled = true
    }
  }, [index])
  return index
}

export function resetHeroArtForTests(): void {
  request = null
  settled = null
}
```

Append to `apps/web/src/test/setup.ts`:

```ts
import { resetHeroPickForTests } from '@go10/core/hero/pickHero'
import { resetHeroArtForTests } from '../catalog/useHeroArt'

// The hero pick and its sidecar are per page load; each test is a fresh page.
beforeEach(() => {
  resetHeroPickForTests()
  resetHeroArtForTests()
})
```

(Place the imports at the top of the file with the existing ones.)

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w @go10/web -- src/catalog/useHeroArt` then `npm test -w @go10/web`
Expected: PASS, whole web suite still green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/catalog/useHeroArt.ts apps/web/src/catalog/useHeroArt.test.ts apps/web/src/test/setup.ts
git commit -m "feat(web): load the hero art sidecar once per page"
```

---

### Task 4: Web — the carousel

**Files:**
- Create: `apps/web/src/screens/useCarousel.ts`
- Create: `apps/web/src/screens/HeroCarousel.tsx`
- Test: `apps/web/src/screens/HeroCarousel.test.tsx`
- Modify: `apps/web/src/screens/Home.tsx` (hero block → `<HeroCarousel>`; new `heroArt` prop; drop `featured` imports)
- Modify: `apps/web/src/screens/Home.css` (carousel rules)
- Modify: `apps/web/src/App.tsx` (call `useHeroArt()`, pass `heroArt` to `Home`)
- Modify: `apps/web/src/screens/Home.test.tsx` (pass `heroArt={{}}`)

**Interfaces:**
- Consumes: `pickHeroOnce`, `HeroSlide` (Task 2), `useHeroArt` (Task 3), existing `useFocusable`, `Backdrop`, `ProgressBar`, `heroMeta`, `imageSrc`, `titleProgress`, `listProgress`, `playedFraction`, `rowLabel`, `remainingLabel`.
- Produces: `SLIDE_MS = 8000`; `useCarousel(count: number, paused: boolean): { index: number; go: (to: number) => void; reduced: boolean }`; `HeroCarousel({ slides, onPlay, onInfo })` where `onPlay: (title: Title, row: CatalogRow) => void`, `onInfo: (title: Title) => void`; `Home` gains prop `heroArt: HeroArtIndex | null`.

- [ ] **Step 1: Write the failing carousel tests**

```tsx
// apps/web/src/screens/HeroCarousel.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { FocusProvider } from '../focus/FocusProvider'
import type { CatalogRow, Title } from '@go10/core/types'
import type { HeroSlide } from '@go10/core/hero/pickHero'
import { HeroCarousel } from './HeroCarousel'
import { SLIDE_MS } from './useCarousel'

function title(key: string): Title {
  const row = { video_id: `${key}1`, chapter_start_seconds: null, episode_number: null } as CatalogRow
  return {
    key, kind: 'movie', title: `Título ${key}`, year: 2001, studio: '', source: '', genre: 'Drama', genre_secondary: '',
    quality: '', language: '', subtitled: false, thumbnail: `catalogo_files/${key}.webp`, views: 0,
    durationSeconds: 0, catalogIndex: 0, seasons: [row],
  }
}
const ART = { small: 'https://image.tmdb.org/t/p/w780/a.jpg', large: 'https://image.tmdb.org/t/p/w1280/a.jpg' }
const SLIDES: HeroSlide[] = [{ title: title('a'), art: ART }, { title: title('b'), art: null }, { title: title('c'), art: ART }]

function renderCarousel(slides = SLIDES, handlers = { onPlay: vi.fn(), onInfo: vi.fn() }) {
  render(
    <FocusProvider onBack={() => {}}>
      <HeroCarousel slides={slides} {...handlers} />
    </FocusProvider>,
  )
  return handlers
}
const current = () => screen.getByRole('heading', { level: 1, hidden: false }).textContent
const press = (key: string) => fireEvent.keyDown(window, { key })
const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('HeroCarousel', () => {
  it('advances every 8 s and wraps', () => {
    renderCarousel()
    expect(current()).toBe('Título a')
    tick(SLIDE_MS - 1)
    expect(current()).toBe('Título a')
    tick(1)
    expect(current()).toBe('Título b')
    tick(SLIDE_MS * 2)
    expect(current()).toBe('Título a')
  })

  it('pauses while hovered and restarts the slide on leave', () => {
    renderCarousel()
    const hero = document.querySelector('.go-hero')!
    fireEvent.pointerEnter(hero)
    tick(SLIDE_MS * 3)
    expect(current()).toBe('Título a')
    fireEvent.pointerLeave(hero)
    tick(SLIDE_MS - 1)
    expect(current()).toBe('Título a')
    tick(1)
    expect(current()).toBe('Título b')
  })

  it('does not advance with reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), addEventListener() {}, removeEventListener() {} }))
    try {
      renderCarousel()
      tick(SLIDE_MS * 3)
      expect(current()).toBe('Título a')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('jumps from the indicators and the arrows', () => {
    renderCarousel()
    fireEvent.click(screen.getByRole('button', { name: 'Ir a la diapositiva 3' }))
    expect(current()).toBe('Título c')
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(current()).toBe('Título a')
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(current()).toBe('Título c')
  })

  it('changes slide with ← on Reproducir and → on Más información, keeping focus', () => {
    renderCarousel()
    const focused = () => document.querySelector('[data-focused="true"]')?.textContent
    expect(focused()).toMatch(/Reproducir/)
    press('ArrowLeft')
    expect(current()).toBe('Título c')
    expect(focused()).toMatch(/Reproducir/)
    press('ArrowRight') // Reproducir → Más información: a focus move, not a slide change
    expect(current()).toBe('Título c')
    expect(focused()).toMatch(/Más información/)
    press('ArrowRight')
    expect(current()).toBe('Título a')
    expect(focused()).toMatch(/Más información/)
  })

  it('a slide change restarts the 8 s', () => {
    renderCarousel()
    tick(SLIDE_MS - 1000)
    press('ArrowRight')
    press('ArrowRight') // → slide b
    tick(SLIDE_MS - 1)
    expect(current()).toBe('Título b')
  })

  it('acts on the visible slide', () => {
    const handlers = renderCarousel()
    tick(SLIDE_MS)
    press('Enter') // Reproducir holds focus
    expect(handlers.onPlay).toHaveBeenCalledWith(expect.objectContaining({ key: 'b' }), expect.objectContaining({ video_id: 'b1' }))
  })

  it('falls back to the blurred layout when a slide art fails to load', () => {
    renderCarousel()
    const art = '.go-hero_stage.is-active .go-hero_frame:not(.go-hero_frame--thumb) .go-hero_key'
    fireEvent.error(document.querySelector(art)!)
    expect(document.querySelector(art)).toBeNull()
    expect(document.querySelector('.go-hero_stage.is-active .go-backdrop')).not.toBeNull()
    expect(document.querySelector('.go-hero')!.classList.contains('has-art')).toBe(false)
  })

  it('shows one slide with no indicators, arrows or timer', () => {
    renderCarousel([SLIDES[0]])
    expect(screen.queryByRole('button', { name: /Ir a la diapositiva/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Siguiente' })).toBeNull()
    tick(SLIDE_MS * 2)
    expect(current()).toBe('Título a')
  })
})
```

Note: inactive slide bodies are `visibility: hidden` + `aria-hidden`, so `getByRole('heading', { level: 1 })` only finds the active one — `hidden: false` is RTL's default, spelled out for readers.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w @go10/web -- src/screens/HeroCarousel`
Expected: FAIL — cannot resolve `./HeroCarousel`

- [ ] **Step 3: Implement `useCarousel`**

```ts
// apps/web/src/screens/useCarousel.ts
import { useCallback, useEffect, useState } from 'react'

export const SLIDE_MS = 8000

function reducedMotion(): boolean {
  // jsdom has no matchMedia.
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * The visible slide. Advances every SLIDE_MS unless paused, reduced motion is
 * on, or the tab is hidden; any change of slide restarts the wait.
 */
export function useCarousel(count: number, paused: boolean) {
  const [index, setIndex] = useState(0)
  const [reduced] = useState(reducedMotion)
  const [hidden, setHidden] = useState(() => document.hidden)

  useEffect(() => {
    const onChange = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  useEffect(() => {
    if (count < 2 || paused || reduced || hidden) return
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % count), SLIDE_MS)
    return () => window.clearTimeout(timer)
  }, [index, count, paused, reduced, hidden])

  const go = useCallback((to: number) => setIndex(((to % count) + count) % count), [count])
  return { index, go, reduced }
}
```

Note: the timer effect re-arms on every `index` change *and* every `paused` flip, which is exactly "any slide change or resume restarts the 8 s".

- [ ] **Step 4: Implement `HeroCarousel`**

Move `HeroButton` from `Home.tsx` into this file, adding `onKey`.

```tsx
// apps/web/src/screens/HeroCarousel.tsx
import { useMemo, useState, type ReactNode } from 'react'
import type { CatalogRow, Title } from '@go10/core/types'
import type { HeroSlide } from '@go10/core/hero/pickHero'
import { heroMeta } from '@go10/core/catalog/describeTitle'
import { imageSrc } from '@go10/core/lib/imageSrc'
import { listProgress } from '@go10/core/progress/progressStore'
import { playedFraction, titleProgress } from '@go10/core/progress/titleProgress'
import { remainingLabel, rowLabel } from '@go10/core/progress/describe'
import { Backdrop } from '../components/Backdrop'
import { ProgressBar } from '../components/ProgressBar'
import { useFocusable } from '../focus/useFocusable'
import { SLIDE_MS, useCarousel } from './useCarousel'

function HeroButton({ id, col, onEnter, onKey, variant, children }: {
  id: string
  col: number
  onEnter: () => void
  onKey?: (key: string) => boolean
  variant: 'primary' | 'secondary'
  children: ReactNode
}) {
  const { ref, focused, activate, tabIndex } = useFocusable(id, -1, col, onEnter, { onKey })
  return (
    <div
      ref={ref}
      tabIndex={tabIndex}
      role="button"
      className={`go-hero_cta go-hero_cta--${variant}${focused ? ' is-focused' : ''}`}
      data-focused={focused}
      onClick={activate}
    >
      {children}
    </div>
  )
}

/** A same-size stand-in for an inactive slide's button: holds the layout, joins no focus grid. */
function StaticButton({ variant, children }: { variant: 'primary' | 'secondary'; children: ReactNode }) {
  return <div className={`go-hero_cta go-hero_cta--${variant}`}>{children}</div>
}

function Stage({ slide, art, active, onArtError }: { slide: HeroSlide; art: HeroSlide['art']; active: boolean; onArtError: () => void }) {
  return (
    <div className={`go-hero_stage${active ? ' is-active' : ''}${art ? '' : ' is-blurred'}`} aria-hidden="true">
      {art ? (
        <div className="go-hero_frame">
          <img
            className="go-hero_key"
            src={imageSrc(art.large)}
            srcSet={`${imageSrc(art.small)} 960w, ${imageSrc(art.large)} 1920w`}
            sizes="100vw"
            alt=""
            fetchPriority={active ? 'high' : 'low'}
            onError={onArtError}
          />
        </div>
      ) : (
        <>
          <Backdrop thumbnail={slide.title.thumbnail} />
          {/* Narrow screens: the thumbnail itself fills the 16:9 art frame (CSS shows it ≤ 900px). */}
          <div className="go-hero_frame go-hero_frame--thumb">
            <img className="go-hero_key go-hero_key--thumb" src={imageSrc(slide.title.thumbnail)} alt="" />
          </div>
        </>
      )}
    </div>
  )
}

export function HeroCarousel({ slides, onPlay, onInfo }: {
  slides: HeroSlide[]
  onPlay: (title: Title, row: CatalogRow) => void
  onInfo: (title: Title) => void
}) {
  const [hovered, setHovered] = useState(false)
  const [failed, setFailed] = useState<ReadonlySet<number>>(new Set())
  const { index, go } = useCarousel(slides.length, hovered)
  const progress = useMemo(() => listProgress(), [])
  const many = slides.length > 1
  const artOf = (i: number) => (failed.has(i) ? null : slides[i].art)
  const activeArt = artOf(index)

  const prev = () => go(index - 1)
  const next = () => go(index + 1)

  return (
    <header
      className={`go-hero go-hero--carousel${activeArt ? ' has-art' : ''}`}
      aria-roledescription="carousel"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {slides.map((slide, i) => (
        <Stage key={slide.title.key} slide={slide} art={artOf(i)} active={i === index} onArtError={() => setFailed((f) => new Set(f).add(i))} />
      ))}

      <div className="go-hero_slides">
        {slides.map((slide, i) => {
          const active = i === index
          const title = slide.title
          const tp = title.seasons[0] ? titleProgress(title, progress) : null
          const resuming = tp?.mode === 'resume' ? tp.progress : null
          const position = tp && tp.mode !== 'start' ? rowLabel(tp.row) : ''
          const playLabel = (
            <>
              <span className="go-hero_play" aria-hidden="true" />
              {resuming ? 'Reanudar' : 'Reproducir'}
              {position && <span className="go-hero_cta-note">{position}</span>}
            </>
          )
          const infoLabel = (
            <>
              <span className="go-hero_info" aria-hidden="true" />
              Más información
            </>
          )
          return (
            <div
              key={title.key}
              className={`go-hero_slide${active ? ' is-active' : ''}`}
              aria-roledescription="slide"
              aria-label={`${i + 1} de ${slides.length}`}
              aria-hidden={!active}
              inert={!active}
            >
              <div className="go-hero_body">
                <p className="go-hero_eyebrow">
                  <span className="go-hero_badge">Destacado</span>
                  {title.kind === 'show' ? 'Serie' : 'Película'}
                  {title.studio && ` · ${title.studio}`}
                </p>
                <h1 className="go-hero_title">{title.title}</h1>
                <p className="go-hero_meta">
                  {heroMeta(title).map((item, n) => (
                    <span key={n}>
                      {n > 0 && <span className="go-hero_sep" aria-hidden="true" />}
                      {item}
                    </span>
                  ))}
                </p>
                <div className="go-hero_genres">
                  {[title.genre, title.genre_secondary].filter(Boolean).map((genre) => (
                    <span key={genre} className="go-chip">{genre}</span>
                  ))}
                </div>
                <div className="go-hero_actions">
                  {tp &&
                    (active ? (
                      <HeroButton
                        id="hero:play"
                        col={0}
                        variant="primary"
                        onEnter={() => onPlay(title, tp.row)}
                        onKey={(key) => (many && key === 'ArrowLeft' ? (prev(), true) : false)}
                      >
                        {playLabel}
                      </HeroButton>
                    ) : (
                      <StaticButton variant="primary">{playLabel}</StaticButton>
                    ))}
                  {active ? (
                    <HeroButton
                      id="hero:select"
                      col={1}
                      variant="secondary"
                      onEnter={() => onInfo(title)}
                      // The last button: → changes slide. Without Reproducir it is also the first, so ← does too.
                      onKey={(key) => (many && (key === 'ArrowRight' || (!tp && key === 'ArrowLeft')) ? (key === 'ArrowRight' ? next() : prev(), true) : false)}
                    >
                      {infoLabel}
                    </HeroButton>
                  ) : (
                    <StaticButton variant="secondary">{infoLabel}</StaticButton>
                  )}
                </div>
                {resuming && (
                  <div className="go-hero_resume">
                    <ProgressBar fraction={playedFraction(resuming)} className="go-hero_progress" />
                    <span>{remainingLabel(resuming)}</span>
                  </div>
                )}
              </div>
              {/* No key art, wide screens: the thumbnail crisp at close to its native 368x210. */}
              {!artOf(i) && (
                <figure className="go-hero_art">
                  <img src={imageSrc(title.thumbnail)} alt="" />
                </figure>
              )}
            </div>
          )
        })}
      </div>

      {many && (
        <>
          <button type="button" tabIndex={-1} className="go-hero_arrow go-hero_arrow--prev" aria-label="Anterior" onClick={prev} />
          <button type="button" tabIndex={-1} className="go-hero_arrow go-hero_arrow--next" aria-label="Siguiente" onClick={next} />
          <div className="go-hero_dots">
            {slides.map((slide, i) => (
              <button
                key={slide.title.key}
                type="button"
                tabIndex={-1}
                className={`go-hero_dot${i === index ? ' is-active' : ''}${hovered ? ' is-paused' : ''}`}
                style={{ ['--go-slide-ms' as string]: `${SLIDE_MS}ms` }}
                aria-label={`Ir a la diapositiva ${i + 1}`}
                aria-current={i === index}
                onClick={() => go(i)}
              />
            ))}
          </div>
        </>
      )}
    </header>
  )
}
```

(`inert` is a valid React 19 boolean prop.)

- [ ] **Step 5: Wire `Home.tsx` and `App.tsx`**

In `Home.tsx`:
- Remove the `HeroButton` function, and the `FEATURED_*`, `Backdrop`, `heroMeta`, `imageSrc`, `ProgressBar`, `playedFraction`, `titleProgress`, `remainingLabel`, `rowLabel` imports that only the hero used (keep what `Row`/Seguir viendo still use — `continueWatching`, `continueCardProgress`, `listProgress`).
- Add prop `heroArt: HeroArtIndex | null` and:

```tsx
import type { HeroArtIndex } from '@go10/core/hero/art'
import { pickHeroOnce } from '@go10/core/hero/pickHero'
import { HeroCarousel } from './HeroCarousel'
// …
  // Picked once the sidecar has settled, so the first pick already prefers art; fixed for the page.
  const slides = useMemo(() => (heroArt ? pickHeroOnce(titles, heroArt) : null), [titles, heroArt])

  if (titles.length === 0) {
    return (/* the existing "El catálogo está vacío." state, unchanged */)
  }
// …
      {slides ? (
        <HeroCarousel slides={slides} onPlay={onResume} onInfo={onSelect} />
      ) : (
        <header className="go-hero go-hero--carousel has-art" aria-hidden="true">
          <div className="go-hero_stage is-active" />
        </header>
      )}
```

In `App.tsx`: `import { useHeroArt } from './catalog/useHeroArt'`, call `const heroArt = useHeroArt()` next to `useCatalog()`, and pass `heroArt={heroArt}` to `<Home>`.

In `Home.test.tsx`: add `heroArt={{}}` to the `<Home>` in `renderHome`.

- [ ] **Step 6: CSS**

Append to `Home.css` (before the `@keyframes`), and extend the `≤ 900px` block:

```css
/* ---- Carousel ------------------------------------------------------------ */

/* Always the with-art height, whatever the slide, so the rows never jump. */
.go-hero--carousel {
  min-height: min(50vw, 80vh);
}

/* Every slide's stage stacked; only the active one shows, crossfading. */
.go-hero--carousel .go-hero_stage {
  opacity: 0;
  transition: opacity var(--go-dur-slow) var(--go-ease);
}

.go-hero--carousel .go-hero_stage.is-active {
  opacity: 1;
}

/* The thumbnail-as-art frame is for narrow screens only. */
.go-hero_frame--thumb {
  display: none;
}

/* All slide bodies share one grid cell: the hero is as tall as the tallest. */
.go-hero_slides {
  position: relative;
  z-index: 1;
  display: grid;
  grid-column: 1 / -1;
}

.go-hero_slide {
  grid-area: 1 / 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: var(--go-safe-x);
  visibility: hidden;
}

.go-hero_slide.is-active {
  visibility: visible;
}

/* Only the arriving slide replays the staggered reveal. */
.go-hero_slide:not(.is-active) .go-hero_body > * {
  animation: none;
}

.go-hero_arrow {
  position: absolute;
  top: 50%;
  z-index: 2;
  width: 3rem;
  height: 3rem;
  margin-top: -1.5rem;
  border: 1px solid rgba(242, 244, 240, 0.16);
  border-radius: 999px;
  background: rgba(8, 9, 12, 0.5);
  color: var(--go-text);
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--go-dur) var(--go-ease);
}

.go-hero_arrow::before {
  content: '‹';
  font-size: 1.75rem;
  line-height: 1;
}

.go-hero_arrow--next::before {
  content: '›';
}

.go-hero_arrow--prev { left: 1rem; }
.go-hero_arrow--next { right: 1rem; }

@media (hover: hover) and (pointer: fine) {
  .go-hero:hover .go-hero_arrow {
    opacity: 1;
  }
}

.go-hero_dots {
  position: absolute;
  z-index: 2;
  right: var(--go-safe-x);
  bottom: 1.25rem;
  display: flex;
  gap: 0.375rem;
}

.go-hero_dot {
  position: relative;
  width: 1.75rem;
  height: 3px;
  padding: 0;
  border: 0;
  border-radius: 2px;
  overflow: hidden;
  background: rgba(242, 244, 240, 0.25);
  cursor: pointer;
}

.go-hero_dot.is-active::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--go-accent);
  transform-origin: left;
  animation: go-dot-fill var(--go-slide-ms) linear both;
}

.go-hero_dot.is-paused::after {
  animation-play-state: paused;
}

@keyframes go-dot-fill {
  from { transform: scaleX(0); }
  to { transform: none; }
}
```

Inside the existing `@media (max-width: 900px)` block add:

```css
  .go-hero--carousel {
    min-height: 0;
  }

  .go-hero_slide {
    grid-template-columns: minmax(0, 1fr);
  }

  /* No key art: the thumbnail fills the 16:9 frame — near its native 368px here. */
  .go-hero--carousel .go-hero_frame--thumb {
    display: block;
  }

  .go-hero--carousel:not(.has-art) {
    --go-hero-h: 56.25vw;
    --go-hero-top: calc(var(--go-nav-h) - 2.5rem);
    padding-top: calc(var(--go-hero-top) + var(--go-hero-h) - 3rem);
    padding-bottom: 3rem;
  }

  .go-hero_arrow {
    display: none;
  }
```

Note: the reduced-motion rule in `tokens.css`/`global.css` already zeroes animation and transition durations globally — check that it covers `.go-hero_dot::after` (a pseudo-element); if the rule uses `*` without `::after`, add `.go-hero_dot.is-active::after { animation: none; }` under `@media (prefers-reduced-motion: reduce)`.

- [ ] **Step 7: Run all web tests**

Run: `npm test -w @go10/web && npm run typecheck -w @go10/web`
Expected: PASS. `App.test.tsx` keeps passing: its `fetch` stub answers `hero_art.json` with the CSV, `parseHeroArt` rejects it → `{}`, "Foo Movie" (Drama) is the one slide. If `Home.test.tsx`'s strip test (`nav.parentElement?.previousElementSibling` is `.go-hero`) fails, it's because the pending-state header must also carry `go-hero` — it does in Step 5; with `heroArt={{}}` the carousel renders anyway.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): auto-advancing hero carousel across genre buckets"
```

---

### Task 5: Mobile — load the sidecar in the catalog store

**Files:**
- Modify: `apps/mobile/src/data/catalogStore.ts`
- Test: `apps/mobile/src/data/catalogStore.test.ts`

**Interfaces:**
- Consumes: `parseHeroArt`, `HeroArtIndex` (Task 2).
- Produces: `CatalogData.heroArt: HeroArtIndex` (always present; `{}` when missing). Task 6 reads it.

- [ ] **Step 1: Write the failing tests** (append to `catalogStore.test.ts`, reusing its `site`, `csv`, `memoryTextCache`, `BASE`, `CATALOG`, `COLLECTIONS` helpers)

```ts
const HERO_ART = 'data/hero_art.json'
const sidecar = (key: string) => JSON.stringify({ schema_version: 1, items: { [key]: { tmdb: 'movie/1', backdrop: `/${key}.jpg` } } })
const heroArtOf = (store: ReturnType<typeof createCatalogStore>) => {
  const state = store.getState()
  return state.status === 'ready' ? state.data.heroArt : state.status
}

describe('hero art', () => {
  it('loads hero_art.json alongside the catalog', async () => {
    const s = site({ [CATALOG]: { body: csv('A') }, [COLLECTIONS]: { body: '[]' }, [HERO_ART]: { body: sidecar('100'), etag: '"h1"' } })
    const store = createCatalogStore({ fetchText: s.fetchText, cache: memoryTextCache(), siteBase: BASE })
    await store.start()
    expect(heroArtOf(store)).toEqual({ '100': { tmdb: 'movie/1', backdrop: '/100.jpg' } })
  })

  it('is {} when the sidecar is missing, corrupt, or an HTML page — never an error', async () => {
    for (const heroArt of ['down', { body: '<!doctype html>' }, { body: '{"schema_version":1' }] as const) {
      const s = site({ [CATALOG]: { body: csv('A') }, [COLLECTIONS]: { body: '[]' }, [HERO_ART]: heroArt })
      const store = createCatalogStore({ fetchText: s.fetchText, cache: memoryTextCache(), siteBase: BASE })
      await store.start()
      expect(heroArtOf(store)).toEqual({})
    }
  })

  it('shows the cached sidecar at once and revalidates it with its ETag', async () => {
    const cache = memoryTextCache()
    cache.write('catalog.csv', { body: csv('A'), etag: '"c1"' })
    cache.write('hero_art.json', { body: sidecar('100'), etag: '"h1"' })
    const s = site({ [CATALOG]: { body: csv('A'), etag: '"c1"' }, [COLLECTIONS]: { body: '[]' }, [HERO_ART]: { body: sidecar('100'), etag: '"h1"' } })
    const store = createCatalogStore({ fetchText: s.fetchText, cache, siteBase: BASE })
    const started = store.start()
    expect(heroArtOf(store)).toEqual({ '100': expect.anything() })
    await started
    expect(s.calls).toContainEqual({ path: HERO_ART, etag: '"h1"' })
  })

  it('a fresh sidecar alone is a pending refresh', async () => {
    const cache = memoryTextCache()
    cache.write('catalog.csv', { body: csv('A'), etag: '"c1"' })
    const s = site({ [CATALOG]: { body: csv('A'), etag: '"c1"' }, [COLLECTIONS]: 'down', [HERO_ART]: { body: sidecar('100') } })
    const store = createCatalogStore({ fetchText: s.fetchText, cache, siteBase: BASE })
    await store.start()
    expect(heroArtOf(store)).toEqual({})
    store.applyPending()
    expect(heroArtOf(store)).toEqual({ '100': expect.anything() })
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w @go10/mobile -- src/data/catalogStore`
Expected: FAIL — `heroArt` is `undefined`.

- [ ] **Step 3: Implement**

In `catalogStore.ts`:

```ts
import { parseHeroArt, type HeroArtIndex } from '@go10/core/hero/art'

export interface CatalogData {
  rows: CatalogRow[]
  titles: Title[]
  collections: Collection[]
  /** Hero backdrops (scripts/fetch_hero_art.py); {} when missing. */
  heroArt: HeroArtIndex
}

const HERO_ART: Resource<HeroArtIndex> = { name: 'hero_art.json', path: 'data/hero_art.json', parse: parseHeroArt }
```

In `load()`:

```ts
    const cachedHeroArt = cached(HERO_ART)?.value ?? {}
    const current: CatalogData | null = rows ? { rows, titles: buildTitles(rows), collections: cachedCollections, heroArt: cachedHeroArt } : null
    // …
    const [freshRows, freshCollections, freshHeroArt] = await Promise.all([refresh(CATALOG), refresh(COLLECTIONS), refresh(HERO_ART)])
    // …
    if (!freshRows && !freshCollections && !freshHeroArt) return // unchanged (or unreachable) with a cache showing
    const next: CatalogData = {
      rows: nextRows,
      titles: freshRows ? buildTitles(freshRows) : current!.titles,
      collections: freshCollections ?? cachedCollections,
      heroArt: freshHeroArt ?? cachedHeroArt,
    }
```

Then fix every other place that builds a `CatalogData` literal (TypeScript will list them: `npm run typecheck -w @go10/mobile`), e.g. the `data()` helper in `homeModel.test.ts` gets `heroArt: {}`.

- [ ] **Step 4: Run to verify**

Run: `cd apps/mobile && npx jest src/data && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/data
git commit -m "feat(mobile): fetch and cache the hero art sidecar"
```

---

### Task 6: Mobile — the carousel, and retire `featured.ts`

**Files:**
- Create: `apps/mobile/src/components/heroEdge.ts`, `apps/mobile/src/components/heroEdge.test.ts`
- Create: `apps/mobile/src/components/HeroCarousel.tsx`, `apps/mobile/src/components/HeroCarousel.test.tsx`
- Modify: `apps/mobile/src/components/Hero.tsx` (`onArtError`, `onFocusButton`, `trap` wrapper on TV)
- Modify: `apps/mobile/src/home/homeModel.ts` + `homeModel.test.ts`
- Modify: `apps/mobile/src/components/HomeView.tsx` + `HomeView.test.tsx`
- Modify: `apps/mobile/src/components/Hero.test.tsx` (art-error case)
- Modify: `apps/mobile/jest.setup.js` (reset the launch pick)
- Delete: `packages/core/src/featured.ts`

**Interfaces:**
- Consumes: `pickHeroOnce`, `HeroSlide`, `resetHeroPickForTests` (Task 2); `CatalogData.heroArt` (Task 5); existing `useRemoteKeys`, `RemoteKey`.
- Produces: `HomeModel.slides: HeroSlide[]` (replaces `featured` / `featuredArt`); `edgeStep(key: RemoteKey, focused: 'play' | 'info' | null): -1 | 1 | 0`; `HeroCarousel({ slides, imageBase, progress, onPlayTitle, onSelectTitle })`; `Hero` gains `onArtError?: () => void`, `onFocusButton?: (button: 'play' | 'info' | null) => void`.

- [ ] **Step 1: Failing tests — `edgeStep`, `buildHome`, `HeroCarousel`, `Hero`**

```ts
// apps/mobile/src/components/heroEdge.test.ts
import { edgeStep } from './heroEdge'

describe('edgeStep', () => {
  it('← on Reproducir is the previous slide, → on Más información the next', () => {
    expect(edgeStep('left', 'play')).toBe(-1)
    expect(edgeStep('right', 'info')).toBe(1)
  })

  it('moves between the two buttons are not slide changes', () => {
    expect(edgeStep('right', 'play')).toBe(0)
    expect(edgeStep('left', 'info')).toBe(0)
  })

  it('ignores other keys and an unfocused hero', () => {
    expect(edgeStep('up', 'play')).toBe(0)
    expect(edgeStep('select', 'info')).toBe(0)
    expect(edgeStep('left', null)).toBe(0)
  })
})
```

Rewrite `homeModel.test.ts`'s first two cases (and add `heroArt: {}` to `data()`):

```ts
import { resetHeroPickForTests } from '@go10/core/hero/pickHero'
// …
const data = (titles: Title[], collections: Collection[] = [], heroArt = {}) => ({ rows: [], titles, collections, heroArt })

beforeEach(() => resetHeroPickForTests())

  it('picks hero slides across the genre buckets, preferring art', () => {
    const titles = [title('d', { genre: 'Drama' }), title('t', { genre: 'Terror' }), title('t2', { genre: 'Terror' })]
    const home = buildHome(data(titles, [], { t2: { tmdb: 'movie/1', backdrop: '/t2.jpg' } }))!
    expect(home.slides.map((s) => s.title.key).sort()).toEqual(['d', 't2'])
    expect(home.slides.find((s) => s.title.key === 't2')!.art?.large).toBe('https://image.tmdb.org/t/p/w1280/t2.jpg')
  })

  it('keeps the launch pick when a refreshed catalog arrives', () => {
    const first = buildHome(data([title('d', { genre: 'Drama' })]))!
    const refreshed = buildHome(data([title('x', { genre: 'Drama' }), title('d', { genre: 'Drama' })]))!
    expect(refreshed.slides).toBe(first.slides)
    expect(refreshed.titles.map((t) => t.key)).toEqual(['x', 'd'])
  })

  it('features the first title when no bucket matches', () => {
    expect(buildHome(data([title('a'), title('b')]))!.slides.map((s) => s.title.key)).toEqual(['a'])
  })
```

```tsx
// apps/mobile/src/components/HeroCarousel.test.tsx
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import type { HeroSlide } from '@go10/core/hero/pickHero'
import type { CatalogRow, Title } from '@go10/core/types'
import { HeroCarousel, SLIDE_MS } from './HeroCarousel'

const title = (key: string): Title => ({
  key, kind: 'movie', title: `Título ${key}`, year: 2001, studio: '', source: '', genre: 'Drama', genre_secondary: '',
  quality: '', language: '', subtitled: false, thumbnail: `catalogo_files/${key}.webp`, views: 0, durationSeconds: 0, catalogIndex: 0,
  seasons: [{ video_id: `${key}1`, type: 'movie' } as CatalogRow],
})
const SLIDES: HeroSlide[] = [{ title: title('a'), art: null }, { title: title('b'), art: null }, { title: title('c'), art: null }]
const props = () => ({ slides: SLIDES, imageBase: 'https://tv.test/', progress: {}, onPlayTitle: jest.fn(), onSelectTitle: jest.fn() })
const active = () => screen.getByTestId('hero-carousel').props.accessibilityValue?.now

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

describe('HeroCarousel (phone)', () => {
  it('renders every slide in a pager', async () => {
    await render(<HeroCarousel {...props()} />)
    expect(screen.getAllByRole('header', { name: /Título/ })).toHaveLength(3)
    expect(screen.getByRole('header', { name: 'Título c' })).toBeTruthy()
  })

  it('advances every 8 s and wraps', async () => {
    await render(<HeroCarousel {...props()} />)
    expect(active()).toBe(1)
    await act(async () => {
      jest.advanceTimersByTime(SLIDE_MS)
    })
    expect(active()).toBe(2)
    await act(async () => {
      jest.advanceTimersByTime(SLIDE_MS * 2)
    })
    expect(active()).toBe(1)
  })

  it('pauses while a finger is down', async () => {
    await render(<HeroCarousel {...props()} />)
    fireEvent(screen.getByTestId('hero-carousel'), 'touchStart')
    await act(async () => {
      jest.advanceTimersByTime(SLIDE_MS * 3)
    })
    expect(active()).toBe(1)
    fireEvent(screen.getByTestId('hero-carousel'), 'touchEnd')
    await act(async () => {
      jest.advanceTimersByTime(SLIDE_MS)
    })
    expect(active()).toBe(2)
  })

  it('follows a swipe', async () => {
    await render(<HeroCarousel {...props()} />)
    fireEvent(screen.getByTestId('hero-pager'), 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 2 * 750, y: 0 }, layoutMeasurement: { width: 750, height: 400 } } })
    expect(active()).toBe(3)
  })

  it('plays and opens each slide from its own buttons', async () => {
    const p = props()
    await render(<HeroCarousel {...p} />)
    fireEvent.press(screen.getAllByRole('button', { name: 'Reproducir' })[1])
    fireEvent.press(screen.getAllByRole('button', { name: 'Más información' })[2])
    expect(p.onPlayTitle).toHaveBeenCalledWith(expect.objectContaining({ key: 'b' }), expect.objectContaining({ video_id: 'b1' }))
    expect(p.onSelectTitle).toHaveBeenCalledWith(expect.objectContaining({ key: 'c' }))
  })

  it('a single slide has no timer', async () => {
    await render(<HeroCarousel {...props()} slides={[SLIDES[0]]} />)
    await act(async () => {
      jest.advanceTimersByTime(SLIDE_MS * 2)
    })
    expect(active()).toBe(1)
  })
})
```

Add to `Hero.test.tsx`:

```tsx
  it('reports a failed art load, so the carousel can fall back', async () => {
    const onArtError = jest.fn()
    await render(<Hero title={spidey} art={ART} imageBase={IMG} progress={null} onPlay={jest.fn()} onInfo={jest.fn()} onArtError={onArtError} />)
    fireEvent(screen.getByTestId('hero-art'), 'error', { error: '404' })
    expect(onArtError).toHaveBeenCalledTimes(1)
  })
```

(import `fireEvent` from `@testing-library/react-native` there.)

In `HomeView.test.tsx`, the `model()` helper replaces `featured: title('a'), featuredArt: null` with `slides: [{ title: title('a'), art: null }]`.

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/mobile && npx jest src/components src/home`
Expected: FAIL — missing `heroEdge`, `HeroCarousel`, `slides`.

- [ ] **Step 3: Implement `heroEdge.ts`, `homeModel.ts`, jest setup**

```ts
// apps/mobile/src/components/heroEdge.ts
import type { RemoteKey } from '../player/playerKeys'

/**
 * TV: which way a D-pad press moves the hero carousel. The actions row traps
 * focus sideways, so ← on Reproducir and → on Más información go nowhere
 * natively and change the slide instead; presses between the buttons are
 * plain focus moves. `focused` is read at key-down, before the native focus
 * move is reported to JS.
 */
export function edgeStep(key: RemoteKey, focused: 'play' | 'info' | null): -1 | 0 | 1 {
  if (key === 'left' && focused === 'play') return -1
  if (key === 'right' && focused === 'info') return 1
  return 0
}
```

```ts
// apps/mobile/src/home/homeModel.ts
import { buildRows, type CatalogRowGroup } from '@go10/core/catalog/buildRows'
import { visibleCollections } from '@go10/core/collections/resolveCollection'
import type { Collection } from '@go10/core/collections/types'
import { pickHeroOnce, type HeroSlide } from '@go10/core/hero/pickHero'
import type { Title } from '@go10/core/types'
import type { CatalogData } from '../data/catalogStore'

export interface HomeModel {
  /** The hero carousel: picked once per launch (pickHeroOnce), so a background refresh never reshuffles it. */
  slides: HeroSlide[]
  /** Collections with at least one title in the catalog, in tile order. */
  strip: Collection[]
  rows: CatalogRowGroup[]
  /** Every title, for Seguir viendo. */
  titles: Title[]
}

/** The web Home's layout decisions (apps/web/src/screens/Home.tsx); Seguir viendo is built by HomeView from live progress. */
export function buildHome(data: CatalogData): HomeModel | null {
  if (data.titles.length === 0) return null
  return {
    slides: pickHeroOnce(data.titles, data.heroArt),
    strip: visibleCollections(data.collections, data.titles).map((resolved) => resolved.collection),
    rows: buildRows(data.titles),
    titles: data.titles,
  }
}
```

Append to `apps/mobile/jest.setup.js`:

```js
// The hero pick is per launch; each test is a fresh launch.
beforeEach(() => require('@go10/core/hero/pickHero').resetHeroPickForTests())
```

Delete `packages/core/src/featured.ts` (`git rm`); `grep -rn "core/featured" apps packages` must come back empty.

- [ ] **Step 4: `Hero.tsx` — art error, focus reporting, TV focus trap**

- Props: add `onArtError?: () => void` and `onFocusButton?: (button: 'play' | 'info' | null) => void`.
- On the `hero-art` `<Image>`: `onError={onArtError}`.
- `HeroButton` gains `onFocus`/`onBlur` passthrough to `Pressable`; the Reproducir one calls `onFocusButton?.('play')`, Más información `onFocusButton?.('info')`, both `onBlur={() => onFocusButton?.(null)}`.
- Wrap the actions row: on TV, `TVFocusGuideView` with `trapFocusLeft trapFocusRight`; on phone, the plain `View`:

```tsx
import { TVFocusGuideView } from 'react-native'
// …
const Actions = tv ? TVFocusGuideView : View
// …
        <Actions style={styles.actions} {...(tv ? { trapFocusLeft: true, trapFocusRight: true } : {})}>
          {/* the two HeroButtons, unchanged apart from onFocus/onBlur */}
        </Actions>
```

- [ ] **Step 5: `HeroCarousel.tsx`**

```tsx
// apps/mobile/src/components/HeroCarousel.tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, AppState, FlatList, Platform, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import type { HeroSlide } from '@go10/core/hero/pickHero'
import type { Progress } from '@go10/core/progress/progressStore'
import { titleProgress } from '@go10/core/progress/titleProgress'
import type { CatalogRow, Title } from '@go10/core/types'
import { useRemoteKeys } from '../platform/remote'
import { Hero } from './Hero'
import { edgeStep } from './heroEdge'

export const SLIDE_MS = 8000
const tv = Platform.isTV

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    let live = true
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => live && setReduced(value))
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced)
    return () => {
      live = false
      subscription.remove()
    }
  }, [])
  return reduced
}

function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active')
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setActive(state === 'active'))
    return () => subscription.remove()
  }, [])
  return active
}

/**
 * The Home hero carousel. Phone: a swipeable pager of Heroes. TV: one Hero
 * whose props swap behind a short fade, so the focused button never unmounts.
 * Advances every SLIDE_MS; any slide change restarts the wait.
 */
export function HeroCarousel({ slides, imageBase, progress, onPlayTitle, onSelectTitle }: {
  slides: HeroSlide[]
  imageBase: string
  progress: Record<string, Progress>
  onPlayTitle: (title: Title, row: CatalogRow) => void
  onSelectTitle: (title: Title) => void
}) {
  const { width } = useWindowDimensions()
  const [index, setIndex] = useState(0)
  const [touching, setTouching] = useState(false)
  const [failed, setFailed] = useState<ReadonlySet<number>>(new Set())
  const reduced = useReducedMotion()
  const appActive = useAppActive()
  const pager = useRef<FlatList<HeroSlide>>(null)
  const count = slides.length

  const go = useCallback((to: number) => {
    const next = ((to % count) + count) % count
    setIndex(next)
    if (!tv) pager.current?.scrollToIndex({ index: next, animated: !reduced })
  }, [count, reduced])

  useEffect(() => {
    if (count < 2 || touching || reduced || !appActive) return
    const timer = setTimeout(() => go(index + 1), SLIDE_MS)
    return () => clearTimeout(timer)
  }, [index, count, touching, reduced, appActive, go])

  // TV: which hero button holds focus, read at key-down (see edgeStep).
  const focused = useRef<'play' | 'info' | null>(null)
  useRemoteKeys((key) => {
    if (!tv || count < 2) return
    const step = edgeStep(key, focused.current)
    if (step !== 0) go(index + step)
  })

  const heroFor = (slide: HeroSlide, i: number) => {
    const tp = titleProgress(slide.title, progress)
    return (
      <Hero
        title={slide.title}
        art={failed.has(i) ? null : slide.art}
        imageBase={imageBase}
        progress={tp}
        onPlay={() => onPlayTitle(slide.title, tp.row)}
        onInfo={() => onSelectTitle(slide.title)}
        onArtError={() => setFailed((f) => new Set(f).add(i))}
        onFocusButton={(button) => {
          focused.current = button
        }}
      />
    )
  }

  // TV: fade out, swap, fade in.
  const [shown, setShown] = useState(0)
  const opacity = useRef(new Animated.Value(1)).current
  useEffect(() => {
    if (!tv || shown === index) return
    if (reduced) {
      setShown(index)
      return
    }
    Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setShown(index)
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start()
    })
  }, [index, shown, reduced, opacity])

  const a11y = { accessibilityRole: 'adjustable' as const, accessibilityValue: { min: 1, max: count, now: index + 1 } }

  if (tv) {
    return (
      <Animated.View testID="hero-carousel" {...a11y} style={{ opacity }}>
        {heroFor(slides[shown], shown)}
      </Animated.View>
    )
  }

  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement } = event.nativeEvent
    setIndex(Math.round(contentOffset.x / layoutMeasurement.width))
  }

  return (
    <View
      testID="hero-carousel"
      {...a11y}
      onTouchStart={() => setTouching(true)}
      onTouchEnd={() => setTouching(false)}
      onTouchCancel={() => setTouching(false)}
    >
      <FlatList
        testID="hero-pager"
        ref={pager}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(slide) => slide.title.key}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        initialNumToRender={count}
        onMomentumScrollEnd={onMomentumScrollEnd}
        renderItem={({ item, index: i }) => <View style={{ width }}>{heroFor(item, i)}</View>}
      />
      {count > 1 && <Dots count={count} index={index} />}
    </View>
  )
}

function Dots({ count, index }: { count: number; index: number }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', right: 16, bottom: 12, flexDirection: 'row', gap: 6 }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ width: 20, height: 3, borderRadius: 2, backgroundColor: i === index ? '#c7f23e' : 'rgba(242,244,240,0.25)' }} />
      ))}
    </View>
  )
}
```

Implementer notes:
- Replace the hard-coded dot colour with `theme.color.accent` (import `theme` from `../theme`) — the literal is only there so this snippet stands alone.
- On TV, add the same `<Dots>` below the `Hero` inside the `Animated.View` when `count > 1`.
- `Hero` keeps `hasTVPreferredFocus` on Reproducir as today; since only one `Hero` exists on TV, that's the single preferred view.

- [ ] **Step 6: `HomeView.tsx`**

Replace the `heroProgress` memo and the `<Hero …/>` header with:

```tsx
      ListHeaderComponent={
        <HeroCarousel
          slides={model.slides}
          imageBase={imageBase}
          progress={progress}
          onPlayTitle={onPlayTitle}
          onSelectTitle={onSelectTitle}
        />
      }
```

and swap the `Hero` import for `HeroCarousel`. Keep the doc comment about the header never being virtualised.

- [ ] **Step 7: Run everything**

Run: `npm test && npm run typecheck && pytest`
Expected: all PASS (core, web, mobile, python).

- [ ] **Step 8: Commit**

```bash
git add -A apps/mobile packages/core/src
git commit -m "feat(mobile): hero carousel — phone pager, TV edge navigation; retire featured.ts"
```

---

### Task 7: Docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a "Hero carousel art" subsection** near the TMDB section:

```markdown
### Hero carousel art

The Home hero rotates through five titles picked at random per launch, one
per genre bucket (Animación, Drama, Terror, Infantil, Anime), preferring
titles with a TMDB backdrop. Backdrops come from an offline matcher:

    TMDB_TOKEN=<TMDB v4 read access token> python3 scripts/fetch_hero_art.py

It writes `apps/web/public/data/hero_art.json` (commit it) and prints the
unmatched titles. Fix mismatches in `data/hero_art_overrides.json`
(`{"pin": {"<title key>": "tv/123"}, "block": ["<title key>"]}`) and re-run.
Without the file both apps fall back to the blurred-thumbnail hero.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: hero carousel art script"
```
