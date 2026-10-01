import { hash01 } from '../lib/hash'
import type { Airing, ChannelPlan, Schedule } from './types'

/** Rounds between cached checkpoints. */
const CHECKPOINT_EVERY = 32

/** Where a round starts: its index, start time, every title's cursor, and the title that aired last. */
export interface Checkpoint {
  round: number
  startsAt: number
  cursors: number[]
  /** Index into `plan.titles` of the previous round's last title; -1 before round 0. */
  lastTitle: number
}

export function originOf(plan: ChannelPlan, epochMs: number): Checkpoint {
  return { round: 0, startsAt: epochMs, cursors: plan.titles.map(() => 0), lastTitle: -1 }
}

/** Title indices in airing order for `round`: shuffled per round, never opening with `lastTitle`. */
export function roundOrder(plan: ChannelPlan, round: number, lastTitle: number): number[] {
  const seed = (plan.seed + round) >>> 0
  const rank = plan.titles.map((title) => hash01(seed, title.key))
  const order = plan.titles.map((_, i) => i).sort((a, b) => rank[a] - rank[b] || a - b)
  if (order.length > 1 && order[0] === lastTitle) {
    order[0] = order[1]
    order[1] = lastTitle
  }
  return order
}

/**
 * One round: each title airs whole units from its cursor until the block
 * reaches `blockSeconds` or the title has aired all of its units this turn.
 */
export function playRound(plan: ChannelPlan, cp: Checkpoint): { airings: Airing[]; next: Checkpoint } {
  const cursors = cp.cursors.slice()
  const airings: Airing[] = []
  const order = roundOrder(plan, cp.round, cp.lastTitle)
  let t = cp.startsAt
  for (const index of order) {
    const { key, units } = plan.titles[index]
    let aired = 0
    let seconds = 0
    do {
      const unit = units[cursors[index]]
      const endsAt = t + unit.length * 1000
      airings.push({ unit, titleKey: key, startsAt: t, endsAt })
      t = endsAt
      seconds += unit.length
      aired++
      cursors[index] = (cursors[index] + 1) % units.length
    } while (seconds < plan.blockSeconds && aired < units.length)
  }
  return { airings, next: { round: cp.round + 1, startsAt: t, cursors, lastTitle: order[order.length - 1] } }
}

interface Memo {
  checkpoints: Checkpoint[]
  /** The last round looked up: live tiles ask about the same round every few seconds. */
  recent: { start: Checkpoint; airings: Airing[]; next: Checkpoint } | null
}

const memos = new WeakMap<ChannelPlan, Map<number, Memo>>()

function memoFor(plan: ChannelPlan, epochMs: number): Memo {
  let byEpoch = memos.get(plan)
  if (!byEpoch) {
    byEpoch = new Map()
    memos.set(plan, byEpoch)
  }
  let memo = byEpoch.get(epochMs)
  if (!memo) {
    memo = { checkpoints: [originOf(plan, epochMs)], recent: null }
    byEpoch.set(epochMs, memo)
  }
  return memo
}

/** The latest checkpoint at or before `at`, extending the list as far as needed. */
function checkpointBefore(plan: ChannelPlan, memo: Memo, at: number): Checkpoint {
  const list = memo.checkpoints
  while (list[list.length - 1].startsAt <= at) {
    let cp = list[list.length - 1]
    for (let i = 0; i < CHECKPOINT_EVERY; i++) cp = playRound(plan, cp).next
    list.push(cp)
  }
  let lo = 0
  let hi = list.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (list[mid].startsAt <= at) lo = mid
    else hi = mid - 1
  }
  return list[lo]
}

/** The round whose span contains `at`. */
function roundAt(plan: ChannelPlan, memo: Memo, at: number): { start: Checkpoint; airings: Airing[]; next: Checkpoint } {
  const recent = memo.recent
  if (recent && recent.start.startsAt <= at && at < recent.next.startsAt) return recent
  let cp = checkpointBefore(plan, memo, at)
  for (;;) {
    const { airings, next } = playRound(plan, cp)
    if (next.startsAt > at) {
      memo.recent = { start: cp, airings, next }
      return memo.recent
    }
    cp = next
  }
}

/**
 * What `plan` airs at instant `t` (epoch ms), and the `upcoming` airings
 * after it. Pure: every device gets the same answer for the same instant.
 */
export function scheduleAt(plan: ChannelPlan, epochMs: number, t: number, upcoming = 3): Schedule {
  if (plan.titles.length === 0) throw new Error(`channel ${plan.channelId} has nothing to air`)
  const at = Math.max(t, epochMs)
  const memo = memoFor(plan, epochMs)
  const round = roundAt(plan, memo, at)
  let index = 0
  while (round.airings[index].endsAt <= at) index++
  const current = round.airings[index]
  const next = round.airings.slice(index + 1, index + 1 + upcoming)
  let cp = round.next
  while (next.length < upcoming) {
    const r = playRound(plan, cp)
    next.push(...r.airings.slice(0, upcoming - next.length))
    cp = r.next
  }
  return { current, offset: (at - current.startsAt) / 1000, next }
}
