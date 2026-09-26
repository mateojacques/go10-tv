/** Catalog art is a path relative to the site root; TMDB art is an absolute URL. */
export function imageSrc(path: string): string {
  return /^https?:\/\//.test(path) ? path : `/${path}`
}
