import { liveKeyAction } from './liveKeys'

describe('liveKeyAction', () => {
  it('Up/Down and CH+/CH− zap, strip open or not', () => {
    for (const open of [false, true]) {
      expect(liveKeyAction('up', open)).toEqual({ type: 'zap', step: -1 })
      expect(liveKeyAction('down', open)).toEqual({ type: 'zap', step: 1 })
      expect(liveKeyAction('channelUp', open)).toEqual({ type: 'zap', step: 1 })
      expect(liveKeyAction('channelDown', open)).toEqual({ type: 'zap', step: -1 })
    }
  })

  it('Left/Right first reveal the strip, then only keep it open (focus moves the tiles)', () => {
    expect(liveKeyAction('left', false)).toEqual({ type: 'reveal' })
    expect(liveKeyAction('right', false)).toEqual({ type: 'reveal' })
    expect(liveKeyAction('right', true)).toEqual({ type: 'activity' })
  })

  it('OK does nothing over the bare picture; on the strip the tile handles it', () => {
    expect(liveKeyAction('select', false)).toBeNull()
    expect(liveKeyAction('select', true)).toEqual({ type: 'activity' })
  })

  it('Info shows the strip', () => {
    expect(liveKeyAction('info', false)).toEqual({ type: 'reveal' })
  })

  it('media keys do nothing: it is live', () => {
    for (const key of ['playPause', 'play', 'pause', 'fastForward', 'rewind', 'next', 'previous'] as const) {
      expect(liveKeyAction(key, false)).toBeNull()
    }
  })
})
