/**
 * The host page must stay put: vidlove serves ads that redirect the top
 * frame (seen twice in Phase 0). Sub-frames (the embed, its ads) may load
 * anything; the top frame only the site itself or about:blank.
 */
export function allowNavigation(request: { url: string; isTopFrame?: boolean }, siteUrl: string): boolean {
  if (request.isTopFrame === false) return true
  if (request.url === 'about:blank') return true
  const site = siteUrl.replace(/\/+$/, '')
  return request.url === site || request.url.startsWith(`${site}/`)
}
