# Franchise 24/7 Channels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 12 franchise "24/7" live channels (101–112) that air short random runs across a whole franchise, shown as a labeled "24/7" group in TV mode and as a second, heading-less collection strip on Home.

**Architecture:** A collection gains `group: 'franchise'`; a channel inherits its collection's group, and the group sets the plan's scheduling `mode` (`blocks` for networks, the new `runs` for franchises). `playRun` sits next to `playRound` in the pure schedule engine and reuses its checkpoint cache, so every device still computes the same schedule from the clock. UI splits strips and channel lists by group using two shared core helpers.

**Tech Stack:** TypeScript, Vitest (core, web), React (web), React Native + Jest (mobile, Android TV), JSON data files.

**Spec:** `docs/superpowers/specs/2026-10-12-franchise-channels-design.md` (builds on `docs/superpowers/specs/2026-10-01-live-tv-channels-design.md`).

## Global Constraints

- `group` values: `'network' | 'franchise'`; absent means `'network'`.
- Network channel numbers ≤ 99; franchise channel numbers ≥ 101.
- Group labels, verbatim: **"Canales"** (network) and **"24/7"** (franchise).
- The franchise Home strip has **no heading**, exactly like the existing strip.
- Run length: `2 + floor(hash01(s, 'len') * 2)` units, truncated at the title's last unit, no wrap. `s = (plan.seed + run index) >>> 0`.
- Pick keys for `hash01`: `'pick'`, then `'pick#1'` … `'pick#8'`, then fall back to unit 0 of the next title in plan order.
- `scheduleAt`'s signature and `Schedule` result are unchanged.
- Spanish UI copy only; no new user-visible strings beyond the two labels.
- Commands: core `npm test -w @go10/core`, web `npm test -w @go10/web`, mobile `npm test -w @go10/mobile`, all `npm run typecheck`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Zap across the seam:** ↑ from channel 13 (the last network) must tune 101 and ↑ from 112 must wrap to 1. `stepChannel` walks the number-sorted lineup; pinned by a test in Task 2.
2. **Stale last channel after the Marvel rename:** a stored `go10:tvLastChannel` of `marvel` must open the default channel, not a blank screen. Pinned in Task 2.
3. **Only one group present:** a lineup or collection list with no franchises (or no networks) must render no empty "24/7" section and no empty second strip, and must not shift web focus row indices. Pinned in Tasks 1, 2 and 4.
4. **Single-title franchise channel** (Los Simpsons, Supercampeones…): the no-back-to-back rule must not loop or starve; runs repeat the same title freely. Pinned in Task 3.
5. **A pick on a title's last unit, or a movie:** must be a one-unit run, never wrapping to episode 1. Pinned in Task 3.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `packages/core/src/collections/types.ts` | `CollectionGroup`, `Collection.group` | 1 |
| `packages/core/src/collections/validateCollection.ts` | validate `group` | 1 |
| `packages/core/src/collections/groups.ts` (new) | `collectionGroup`, `splitByGroup` | 1 |
| `packages/core/src/tv/types.ts` | `ChannelPlan.mode`, `Channel.group` | 2 |
| `packages/core/src/tv/plan.ts` | set `mode` from the collection | 2 |
| `packages/core/src/tv/lineup.ts` | set `Channel.group` | 2 |
| `packages/core/src/tv/validateChannels.ts` | number-range rule | 2 |
| `packages/core/src/tv/groups.ts` (new) | `channelGroups` (labeled sections) | 2 |
| `packages/core/src/tv/schedule.ts` | `playRun`, `playNext`, dispatch | 3 |
| `apps/web/src/screens/Home.tsx` | second strip, focus row indices | 4 |
| `apps/web/src/tv/LiveRow.tsx`, `apps/web/src/tv/TvScreen.tsx`, `apps/web/src/tv/tv.css` | labeled sections | 4 |
| `apps/mobile/src/home/homeModel.ts`, `apps/mobile/src/components/HomeView.tsx` | second strip | 5 |
| `apps/mobile/src/tv/LiveRow.tsx`, `apps/mobile/src/tv/TvScreenView.tsx` | labeled sections | 5 |
| `apps/web/public/assets/collections/<id>/logo.svg` (10 new) | logos | 6 |
| `data/collections/*.json`, `data/channels.json` | lineup data | 6 |

---

### Task 1: Collection `group`

**Files:**
- Modify: `packages/core/src/collections/types.ts`
- Modify: `packages/core/src/collections/validateCollection.ts` (after the `order` check)
- Create: `packages/core/src/collections/groups.ts`
- Test: `packages/core/src/collections/validateCollection.test.ts`, `packages/core/src/collections/groups.test.ts` (new)

**Interfaces:**
- Produces: `type CollectionGroup = 'network' | 'franchise'`; `Collection.group?: CollectionGroup`; `collectionGroup(c: Collection): CollectionGroup`; `splitByGroup<T>(items: T[], groupOf: (item: T) => CollectionGroup): { network: T[]; franchise: T[] }`.

- [ ] **Step 1: Write the failing tests**

Append to the `describe('validateCollection', …)` block in `validateCollection.test.ts`:

```ts
  it.each([['network'], ['franchise']])('accepts group "%s"', (group) => {
    expect(check({ ...valid(), group })).toEqual([])
  })

  it.each([['Franchise'], [''], [1], [null]])('rejects group %j', (group) => {
    expect(check({ ...valid(), group })).toEqual([
      'cartoon-network.json: group must be "network" or "franchise" when present',
    ])
  })
```

Create `groups.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { collectionOf } from '../tv/testing'
import { collectionGroup, splitByGroup } from './groups'

describe('collectionGroup', () => {
  it('defaults to network', () => {
    expect(collectionGroup(collectionOf('cn', ['x']))).toBe('network')
    expect(collectionGroup({ ...collectionOf('db', ['x']), group: 'franchise' })).toBe('franchise')
  })
})

describe('splitByGroup', () => {
  it('splits keeping order, and leaves a group empty when nothing is in it', () => {
    const cn = collectionOf('cn', ['x'])
    const db = { ...collectionOf('db', ['x']), group: 'franchise' as const }
    const jx = collectionOf('jx', ['x'])
    expect(splitByGroup([cn, db, jx], collectionGroup)).toEqual({ network: [cn, jx], franchise: [db] })
    expect(splitByGroup([cn], collectionGroup)).toEqual({ network: [cn], franchise: [] })
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w @go10/core -- src/collections`
Expected: FAIL. The `group` rejections return `[]`, and `./groups` doesn't resolve.

- [ ] **Step 3: Implement**

In `types.ts`, above `Collection`:

```ts
/** Which Home strip and live TV group a collection belongs to. */
export type CollectionGroup = 'network' | 'franchise'
```

and inside `Collection`, after `order`:

```ts
  /** Network/studio (default) or a single franchise, which gets a 24/7 channel. */
  group?: CollectionGroup
```

In `validateCollection.ts`, right after `if (!Number.isInteger(c.order)) fail('order must be an integer')`:

```ts
  if (c.group !== undefined && c.group !== 'network' && c.group !== 'franchise') {
    fail('group must be "network" or "franchise" when present')
  }
```

Create `groups.ts`:

```ts
import type { Collection, CollectionGroup } from './types'

export function collectionGroup(collection: Collection): CollectionGroup {
  return collection.group ?? 'network'
}

/** Networks and franchises, each in the order given. */
export function splitByGroup<T>(items: T[], groupOf: (item: T) => CollectionGroup): { network: T[]; franchise: T[] } {
  return {
    network: items.filter((item) => groupOf(item) === 'network'),
    franchise: items.filter((item) => groupOf(item) === 'franchise'),
  }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -w @go10/core -- src/collections && npm run typecheck -w @go10/core`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/collections
git commit -m "feat(core): collection group (network | franchise)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Channel group, plan mode, number ranges

**Files:**
- Modify: `packages/core/src/tv/types.ts`, `packages/core/src/tv/plan.ts`, `packages/core/src/tv/lineup.ts`, `packages/core/src/tv/validateChannels.ts`
- Create: `packages/core/src/tv/groups.ts`
- Test: `packages/core/src/tv/plan.test.ts`, `packages/core/src/tv/validateChannels.test.ts`, `packages/core/src/tv/lineup.test.ts`, `packages/core/src/tv/groups.test.ts` (new)

**Interfaces:**
- Consumes: `CollectionGroup`, `collectionGroup` (Task 1).
- Produces: `type ScheduleMode = 'blocks' | 'runs'`; `ChannelPlan.mode: ScheduleMode`; `Channel.group: CollectionGroup`; `interface ChannelGroup { group: CollectionGroup; label: 'Canales' | '24/7'; channels: Channel[] }`; `channelGroups(channels: Channel[]): ChannelGroup[]` (in `tv/groups.ts`), which returns only non-empty groups, network first.

- [ ] **Step 1: Write the failing tests**

`plan.test.ts`, inside `describe('buildChannelPlan', …)`:

```ts
  it('schedules a network in blocks and a franchise in runs', () => {
    expect(buildChannelPlan({ id: 'cn', number: 1, collection: 'cn' }, collection, titles).mode).toBe('blocks')
    expect(buildChannelPlan({ id: 'cn', number: 101, collection: 'cn' }, { ...collection, group: 'franchise' }, titles).mode).toBe('runs')
  })
```

`validateChannels.test.ts`: read the top of the file for its existing fixtures and helper names, then add a `describe` that builds its own context:

```ts
describe('number ranges', () => {
  const titles = [showTitle('s', 3, 600)]
  const collections = [collectionOf('net', ['s']), { ...collectionOf('fr', ['s']), group: 'franchise' as const }]
  const file = (channels: unknown[]) => ({ epoch: '2026-10-01T00:00:00Z', defaultChannel: 'n', channels })

  it('accepts a network at 1–99 and a franchise at 101+', () => {
    expect(validateChannels(file([{ id: 'n', number: 99, collection: 'net' }, { id: 'f', number: 101, collection: 'fr' }]), { collections, titles })).toEqual([])
  })

  it('rejects a network above 99 and a franchise below 101', () => {
    expect(validateChannels(file([{ id: 'n', number: 100, collection: 'net' }, { id: 'f', number: 100, collection: 'fr' }]), { collections, titles })).toEqual([
      'channels.json: channels[0] (n): a network channel\'s number must be 99 or less',
      'channels.json: channels[1] (f): a franchise channel\'s number must be 101 or more',
      'channels.json: number 100 is used by more than one channel',
    ])
  })
})
```

(Import `collectionOf` and `showTitle` from `./testing` if the file doesn't already.)

`lineup.test.ts`, add a describe. Read the file's setup first: if it stubs `keyValueStore`, reuse that stub to store `marvel`.

```ts
describe('franchise channels in the lineup', () => {
  const titles = [showTitle('s', 3, 600)]
  const fr = { ...collectionOf('fr', ['s']), group: 'franchise' as const }
  const lineup = resolveLineup(
    {
      epoch: '2026-10-01T00:00:00Z',
      defaultChannel: 'n1',
      channels: [
        { id: 'f2', number: 102, collection: 'fr' },
        { id: 'n1', number: 1, collection: 'net' },
        { id: 'n15', number: 15, collection: 'net' },
        { id: 'f1', number: 101, collection: 'fr' },
      ],
    },
    [collectionOf('net', ['s']), fr],
    titles,
  )!

  it('takes the group from the collection', () => {
    expect(lineup.channels.map((c) => [c.id, c.group])).toEqual([['n1', 'network'], ['n15', 'network'], ['f1', 'franchise'], ['f2', 'franchise']])
  })

  it('zaps across the seam and wraps', () => {
    expect(stepChannel(lineup, 'n15', 1).id).toBe('f1')
    expect(stepChannel(lineup, 'f1', -1).id).toBe('n15')
    expect(stepChannel(lineup, 'f2', 1).id).toBe('n1')
  })

  it('falls back to the default when the last channel no longer exists (marvel → spider-man)', () => {
    writeLastChannel('marvel')
    expect(pickChannel(lineup, null)?.id).toBe('n1')
  })
})
```

Create `groups.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resolveLineup } from './lineup'
import { channelGroups } from './groups'
import { collectionOf, showTitle } from './testing'

const titles = [showTitle('s', 3, 600)]
const collections = [collectionOf('net', ['s']), { ...collectionOf('fr', ['s']), group: 'franchise' as const }]
const lineupOf = (channels: unknown[]) =>
  resolveLineup({ epoch: '2026-10-01T00:00:00Z', defaultChannel: 'n', channels }, collections, titles)!

describe('channelGroups', () => {
  it('labels networks "Canales" and franchises "24/7", networks first', () => {
    const lineup = lineupOf([{ id: 'f', number: 101, collection: 'fr' }, { id: 'n', number: 1, collection: 'net' }])
    expect(channelGroups(lineup.channels).map((g) => [g.label, g.channels.map((c) => c.id)])).toEqual([
      ['Canales', ['n']],
      ['24/7', ['f']],
    ])
  })

  it('leaves out a group with no channels', () => {
    const lineup = lineupOf([{ id: 'n', number: 1, collection: 'net' }])
    expect(channelGroups(lineup.channels).map((g) => g.label)).toEqual(['Canales'])
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w @go10/core -- src/tv`
Expected: FAIL, because `mode`, `group`, `channelGroups` and the range errors don't exist yet.

- [ ] **Step 3: Implement**

`types.ts`: add `import type { CollectionGroup } from '../collections/types'` (merge with the existing `Collection` import), then:

```ts
/** `blocks`: rotating turns of consecutive episodes (networks). `runs`: 2–3 episodes from a random point (franchises). */
export type ScheduleMode = 'blocks' | 'runs'
```

In `ChannelPlan`, add `mode: ScheduleMode` after `blockSeconds`. In `Channel`, add `group: CollectionGroup` after `name`.

`plan.ts`: import `collectionGroup` from `'../collections/groups'` and add to the returned object, after `blockSeconds`:

```ts
    mode: collectionGroup(collection) === 'franchise' ? 'runs' : 'blocks',
```

`lineup.ts`: import `collectionGroup` and add `group: collectionGroup(collection),` after `name:` in `channels.push({…})`.

`validateChannels.ts`: import `collectionGroup`; in `validateChannelEntry`, right after `if (!collection) return …`:

```ts
  if (collectionGroup(collection) === 'franchise') {
    if (config.number < 101) errors.push(`${named}: a franchise channel's number must be 101 or more`)
  } else if (config.number > 99) {
    errors.push(`${named}: a network channel's number must be 99 or less`)
  }
```

Create `tv/groups.ts`:

```ts
import type { CollectionGroup } from '../collections/types'
import type { Channel } from './types'

export interface ChannelGroup {
  group: CollectionGroup
  label: 'Canales' | '24/7'
  channels: Channel[]
}

/** The lineup as the TV strip and "En vivo ahora" show it: networks, then franchises; empty groups left out. */
export function channelGroups(channels: Channel[]): ChannelGroup[] {
  const groups: ChannelGroup[] = [
    { group: 'network', label: 'Canales', channels: channels.filter((c) => c.group === 'network') },
    { group: 'franchise', label: '24/7', channels: channels.filter((c) => c.group === 'franchise') },
  ]
  return groups.filter((g) => g.channels.length > 0)
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -w @go10/core && npm run typecheck`
Expected: PASS. If typecheck flags hand-built `ChannelPlan` or `Channel` literals in web or mobile tests, add `mode: 'blocks'` or `group: 'network'` to them.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tv apps
git commit -m "feat(core): channel groups, schedule mode and number ranges

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Random runs engine

**Files:**
- Modify: `packages/core/src/tv/schedule.ts`
- Test: `packages/core/src/tv/schedule.test.ts`

**Interfaces:**
- Consumes: `ChannelPlan.mode` (Task 2), `hash01(seed: number, key: string): number` from `../lib/hash`.
- Produces: `playRun(plan, cp): { airings: Airing[]; next: Checkpoint }` and `playNext(plan, cp)` (dispatches on `plan.mode`), both exported. `scheduleAt` is unchanged outside.

- [ ] **Step 1: Write the failing tests**

Append to `schedule.test.ts` (extend the imports with `playRun`, `playNext`):

```ts
function runsPlan(titles = [showTitle('big', 90, 600), showTitle('small', 9, 600), movieTitle('m', 5400)]): ChannelPlan {
  const collection = { ...collectionOf('fr', titles.map((t) => t.key)), group: 'franchise' as const }
  return buildChannelPlan({ id: 'fr', number: 101, collection: 'fr' }, collection, titles)
}

function naiveRuns(p: ChannelPlan, runs: number): Airing[] {
  let cp = originOf(p, EPOCH)
  const all: Airing[] = []
  for (let i = 0; i < runs; i++) {
    const r = playRun(p, cp)
    all.push(...r.airings)
    cp = r.next
  }
  return all
}

describe('playRun', () => {
  it('is deterministic and contiguous from the epoch', () => {
    const p = runsPlan()
    expect(naiveRuns(p, 50)).toEqual(naiveRuns(p, 50))
    const all = naiveRuns(p, 50)
    expect(all[0].startsAt).toBe(EPOCH)
    for (let i = 1; i < all.length; i++) expect(all[i].startsAt).toBe(all[i - 1].endsAt)
  })

  it('airs 1–3 consecutive units of one title, never wrapping past its end', () => {
    const p = runsPlan()
    let cp = originOf(p, EPOCH)
    for (let i = 0; i < 300; i++) {
      const { airings, next } = playRun(p, cp)
      expect(airings.length).toBeGreaterThanOrEqual(1)
      expect(airings.length).toBeLessThanOrEqual(3)
      expect(new Set(airings.map((a) => a.titleKey)).size).toBe(1)
      const units = p.titles.find((t) => t.key === airings[0].titleKey)!.units
      const first = units.findIndex((u) => u.key === airings[0].unit.key)
      expect(airings.map((a) => a.unit.key)).toEqual(units.slice(first, first + airings.length).map((u) => u.key))
      if (airings.length < 2) expect(first === units.length - 1).toBe(true)
      cp = next
    }
  })

  it('airs a movie alone', () => {
    const p = runsPlan()
    const movieRuns = Array.from({ length: 400 }, (_, round) => playRun(p, { ...originOf(p, EPOCH), round }).airings).filter((a) => a[0].titleKey === 'm')
    expect(movieRuns.length).toBeGreaterThan(0)
    for (const run of movieRuns) expect(run.map((a) => a.unit.key)).toEqual(['m'])
  })

  it('picks by unit, so a long series wins most runs', () => {
    const p = runsPlan() // 90 + 9 + 1 units
    const firsts = Array.from({ length: 4000 }, (_, round) => playRun(p, { ...originOf(p, EPOCH), round }).airings[0].titleKey)
    const share = (key: string) => firsts.filter((k) => k === key).length / firsts.length
    expect(share('big')).toBeGreaterThan(0.85)
    expect(share('big')).toBeLessThan(0.95)
    expect(share('m')).toBeLessThan(0.03)
  })

  it('never airs the same title twice in a row when there are several', () => {
    const p = runsPlan()
    const runTitles: string[] = []
    let cp = originOf(p, EPOCH)
    for (let i = 0; i < 500; i++) {
      const r = playRun(p, cp)
      runTitles.push(r.airings[0].titleKey)
      cp = r.next
    }
    for (let i = 1; i < runTitles.length; i++) expect(runTitles[i]).not.toBe(runTitles[i - 1])
  })

  it('repeats freely on a single-title channel', () => {
    const p = runsPlan([showTitle('simpsons', 81, 1320)])
    const all = naiveRuns(p, 100)
    expect(new Set(all.map((a) => a.titleKey))).toEqual(new Set(['simpsons']))
  })
})

describe('playNext', () => {
  it('dispatches on the plan mode', () => {
    const blocks = plan()
    const runs = runsPlan()
    expect(playNext(blocks, originOf(blocks, EPOCH))).toEqual(playRound(blocks, originOf(blocks, EPOCH)))
    expect(playNext(runs, originOf(runs, EPOCH))).toEqual(playRun(runs, originOf(runs, EPOCH)))
  })
})

describe('scheduleAt in runs mode', () => {
  it('matches a naïve run-by-run simulation, through the checkpoint cache', () => {
    const p = runsPlan()
    const all = naiveRuns(p, 2000)
    const end = all[all.length - 1].endsAt
    for (let i = 0; i < 300; i++) {
      const t = EPOCH + Math.floor(((i * 7919) % 1000) / 1000 * (end - EPOCH - 1))
      const expected = all.find((a) => a.startsAt <= t && t < a.endsAt)!
      expect(scheduleAt(p, EPOCH, t).current).toEqual(expected)
    }
  })

  it('answers boundary instants with the airing that starts there', () => {
    const p = runsPlan()
    const all = naiveRuns(p, 20)
    expect(scheduleAt(p, EPOCH, all[5].startsAt).current).toEqual(all[5])
    expect(scheduleAt(p, EPOCH, all[5].startsAt).offset).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w @go10/core -- src/tv/schedule`
Expected: FAIL, because `playRun` and `playNext` are not exported.

- [ ] **Step 3: Implement**

In `schedule.ts`, after `playRound`:

```ts
/** Pick attempts that may land on the title that just aired before falling back. */
const REPICKS = 8

/**
 * One run (franchise channels): a unit picked uniformly over every unit of
 * every title, so a long series outweighs a single movie, then 2 or 3
 * consecutive units of that title from there, cut at the title's end. Never
 * the title the previous run aired, unless the plan has only one.
 */
export function playRun(plan: ChannelPlan, cp: Checkpoint): { airings: Airing[]; next: Checkpoint } {
  const seed = (plan.seed + cp.round) >>> 0
  const total = plan.titles.reduce((sum, title) => sum + title.units.length, 0)
  const locate = (key: string) => {
    let flat = Math.min(total - 1, Math.floor(hash01(seed, key) * total))
    let title = 0
    while (flat >= plan.titles[title].units.length) flat -= plan.titles[title++].units.length
    return { title, unit: flat }
  }
  let pick = locate('pick')
  if (plan.titles.length > 1) {
    for (let k = 1; pick.title === cp.lastTitle && k <= REPICKS; k++) pick = locate(`pick#${k}`)
    if (pick.title === cp.lastTitle) pick = { title: (cp.lastTitle + 1) % plan.titles.length, unit: 0 }
  }
  const { key, units } = plan.titles[pick.title]
  const count = Math.min(2 + Math.floor(hash01(seed, 'len') * 2), units.length - pick.unit)
  const airings: Airing[] = []
  let t = cp.startsAt
  for (const unit of units.slice(pick.unit, pick.unit + count)) {
    const endsAt = t + unit.length * 1000
    airings.push({ unit, titleKey: key, startsAt: t, endsAt })
    t = endsAt
  }
  return { airings, next: { round: cp.round + 1, startsAt: t, cursors: cp.cursors, lastTitle: pick.title } }
}

/** The next round (block channels) or run (franchise channels). */
export function playNext(plan: ChannelPlan, cp: Checkpoint): { airings: Airing[]; next: Checkpoint } {
  return plan.mode === 'runs' ? playRun(plan, cp) : playRound(plan, cp)
}
```

Then replace the three `playRound(plan, …)` calls inside `checkpointBefore`, `roundAt` and `scheduleAt` with `playNext(plan, …)`. Leave `playRound` itself and the `Checkpoint` doc unchanged, but add to the `round` field's doc: `For runs mode, the run index.`

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -w @go10/core && npm run typecheck -w @go10/core`
Expected: PASS, and the existing `playRound`/`scheduleAt` tests still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tv/schedule.ts packages/core/src/tv/schedule.test.ts
git commit -m "feat(core): random runs schedule for franchise channels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Web UI — second strip and labeled channel groups

**Files:**
- Modify: `apps/web/src/screens/Home.tsx` (the `strip` memo, focus-row math around "Focus rows:", the `<CollectionStrip>` render)
- Modify: `apps/web/src/tv/LiveRow.tsx`, `apps/web/src/tv/TvScreen.tsx` (the `go-tv_track` map, ~line 307), `apps/web/src/tv/tv.css`
- Test: `apps/web/src/screens/Home.test.tsx` (find the existing Home test with `ls apps/web/src/screens`; if Home has none, use `apps/web/src/components/CollectionStrip.test.tsx`'s render style in a new `Home.strips.test.tsx`), `apps/web/src/tv/LiveRow.test.tsx`, `apps/web/src/tv/TvScreen.test.tsx`

**Interfaces:**
- Consumes: `collectionGroup`, `splitByGroup` (Task 1); `channelGroups`, `Channel.group` (Task 2).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing tests**

Read the existing `LiveRow.test.tsx` and `TvScreen.test.tsx` first and follow their fixtures and render helpers (TvProvider wrapper, lineup builder). Add a lineup fixture with one network (`number: 1`, collection `net`) and one franchise (`number: 101`, collection with `group: 'franchise'`), then:

`LiveRow.test.tsx`:

```ts
it('shows networks under "Canales" and franchises under "24/7"', () => {
  renderLiveRow(mixedLineup) // the file's existing render helper, given the mixed lineup
  const canales = screen.getByText('Canales')
  const franquicias = screen.getByText('24/7')
  expect(canales.compareDocumentPosition(franquicias) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label')?.split(' ')[0])).toEqual(['1', '101'])
})

it('shows no "24/7" label when there are no franchise channels', () => {
  renderLiveRow(networkOnlyLineup)
  expect(screen.queryByText('24/7')).toBeNull()
})
```

`TvScreen.test.tsx`: the same two assertions against the TV screen's channel strip, scoped with `within(screen.getByRole('navigation', { name: 'Canales' }))`.

Home test: render Home with collections `[cn (network, order 1), db (franchise, order 101)]` whose titles are in the catalog fixture:

```ts
it('renders franchises in a second strip, with no heading', () => {
  renderHome({ collections: [cn, db] })
  const strips = screen.getAllByRole('navigation', { name: /Colecciones|Franquicias/ })
  expect(strips.map((s) => within(s).getAllByRole('button').length)).toEqual([1, 1])
  expect(screen.queryByRole('heading', { name: 'Franquicias' })).toBeNull()
})

it('renders one strip when no franchise collection is visible', () => {
  renderHome({ collections: [cn] })
  expect(screen.getAllByRole('navigation', { name: /Colecciones|Franquicias/ })).toHaveLength(1)
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w @go10/web -- LiveRow TvScreen Home`
Expected: FAIL. No labels or second strip exist yet.

- [ ] **Step 3: Implement**

`CollectionStrip.tsx`: add an optional `label = 'Colecciones'` prop, used as the `<nav aria-label>`. It is an accessible name only; nothing visible changes.

`Home.tsx`: replace the `strip` memo with:

```ts
  const strips = useMemo(
    () => splitByGroup(visibleCollections(collections, titles).map((resolved) => resolved.collection), collectionGroup),
    [collections, titles],
  )
```

Then update the focus-row math and render:

```ts
  // Focus rows: networks strip, franchises strip, then the live row, then Seguir viendo, then the catalog rows.
  const stripRows = (strips.network.length > 0 ? 1 : 0) + (strips.franchise.length > 0 ? 1 : 0)
  const liveIndex = stripRows
```

```tsx
        {strips.network.length > 0 && <CollectionStrip collections={strips.network} rowIndex={0} onSelect={onOpenCollection} />}
        {strips.franchise.length > 0 && (
          <CollectionStrip
            collections={strips.franchise}
            rowIndex={strips.network.length > 0 ? 1 : 0}
            label="Franquicias"
            onSelect={onOpenCollection}
          />
        )}
```

`LiveRow.tsx`: replace the single map with grouped sections inside the same track, keeping a running `col` so spatial focus is unchanged:

```tsx
      <div className="go-row_track">
        {(() => {
          let col = 0
          return channelGroups(lineup.channels).map((group) => (
            <Fragment key={group.group}>
              <span className="go-channel-group">{group.label}</span>
              {group.channels.map((channel) => {
                const schedule = live.get(channel.id)
                return schedule ? (
                  <ChannelTile key={channel.id} channel={channel} schedule={schedule} row={rowIndex} col={col++} scope="live" onSelect={(c) => onWatch(c.id)} />
                ) : null
              })}
            </Fragment>
          ))
        })()}
      </div>
```

`TvScreen.tsx`: same transformation of the `go-tv_track` map (keep `row={0}`, `current`, `scope="tv"`, `onSelect={onTile}`, `onKey={onKey}`).

`tv.css`, append:

```css
/* "Canales" / "24/7": a label in the track, before its group's first tile. */
.go-channel-group {
  flex: none;
  align-self: center;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.7;
}
```

Import `Fragment` from `react` and `channelGroups` from `@go10/core/tv/groups` where used.

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -w @go10/web && npm run typecheck -w @go10/web`
Expected: PASS, including the existing focus and spatial-nav tests for Home and the TV screen.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): Franquicias strip and Canales / 24/7 channel groups

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Mobile (Android TV) UI — second strip and labeled channel groups

**Files:**
- Modify: `apps/mobile/src/home/homeModel.ts`, `apps/mobile/src/components/HomeView.tsx` (`Section`, `homeSections`, `renderItem`)
- Modify: `apps/mobile/src/tv/LiveRow.tsx`, `apps/mobile/src/tv/TvScreenView.tsx` (the strip `ScrollView` map, ~line 188)
- Test: `apps/mobile/src/components/HomeView.test.tsx`, `apps/mobile/src/tv/LiveRow.test.tsx`, `apps/mobile/src/tv/TvScreenView.test.tsx`, and the homeModel test if one exists (`ls apps/mobile/src/home`)

**Interfaces:**
- Consumes: `collectionGroup`, `splitByGroup` (Task 1); `channelGroups` (Task 2).
- Produces: `HomeModel.franchiseStrip: Collection[]`; `Section` gains `{ kind: 'franchises' }`.

- [ ] **Step 1: Write the failing tests**

`HomeView.test.tsx`, next to the existing `homeSections` tests:

```ts
it('puts the franchise strip right after the networks strip, only when it has collections', () => {
  const base = { ...model, strip: [cn], franchiseStrip: [db] }
  expect(homeSections(base, 0, true).slice(0, 3)).toEqual([{ kind: 'strip' }, { kind: 'franchises' }, { kind: 'live' }])
  expect(homeSections({ ...base, franchiseStrip: [] }, 0, true).slice(0, 2)).toEqual([{ kind: 'strip' }, { kind: 'live' }])
})
```

(Use the file's existing `model` fixture. Build `cn` with `collectionOf('cn', …)` and `db` with `{ ...collectionOf('db', …), group: 'franchise' as const }`, both from `@go10/core/tv/testing`.)

`LiveRow.test.tsx`: build a mixed lineup (collection `b` gets `group: 'franchise'`, channel `b` gets `number: 101`) and add:

```ts
it('shows networks under "Canales" and franchises under "24/7"', async () => {
  await render(<LiveRow lineup={mixed} imageBase="https://tv.test/" onWatch={jest.fn()} />)
  expect(screen.getByText('Canales')).toBeTruthy()
  expect(screen.getByText('24/7')).toBeTruthy()
  expect(screen.getByLabelText(/^101 /)).toBeTruthy()
})

it('shows no "24/7" label without franchise channels', async () => {
  await render(<LiveRow lineup={lineup} imageBase="https://tv.test/" onWatch={jest.fn()} />)
  expect(screen.queryByText('24/7')).toBeNull()
})
```

`TvScreenView.test.tsx`: the same pair, following that file's render helper, with the strip opened the way the existing tests open it.

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w @go10/mobile -- HomeView LiveRow TvScreenView`
Expected: FAIL.

- [ ] **Step 3: Implement**

`homeModel.ts`: add to `HomeModel`:

```ts
  /** Franchise collections with at least one title, in tile order: the second strip, also headless. */
  franchiseStrip: Collection[]
```

and in `buildHome`:

```ts
  const strips = splitByGroup(visibleCollections(data.collections, data.titles).map((resolved) => resolved.collection), collectionGroup)
  return {
    slides,
    strip: strips.network,
    franchiseStrip: strips.franchise,
    …
```

Update the `strip` doc to "Network collections with at least one title…". Fix any other `HomeModel` literals that typecheck flags.

`HomeView.tsx`:

```ts
type Section = { kind: 'strip' } | { kind: 'franchises' } | { kind: 'live' } | { kind: 'continue' } | { kind: 'row'; index: number }
```

In `homeSections`, after the `strip` entry:

```ts
    ...(model.franchiseStrip.length > 0 ? [{ kind: 'franchises' } as const] : []),
```

In `renderItem`, after the `strip` line:

```tsx
        if (item.kind === 'franchises') return <CollectionStrip collections={model.franchiseStrip} imageBase={imageBase} onSelect={onSelectCollection} />
```

`LiveRow.tsx`: inside the `ScrollView`, render the groups (import `Fragment` and `channelGroups`):

```tsx
          {channelGroups(lineup.channels).map((group) => (
            <Fragment key={group.group}>
              <Text style={styles.group}>{group.label}</Text>
              {group.channels.map((channel) => {
                const schedule = live.get(channel.id)
                return schedule ? <ChannelTile key={channel.id} channel={channel} schedule={schedule} imageBase={imageBase} onSelect={(c) => onWatch(c.id)} /> : null
              })}
            </Fragment>
          ))}
```

with a style:

```ts
  // "Canales" / "24/7": not focusable, so the D-pad moves tile to tile across groups.
  group: { alignSelf: 'center', color: theme.color.text, opacity: 0.7, fontFamily: theme.font.displayBold, fontSize: theme.size.section * 0.6, textTransform: 'uppercase' },
```

`TvScreenView.tsx`: same transformation of the strip map (keep `current` and `preferred`), with the same `group` style added to its `StyleSheet`.

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -w @go10/mobile && npm run typecheck -w @go10/mobile`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src
git commit -m "feat(mobile): Franquicias strip and Canales / 24/7 channel groups

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Lineup data — logos, collections, channels

**Files:**
- Create: `apps/web/public/assets/collections/{dragon-ball,yu-gi-oh,tom-y-jerry,looney-tunes,los-simpsons,caballeros-del-zodiaco,sailor-moon,supercampeones,thundercats,spider-man}/logo.svg`
- Create: `data/collections/{dragon-ball,yu-gi-oh,tom-y-jerry,looney-tunes,los-simpsons,caballeros-del-zodiaco,sailor-moon,supercampeones,thundercats}.json`
- Rename: `data/collections/marvel.json` → `data/collections/spider-man.json`. Delete `apps/web/public/assets/collections/marvel/` once nothing references it.
- Modify: `data/collections/barbie.json`, `data/collections/monster-high.json`, `data/channels.json`
- Test (existing, must pass): `apps/web/src/collections/collections.data.test.ts`, `apps/web/src/tv/channels.data.test.ts`

**Interfaces:**
- Consumes: `group` validation (Task 1), number-range validation (Task 2).

- [ ] **Step 1: Logos**

Each logo is the show's or franchise's official wordmark as an SVG, sized like the existing ones: a `viewBox` with the wordmark filling it, no padding, readable on its tile color. Source each from Wikimedia Commons (search "<name> logo svg"). If Commons only has a PNG, wrap it the way `assets/collections/monster-high/logo.svg` does (an `<image>` with a base64 PNG inside an SVG). Keep each file under ~60 KB.

For Spider-Man, use the Spider-Man wordmark. If a logo can't be found for one of them, **stop and ask the user** rather than inventing artwork.

- [ ] **Step 2: Write the collection files**

Template, with values from the table below:

```json
{
  "id": "dragon-ball",
  "name": "Dragon Ball",
  "order": 101,
  "group": "franchise",
  "logo": "assets/collections/dragon-ball/logo.svg",
  "tile": { "color": "#f28c00" },
  "titles": ["dragon-ball", "…"]
}
```

| id | name | order | color | titles (in this order) |
|---|---|---|---|---|
| `dragon-ball` | Dragon Ball | 101 | `#f28c00` | `dragon-ball`, `dragon-ball-super-beerus`, `15686163630767`, `14705474407150`, `14706742135534`, `14705474603758`, `14790427871822`, `2808504191608`, `2808504126072`, `2808060906104`, `2057376893532`, `6039184542418`, `2808060840568`, `14718117677806`, `92504918728`, `2808061037176`, `14790427544142`, `2808503995000`, `2808060775032`, `92505770696`, `2808060971640`, `2808499604088` |
| `yu-gi-oh` | Yu-Gi-Oh! | 102 | `#5b2a86` | `yu-gi-oh`, `yu-gi-oh-gx`, `15015012338364`, `15030031485628`, `15029787298492` |
| `tom-y-jerry` | Tom y Jerry | 103 | `#1f6fb2` | `tom-y-jerry`, `tom-y-jerry-redoblaje`, `el-nuevo-show-de-tom-y-jerry`, `14766751287910`, `16936861501958`, `13310400858878`, `14766664256102`, `8813716376135`, `8821574535751`, `7265551256166`, `8833835534919`, `14766848412262`, `14766802668134`, `7265551387238` |
| `looney-tunes` | Looney Tunes | 104 | `#c8102e` | `las-aventuras-de-silvestre-y-piolin`, `duck-dodgers`, `looney-tunes-speedy-gonzales`, `looney-tunes-el-correcaminos` |
| `los-simpsons` | Los Simpsons | 105 | `#fed90f` | `los-simpsons` |
| `caballeros-del-zodiaco` | Los Caballeros del Zodiaco | 106 | `#1b2a5e` | `los-caballeros-del-zodiaco` |
| `sailor-moon` | Sailor Moon | 107 | `#e85a9b` | `sailor-moon`, `sailor-moon-r` |
| `supercampeones` | Supercampeones | 108 | `#0b8a3e` | `supercampeones` |
| `thundercats` | ThunderCats | 109 | `#b5121b` | `thundercats` |

If a logo turns out unreadable on its color, adjust the color; it is a free choice.

- [ ] **Step 3: Move the existing three into the franchise group**

- `barbie.json`: add `"group": "franchise"` after `order`, and set `"order": 111`.
- `monster-high.json`: add `"group": "franchise"`, and set `"order": 112`.
- `git mv data/collections/marvel.json data/collections/spider-man.json`. Set `"id": "spider-man"`, `"name": "Spider-Man"`, `"order": 110`, `"group": "franchise"` and `"logo": "assets/collections/spider-man/logo.svg"`. Titles stay unchanged.
- `git rm -r apps/web/public/assets/collections/marvel`, after `grep -rn "collections/marvel" apps packages data` returns only test fixtures. Those fixtures are strings in `validateCollection.test.ts` and don't need the file.

- [ ] **Step 4: Update `data/channels.json`**

Barbie (14), Monster High (15) and Marvel (16) leave the network numbers. The final `channels` array is:

```json
    { "id": "cartoon-network", "number": 1, "collection": "cartoon-network" },
    { "id": "jetix", "number": 2, "collection": "jetix" },
    { "id": "disney", "number": 3, "collection": "disney" },
    { "id": "nickelodeon", "number": 4, "collection": "nickelodeon" },
    { "id": "adult-swim", "number": 5, "collection": "adult-swim" },
    { "id": "pixar", "number": 6, "collection": "pixar" },
    { "id": "fox", "number": 7, "collection": "fox" },
    { "id": "warner-bros", "number": 8, "collection": "warner-bros" },
    { "id": "dreamworks", "number": 9, "collection": "dreamworks" },
    { "id": "toei", "number": 10, "collection": "toei" },
    { "id": "animax", "number": 11, "collection": "animax" },
    { "id": "netflix", "number": 12, "collection": "netflix" },
    { "id": "prime-video", "number": 13, "collection": "prime-video" },
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

Networks are therefore 1–13, so ↑ from Prime Video (13) tunes Dragon Ball (101). Keep `epoch` and `defaultChannel` as they are.

- [ ] **Step 5: Run the data tests and the full suite**

Run: `npm test && npm run typecheck`
Expected: PASS. The data tests validate every collection's keys and logo paths and every channel's collection, range and non-empty plan against the real catalog.

Then add this case to `channels.data.test.ts` to pin the real lineup's grouping:

```ts
  it('puts every franchise collection on a 101+ channel', () => {
    const franchiseIds = COLLECTIONS.filter((c) => c.group === 'franchise').map((c) => c.id)
    const numbers = (CHANNELS_FILE as { channels: { collection: string; number: number }[] }).channels
    expect(franchiseIds.sort()).toEqual(numbers.filter((c) => c.number >= 101).map((c) => c.collection).sort())
  })
```

Run it again. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add data apps/web/public/assets/collections apps/web/src/tv/channels.data.test.ts
git commit -m "feat(data): 12 franchise 24/7 channels and collections

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Hand off for the manual TV check**

Tell the user the build is ready for a real-TV check. The user runs the install themselves. Things to check:

- tune 101–112 by number;
- watch one run boundary on Dragon Ball;
- zap ↑ from 13 to 101 and ↑ from 112 to 1;
- the "Canales" / "24/7" labels in the strip;
- the Franquicias strip on Home.
