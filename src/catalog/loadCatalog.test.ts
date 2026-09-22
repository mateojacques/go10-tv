import { describe, it, expect } from 'vitest'
import { parseCatalogCsv, buildTitles } from './loadCatalog'

const CSV = `catalog_index,video_id,type,title,title_raw,series_id,series_title,season_number,season_label,year,studio,genre,genre_secondary,quality,language,subtitled,duration_raw,duration_seconds,views,thumbnail,video_url,embed_url
0,111,season,Hora de Aventura,"Hora de Aventura - Temporada 2 [1080p]",hora-de-aventura,Hora de Aventura,2,,2010,Cartoon N.,Animación,Aventura,1080p,Español,false,4:52:35,17555,137,catalogo_files/a.webp,https://ok.ru/video/111,https://ok.ru/videoembed/111
1,222,season,Hora de Aventura,"Hora de Aventura - Temporada 1 [1080p]",hora-de-aventura,Hora de Aventura,1,,2010,Cartoon N.,Animación,Aventura,1080p,Español,false,4:08:29,14909,173,catalogo_files/b.webp,https://ok.ru/video/222,https://ok.ru/videoembed/222
2,333,movie,"Crows Zero, el regreso","Crows Zero, el regreso (2007) [1080p]",,,,,2007,,Acción,,1080p,Español,true,2:13:42,8022,1444,catalogo_files/c.webp,https://ok.ru/video/333,https://ok.ru/videoembed/333
`

describe('parseCatalogCsv', () => {
  it('types numeric and boolean columns', () => {
    const rows = parseCatalogCsv(CSV)
    expect(rows).toHaveLength(3)
    expect(rows[0].video_id).toBe('111')
    expect(rows[0].season_number).toBe(2)
    expect(rows[2].views).toBe(1444)
    expect(rows[2].subtitled).toBe(true)
    expect(rows[0].subtitled).toBe(false)
  })

  it('preserves titles containing commas', () => {
    expect(parseCatalogCsv(CSV)[2].title).toBe('Crows Zero, el regreso')
  })
})

describe('buildTitles', () => {
  it('collapses seasons of one series into a single show', () => {
    const titles = buildTitles(parseCatalogCsv(CSV))
    expect(titles).toHaveLength(2)

    const show = titles.find((t) => t.kind === 'show')!
    expect(show.title).toBe('Hora de Aventura')
    expect(show.key).toBe('hora-de-aventura')
    expect(show.seasons.map((s) => s.season_number)).toEqual([1, 2])
  })

  it('keeps movies as standalone titles keyed by video id', () => {
    const movie = buildTitles(parseCatalogCsv(CSV)).find((t) => t.kind === 'movie')!
    expect(movie.key).toBe('333')
    expect(movie.seasons).toHaveLength(1)
  })

  it('orders titles by first appearance in the catalog', () => {
    expect(buildTitles(parseCatalogCsv(CSV)).map((t) => t.key))
      .toEqual(['hora-de-aventura', '333'])
  })

  it('takes show metadata from its earliest season', () => {
    const show = buildTitles(parseCatalogCsv(CSV))[0]
    expect(show.thumbnail).toBe('catalogo_files/b.webp')
    expect(show.views).toBe(137 + 173)
  })
})
