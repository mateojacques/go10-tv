/**
 * Catalog art is a path relative to the site root; TMDB art is an absolute URL.
 * The web app serves the art itself (`/`); the mobile app passes the site's URL.
 */
export function imageSrc(path: string, base = '/'): string {
  return /^https?:\/\//.test(path) ? path : `${base}${path}`
}
