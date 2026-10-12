# Franchise 24/7 channels — design

## Goal

Alongside the network/studio channels (Cartoon Network, Jetix, Disney…),
add **franchise channels** that always air one franchise: Dragon Ball 24/7,
Yu-Gi-Oh! 24/7, Tom y Jerry 24/7… Each one jumps around the whole franchise
(every series and movie), airing a short run of consecutive episodes from a
random point, then jumping again.

Builds on `2026-10-01-live-tv-channels-design.md`: same `channels.json`,
same "the schedule is math, not state" engine, same live session and UI.

## Decisions

| Question | Decision |
|---|---|
| How a franchise channel picks what airs | **Short random runs:** a random point anywhere in the franchise, 2–3 consecutive units from there, then a new random point. |
| How franchise channels sit next to networks | **Two labeled groups** in the TV strip and the "En vivo ahora" row: "Canales" and "24/7". One zap order across both. |
| Numbering | Networks keep 1–16; franchises are **101+**. |
| Launch lineup | **Tier 1** (9 new) + Barbie, Monster High and Marvel (renamed Spider-Man) moved into the group: **12 channels**. |
| On-demand Home | A **second collection strip** below the networks strip, with franchise tiles. **No heading**, exactly like the networks strip. |

## 1. Data model

### Collections: `group`

`Collection` gains an optional field:

```ts
/** Which Home strip and TV group it belongs to. Default 'network'. */
group?: 'network' | 'franchise'
```

`validateCollection` accepts it absent, `"network"` or `"franchise"`, and
fails on anything else. Existing network files are untouched. `order` stays
globally unique; franchise collections use orders 101+ (matching their
channel numbers) so the two ranges never collide.

### New collection files (`data/collections/`)

Each with `"group": "franchise"`, a logo at
`assets/collections/<id>/logo.svg` and a tile color. Title keys:

| id | name | order | titles |
|---|---|---|---|
| `dragon-ball` | Dragon Ball | 101 | `dragon-ball`, `dragon-ball-super-beerus`, `15686163630767`, `14705474407150`, `14706742135534`, `14705474603758`, `14790427871822`, `2808504191608`, `2808504126072`, `2808060906104`, `2057376893532`, `6039184542418`, `2808060840568`, `14718117677806`, `92504918728`, `2808061037176`, `14790427544142`, `2808503995000`, `2808060775032`, `92505770696`, `2808060971640`, `2808499604088` |
| `yu-gi-oh` | Yu-Gi-Oh! | 102 | `yu-gi-oh`, `yu-gi-oh-gx`, `15015012338364`, `15030031485628`, `15029787298492` |
| `tom-y-jerry` | Tom y Jerry | 103 | `tom-y-jerry`, `tom-y-jerry-redoblaje`, `el-nuevo-show-de-tom-y-jerry`, `14766751287910`, `16936861501958`, `13310400858878`, `14766664256102`, `8813716376135`, `8821574535751`, `7265551256166`, `8833835534919`, `14766848412262`, `14766802668134`, `7265551387238` |
| `looney-tunes` | Looney Tunes | 104 | `las-aventuras-de-silvestre-y-piolin`, `duck-dodgers`, `looney-tunes-speedy-gonzales`, `looney-tunes-el-correcaminos` |
| `los-simpsons` | Los Simpsons | 105 | `los-simpsons` |
| `caballeros-del-zodiaco` | Los Caballeros del Zodiaco | 106 | `los-caballeros-del-zodiaco` |
| `sailor-moon` | Sailor Moon | 107 | `sailor-moon`, `sailor-moon-r` |
| `supercampeones` | Supercampeones | 108 | `supercampeones` |
| `thundercats` | ThunderCats | 109 | `thundercats` |

Deliberately left out despite matching names: *Dragon Half*, *Dragon Age:
Dawn of the Seeker*, *Dragon Pink* (not Dragon Ball) and *Tygra, Fuego y
Hielo* (Bakshi's *Fire and Ice*, not ThunderCats).

### Existing collections

- `barbie`: add `"group": "franchise"`, order → 111.
- `monster-high`: add `"group": "franchise"`, order → 112.
- `marvel` → **`spider-man`**: file renamed, `id` and `name` ("Spider-Man")
  changed, new logo at `assets/collections/spider-man/logo.svg`, `"group":
  "franchise"`, order → 110. Same five titles. The `/collection/marvel` and
  `/tv/marvel` URLs stop existing; a stored `tv:lastChannel` of `marvel`
  already falls back to the default channel.

## 2. Channels

### `channels.json`

The network entries keep their numbers 1–15; the `marvel` entry is removed
and these are added:

```json
{ "id": "dragon-ball", "number": 101, "collection": "dragon-ball" },
{ "id": "yu-gi-oh", "number": 102, "collection": "yu-gi-oh" },
{ "id": "tom-y-jerry", "number": 103, "collection": "tom-y-jerry" },
{ "id": "looney-tunes", "number": 104, "collection": "looney-tunes", "exclude": ["looney-tunes-el-correcaminos"] },
{ "id": "los-simpsons", "number": 105, "collection": "los-simpsons" },
{ "id": "caballeros-del-zodiaco", "number": 106, "collection": "caballeros-del-zodiaco" },
{ "id": "sailor-moon", "number": 107, "collection": "sailor-moon" },
{ "id": "supercampeones", "number": 108, "collection": "supercampeones" },
{ "id": "thundercats", "number": 109, "collection": "thundercats" },
{ "id": "spider-man", "number": 110, "collection": "spider-man" },
{ "id": "barbie", "number": 111, "collection": "barbie" },
{ "id": "monster-high", "number": 112, "collection": "monster-high" }
```

`El Correcaminos` is one unchaptered 16,640 s (4.6 h) video; as a single
unit it would air for 4.6 hours straight. It is excluded from the channel
(it stays on the collection page) until it gets chapters from runtimes.

No new channel fields: **a channel's group is its collection's group**, and
the group decides the scheduling mode.

### Plan

`ChannelPlan` gains `mode: 'blocks' | 'runs'`, set by `buildChannelPlan`
from `collection.group` (`franchise` → `runs`, otherwise `blocks`).
`Channel` gains `group: 'network' | 'franchise'` for the UI.

### Validation

`validateChannels` adds one rule: a channel's number must be ≤ 99 when its
collection is a network and ≥ 101 when it's a franchise. Everything else
(unique ids and numbers, known collection, known `exclude` keys, non-empty
plan) is unchanged.

## 3. Random runs engine (`packages/core/src/tv/schedule.ts`)

A run plays the role a round plays for block channels: the timeline is runs
laid end to end from the epoch, and the checkpoint cache (every 32 runs)
works unchanged. `cursors` are unused in `runs` mode; `lastTitle` is used.

`playRun(plan, cp) → { airings, next }`, for run index `i = cp.round` and
`s = (plan.seed + i) >>> 0`:

1. **Pick a unit**, uniformly over every unit of every title in the plan
   (a flat index over `plan.titles[*].units`, in plan order), using
   `hash01(s, 'pick')`. Picking by unit rather than by title weights big
   series over single movies: Dragon Ball's 122 episodes vs. its 20 movies
   gives movies ~14 % of runs instead of ~90 %.
2. **No back-to-back title:** if the plan has more than one title and the
   pick belongs to `cp.lastTitle`, re-pick with `hash01(s, 'pick#1')`,
   `'pick#2'`, … (up to 8 tries, then take the first unit of the next title
   in plan order).
3. **Run length:** `2 + floor(hash01(s, 'len') * 2)` → 2 or 3 units,
   consecutive from the pick in the title's own order, **stopping at the
   title's last unit** (no wrap). A movie, or a pick on a title's last
   unit, is therefore a one-unit run.
4. `next = { round: i + 1, startsAt: end of the run, cursors: cp.cursors,
   lastTitle: <index of this run's title> }`.

`scheduleAt` dispatches on `plan.mode` (`playRound` or `playRun`); its
signature and result are unchanged, so `liveSession`, `describe`, the tiles
and "A continuación" work as-is.

Exact repeats of an episode within a short time are possible and accepted
(with 81–247 units per channel they're rare).

## 4. UI

### Home (web `screens/Home.tsx`, mobile `components/HomeView.tsx`)

Two `CollectionStrip`s: networks, then franchises directly below, neither
with a heading. Same tiles, same `CollectionView` destination. A strip with
no collections isn't rendered.

### TV mode (web `tv/LiveRow.tsx`, mobile `tv/LiveRow.tsx`, and the TV screens' channel strip)

- The channel strip and the Home "En vivo ahora" row render two labeled
  sections, **"Canales"** (network channels) then **"24/7"** (franchise
  channels), each ascending by number. The label is a small heading before
  the section's first tile, in the same row, so D-pad/arrow movement across
  tiles is unchanged.
- **Zapping** (↑/↓, swipe, PgUp/PgDn) walks the single lineup in number
  order: 15 → 101 going up, 112 → 1 wrapping.
- **Number entry:** with 3-digit numbers, `1`, `10` and `11` now wait
  `NUMBER_ENTRY_MS` for a possible next digit unless one is typed.
  `enterDigit` already handles this; no change.
- Live session, retries, "Señal interrumpida", mini-player, now-playing bar:
  unchanged.

## 5. Testing

- **Core (Vitest):**
  - `playRun`: deterministic; picks are uniform over units (a large
    simulated sample is within tolerance of unit share per title); no
    back-to-back title on multi-title plans; single-title plans allowed to
    repeat; run length is 2–3 and truncated at a title's end; a movie airs
    alone; airings are contiguous.
  - `scheduleAt` in `runs` mode: checkpoint answers equal a naïve
    simulation over a long range; boundary instants.
  - `buildChannelPlan`: `mode` follows `collection.group`.
  - `validateCollection`: `group` accepted / rejected.
  - `validateChannels`: the number-range rule.
- **Data tests:** the real `channels.json` and collections validate against
  the real catalog; every franchise collection resolves all of its keys.
- **Web and mobile (RTL):** both Home strips render without headings; the
  LiveRow / channel strip render the "Canales" and "24/7" labels with the
  right channels under each; ↑ from 15 tunes 101.
- **Manual:** on a real TV after the build (the user runs the install):
  tune 101–112, watch a run boundary, zap across the 15 ↔ 101 seam.

## 6. Out of scope (later)

- More franchise channels (Futurama, Digimon, Scooby-Doo, Hora de Aventura,
  El Chavo, La Pantera Rosa, Ben 10; Pokémon once a series is ingested;
  Dragon Ball gains a lot from ingesting DBZ). Each is a data-only edit:
  a collection file with `"group": "franchise"` plus a channel entry.
- Chapters for `looney-tunes-el-correcaminos`, then dropping its `exclude`.

Logo art for the 9 new collections and `spider-man` is in scope: `logo` is a
required collection field, so each needs an SVG before its file lands.
