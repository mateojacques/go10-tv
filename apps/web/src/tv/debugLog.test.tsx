import { afterEach, describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { debugEntries, enableTvDebugForTests, tvDebug, TvDebugPanel } from './debugLog'

afterEach(() => enableTvDebugForTests(false))

describe('tvDebug', () => {
  it('records nothing unless ?tvdebug=1 turned it on', () => {
    tvDebug('cn', 'recv', { event: 'paused' })
    expect(debugEntries()).toEqual([])
    render(<TvDebugPanel />)
    expect(screen.queryByRole('log')).toBeNull()
  })

  it('shows the latest entries on screen when on', () => {
    enableTvDebugForTests(true)
    render(<TvDebugPanel />)
    act(() => {
      tvDebug('cn', 'recv', { event: 'paused' })
      tvDebug('cn', 'send', { action: 'play' })
    })
    const log = screen.getByRole('log')
    expect(log.textContent).toContain('cn recv {"event":"paused"}')
    expect(log.textContent).toContain('cn send {"action":"play"}')
  })
})
