import { createFetchText } from './httpText'

function response(status: number, body = '', headers: Record<string, string> = {}) {
  return { status, ok: status >= 200 && status < 300, text: async () => body, headers: { get: (n: string) => headers[n.toLowerCase()] ?? null } }
}

describe('fetchText', () => {
  it('returns the body and ETag of a 200', async () => {
    const fetchImpl = jest.fn(async (_url: string, _init: { headers: Record<string, string> }) => response(200, 'csv', { etag: '"v1"' }))
    await expect(createFetchText(fetchImpl as never)('https://x/data', null)).resolves.toEqual({ status: 200, body: 'csv', etag: '"v1"' })
    expect(fetchImpl.mock.calls[0][1].headers).toEqual({})
  })

  it('revalidates with If-None-Match and reports a 304', async () => {
    const fetchImpl = jest.fn(async (_url: string, _init: { headers: Record<string, string> }) => response(304))
    await expect(createFetchText(fetchImpl as never)('https://x/data', '"v1"')).resolves.toEqual({ status: 304 })
    expect(fetchImpl.mock.calls[0][1].headers).toEqual({ 'If-None-Match': '"v1"' })
  })

  it('reports other statuses without a body', async () => {
    const fetchImpl = jest.fn(async () => response(503, 'down'))
    await expect(createFetchText(fetchImpl as never)('https://x/data', null)).resolves.toEqual({ status: 'error', code: 503 })
  })

  it('gives up on a network that never answers', async () => {
    jest.useFakeTimers()
    try {
      const fetchImpl = jest.fn((_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))))
      const pending = createFetchText(fetchImpl as never, 1000)('https://x/data', null)
      jest.advanceTimersByTime(1000)
      await expect(pending).rejects.toThrow('aborted')
    } finally {
      jest.useRealTimers()
    }
  })
})
