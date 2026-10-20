import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogRow } from '../types'
import { readProgress, writeProgress, markWatched } from '../progress/progressStore'
import { createPlaybackSession, playbackStart } from './playbackSession'

const base = {
  catalog_index: 0, title: 'T', title_raw: 'T', series_id: '', series_title: '', season_label: '', year: null,
  studio: '', source: '', genre: '', genre_secondary: '', quality: '', language: '', subtitled: false,
  duration_raw: '', views: 0, thumbnail: '', video_url: '', chapter_start_seconds: null, chapter_end_seconds: null,
}
const movie: CatalogRow = {
  ...base, video_id: 'm1', type: 'movie', season_number: null, episode_number: null, duration_seconds: 700,
  embed_url: 'https://ok.ru/videoembed/1',
}
const chapter = (n: number, start: number, end: number): CatalogRow => ({
  ...base, video_id: 'f9', type: 'episode', season_number: 1, episode_number: n,
  chapter_start_seconds: start, chapter_end_seconds: end, duration_seconds: end - start,
  embed_url: 'https://ok.ru/videoembed/9',
})
const tmdb: CatalogRow = {
  ...base, video_id: 'tmdb-movie-155', type: 'movie', season_number: null, episode_number: null, duration_seconds: 0,
  embed_url: 'https://player.vidlove.cc/embed/movie/155', external: true,
}
const okTime = (time: number, duration = 700) => ({ event: 'timeupdate', time, duration })
const vidTime = (currentTime: number) => ({
  type: 'PLAYER_EVENT', data: { event: 'timeupdate', currentTime, duration: 2900, tmdbId: 155, mediaType: 'movie' },
})

let clock = 0
function setup(seekCoalesceMs?: number) {
  const sent: unknown[] = []
  const onEnded = vi.fn()
  const onPlayingChange = vi.fn()
  const session = createPlaybackSession({ send: (c) => sent.push(c), onEnded, onPlayingChange, now: () => clock, seekCoalesceMs })
  return { session, sent, onEnded, onPlayingChange }
}

beforeEach(() => {
  localStorage.clear()
  clock = 100_000
})

describe('playbackStart', () => {
  it('resumes a saved position, else starts a chapter at its own start, else at the top', () => {
    writeProgress('m1', { time: 120, duration: 700 })
    expect(playbackStart(movie)).toBe(117)
    expect(playbackStart(chapter(2, 600, 1200))).toBe(600)
    expect(playbackStart(chapter(1, 0, 600))).toBeNull()
    markWatched('m1', 700)
    expect(playbackStart(movie)).toBeNull()
  })
})

describe('createPlaybackSession', () => {
  it('opens ok.ru at the resume point through the URL', () => {
    writeProgress('m1', { time: 120, duration: 700 })
    const { session, sent } = setup()
    expect(session.load(movie)).toBe('https://ok.ru/videoembed/1?autoplay=1&fromTime=117')
    session.handle(okTime(117))
    expect(sent).toEqual([])
  })

  it('resumes vidlove with one seek on its first time event', () => {
    writeProgress('tmdb-movie-155', { time: 300, duration: 2900 })
    const { session, sent } = setup()
    expect(session.load(tmdb)).not.toContain('fromTime')
    session.handle(vidTime(1))
    session.handle(vidTime(2))
    expect(sent).toEqual([{ type: 'seek', time: 297 }])
  })

  it('saves at most every 5 s, and always on pause', () => {
    const { session } = setup()
    session.load(movie)
    session.handle(okTime(20))
    expect(readProgress('m1')?.time).toBe(20)
    clock += 2000
    session.handle(okTime(30))
    expect(readProgress('m1')?.time).toBe(20)
    session.handle({ event: 'paused' })
    expect(readProgress('m1')?.time).toBe(30)
  })

  it('flush saves the latest position', () => {
    const { session } = setup()
    session.load(movie)
    session.handle(okTime(20))
    clock += 1000
    session.handle(okTime(40))
    session.flush()
    expect(readProgress('m1')?.time).toBe(40)
  })

  it('ended marks the row watched and advances once', () => {
    const { session, onEnded } = setup()
    session.load(movie)
    session.handle(okTime(650))
    session.handle({ event: 'ended', time: 700 })
    session.handle({ event: 'ended', time: 700 })
    expect(readProgress('m1')?.watched).toBe(true)
    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('chapter end marks watched once and stops saving', () => {
    const { session, onEnded } = setup()
    session.load(chapter(1, 0, 600))
    session.handle(okTime(601, 1200))
    clock += 10_000
    session.handle(okTime(605, 1200))
    session.flush()
    expect(readProgress('f9:1')?.watched).toBe(true)
    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('selecting another chapter of the same file saves the outgoing one and seeks', () => {
    const { session, sent } = setup()
    session.load(chapter(1, 0, 600))
    session.handle(okTime(20, 1200))
    clock += 1000
    session.handle(okTime(300, 1200))
    session.select(chapter(2, 600, 1200))
    expect(readProgress('f9:1')?.time).toBe(300)
    expect(sent).toEqual([{ action: 'seek', time: 600 }])
    clock += 5000
    session.handle(okTime(610, 1200))
    expect(readProgress('f9:2')?.time).toBe(610)
  })

  it('selecting the same row, or a row of another file, sends nothing', () => {
    const { session, sent } = setup()
    session.load(chapter(1, 0, 600))
    session.select(chapter(1, 0, 600))
    session.select(movie)
    expect(sent).toEqual([])
  })

  it('seeks by steps from the last reported time, within the video', () => {
    const { session, sent } = setup()
    session.load(movie)
    session.handle(okTime(100))
    session.seekBy(10)
    session.seekBy(10)
    session.seekBy(-500)
    session.handle(okTime(695))
    session.seekBy(10)
    expect(sent).toEqual([
      { action: 'seek', time: 110 },
      { action: 'seek', time: 120 },
      { action: 'seek', time: 0 },
      { action: 'seek', time: 699 },
    ])
  })

  it('returns where each seek lands', () => {
    const { session } = setup()
    session.load(movie)
    session.handle(okTime(100))
    expect(session.seekBy(10)).toBe(110)
    expect(session.seekBy(-500)).toBe(0)
  })

  it("keeps seeks within the chapter's own range", () => {
    const { session, sent } = setup()
    session.load(chapter(2, 600, 1200))
    session.handle(okTime(605, 14000))
    session.seekBy(-10)
    session.handle(okTime(1195, 14000))
    session.seekBy(10)
    expect(sent).toEqual([{ action: 'seek', time: 600 }, { action: 'seek', time: 1199 }])
  })

  describe('with seekCoalesceMs', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('sends quick presses as one seek once the window closes', () => {
      const { session, sent } = setup(400)
      session.load(movie)
      session.handle(okTime(100))
      session.seekBy(10)
      vi.advanceTimersByTime(150)
      expect(session.seekBy(10)).toBe(120)
      session.handle(okTime(101)) // a stale report while the seek waits
      expect(session.seekBy(10)).toBe(130)
      expect(sent).toEqual([])
      vi.advanceTimersByTime(250)
      expect(sent).toEqual([{ action: 'seek', time: 130 }])
    })

    it('a held key still seeks every window', () => {
      const { session, sent } = setup(400)
      session.load(movie)
      session.handle(okTime(100))
      for (let i = 0; i < 8; i++) {
        session.seekBy(10)
        vi.advanceTimersByTime(100)
      }
      expect(sent).toEqual([{ action: 'seek', time: 140 }, { action: 'seek', time: 180 }])
    })

    it('drops a waiting seek when another row loads', () => {
      const { session, sent } = setup(400)
      session.load(movie)
      session.seekBy(10)
      session.load(tmdb)
      vi.advanceTimersByTime(400)
      expect(sent).toEqual([])
    })
  })

  it('toggles ok.ru between pause and play, reporting the playing state', () => {
    const { session, sent, onPlayingChange } = setup()
    session.load(movie)
    expect(session.canTogglePlay()).toBe(true)
    session.handle(okTime(50))
    session.togglePlay()
    session.togglePlay()
    expect(sent).toEqual([{ action: 'pause' }, { action: 'play' }])
    expect(onPlayingChange.mock.calls).toEqual([[true], [false], [true]])
  })

  it('plays and pauses outright, whatever the current state', () => {
    const { session, sent } = setup()
    session.load(movie)
    session.handle(okTime(50))
    session.setPlaying(true)
    session.setPlaying(false)
    session.setPlaying(false)
    expect(sent).toEqual([{ action: 'play' }, { action: 'pause' }, { action: 'pause' }])
  })

  it('cannot toggle vidlove, which has no play/pause command', () => {
    const { session, sent } = setup()
    session.load(tmdb)
    session.handle(vidTime(5))
    expect(session.canTogglePlay()).toBe(false)
    session.togglePlay()
    expect(sent).toEqual([])
  })

  it('ignores everything before a row is loaded', () => {
    const { session, sent, onEnded } = setup()
    session.handle(okTime(50))
    session.seekBy(10)
    session.flush()
    expect(sent).toEqual([])
    expect(onEnded).not.toHaveBeenCalled()
  })
})

describe('seekTo and timeline', () => {
  it('reports the position and the seekable range of the file', () => {
    const { session } = setup()
    expect(session.timeline()).toEqual({ time: 0, start: 0, end: null })
    session.load(movie)
    session.handle(okTime(42, 700))
    expect(session.timeline()).toEqual({ time: 42, start: 0, end: 700 })
  })

  it("uses a chapter's own range", () => {
    const { session } = setup()
    session.load(chapter(2, 600, 1200))
    session.handle(okTime(650, 3000))
    expect(session.timeline()).toEqual({ time: 650, start: 600, end: 1200 })
  })

  it('seeks to an absolute time, clamped like seekBy', () => {
    const { session, sent } = setup()
    session.load(chapter(2, 600, 1200))
    session.handle(okTime(650, 3000))
    expect(session.seekTo(900)).toBe(900)
    expect(session.seekTo(5000)).toBe(1199)
    expect(session.seekTo(10)).toBe(600)
    expect(sent.slice(-3)).toEqual([{ action: 'seek', time: 900 }, { action: 'seek', time: 1199 }, { action: 'seek', time: 600 }])
    expect(session.timeline().time).toBe(600)
  })

  it('returns null before a load', () => {
    expect(setup().session.seekTo(5)).toBeNull()
  })
})

describe('createPlaybackSession with YouTube', () => {
  const yt: CatalogRow = {
    ...base, video_id: 'aqz-KE-bpKQ', type: 'movie', season_number: null, episode_number: null, duration_seconds: 635,
    embed_url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
  }
  const info = (fields: Record<string, number>) => JSON.stringify({ event: 'infoDelivery', info: fields })
  const HANDSHAKE = '{"event":"listening","id":1,"channel":"widget"}'

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('handshakes on attach until the embed first speaks', () => {
    const { session, sent } = setup()
    session.load(yt)
    session.attach()
    vi.advanceTimersByTime(500)
    expect(sent).toEqual([HANDSHAKE, HANDSHAKE, HANDSHAKE])
    session.handle(info({ currentTime: 0, duration: 635, playerState: -1 }))
    vi.advanceTimersByTime(2000)
    expect(sent).toHaveLength(3)
  })

  it('stops handshaking when a new file loads', () => {
    const { session, sent } = setup()
    session.load(yt)
    session.attach()
    session.load(yt)
    vi.advanceTimersByTime(2000)
    expect(sent).toEqual([HANDSHAKE])
  })

  it('sends no handshake to ok.ru', () => {
    const { session, sent } = setup()
    session.load(movie)
    session.attach()
    vi.advanceTimersByTime(2000)
    expect(sent).toEqual([])
  })

  it('reports an embed error once and saves nothing', () => {
    const onError = vi.fn()
    const session = createPlaybackSession({ send: () => {}, onEnded: () => {}, onError, now: () => clock })
    session.load(yt)
    session.handle(JSON.stringify({ event: 'onError', info: 101 }))
    session.flush()
    expect(onError).toHaveBeenCalledExactlyOnceWith(101)
    expect(readProgress('aqz-KE-bpKQ')).toBeNull()
  })

  it("doesn't let an ad's early times overwrite the resume point", () => {
    writeProgress('aqz-KE-bpKQ', { time: 300, duration: 635 })
    const { session } = setup()
    expect(session.load(yt)).toContain('&start=297')
    session.handle(info({ currentTime: 3, duration: 15, playerState: 1 }))
    clock += 10_000
    session.handle(info({ currentTime: 9 }))
    session.flush()
    expect(readProgress('aqz-KE-bpKQ')?.time).toBe(300)
    expect(session.timeline().time).toBe(297)
  })

  it('saves normally once playback reaches the resume point', () => {
    writeProgress('aqz-KE-bpKQ', { time: 300, duration: 635 })
    const { session } = setup()
    session.load(yt)
    session.handle(info({ currentTime: 297.2, duration: 635, playerState: 1 }))
    clock += 10_000
    session.handle(info({ currentTime: 307 }))
    session.flush()
    expect(readProgress('aqz-KE-bpKQ')?.time).toBe(307)
  })

  it("never saves a pre-roll ad's times on a first play", () => {
    const { session } = setup()
    session.load(yt)
    session.handle(info({ currentTime: 14, duration: 15, playerState: 1 }))
    clock += 10_000
    session.flush()
    expect(readProgress('aqz-KE-bpKQ')).toBeNull()
    session.handle(info({ currentTime: 3, duration: 635 }))
    clock += 10_000
    session.handle(info({ currentTime: 13 }))
    session.flush()
    expect(readProgress('aqz-KE-bpKQ')?.time).toBe(13)
  })

  it("doesn't carry one video's duration into the next", () => {
    const other: CatalogRow = { ...yt, video_id: 'jNQXAC9IVRw', duration_seconds: 19, embed_url: 'https://youtu.be/jNQXAC9IVRw' }
    const { session } = setup()
    session.load(other)
    session.handle(info({ currentTime: 1, duration: 19, playerState: 1 }))
    session.load(yt)
    session.handle(info({ currentTime: 5 }))
    expect(session.timeline().end).toBeNull()
  })

  it('marks playing on a state-only report', () => {
    const { session, onPlayingChange } = setup()
    session.load(yt)
    session.handle(info({ playerState: 1 }))
    expect(onPlayingChange).toHaveBeenLastCalledWith(true)
  })
})
