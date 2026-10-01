import { describe, expect, it } from 'vitest'
import { buildChannelPlan, channelSeed, unitsOf } from './plan'
import { catalogRow, collectionOf, movieTitle, showTitle } from './testing'

describe('unitsOf', () => {
  it('makes one unit per row, in season order, starting at 0 for a whole file', () => {
    const show = showTitle('coraje', 2, 660)
    expect(unitsOf(show).map((u) => [u.key, u.start, u.length])).toEqual([['coraje-1', 0, 660], ['coraje-2', 0, 660]])
  })

  it('starts a chapter at its chapter start and uses its own duration', () => {
    const show = showTitle('db', 1, 0)
    show.seasons = [
      catalogRow({ video_id: 'f9', type: 'episode', series_id: 'db', episode_number: 1, chapter_start_seconds: 0, chapter_end_seconds: 1335, duration_seconds: 1335 }),
      catalogRow({ video_id: 'f9', type: 'episode', series_id: 'db', episode_number: 2, chapter_start_seconds: 1335, chapter_end_seconds: null, duration_seconds: 1300 }),
    ]
    expect(unitsOf(show).map((u) => [u.key, u.start, u.length])).toEqual([['f9:1', 0, 1335], ['f9:2', 1335, 1300]])
  })

  it('drops zero-length and external rows', () => {
    const show = showTitle('x', 2, 600)
    show.seasons[0] = { ...show.seasons[0], duration_seconds: 0 }
    show.seasons[1] = { ...show.seasons[1], external: true }
    expect(unitsOf(show)).toEqual([])
  })
})

describe('buildChannelPlan', () => {
  const titles = [showTitle('coraje', 3, 660), movieTitle('mulan', 5280), movieTitle('empty', 0)]
  const collection = collectionOf('cn', ['coraje', 'gone', 'mulan', 'empty'])

  it('keeps the collection order, skipping unknown, excluded and unairable titles', () => {
    const plan = buildChannelPlan({ id: 'cn', number: 1, collection: 'cn', exclude: ['coraje'] }, collection, titles)
    expect(plan.titles.map((t) => t.key)).toEqual(['mulan'])
  })

  it('defaults to 30-minute blocks and honours blockMinutes', () => {
    expect(buildChannelPlan({ id: 'cn', number: 1, collection: 'cn' }, collection, titles).blockSeconds).toBe(1800)
    expect(buildChannelPlan({ id: 'cn', number: 1, collection: 'cn', blockMinutes: 45 }, collection, titles).blockSeconds).toBe(2700)
  })

  it('seeds from the channel id, stably', () => {
    expect(channelSeed('cn')).toBe(channelSeed('cn'))
    expect(channelSeed('cn')).not.toBe(channelSeed('jetix'))
    expect(Number.isInteger(channelSeed('cn'))).toBe(true)
  })

  it('yields a plan with no titles when nothing can air', () => {
    const plan = buildChannelPlan({ id: 'x', number: 9, collection: 'x' }, collectionOf('x', ['empty']), titles)
    expect(plan.titles).toEqual([])
  })
})
