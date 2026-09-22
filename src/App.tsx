import { useCallback } from 'react'
import type { CatalogRow } from './types'
import { useCatalog } from './catalog/useCatalog'
import { rowKey } from './catalog/rowKey'
import { FocusProvider } from './focus/FocusProvider'
import { Home } from './screens/Home'
import { Detail } from './screens/Detail'
import { Player } from './screens/Player'
import { findNextEpisode, findPreviousEpisode } from './screens/nextEpisode'
import { useRoute } from './router/useRoute'
import { resolveRoute } from './router/resolveRoute'
import './styles/global.css'

export default function App() {
  const { titles, loading, error } = useCatalog()
  const { route, navigate } = useRoute()

  const back = useCallback(() => {
    navigate(route.name === 'play' ? { name: 'title', key: route.key } : { name: 'home' })
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

  if (resolved.name === 'home') {
    return (
      <FocusProvider key="home" onBack={back}>
        <Home
          titles={titles}
          onSelect={(title) => navigate({ name: 'title', key: title.key })}
          onResume={(title, row) => navigate({ name: 'play', key: title.key, videoId: rowKey(row) })}
        />
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
