import { useCallback, useEffect, useRef } from 'react'
import type { CatalogRow, Title } from './types'
import { useCatalog } from './catalog/useCatalog'
import { rowKey } from './catalog/rowKey'
import { FocusProvider } from './focus/FocusProvider'
import { Home } from './screens/Home'
import { Catalog } from './screens/Catalog'
import { Navbar } from './components/Navbar'
import { Detail } from './screens/Detail'
import { Player } from './screens/Player'
import { findNextEpisode, findPreviousEpisode } from './screens/nextEpisode'
import { useRoute } from './router/useRoute'
import type { Route } from './router/route'
import { resolveRoute } from './router/resolveRoute'
import { COLLECTIONS } from './collections/collections'
import { Collection } from './screens/Collection'
import { externalTitlesEnabled } from './external/config'
import { isTmdbKey } from './external/tmdb/keys'
import { useTmdbTitle } from './external/useTmdbTitle'
import { saveSnapshot } from './external/snapshots'
import './styles/global.css'

export default function App() {
  const { titles, loading, error } = useCatalog()
  const { route, navigate } = useRoute()
  // The Home or catalog page a title was opened from, so backing out of Detail
  // returns to that search or section rather than always to Home. Deep links
  // have nowhere better to go than Home.
  const lastBrowseRoute = useRef<Route>({ name: 'home' })

  const back = useCallback(() => {
    switch (route.name) {
      case 'play':
        navigate({ name: 'title', key: route.key })
        break
      case 'title':
        navigate(lastBrowseRoute.current)
        break
      case 'collection':
        navigate({ name: 'home' })
        break
      case 'catalog':
        navigate({ name: 'home' })
        break
    }
  }, [route, navigate])

  // TMDB titles aren't in the catalog: a `tmdb-*` key is fetched instead.
  const tmdbKey =
    externalTitlesEnabled() && (route.name === 'title' || route.name === 'play') && isTmdbKey(route.key)
      ? route.key
      : null
  const tmdb = useTmdbTitle(tmdbKey)
  const playingExternal = route.name === 'play' && tmdb.status === 'ready' ? tmdb.title : null

  // Played TMDB titles are remembered for Home's "Seguir viendo".
  useEffect(() => {
    if (playingExternal) saveSnapshot(playingExternal)
  }, [playingExternal])

  if (loading) {
    return (
      <div className="go-state">
        <span className="go-state_mark is-loading">GO10 TV</span>
        <p className="go-state_msg">Cargando catálogo…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="go-state">
        <span className="go-state_mark">GO10 TV</span>
        <p className="go-state_msg">No se pudo cargar el catálogo: {error}</p>
      </div>
    )
  }

  if (tmdbKey && tmdb.status === 'loading') {
    return (
      // A slow TMDB mustn't trap the remote: Back still leaves.
      <FocusProvider key="external-loading" onBack={back}>
        <div className="go-state">
          <span className="go-state_mark is-loading">GO10 TV</span>
          <p className="go-state_msg">Cargando título…</p>
        </div>
      </FocusProvider>
    )
  }

  if (tmdbKey && tmdb.status === 'error') {
    return (
      <FocusProvider key="external-error" onBack={back}>
        <div className="go-state">
          <button type="button" className="go-back" onClick={back} aria-label="Volver">
            <span className="go-back_chevron" aria-hidden="true" />
          </button>
          <span className="go-state_mark">GO10 TV</span>
          <p className="go-state_msg">No se pudo cargar el título.</p>
        </div>
      </FocusProvider>
    )
  }

  // A loaded TMDB title resolves exactly like a catalog one; `not-found`
  // falls through to the usual bounce Home.
  const available = tmdb.status === 'ready' ? [...titles, tmdb.title] : titles
  const resolved = resolveRoute(route, available, COLLECTIONS)

  if (resolved.name === 'not-found') {
    // Stale or hand-typed URL — bounce to Home without leaving a broken
    // history entry behind.
    navigate({ name: 'home' }, { replace: true })
    return null
  }

  if (resolved.name === 'home' || resolved.name === 'catalog' || resolved.name === 'collection') {
    lastBrowseRoute.current = route
    const openTitle = (title: Title) => navigate({ name: 'title', key: title.key })

    return (
      // One provider for Home, the catalog and collection pages, with the navbar outside the
      // screen that swaps beneath it: typing on Home navigates to /buscar, and
      // the input has to survive that without losing focus (and the TV's
      // on-screen keyboard) after the first letter.
      <FocusProvider key="browse" onBack={back}>
        <div className="go-browse">
          <Navbar route={route} onNavigate={navigate} />
          {resolved.name === 'home' ? (
            <Home
              titles={titles}
              onSelect={openTitle}
              onResume={(title, row) => navigate({ name: 'play', key: title.key, videoId: rowKey(row) })}
              collections={COLLECTIONS}
              onOpenCollection={(collection) => navigate({ name: 'collection', id: collection.id })}
            />
          ) : resolved.name === 'catalog' ? (
            <Catalog
              titles={titles}
              section={resolved.section}
              query={resolved.query}
              catalogOnly={route.name === 'catalog' && route.catalogOnly === true}
              onSelect={openTitle}
            />
          ) : (
            <Collection collection={resolved.collection} titles={resolved.titles} onSelect={openTitle} />
          )}
        </div>
      </FocusProvider>
    )
  }

  const title = resolved.title
  const playingRow = resolved.name === 'player' ? resolved.row : undefined
  const nextRow = playingRow ? findNextEpisode(title.seasons, playingRow) : null
  const prevRow = playingRow ? findPreviousEpisode(title.seasons, playingRow) : null
  const goToEpisode = (episodeRow: CatalogRow) =>
    navigate({ name: 'play', key: title.key, videoId: rowKey(episodeRow) })

  return (
    <>
      {/* The player is an overlay on top of the detail screen, so the screen
          beneath keeps its identity — and its chosen season — while playback
          is open. */}
      <FocusProvider key="detail" onBack={back} enabled={resolved.name !== 'player'}>
        <Detail
          title={title}
          onPlay={(row) => navigate({ name: 'play', key: title.key, videoId: rowKey(row) })}
          onBack={back}
          playingRow={playingRow}
        />
      </FocusProvider>

      {resolved.name === 'player' && (
        <Player
          row={resolved.row}
          onClose={back}
          onEnded={nextRow ? () => goToEpisode(nextRow) : undefined}
          onPrev={prevRow ? () => goToEpisode(prevRow) : undefined}
          onNext={nextRow ? () => goToEpisode(nextRow) : undefined}
        />
      )}
    </>
  )
}
