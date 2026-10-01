import { describe, expect, it } from 'vitest'
import { buildChannelPlan } from './plan'
import { originOf, playRound, roundOrder, scheduleAt } from './schedule'
import type { Airing, ChannelPlan } from './types'
import { collectionOf, movieTitle, showTitle } from './testing'

const EPOCH = Date.UTC(2026, 9, 1)
const MIN = 60_000

function plan(titles = [showTitle('a', 5, 600), showTitle('b', 2, 1500), movieTitle('m', 5400), showTitle('c', 1, 300)], blockMinutes = 30): ChannelPlan {
  return buildChannelPlan({ id: 'ch', number: 1, collection: 'ch', blockMinutes }, collectionOf('ch', titles.map((t) => t.key)), titles)
}

/** Every airing from the epoch, played round by round with no cache. */
function naive(p: ChannelPlan, rounds: number): Airing[] {
  let cp = originOf(p, EPOCH)
  const all: Airing[] = []
  for (let i = 0; i < rounds; i++) {
    const r = playRound(p, cp)
    all.push(...r.airings)
    cp = r.next
  }
  return all
}

describe('playRound', () => {
  it('airs each title once per round, laid end to end from the epoch', () => {
    const p = plan()
    const { airings } = playRound(p, originOf(p, EPOCH))
    expect(new Set(airings.map((a) => a.titleKey))).toEqual(new Set(['a', 'b', 'm', 'c']))
    expect(airings[0].startsAt).toBe(EPOCH)
    for (let i = 1; i < airings.length; i++) expect(airings[i].startsAt).toBe(airings[i - 1].endsAt)
  })

  it('fills a block with whole consecutive units until it reaches the block length', () => {
    const p = plan()
    const a = playRound(p, originOf(p, EPOCH)).airings.filter((x) => x.titleKey === 'a')
    // 10-minute episodes, 30-minute blocks: three of them, in order.
    expect(a.map((x) => x.unit.key)).toEqual(['a-1', 'a-2', 'a-3'])
  })

  it('airs a long unit alone and never repeats a title within its own turn', () => {
    const p = plan()
    const air = playRound(p, originOf(p, EPOCH)).airings
    expect(air.filter((x) => x.titleKey === 'm').map((x) => x.unit.key)).toEqual(['m'])
    // 'b' has two 25-minute episodes: 25 < 30, so both, then the turn ends (all units aired).
    expect(air.filter((x) => x.titleKey === 'b').map((x) => x.unit.key)).toEqual(['b-1', 'b-2'])
    // 'c' has one 5-minute episode: it airs once, not six times.
    expect(air.filter((x) => x.titleKey === 'c').map((x) => x.unit.key)).toEqual(['c-1'])
  })

  it('carries each series cursor into the next round and wraps at the end', () => {
    const p = plan()
    const rounds = [0, 1, 2].reduce<{ cp: ReturnType<typeof originOf>; keys: string[][] }>(
      (acc) => {
        const r = playRound(p, acc.cp)
        return { cp: r.next, keys: [...acc.keys, r.airings.filter((x) => x.titleKey === 'a').map((x) => x.unit.key)] }
      },
      { cp: originOf(p, EPOCH), keys: [] },
    ).keys
    expect(rounds).toEqual([['a-1', 'a-2', 'a-3'], ['a-4', 'a-5', 'a-1'], ['a-2', 'a-3', 'a-4']])
  })
})

describe('roundOrder', () => {
  it('is deterministic per round and differs between rounds', () => {
    const p = plan()
    expect(roundOrder(p, 3, -1)).toEqual(roundOrder(p, 3, -1))
    const orders = new Set([0, 1, 2, 3, 4, 5].map((r) => roundOrder(p, r, -1).join()))
    expect(orders.size).toBeGreaterThan(1)
  })

  it('never opens a round with the title that closed the previous one', () => {
    const p = plan()
    for (let r = 0; r < 50; r++) {
      const first = roundOrder(p, r, -1)[0]
      expect(roundOrder(p, r, first)[0]).not.toBe(first)
    }
  })

  it('keeps a single-title channel airing', () => {
    const p = plan([showTitle('solo', 3, 600)])
    expect(roundOrder(p, 0, 0)).toEqual([0])
  })
})

describe('scheduleAt', () => {
  it('finds the airing at an instant and the offset into it', () => {
    const p = plan()
    const first = playRound(p, originOf(p, EPOCH)).airings[0]
    const s = scheduleAt(p, EPOCH, EPOCH + 90_000)
    expect(s.current).toEqual(first)
    expect(s.offset).toBe(90)
  })

  it('switches exactly at a boundary', () => {
    const p = plan()
    const [a0, a1] = playRound(p, originOf(p, EPOCH)).airings
    expect(scheduleAt(p, EPOCH, a0.endsAt - 1).current).toEqual(a0)
    expect(scheduleAt(p, EPOCH, a0.endsAt).current).toEqual(a1)
    expect(scheduleAt(p, EPOCH, a0.endsAt).offset).toBe(0)
  })

  it('treats instants before the epoch as the epoch', () => {
    const p = plan()
    expect(scheduleAt(p, EPOCH, EPOCH - 5 * MIN)).toEqual(scheduleAt(p, EPOCH, EPOCH))
  })

  it('lists the upcoming airings, across a round boundary', () => {
    const p = plan()
    const all = naive(p, 3)
    const lastOfRound0 = playRound(p, originOf(p, EPOCH)).airings.length - 1
    const s = scheduleAt(p, EPOCH, all[lastOfRound0].startsAt, 3)
    expect(s.next).toEqual(all.slice(lastOfRound0 + 1, lastOfRound0 + 4))
  })

  it('matches a naive replay far from the epoch (checkpoints and memo are transparent)', () => {
    const p = plan()
    const all = naive(p, 400)
    // Ask out of order so the memo is exercised both ways.
    for (const i of [all.length - 1, 5, 1234, 77, all.length - 400, 0, 999]) {
      const a = all[i]
      const s = scheduleAt(p, EPOCH, a.startsAt + 1000)
      expect(s.current).toEqual(a)
      expect(s.offset).toBe(1)
    }
  })

  it('gives every device the same answer for the same instant', () => {
    const t = EPOCH + 123_456_789
    expect(scheduleAt(plan(), EPOCH, t)).toEqual(scheduleAt(plan(), EPOCH, t))
  })

  it('refuses an empty plan', () => {
    expect(() => scheduleAt({ channelId: 'x', seed: 1, blockSeconds: 1800, titles: [] }, EPOCH, EPOCH)).toThrow(/nothing to air/)
  })
})
