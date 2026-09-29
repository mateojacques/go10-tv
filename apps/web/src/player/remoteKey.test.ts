import { describe, expect, it } from 'vitest'
import { remoteKeyFromEvent } from './remoteKey'

const press = (init: KeyboardEventInit & { keyCode?: number }) => new KeyboardEvent('keydown', init)

describe('remoteKeyFromEvent', () => {
  it("maps Tizen's media keyCodes", () => {
    expect(remoteKeyFromEvent(press({ keyCode: 10252 }))).toBe('playPause')
    expect(remoteKeyFromEvent(press({ keyCode: 415 }))).toBe('play')
    expect(remoteKeyFromEvent(press({ keyCode: 19 }))).toBe('pause')
    expect(remoteKeyFromEvent(press({ keyCode: 417 }))).toBe('fastForward')
    expect(remoteKeyFromEvent(press({ keyCode: 412 }))).toBe('rewind')
    expect(remoteKeyFromEvent(press({ keyCode: 10233 }))).toBe('next')
    expect(remoteKeyFromEvent(press({ keyCode: 10232 }))).toBe('previous')
  })

  it('maps the standard key names, D-pad and OK included', () => {
    expect(remoteKeyFromEvent(press({ key: 'MediaPlayPause' }))).toBe('playPause')
    expect(remoteKeyFromEvent(press({ key: 'MediaFastForward' }))).toBe('fastForward')
    expect(remoteKeyFromEvent(press({ key: 'ArrowRight', keyCode: 39 }))).toBe('right')
    expect(remoteKeyFromEvent(press({ key: 'ArrowUp', keyCode: 38 }))).toBe('up')
    expect(remoteKeyFromEvent(press({ key: 'Enter', keyCode: 13 }))).toBe('select')
  })

  it('ignores other keys and modified presses', () => {
    expect(remoteKeyFromEvent(press({ key: 'a', keyCode: 65 }))).toBeNull()
    expect(remoteKeyFromEvent(press({ key: 'Escape', keyCode: 27 }))).toBeNull()
    expect(remoteKeyFromEvent(press({ key: 'ArrowLeft', shiftKey: true }))).toBeNull()
  })
})
