import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { frameScript } from './frameScript'

type Posted = { go10Bridge: string; source?: string; frame?: string; caps?: any; id?: number }
let posted: Posted[]

beforeEach(() => {
  vi.useFakeTimers()
  posted = []
  delete (window as unknown as { __go10Bridge?: boolean }).__go10Bridge
  document.body.innerHTML = ''
  vi.spyOn(window, 'postMessage').mockImplementation((msg: unknown) => { posted.push(msg as Posted) })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const start = (adapters?: string[]) => new Function(frameScript(adapters))()
const caps = (source: string) => posted.filter((m) => m.go10Bridge === 'caps' && m.source === source).at(-1)
const results = () => posted.filter((m) => m.go10Bridge === 'result')
const send = (data: object) => window.dispatchEvent(new MessageEvent('message', { data, source: window }))

function addVideo(tracks: { kind: string; label: string; language: string; mode: string }[] = []) {
  const video = document.createElement('video')
  Object.defineProperty(video, 'textTracks', { value: tracks })
  document.body.appendChild(video)
  return video
}

describe('frameScript — html5 adapter', () => {
  it('reports nothing until a video exists, then speed and subtitles', () => {
    start()
    vi.advanceTimersByTime(1000)
    expect(caps('html5')?.caps ?? {}).toEqual({})
    addVideo([
      { kind: 'subtitles', label: 'Español', language: 'es', mode: 'disabled' },
      { kind: 'metadata', label: '', language: '', mode: 'hidden' },
    ])
    vi.advanceTimersByTime(1000)
    const report = caps('html5')!
    expect(report.caps.speed.current).toBe('1')
    expect(report.caps.speed.options.map((o: { value: string }) => o.value)).toEqual(['0.5', '0.75', '1', '1.25', '1.5', '2'])
    expect(report.caps.subtitles).toEqual({ options: [{ value: 'off', label: 'Desactivados' }, { value: '0', label: 'Español' }], current: 'off' })
    expect(typeof report.frame).toBe('string')
  })

  it('applies a set addressed to it and answers with a result', () => {
    start()
    const tracks = [{ kind: 'subtitles', label: 'Español', language: 'es', mode: 'disabled' }]
    const video = addVideo(tracks)
    vi.advanceTimersByTime(1000)
    const frame = caps('html5')!.frame
    send({ go10Bridge: 'set', id: 1, source: 'html5', frame, setting: 'speed', value: '1.5' })
    send({ go10Bridge: 'set', id: 2, source: 'html5', frame, setting: 'subtitles', value: '0' })
    expect(video.playbackRate).toBe(1.5)
    expect(tracks[0].mode).toBe('showing')
    expect(results()).toEqual([{ go10Bridge: 'result', id: 1, ok: true }, { go10Bridge: 'result', id: 2, ok: true }])
  })

  it('ignores sets for another frame or adapter, and messages not from the top window', () => {
    start()
    const video = addVideo()
    vi.advanceTimersByTime(1000)
    send({ go10Bridge: 'set', id: 1, source: 'html5', frame: 'other', setting: 'speed', value: '2' })
    window.dispatchEvent(new MessageEvent('message', { data: { go10Bridge: 'set', id: 2, source: 'html5', frame: caps('html5')!.frame, setting: 'speed', value: '2' } }))
    expect(video.playbackRate).toBe(1)
    expect(results()).toEqual([])
  })

  it('a throwing adapter reports nothing and keeps the page alive', () => {
    start(['{ name: "boom", read: function () { throw new Error("x") }, set: function () { throw new Error("y") } }'])
    addVideo()
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow()
    expect(caps('boom')).toBeUndefined()
    expect(caps('html5')).toBeDefined()
    send({ go10Bridge: 'set', id: 9, source: 'boom', frame: caps('html5')!.frame, setting: 'quality', value: 'hd' })
    expect(results()).toEqual([{ go10Bridge: 'result', id: 9, ok: false, error: 'Error: y' }])
  })

  it('runs once per frame even if injected twice', () => {
    start()
    start()
    addVideo()
    vi.advanceTimersByTime(1000)
    expect(posted.filter((m) => m.go10Bridge === 'caps' && m.source === 'html5')).toHaveLength(1)
  })
})
