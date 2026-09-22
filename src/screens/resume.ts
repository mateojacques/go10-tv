export const RESUME_MAX_AGE_MS = 6 * 60 * 60 * 1000
export const RESUME_REWIND_SECONDS = 5

interface ResumeEntry {
  startedAt: number
}

function resumeKey(videoId: string): string {
  return `go10:resume:${videoId}`
}

/** Best-effort: if storage is unavailable, resume simply degrades to starting at 0. */
export function markResumeStart(videoId: string, now: number = Date.now()): void {
  try {
    localStorage.setItem(resumeKey(videoId), JSON.stringify({ startedAt: now } satisfies ResumeEntry))
  } catch {
    // ignore — private mode, quota exceeded, or storage disabled
  }
}

export function clearResume(videoId: string): void {
  try {
    localStorage.removeItem(resumeKey(videoId))
  } catch {
    // ignore
  }
}

export function readResumeFromTime(videoId: string, now: number = Date.now()): number | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(resumeKey(videoId))
  } catch {
    return null
  }
  if (!raw) return null

  let entry: ResumeEntry
  try {
    entry = JSON.parse(raw)
  } catch {
    return null
  }

  const age = now - entry.startedAt
  if (age < 0 || age > RESUME_MAX_AGE_MS) return null

  const elapsedSeconds = Math.floor(age / 1000)
  return Math.max(0, elapsedSeconds - RESUME_REWIND_SECONDS)
}
