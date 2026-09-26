import { afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Detail } from './Detail'
import { FocusProvider } from '../focus/FocusProvider'
import type { CatalogRow, Title } from '@go10/core/types'

function row(overrides: Partial<CatalogRow>): CatalogRow {
  return {
    catalog_index: 0, video_id: '1', type: 'episode', title: 'Ep Show', title_raw: '',
    series_id: 'ep-show', series_title: 'Ep Show', season_number: 1, season_label: '',
    episode_number: 1, chapter_start_seconds: null, chapter_end_seconds: null, year: null, studio: '', source: '', genre: '', genre_secondary: '',
    quality: '', language: '', subtitled: false, duration_raw: '', duration_seconds: 0,
    views: 0, thumbnail: '', video_url: '', embed_url: '',
    ...overrides,
  }
}

function makeTitle(seasons: CatalogRow[]): Title {
  return {
    key: 'ep-show', kind: 'show', title: 'Ep Show', year: null, studio: '', source: '',
    genre: '', genre_secondary: '', quality: '', language: '', subtitled: false,
    thumbnail: '', views: 0, durationSeconds: 0, catalogIndex: 0, seasons,
  }
}

afterEach(() => localStorage.clear())

describe('Detail', () => {
  it('syncs the active season/episode to the currently playing row (e.g. after autoplay)', () => {
    const season1Ep1 = row({ video_id: '1', season_number: 1, episode_number: 1 })
    const season1Ep2 = row({ video_id: '2', season_number: 1, episode_number: 2 })
    const season2Ep1 = row({ video_id: '3', season_number: 2, episode_number: 1 })
    const title = makeTitle([season1Ep1, season1Ep2, season2Ep1])

    const onPlay = vi.fn()
    const { rerender } = render(
      <FocusProvider onBack={() => {}}>
        <Detail title={title} onPlay={onPlay} onBack={() => {}} />
      </FocusProvider>,
    )

    // Autoplay (not a click) has advanced playback to season 2, episode 1.
    rerender(
      <FocusProvider onBack={() => {}}>
        <Detail title={title} onPlay={onPlay} onBack={() => {}} playingRow={season2Ep1} />
      </FocusProvider>,
    )

    fireEvent.click(screen.getByText('Reproducir'))
    expect(onPlay).toHaveBeenCalledWith(season2Ep1)
  })
})

describe('Detail with chaptered episodes', () => {
  it('tracks progress and active state per chapter, not per shared video_id', () => {
    const ep1 = row({ video_id: '9', season_number: 1, episode_number: 1, chapter_start_seconds: 0 })
    const ep2 = row({ video_id: '9', season_number: 1, episode_number: 2, chapter_start_seconds: 1435 })
    const title = makeTitle([ep1, ep2])

    localStorage.setItem('go10:progress:9:1', JSON.stringify({ time: 1435, duration: 1435, updatedAt: 1, watched: true }))
    localStorage.setItem('go10:progress:9:2', JSON.stringify({ time: 300, duration: 1370, updatedAt: 2, watched: false }))

    render(
      <FocusProvider onBack={() => {}}>
        <Detail title={title} onPlay={() => {}} onBack={() => {}} />
      </FocusProvider>,
    )

    expect(screen.getByRole('button', { name: /^Episodio 1\b/ }).getAttribute('aria-label')).toContain('Visto')
    expect(screen.getByRole('button', { name: /^Episodio 2\b/ }).getAttribute('aria-label')).not.toContain('Visto')
    expect(screen.getByRole('button', { name: /^Episodio 2\b/ }).className).toContain('is-active')
  })
})

describe('Detail play button', () => {
  it('keeps the label short and puts the episode and time left underneath', () => {
    const ep1 = row({ video_id: '1', season_number: 1, episode_number: 1, duration_seconds: 1380 })
    const ep2 = row({ video_id: '2', season_number: 1, episode_number: 2, duration_seconds: 1380 })
    localStorage.setItem('go10:progress:2', JSON.stringify({ time: 600, duration: 1380, updatedAt: 2, watched: false }))

    render(
      <FocusProvider onBack={() => {}}>
        <Detail title={makeTitle([ep1, ep2])} onPlay={() => {}} onBack={() => {}} />
      </FocusProvider>,
    )

    const play = document.querySelector('.go-play')!
    expect(play.textContent).toBe('Reanudar')
    expect(document.querySelector('.go-play_meta')?.textContent).toBe('T1 · E2 · Quedan 13 min')
  })
})

describe('Detail episode grid', () => {
  const season = (n: number, count: number) =>
    Array.from({ length: count }, (_, i) =>
      row({ video_id: `${n}-${i + 1}`, season_number: n, episode_number: i + 1 }),
    )

  it('switches seasons from the tab row', () => {
    render(
      <FocusProvider onBack={() => {}}>
        <Detail title={makeTitle([...season(1, 3), ...season(2, 12)])} onPlay={() => {}} onBack={() => {}} />
      </FocusProvider>,
    )
    expect(screen.getAllByRole('button', { name: /^Episodio \d+/ })).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Temporada 2, 12 episodios' }))
    expect(screen.getAllByRole('button', { name: /^Episodio \d+/ })).toHaveLength(12)
    expect(screen.getByRole('button', { name: 'Temporada 2, 12 episodios' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('has no tab row for a single season', () => {
    render(
      <FocusProvider onBack={() => {}}>
        <Detail title={makeTitle(season(1, 8))} onPlay={() => {}} onBack={() => {}} />
      </FocusProvider>,
    )
    expect(document.querySelector('.go-seasontabs')).toBeNull()
  })

  it('lays tiles out as a 2D focus grid, so Down moves a whole line', () => {
    // jsdom can't measure the grid, so it falls back to five columns.
    render(
      <FocusProvider onBack={() => {}}>
        <Detail title={makeTitle(season(1, 12))} onPlay={() => {}} onBack={() => {}} />
      </FocusProvider>,
    )
    const press = (key: string) => fireEvent.keyDown(window, { key })
    press('ArrowDown') // Play → first line of the grid
    press('ArrowRight')
    press('ArrowDown')
    const focused = document.querySelector('[data-focused="true"]')
    expect(focused?.getAttribute('aria-label')).toMatch(/^Episodio 7\b/)
    expect(document.querySelector('.go-episodes_caption')?.textContent).toContain('Episodio 7')
  })

  it('plays the picked episode', () => {
    const onPlay = vi.fn()
    const rows = season(1, 6)
    render(
      <FocusProvider onBack={() => {}}>
        <Detail title={makeTitle(rows)} onPlay={onPlay} onBack={() => {}} />
      </FocusProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Episodio 4\b/ }))
    expect(onPlay).toHaveBeenCalledWith(rows[3])
  })
})
