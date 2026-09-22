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

const CHAPTER_CSV = `catalog_index,video_id,type,title,title_raw,series_id,series_title,season_number,season_label,episode_number,chapter_start_seconds,chapter_end_seconds,year,studio,genre,genre_secondary,quality,language,subtitled,duration_raw,duration_seconds,views,thumbnail,video_url,embed_url
0,111,episode,Hora de Aventura,"Hora de Aventura - Temporada 1",hora-de-aventura,Hora de Aventura,1,,1,0,1435,2010,Cartoon N.,Animación,,1080p,Español,false,23:55,1435,173,catalogo_files/b.webp,https://ok.ru/video/111,https://ok.ru/videoembed/111
1,111,episode,Hora de Aventura,"Hora de Aventura - Temporada 1",hora-de-aventura,Hora de Aventura,1,,2,1435,,2010,Cartoon N.,Animación,,1080p,Español,false,45:34,2735,50,catalogo_files/b.webp,https://ok.ru/video/111,https://ok.ru/videoembed/111
`

describe('parseCatalogCsv with chapter boundaries', () => {
  it('types chapter_start_seconds/chapter_end_seconds as numbers, and an open end as null', () => {
    const rows = parseCatalogCsv(CHAPTER_CSV)
    expect(rows[0].chapter_start_seconds).toBe(0)
    expect(rows[0].chapter_end_seconds).toBe(1435)
    expect(rows[1].chapter_end_seconds).toBeNull()
  })

  it('leaves chapter fields null for a CSV with no such columns', () => {
    expect(parseCatalogCsv(CSV)[0].chapter_start_seconds).toBeNull()
  })
})

const EPISODIC_CSV = `catalog_index,video_id,type,title,title_raw,series_id,series_title,season_number,season_label,episode_number,year,studio,genre,genre_secondary,quality,language,subtitled,duration_raw,duration_seconds,views,thumbnail,video_url,embed_url
0,901,episode,Spidey,"Spidey - T1E2",spidey,Spidey,1,,2,,Marvel,Superhéroes,Infantil,1080p,Español,false,23:32,1412,2,assets/spidey/a.webp,https://ok.ru/video/901,https://ok.ru/videoembed/901
1,902,episode,Spidey,"Spidey - T1E1",spidey,Spidey,1,,1,,Marvel,Superhéroes,Infantil,1080p,Español,false,23:20,1400,3,assets/spidey/b.webp,https://ok.ru/video/902,https://ok.ru/videoembed/902
2,903,episode,Spidey,"Spidey - T2E1",spidey,Spidey,2,,1,,Marvel,Superhéroes,Infantil,1080p,Español,false,23:40,1420,1,assets/spidey/c.webp,https://ok.ru/video/903,https://ok.ru/videoembed/903
`

describe('buildTitles with episode rows', () => {
  it('types episode_number as a number', () => {
    const rows = parseCatalogCsv(EPISODIC_CSV)
    expect(rows[0].episode_number).toBe(2)
  })

  it('sorts episodes by season then episode number regardless of scrape order', () => {
    const show = buildTitles(parseCatalogCsv(EPISODIC_CSV))[0]
    expect(show.seasons.map((s) => [s.season_number, s.episode_number])).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
    ])
  })
})
