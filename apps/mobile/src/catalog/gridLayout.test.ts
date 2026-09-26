import { catalogGrid } from './gridLayout'

describe('catalogGrid', () => {
  it('fills a phone with two cards per line', () => {
    expect(catalogGrid(372, 240, 12, true)).toEqual({ columns: 2, card: 180 })
  })

  it('fits as many fixed-width cards as the TV allows', () => {
    expect(catalogGrid(880, 192, 10, false)).toEqual({ columns: 4, card: 192 })
    expect(catalogGrid(100, 192, 10, false)).toEqual({ columns: 1, card: 192 })
  })
})
