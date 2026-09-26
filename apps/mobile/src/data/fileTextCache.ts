import { File, Paths } from 'expo-file-system'
import type { TextCache } from './textCache'

function writeText(file: File, text: string): void {
  if (!file.exists) file.create()
  file.write(text)
}

/**
 * Each entry is two files in the app's document directory: the body, and its
 * ETag beside it. Writes clear the ETag first and set it last, so a write cut
 * short can leave a body without an ETag (refetched in full next time), but
 * never a new body paired with an old ETag (which would 304 forever).
 */
export function fileTextCache(): TextCache {
  const body = (name: string) => new File(Paths.document, name)
  const etag = (name: string) => new File(Paths.document, `${name}.etag`)
  return {
    read(name) {
      const bodyFile = body(name)
      if (!bodyFile.exists) return null
      const etagFile = etag(name)
      return { body: bodyFile.textSync(), etag: (etagFile.exists && etagFile.textSync()) || null }
    },
    write(name, entry) {
      writeText(etag(name), '')
      writeText(body(name), entry.body)
      writeText(etag(name), entry.etag ?? '')
    },
  }
}
