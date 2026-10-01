/** FNV-1a over the key, mixed with the seed: a stable 0..1 per (seed, key). */
export function hash01(seed: number, key: string): number {
  let h = (0x811c9dc5 ^ seed) >>> 0
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296
}
