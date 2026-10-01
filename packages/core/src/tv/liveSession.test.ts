import { describe, expect, it, vi } from 'vitest'
import { buildChannelPlan } from './plan'
import { createLiveSession } from './liveSession'
import { scheduleAt } from './schedule'
import { catalogRow, collectionOf, movieTitle, showTitle } from './testing'
import type { Title } from '../types'

const EPOCH = Date.UTC(2026, 9, 1)

function setup(titles: Title[] = [showTitle('a', 4, 600), movieTitle('m', 3000)]) {
  const plan = buildChannelPlan({ id: 'ch', number: 1, collection: 'ch' }, collectionOf('ch', titles.map((t) => t.key)), titles)
  let clock = EPOCH
  const sent: unknown[] = []
  const onFinishedEarly = vi.fn()
  const session = createLiveSession({ plan, epochMs: EPOCH, now: () => clock, send: (c) => sent.push(c), onFinishedEarly })
  return { plan, session, sent, onFinishedEarly, at: (t: number) => (clock = t) }
}

const tick = (time: number) => ({ event: 'timeupdate', time, duration: 9999 })

describe('createLiveSession', () => {
  it('tunes to the live second with fromTime', () => {
    const { plan, session, at } = setup()
    at(EPOCH + 125_400)
    const s = scheduleAt(plan, EPOCH, EPOCH + 125_400)
    expect(session.tune()).toBe(`${s.current.unit.row.embed_url}?autoplay=1&fromTime=${Math.floor(s.offset)}`)
    expect(session.current()).toEqual(s.current)
  })

  it('adds the chapter start to the offset inside a season pack', () => {
    const show = showTitle('db', 1, 0)
    show.seasons = [catalogRow({ video_id: 'f9', type: 'episode', series_id: 'db', episode_number: 2, chapter_start_seconds: 1335, chapter_end_seconds: 2635, duration_seconds: 1300, embed_url: 'https://ok.ru/videoembed/f9' })]
    const { session, at } = setup([show])
    at(EPOCH + 60_000)
    expect(session.tune()).toBe('https://ok.ru/videoembed/f9?autoplay=1&fromTime=1395')
  })

  it('seeks back to live after two consecutive reports more than 20 s off', () => {
    const { session, sent, at } = setup()
    at(EPOCH + 100_000)
    session.tune()
    session.handle(tick(60)) // expected 100: 40 s behind
    expect(sent).toEqual([])
    at(EPOCH + 101_000)
    session.handle(tick(61))
    expect(sent).toEqual([{ action: 'seek', time: 101 }])
  })

  it('forgives a single stray report and small drift', () => {
    const { session, sent, at } = setup()
    at(EPOCH + 100_000)
    session.tune()
    session.handle(tick(60))
    session.handle(tick(100))
    session.handle(tick(60))
    session.handle(tick(85))
    expect(sent).toEqual([])
  })

  it('ignores messages from other providers and before tuning', () => {
    const { session, sent } = setup()
    session.handle(tick(1))
    session.tune()
    session.handle({ type: 'PLAYER_EVENT', data: { event: 'timeupdate', currentTime: 999 } })
    session.handle(null)
    expect(sent).toEqual([])
  })

  it('flags a file that ends before the schedule does, once', () => {
    const { session, onFinishedEarly, at } = setup()
    at(EPOCH + 1000)
    session.tune()
    session.handle({ event: 'ended', time: 590 })
    session.handle(tick(600))
    expect(session.finishedEarly()).toBe(true)
    expect(onFinishedEarly).toHaveBeenCalledTimes(1)
  })

  it('flags a chapter played past its end', () => {
    const { session, at } = setup([showTitle('a', 4, 600)])
    at(EPOCH + 1000)
    session.tune()
    session.handle(tick(600)) // every unit is 600 s long, starting at 0
    expect(session.finishedEarly()).toBe(true)
  })

  it('does not flag an end that arrives on schedule', () => {
    const { session, at } = setup()
    at(EPOCH)
    session.tune()
    at(session.current()!.endsAt)
    session.handle({ event: 'ended', time: 600 })
    expect(session.finishedEarly()).toBe(false)
  })

  it('at a boundary, moves to the next airing: a reload for a different file', () => {
    const { session, at } = setup()
    at(EPOCH)
    session.tune()
    const first = session.current()!
    at(first.endsAt - 200) // the timer fired a little early
    expect(session.sync(first.endsAt)).toBe('load')
    expect(session.current()!.startsAt).toBe(first.endsAt)
    expect(session.finishedEarly()).toBe(false)
  })

  it('at a boundary, seeks instead when the next airing is in the same file', () => {
    const chapters = showTitle('db', 1, 0)
    chapters.seasons = [1, 2].map((n) =>
      catalogRow({ video_id: 'f9', type: 'episode', series_id: 'db', episode_number: n, chapter_start_seconds: (n - 1) * 600, chapter_end_seconds: n * 600, duration_seconds: 600, embed_url: 'https://ok.ru/videoembed/f9' }),
    )
    const { session, sent, at } = setup([chapters])
    at(EPOCH)
    session.tune()
    const first = session.current()!
    at(first.endsAt)
    expect(session.sync(first.endsAt)).toBe('seek')
    expect(sent).toEqual([{ action: 'seek', time: 600 }])
  })

  it('lands on the airing for now when the timer fires very late', () => {
    const { plan, session, at } = setup()
    at(EPOCH)
    session.tune()
    const first = session.current()!
    const later = EPOCH + 5 * 3600_000
    at(later)
    session.sync(first.endsAt)
    expect(session.current()).toEqual(scheduleAt(plan, EPOCH, later).current)
  })

  it('resumes at the live position when the embed is paused mid-program', () => {
    const { session, sent, at } = setup()
    at(EPOCH + 100_000)
    session.tune()
    session.handle({ event: 'paused' })
    expect(sent).toEqual([{ action: 'play' }, { action: 'seek', time: 100 }])
  })

  it('resumes at most once every 3 s, so a blocked embed is not hammered', () => {
    const { session, sent, at } = setup()
    at(EPOCH + 100_000)
    session.tune()
    session.handle({ event: 'paused' })
    at(EPOCH + 101_000)
    session.handle({ event: 'paused' })
    expect(sent).toHaveLength(2)
    at(EPOCH + 103_500)
    session.handle({ event: 'paused' })
    expect(sent).toHaveLength(4)
  })

  it('leaves a pause alone once the program has finished early', () => {
    const { session, sent, at } = setup([showTitle('a', 4, 600)])
    at(EPOCH + 1000)
    session.tune()
    session.handle({ event: 'ended', time: 590 })
    session.handle({ event: 'paused' })
    expect(sent).toEqual([])
  })
})
