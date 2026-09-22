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
