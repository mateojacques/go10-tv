import { describe, expect, it } from 'vitest'
import { createSessionFor } from './sessionFor'
import { buildChannelPlan } from './plan'
import { collectionOf, movieTitle } from './testing'
import type { Channel } from './types'

const titles = [movieTitle('m', 3000)]
const collection = collectionOf('ch', ['m'])
const schedule: Channel = {
  kind: 'schedule', id: 'ch', number: 1, name: 'CH', group: 'network', collection,
  plan: buildChannelPlan({ id: 'ch', number: 1, collection: 'ch' }, collection, titles),
}
const live: Channel = {
  kind: 'live', id: 'aj', number: 301, name: 'AJ', group: 'live', source: { videoId: 'gCNeDWCI0vo' }, logo: null, thumbnail: null,
}

describe('createSessionFor', () => {
  it('keeps a collection channel on its schedule', () => {
    const session = createSessionFor({ channel: schedule, epochMs: Date.now() - 60_000, send: () => {} })
    expect(session.tune()).toContain('fromTime=')
  })

  it('joins a live at its edge', () => {
    const session = createSessionFor({ channel: live, epochMs: 0, send: () => {} })
    expect(session.tune()).toContain('/embed/gCNeDWCI0vo?')
  })
})
