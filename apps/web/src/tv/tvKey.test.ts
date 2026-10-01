import { describe, expect, it } from 'vitest'
import { tvKeyFromEvent } from './tvKey'

const press = (init: Partial<KeyboardEvent>) =>
  tvKeyFromEvent({ key: 'Unidentified', keyCode: 0, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...init })

describe('tvKeyFromEvent', () => {
  it("reads Tizen's keyCodes, which carry no useful key", () => {
    expect(press({ keyCode: 427 })).toEqual({ type: 'zap', step: 1 })
    expect(press({ keyCode: 428 })).toEqual({ type: 'zap', step: -1 })
    expect(press({ keyCode: 457 })).toEqual({ type: 'info' })
    expect(press({ keyCode: 10190 })).toEqual({ type: 'previous' })
    expect(press({ keyCode: 10073 })).toEqual({ type: 'list' })
    expect(press({ keyCode: 55 })).toEqual({ type: 'digit', digit: '7' })
  })

  it('reads standard key names from keyboards', () => {
    expect(press({ key: 'ChannelUp' })).toEqual({ type: 'zap', step: 1 })
    expect(press({ key: 'ChannelDown' })).toEqual({ type: 'zap', step: -1 })
    expect(press({ key: 'PageUp' })).toEqual({ type: 'zap', step: -1 })
    expect(press({ key: 'PageDown' })).toEqual({ type: 'zap', step: 1 })
    expect(press({ key: 'Info' })).toEqual({ type: 'info' })
    expect(press({ key: '0' })).toEqual({ type: 'digit', digit: '0' })
    expect(press({ key: 'm' })).toEqual({ type: 'sound' })
    expect(press({ key: 'F' })).toEqual({ type: 'fullscreen' })
  })

  it('leaves the arrows, OK and Back to the focus grid', () => {
    for (const key of ['ArrowUp', 'ArrowLeft', 'Enter', 'Escape']) expect(press({ key })).toBeNull()
    expect(press({ keyCode: 10009 })).toBeNull()
  })

  it('leaves modified presses to the browser', () => {
    expect(press({ key: '1', ctrlKey: true })).toBeNull()
    expect(press({ key: 'f', metaKey: true })).toBeNull()
  })
})
