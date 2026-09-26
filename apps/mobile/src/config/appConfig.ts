import Constants from 'expo-constants'
import { DEFAULT_SITE_URL } from '../../config/envFile'

/** Baked in at build time by app.config.ts (see config/envFile.js). */
export interface AppExtra {
  siteUrl: string
  externalTitles?: string
  tmdbToken?: string
}

export function appExtra(): AppExtra {
  const extra = (Constants.expoConfig?.extra ?? {}) as Partial<AppExtra>
  return { siteUrl: extra.siteUrl || DEFAULT_SITE_URL, externalTitles: extra.externalTitles, tmdbToken: extra.tmdbToken }
}

/** `imageSrc` and the data URLs append paths to this: exactly one trailing slash. */
export function siteBase(siteUrl: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/`
}
