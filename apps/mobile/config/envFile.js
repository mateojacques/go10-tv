// CommonJS, not TypeScript: app.config.ts imports it, and Expo's config
// loader transpiles the config file itself but not modules it imports.

/** The live site; override with GO10_SITE_URL (e.g. a Netlify preview deploy). */
const DEFAULT_SITE_URL = 'https://tv.go10.blog'

/**
 * Minimal dotenv reader: KEY=value lines, optional `export`, optional quotes, # comments.
 * @param {string} text
 * @returns {Record<string, string>}
 */
function parseEnvFile(text) {
  /** @type {Record<string, string>} */
  const vars = {}
  for (const line of text.split(/\r?\n/)) {
    if (line.trimStart().startsWith('#')) continue
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (!match) continue
    let value = match[2]
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1)
    vars[match[1]] = value
  }
  return vars
}

/**
 * What the app reads at runtime (Expo `extra`). The external-titles switch and
 * token are the web app's own variables, so one .env.local drives both apps.
 * @param {Record<string, string | undefined>} env
 */
function mobileExtra(env) {
  return {
    siteUrl: env.GO10_SITE_URL || DEFAULT_SITE_URL,
    externalTitles: env.VITE_EXTERNAL_TITLES,
    tmdbToken: env.VITE_TMDB_TOKEN,
  }
}

module.exports = { DEFAULT_SITE_URL, parseEnvFile, mobileExtra }
