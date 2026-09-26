import { siteBase } from './appConfig'

describe('siteBase', () => {
  it('ends the site URL in exactly one slash, as imageSrc and the data URLs expect', () => {
    expect(siteBase('https://tv.go10.blog')).toBe('https://tv.go10.blog/')
    expect(siteBase('https://tv.go10.blog/')).toBe('https://tv.go10.blog/')
    expect(siteBase('https://tv.go10.blog//')).toBe('https://tv.go10.blog/')
  })
})
