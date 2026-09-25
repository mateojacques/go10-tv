import type { Title } from '../types'

/**
 * TMDB titles the viewer has played, kept whole (seasons included) so Home's
 * "Seguir viendo" and next-episode logic can use them without the network.
 * Best-effort like the progress store: storage failures are ignored.
 */

const PREFIX = 'go10:tmdb-title:'
export const SNAPSHOT_LIMIT = 30

interface Snapshot {
  savedAt: number
  title: Title
}

function isSnapshot(value: unknown): value is Snapshot {
  const s = value as Snapshot | null
  return typeof s?.savedAt === 'number' && typeof s.title?.key === 'string' && Array.isArray(s.title.seasons)
}

function parse(raw: string | null): Snapshot | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    return isSnapshot(value) ? value : null
  } catch {
    return null
  }
}

function entries(): { storageKey: string; snapshot: Snapshot }[] {
  const found: { storageKey: string; snapshot: Snapshot }[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i)
      if (!storageKey?.startsWith(PREFIX)) continue
      const snapshot = parse(localStorage.getItem(storageKey))
      if (snapshot) found.push({ storageKey, snapshot })
    }
  } catch {
    // ignore
  }
  return found.sort((a, b) => b.snapshot.savedAt - a.snapshot.savedAt)
}

export function saveSnapshot(title: Title, now: number = Date.now()): void {
  try {
    localStorage.setItem(PREFIX + title.key, JSON.stringify({ savedAt: now, title }))
    for (const { storageKey } of entries().slice(SNAPSHOT_LIMIT)) localStorage.removeItem(storageKey)
  } catch {
    // ignore — private mode, quota exceeded, or storage disabled
  }
}

export function readSnapshot(key: string): Title | null {
  try {
    return parse(localStorage.getItem(PREFIX + key))?.title ?? null
  } catch {
    return null
  }
}

export function listSnapshots(): Title[] {
  return entries().map((entry) => entry.snapshot.title)
}
