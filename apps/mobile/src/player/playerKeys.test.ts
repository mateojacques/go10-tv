import { backAction, playerKeyAction, remoteKey } from './playerKeys'

describe('playerKeyAction', () => {
  it('seeks with the D-pad and media keys while the bar is hidden', () => {
    expect(playerKeyAction('right', false)).toEqual({ type: 'seekBy', delta: 10 })
    expect(playerKeyAction('left', false)).toEqual({ type: 'seekBy', delta: -10 })
    expect(playerKeyAction('fastForward', false)).toEqual({ type: 'seekBy', delta: 10 })
    expect(playerKeyAction('rewind', false)).toEqual({ type: 'seekBy', delta: -10 })
  })

  it('opens the bar with Select or Up', () => {
    expect(playerKeyAction('select', false)).toEqual({ type: 'openBar' })
    expect(playerKeyAction('up', false)).toEqual({ type: 'openBar' })
    expect(playerKeyAction('down', false)).toBeNull()
  })

  it('leaves the D-pad to the bar while it is open; media keys still work', () => {
    for (const key of ['left', 'right', 'up', 'down', 'select'] as const) expect(playerKeyAction(key, true)).toBeNull()
    expect(playerKeyAction('fastForward', true)).toEqual({ type: 'seekBy', delta: 10 })
    expect(playerKeyAction('playPause', true)).toEqual({ type: 'togglePlay' })
  })

  it('toggles play and steps episodes from the media keys', () => {
    expect(playerKeyAction('playPause', false)).toEqual({ type: 'togglePlay' })
    expect(playerKeyAction('next', false)).toEqual({ type: 'next' })
    expect(playerKeyAction('previous', false)).toEqual({ type: 'previous' })
  })
})

describe('backAction', () => {
  it('closes the bar first, then leaves', () => {
    expect(backAction(true)).toBe('closeBar')
    expect(backAction(false)).toBe('leave')
  })
})

describe('remoteKey', () => {
  it('acts on key-down only: Android TV reports each press as a down and an up', () => {
    expect(remoteKey({ eventType: 'right', eventKeyAction: 0 })).toBe('right')
    expect(remoteKey({ eventType: 'right', eventKeyAction: 1 })).toBeNull()
    expect(remoteKey({ eventType: 'right', eventKeyAction: '0' })).toBe('right')
  })

  it('ignores focus events and keys the player has no use for', () => {
    expect(remoteKey({ eventType: 'focus', eventKeyAction: -1 })).toBeNull()
    expect(remoteKey({ eventType: 'menu', eventKeyAction: 0 })).toBeNull()
    expect(remoteKey({})).toBeNull()
  })
})
