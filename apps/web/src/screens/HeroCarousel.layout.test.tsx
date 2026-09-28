import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FocusProvider } from '../focus/FocusProvider'
import type { CatalogRow, Title } from '@go10/core/types'
import type { HeroSlide } from '@go10/core/hero/pickHero'
import { HeroCarousel } from './HeroCarousel'

function title(key: string): Title {
  return {
    key, kind: 'movie', title: `Título ${key}`, year: 2001, studio: '', source: '', genre: 'Drama', genre_secondary: '',
    quality: '', language: '', subtitled: false, thumbnail: `catalogo_files/${key}.webp`, views: 0,
    durationSeconds: 0, catalogIndex: 0, seasons: [{ video_id: `${key}1` } as CatalogRow],
  }
}
// Vitest stubs CSS imports (even ?raw); the stylesheet is read from disk.
const css = readFileSync(resolve(__dirname, 'Home.css'), 'utf-8')
const ART = { small: 'https://image.tmdb.org/t/p/w780/a.jpg', large: 'https://image.tmdb.org/t/p/w1280/a.jpg' }

/** The cascaded layout the rows' position depends on (jsdom resolves the cascade, not the geometry). */
function layout() {
  const hero = document.querySelector('.go-hero')!
  const style = (selector: string) => getComputedStyle(document.querySelector(selector)!)
  return {
    heroPadding: getComputedStyle(hero).paddingBottom,
    heroMinHeight: getComputedStyle(hero).minHeight,
    rowsMargin: style('.go-rows').marginTop,
    titleSize: style('.go-hero_slide.is-active .go-hero_title').fontSize,
    bodyWidth: style('.go-hero_slide.is-active .go-hero_body').maxWidth,
  }
}

describe('HeroCarousel layout', () => {
  it('keeps the same layout on art and no-art slides, so the rows never jump', () => {
    const style = document.createElement('style')
    style.textContent = css
    document.head.append(style)
    try {
      const slides: HeroSlide[] = [{ title: title('a'), art: ART }, { title: title('b'), art: null }]
      render(
        <FocusProvider onBack={() => {}}>
          <div className="go-home">
            <HeroCarousel slides={slides} onPlay={vi.fn()} onInfo={vi.fn()} />
            <div className="go-rows" />
          </div>
        </FocusProvider>,
      )
      const withArt = layout()
      fireEvent.click(document.querySelector('[aria-label="Siguiente"]')!)
      expect(document.querySelector('.go-hero')!.classList.contains('has-art')).toBe(false)
      expect(layout()).toEqual(withArt)
    } finally {
      style.remove()
    }
  })
})
