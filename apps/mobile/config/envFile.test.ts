import { DEFAULT_SITE_URL, mobileExtra, parseEnvFile } from './envFile'

describe('parseEnvFile', () => {
  it('reads KEY=value lines, skipping comments and blanks', () => {
    expect(parseEnvFile('# switches\nVITE_EXTERNAL_TITLES=on\n\nVITE_TMDB_TOKEN=abc.def\n')).toEqual({
      VITE_EXTERNAL_TITLES: 'on',
      VITE_TMDB_TOKEN: 'abc.def',
    })
  })

  it('unquotes values, trims spaces, accepts "export" and CRLF', () => {
    expect(parseEnvFile('export A="x y"\r\nB = \'z\' \r\nC=a=b\r\n')).toEqual({ A: 'x y', B: 'z', C: 'a=b' })
  })
})

describe('mobileExtra', () => {
  it('uses the web app variables for the external-titles switch and token', () => {
    expect(mobileExtra({ VITE_EXTERNAL_TITLES: 'on', VITE_TMDB_TOKEN: 't' })).toEqual({
      siteUrl: DEFAULT_SITE_URL,
      externalTitles: 'on',
      tmdbToken: 't',
    })
  })

  it('lets GO10_SITE_URL point the app at another deploy', () => {
    expect(mobileExtra({ GO10_SITE_URL: 'https://preview.example' }).siteUrl).toBe('https://preview.example')
  })

  it('is catalog-only on the live site when nothing is set', () => {
    expect(mobileExtra({})).toEqual({ siteUrl: 'https://tv.go10.blog', externalTitles: undefined, tmdbToken: undefined })
  })
})
