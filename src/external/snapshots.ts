import type { Title } from '../types'

/**
 * TMDB titles the viewer has played, kept whole (seasons included) so Home's
 * "Seguir viendo" and next-episode logic can use them without the network.
 * Best-effort like the progress store: storage failures are ignored.
 */

const PREFIX = 'go10:tmdb-title:'
export const SNAPSHOT_LIMIT = 30
/**
 * Total size cap, in characters. A long anime runs to ~1 MB of JSON, and
 * localStorage is ~5M characters per origin, shared with watch progress:
 * snapshots must never crowd out progress for the whole app.
 */
export const SNAPSHOT_BUDGET_CHARS = 1_000_000

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

interface Entry {
  storageKey: string
  size: number
  snapshot: Snapshot
}

function entries(): Entry[] {
  const found: Entry[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i)
      if (!storageKey?.startsWith(PREFIX)) continue
      const raw = localStorage.getItem(storageKey)
      const snapshot = parse(raw)
      if (snapshot) found.push({ storageKey, size: raw?.length ?? 0, snapshot })
    }
  } catch {
    // ignore
  }
  return found.sort((a, b) => b.snapshot.savedAt - a.snapshot.savedAt)
}

/** Drops the oldest snapshots beyond the count limit or the size budget; the newest always stays. */
function prune(): void {
  let total = 0
  entries().forEach(({ storageKey, size }, index) => {
    total += size
    if (index > 0 && (index >= SNAPSHOT_LIMIT || total > SNAPSHOT_BUDGET_CHARS)) localStorage.removeItem(storageKey)
  })
}

export function saveSnapshot(title: Title, now: number = Date.now()): void {
  const storageKey = PREFIX + title.key
  const value = JSON.stringify({ savedAt: now, title })
  try {
    try {
      localStorage.setItem(storageKey, value)
    } catch {
      // Full: make room by dropping the oldest other snapshot, then try once more.
      const oldest = entries().filter((entry) => entry.storageKey !== storageKey).pop()
      if (!oldest) return
      localStorage.removeItem(oldest.storageKey)
      localStorage.setItem(storageKey, value)
    }
    prune()
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
