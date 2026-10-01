import { describe, expect, it } from 'vitest'
import { okru } from './okru'

describe('okru sound commands', () => {
  it('has the mute, unmute and volume messages found in the TV embed spike', () => {
    expect(okru.muteMessage).toEqual({ action: 'mute' })
    expect(okru.unmuteMessage).toEqual({ action: 'unmute' })
    expect(okru.volumeMessage?.(1)).toEqual({ action: 'volume', value: 1 })
  })
})
