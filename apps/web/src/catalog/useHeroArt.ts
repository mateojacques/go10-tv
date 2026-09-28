import { useEffect, useState } from 'react'
import { parseHeroArt, type HeroArtIndex } from '@go10/core/hero/art'

// One request per page load; every Home mount after it reads the settled value.
let request: Promise<HeroArtIndex> | null = null
let settled: HeroArtIndex | null = null

function load(): Promise<HeroArtIndex> {
  request ??= fetch('/data/hero_art.json')
    .then((response) => (response.ok ? response.text() : ''))
    .then((text) => parseHeroArt(text) ?? {})
    .catch(() => ({}))
    .then((index) => (settled = index))
  return request
}

/** The hero art sidecar; null until the request settles, `{}` if it failed. Never fatal. */
export function useHeroArt(): HeroArtIndex | null {
  const [index, setIndex] = useState<HeroArtIndex | null>(settled)
  useEffect(() => {
    if (index) return
    let cancelled = false
    void load().then((value) => {
      if (!cancelled) setIndex(value)
    })
    return () => {
      cancelled = true
    }
  }, [index])
  return index
}

export function resetHeroArtForTests(): void {
  request = null
  settled = null
}
