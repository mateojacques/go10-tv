interface ImportMetaEnv {
  /** `on` enables TMDB search + vidlove playback. Anything else: off. */
  readonly VITE_EXTERNAL_TITLES?: string
  readonly VITE_TMDB_TOKEN?: string
  /** Where catalog art is served from; unset = this site (`/`). See catalog/art.ts. */
  readonly VITE_IMAGE_BASE?: string
}
