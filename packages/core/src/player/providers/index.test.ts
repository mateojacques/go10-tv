import { describe, expect, it } from 'vitest'
import { catalogRow } from '../../tv/testing'
import { providerFor } from './index'
import { okru } from './okru'
import { vidlove } from './vidlove'
import { youtube } from './youtube'

describe('providerFor', () => {
  it('picks YouTube by the embed URL host', () => {
    expect(providerFor(catalogRow({ embed_url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' }))).toBe(youtube)
  })

  it('keeps TMDB rows on vidlove and the rest on ok.ru', () => {
    expect(providerFor(catalogRow({ external: true, embed_url: 'https://player.vidlove.cc/embed/movie/155' }))).toBe(vidlove)
    expect(providerFor(catalogRow())).toBe(okru)
  })
})
