import { describe, expect, it } from 'vitest'
import { backAction, createRemoteKeyFilter, playerKeyAction, remoteKey } from './playerKeys'

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
    expect(playerKeyAction('play', true)).toEqual({ type: 'play' })
    expect(playerKeyAction('pause', false)).toEqual({ type: 'pause' })
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

describe('createRemoteKeyFilter', () => {
  const down = (eventType: string) => ({ eventType, eventKeyAction: 0 })
  const up = (eventType: string) => ({ eventType, eventKeyAction: 1 })

  it('one press is one key: the down acts, its up does not', () => {
    const filter = createRemoteKeyFilter()
    expect([filter(down('right')), filter(up('right'))]).toEqual(['right', null])
  })

  it('a held key repeats its down', () => {
    const filter = createRemoteKeyFilter()
    expect([down('right'), down('right'), down('right'), up('right')].map(filter)).toEqual(['right', 'right', 'right', null])
  })

  it('acts on an up whose down never arrived (a phone driven over adb only reports ups)', () => {
    const filter = createRemoteKeyFilter()
    expect([up('select'), up('select'), up('right')].map(filter)).toEqual(['select', 'select', 'right'])
  })

  it('ignores focus events and unknown keys', () => {
    const filter = createRemoteKeyFilter()
    expect([{ eventType: 'focus', eventKeyAction: -1 }, up('menu'), {}].map(filter)).toEqual([null, null, null])
  })
})

describe('channel keys', () => {
  it('passes CH+/CH− and Info through as remote keys', () => {
    expect(remoteKey({ eventType: 'channelUp', eventKeyAction: 0 })).toBe('channelUp')
    expect(remoteKey({ eventType: 'channelDown', eventKeyAction: 0 })).toBe('channelDown')
    expect(remoteKey({ eventType: 'info', eventKeyAction: 0 })).toBe('info')
  })

  it('the on-demand player ignores them', () => {
    expect(playerKeyAction('channelUp', false)).toBeNull()
    expect(playerKeyAction('info', false)).toBeNull()
  })
})
