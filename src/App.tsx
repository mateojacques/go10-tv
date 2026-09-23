import { useCallback, useRef } from 'react'
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
      case 'catalog':
        navigate({ name: 'home' })
        break
    }
  }, [route, navigate])

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

  const resolved = resolveRoute(route, titles)

  if (resolved.name === 'not-found') {
    // Stale or hand-typed URL — bounce to Home without leaving a broken
    // history entry behind.
    navigate({ name: 'home' }, { replace: true })
    return null
  }

  if (resolved.name === 'home' || resolved.name === 'catalog') {
    lastBrowseRoute.current = route
    const openTitle = (title: Title) => navigate({ name: 'title', key: title.key })

    return (
      // One provider for Home and the catalog, with the navbar outside the
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
            />
          ) : (
            <Catalog
              titles={titles}
              section={resolved.section}
              query={resolved.query}
              onSelect={openTitle}
            />
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
