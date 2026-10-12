import { describe, expect, it } from 'vitest'
import type { RemoteKey } from './playerKeys'
import { initialTvControls, scrubStep, tvControls, type TvControlsState, type TvEffect, type TvInput } from './tvControls'

function run(inputs: TvInput[], state: TvControlsState = initialTvControls) {
  const effects: (TvEffect | null)[] = []
  for (const input of inputs) {
    const out = tvControls(state, input)
    state = out.state
    effects.push(out.effect)
  }
  return { state, effects }
}
const key = (k: string, now = 0): TvInput => ({ type: 'key', key: k as RemoteKey, now })
const scrubAt = (time: number, start = 0, end: number | null = 1000): TvInput => ({ type: 'scrubFocus', timeline: { time, start, end } })

describe('tvControls — hidden', () => {
  it('seeks ±10 s with Left/Right and opens with Select, Up, Down or Info', () => {
    expect(run([key('right')]).effects).toEqual([{ type: 'seekBy', delta: 10 }])
    expect(run([key('left')]).effects).toEqual([{ type: 'seekBy', delta: -10 }])
    for (const k of ['select', 'up', 'down', 'info']) expect(run([key(k)]).state.mode).toBe('open')
  })

  it('media keys act in every mode except pointer and diagnostics', () => {
    expect(run([key('playPause')]).effects).toEqual([{ type: 'togglePlay' }])
    expect(run([key('select'), key('next')]).effects[1]).toEqual({ type: 'next' })
    expect(run([key('select'), { type: 'openMenu' }, key('pause')]).effects[2]).toEqual({ type: 'pause' })
  })
})

describe('tvControls — open', () => {
  it('leaves the D-pad to native focus', () => {
    const { effects } = run([key('select'), key('left'), key('right'), key('down'), key('select')])
    expect(effects).toEqual([null, null, null, null, null])
  })

  it('opens diagnostics after five quick Up presses, not five slow ones', () => {
    const quick = run([key('select', 0), ...[100, 200, 300, 400, 500].map((t) => key('up', t))])
    expect(quick.state.mode).toBe('diagnostics')
    const slow = run([key('select', 0), ...[0, 1000, 2000, 3000, 4000].map((t) => key('up', t))])
    expect(slow.state.mode).toBe('open')
  })

  it('hides on idle', () => {
    expect(run([key('select'), { type: 'idle' }]).state.mode).toBe('hidden')
  })
})

describe('tvControls — scrubbing', () => {
  it('moves the marker without seeking, then commits one seek on OK (the timeline press)', () => {
    const press: TvInput = { type: 'scrubPress', timeline: { time: 100, start: 0, end: 1000 } }
    // The remote's Select key event is ignored while scrubbing; the timeline's onPress commits.
    const { state, effects } = run([key('select'), scrubAt(100), key('right', 0), key('right', 1000), key('left', 2000), key('select', 2100), press])
    expect(effects.slice(0, 6)).toEqual([null, null, null, null, null, null])
    expect(effects[6]).toEqual({ type: 'seekTo', time: 110 })
    expect(state.mode).toBe('open')
    expect(state.scrub).toBeNull()
  })

  it('OK on the timeline after Back starts scrubbing again (focus never left it)', () => {
    const press: TvInput = { type: 'scrubPress', timeline: { time: 300, start: 0, end: 1000 } }
    const { state } = run([key('select'), scrubAt(100), { type: 'back' }, press])
    expect(state).toMatchObject({ mode: 'scrubbing', scrub: { target: 300 } })
  })

  it('accelerates while a key is held (repeats under 300 ms apart)', () => {
    expect([1, 4, 5, 14, 15, 40].map(scrubStep)).toEqual([10, 10, 30, 30, 60, 60])
    const held = Array.from({ length: 6 }, (_, i) => key('right', i * 50))
    const { state } = run([key('select'), scrubAt(0, 0, null), ...held])
    // presses 1-4 step 10, presses 5-6 step 30
    expect(state.scrub?.target).toBe(4 * 10 + 2 * 30)
  })

  it('FF/RW move the marker too', () => {
    const { state } = run([key('select'), scrubAt(100), key('fastForward', 0), key('rewind', 1000), key('rewind', 2000)])
    expect(state.scrub?.target).toBe(90)
  })

  it('clamps the marker to the chapter', () => {
    const back = run([key('select'), scrubAt(605, 600, 1200), key('left', 0)])
    expect(back.state.scrub?.target).toBe(600)
    const fwd = run([key('select'), scrubAt(1195, 600, 1200), key('right', 0)])
    expect(fwd.state.scrub?.target).toBe(1199)
  })

  it('moves freely forward while the end is unknown', () => {
    expect(run([key('select'), scrubAt(5000, 0, null), key('right', 0)]).state.scrub?.target).toBe(5010)
  })

  it('cancels on blur or Back without seeking', () => {
    expect(run([key('select'), scrubAt(100), key('right'), { type: 'scrubBlur' }]).state).toMatchObject({ mode: 'open', scrub: null })
    const back = run([key('select'), scrubAt(100), key('right'), { type: 'back' }])
    expect(back.state).toMatchObject({ mode: 'open', scrub: null })
    expect(back.effects.every((e) => e === null)).toBe(true)
  })
})

describe('tvControls — pointer, menu, Back', () => {
  it('sends the D-pad and Select to the pointer', () => {
    const { effects } = run([key('select'), { type: 'pointer' }, key('up'), key('select'), key('playPause')])
    expect(effects.slice(2)).toEqual([{ type: 'pointerKey', key: 'up' }, { type: 'pointerKey', key: 'select' }, null])
  })

  it('Back unwinds one level at a time', () => {
    const levels = (inputs: TvInput[]) => run([...inputs, { type: 'back' }]).state.mode
    expect(levels([key('select'), { type: 'openMenu' }])).toBe('open')
    expect(levels([key('select'), scrubAt(1)])).toBe('open')
    expect(levels([key('select'), { type: 'pointer' }])).toBe('open')
    expect(levels([key('select'), ...[1, 2, 3, 4, 5].map((t) => key('up', t))])).toBe('open')
    expect(levels([key('select')])).toBe('hidden')
    expect(run([{ type: 'back' }]).effects).toEqual([{ type: 'leave' }])
  })

  it('closeMenu returns to the open overlay', () => {
    expect(run([key('select'), { type: 'openMenu' }, { type: 'closeMenu' }]).state.mode).toBe('open')
  })
})
