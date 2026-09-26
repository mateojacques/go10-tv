export type FetchResult =
  | { status: 200; body: string; etag: string | null }
  | { status: 304 }
  | { status: 'error'; code: number }

/** Rejects on network failure or timeout; callers treat that like "no answer". */
export type FetchText = (url: string, etag: string | null) => Promise<FetchResult>

/** A dead Wi-Fi or captive portal can hang forever; the first launch must still end. */
export const FETCH_TIMEOUT_MS = 15000

export function createFetchText(fetchImpl: typeof fetch = fetch, timeoutMs = FETCH_TIMEOUT_MS): FetchText {
  return async (url, etag) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(url, {
        headers: etag ? { 'If-None-Match': etag } : {},
        signal: controller.signal,
      })
      if (response.status === 304) return { status: 304 }
      if (!response.ok) return { status: 'error', code: response.status }
      return { status: 200, body: await response.text(), etag: response.headers.get('etag') }
    } finally {
      clearTimeout(timer)
    }
  }
}
