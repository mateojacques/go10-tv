import { episodeGrid } from './episodeGrid'

describe('episodeGrid', () => {
  it('fits as many tiles of the minimum width as it can, stretched to fill', () => {
    expect(episodeGrid(320, 56, 8)).toEqual({ columns: 5, tile: 57 })
    expect(episodeGrid(880, 44, 8)).toEqual({ columns: 17, tile: 44 })
  })

  it('always keeps one column', () => {
    expect(episodeGrid(40, 56, 8)).toEqual({ columns: 1, tile: 40 })
  })
})
