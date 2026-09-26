export interface CachedText {
  body: string
  etag: string | null
}

/** Where downloaded data files live between launches. Methods may throw (disk full); callers catch. */
export interface TextCache {
  read(name: string): CachedText | null
  write(name: string, entry: CachedText): void
}

export function memoryTextCache(): TextCache {
  const entries = new Map<string, CachedText>()
  return {
    read: (name) => entries.get(name) ?? null,
    write: (name, entry) => void entries.set(name, entry),
  }
}
