import { describe, it, expect } from 'vitest'
import {
  playerRetryReducer,
  initialPlayerRetryState,
  backoffMs,
  MAX_RETRIES,
  type PlayerRetryState,
} from './playerRetry'

describe('backoffMs', () => {
  it('scales linearly with the attempt number', () => {
    expect(backoffMs(0)).toBe(0)
    expect(backoffMs(1)).toBe(1000)
    expect(backoffMs(2)).toBe(2000)
    expect(backoffMs(3)).toBe(3000)
  })
})

describe('playerRetryReducer', () => {
  it('reset always returns to attempt 0 / loading and bumps reloadToken', () => {
    const state: PlayerRetryState = { attempt: 2, status: 'failed', reloadToken: 5 }
    expect(playerRetryReducer(state, { type: 'reset' })).toEqual({
      attempt: 0,
      status: 'loading',
      reloadToken: 6,
    })
  })

  it('timeout increments attempt and moves to retrying, while under the budget', () => {
    const state = playerRetryReducer(initialPlayerRetryState, { type: 'timeout' })
    expect(state).toEqual({ attempt: 1, status: 'retrying', reloadToken: 0 })
  })

  it('retryLoadStarted moves back to loading and bumps reloadToken, keeping attempt', () => {
    const retrying: PlayerRetryState = { attempt: 1, status: 'retrying', reloadToken: 0 }
    expect(playerRetryReducer(retrying, { type: 'retryLoadStarted' })).toEqual({
      attempt: 1,
      status: 'loading',
      reloadToken: 1,
    })
  })

  it('loaded moves to ready without touching attempt or reloadToken', () => {
    const loading: PlayerRetryState = { attempt: 1, status: 'loading', reloadToken: 1 }
    expect(playerRetryReducer(loading, { type: 'loaded' })).toEqual({
      attempt: 1,
      status: 'ready',
      reloadToken: 1,
    })
  })

  it('exhausts the retry budget after MAX_RETRIES timeouts', () => {
    let state = initialPlayerRetryState
    for (let i = 0; i < MAX_RETRIES; i++) {
      state = playerRetryReducer(state, { type: 'timeout' })
      state = playerRetryReducer(state, { type: 'retryLoadStarted' })
    }
    state = playerRetryReducer(state, { type: 'timeout' })
    expect(state.status).toBe('failed')
    expect(state.attempt).toBe(MAX_RETRIES)
  })

  it('manualReload resets the budget and bumps reloadToken even from failed', () => {
    const failed: PlayerRetryState = { attempt: MAX_RETRIES, status: 'failed', reloadToken: 7 }
    expect(playerRetryReducer(failed, { type: 'manualReload' })).toEqual({
      attempt: 0,
      status: 'loading',
      reloadToken: 8,
    })
  })
})
