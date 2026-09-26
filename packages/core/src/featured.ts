/** The hero is a fixed promo slot, not derived from the catalog. Shared so web and mobile feature the same title. */
export const FEATURED_SERIES_ID = 'spidey-y-sus-sorprendentes-amigos'

/**
 * Full-resolution key art for the promo slot. Catalog thumbnails are only
 * 368x210, so a title without its own key art falls back to the blurred
 * backdrop plus a small crisp thumbnail.
 */
export const FEATURED_ART = {
  small: 'assets/spidey/spidey-hero-960.webp',
  large: 'assets/spidey/spidey-hero-1920.webp',
}
