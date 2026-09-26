import { allowNavigation } from './navigationGuard'

const SITE = 'https://tv.go10.blog/'

describe('allowNavigation', () => {
  it('lets the embed and its sub-frames load anything', () => {
    expect(allowNavigation({ url: 'https://ads.example/x', isTopFrame: false }, SITE)).toBe(true)
  })

  it('keeps the top frame on the host page', () => {
    expect(allowNavigation({ url: 'about:blank', isTopFrame: true }, SITE)).toBe(true)
    expect(allowNavigation({ url: 'https://tv.go10.blog/', isTopFrame: true }, SITE)).toBe(true)
    expect(allowNavigation({ url: 'https://tv.go10.blog', isTopFrame: true }, SITE)).toBe(true)
  })

  it('refuses top-frame navigation anywhere else, look-alikes included', () => {
    expect(allowNavigation({ url: 'https://ok.ru/video/1', isTopFrame: true }, SITE)).toBe(false)
    expect(allowNavigation({ url: 'https://tv.go10.blog.evil.example/', isTopFrame: true }, SITE)).toBe(false)
    expect(allowNavigation({ url: 'https://ads.example/' }, SITE)).toBe(false)
  })
})
