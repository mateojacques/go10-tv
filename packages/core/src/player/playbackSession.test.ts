import { beforeEach, describe, expect, it, vi } from 'vitest'
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
function setup() {
  const sent: unknown[] = []
  const onEnded = vi.fn()
  const onPlayingChange = vi.fn()
  const session = createPlaybackSession({ send: (c) => sent.push(c), onEnded, onPlayingChange, now: () => clock })
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
