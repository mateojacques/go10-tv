import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Detail } from './Detail'
import { FocusProvider } from '../focus/FocusProvider'
import type { CatalogRow, Title } from '../types'

function row(overrides: Partial<CatalogRow>): CatalogRow {
  return {
    catalog_index: 0, video_id: '1', type: 'episode', title: 'Ep Show', title_raw: '',
    series_id: 'ep-show', series_title: 'Ep Show', season_number: 1, season_label: '',
    episode_number: 1, chapter_start_seconds: null, chapter_end_seconds: null, year: null, studio: '', genre: '', genre_secondary: '',
    quality: '', language: '', subtitled: false, duration_raw: '', duration_seconds: 0,
    views: 0, thumbnail: '', video_url: '', embed_url: '',
    ...overrides,
  }
}

function makeTitle(seasons: CatalogRow[]): Title {
  return {
    key: 'ep-show', kind: 'show', title: 'Ep Show', year: null, studio: '',
    genre: '', genre_secondary: '', quality: '', language: '', subtitled: false,
    thumbnail: '', views: 0, durationSeconds: 0, catalogIndex: 0, seasons,
  }
}

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

    expect(screen.getByText('Episodio 1').closest('[data-focused]')?.textContent).toContain('Visto')
    expect(screen.getByText('Episodio 2').closest('[data-focused]')?.textContent).not.toContain('Visto')
  })
})
