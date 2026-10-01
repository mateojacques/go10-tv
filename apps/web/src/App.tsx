import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import type { CatalogRow, Title } from '@go10/core/types'
import { useCatalog } from './catalog/useCatalog'
import { useHeroArt } from './catalog/useHeroArt'
import { rowKey } from '@go10/core/catalog/rowKey'
import { FocusProvider } from './focus/FocusProvider'
import { useFocusable } from './focus/useFocusable'
import { Home } from './screens/Home'
import { Catalog } from './screens/Catalog'
import { Navbar } from './components/Navbar'
import { Detail } from './screens/Detail'
import { Player } from './screens/Player'
import { findNextEpisode, findPreviousEpisode } from '@go10/core/player/nextEpisode'
import { useRoute } from './router/useRoute'
import type { Route } from '@go10/core/router/route'
import { resolveRoute } from '@go10/core/router/resolveRoute'
import { COLLECTIONS } from './collections/collections'
import { Collection } from './screens/Collection'
import { externalTitlesEnabled } from '@go10/core/external/config'
import { isTmdbKey } from '@go10/core/external/tmdb/keys'
import { useTmdbTitle } from './external/useTmdbTitle'
import { saveSnapshot } from '@go10/core/external/snapshots'
import { exitAppIfTizen } from './platformTizen'
import { useLineup } from './tv/useLineup'
import { TvProvider, useTv } from './tv/TvProvider'
import { TvLayer } from './tv/TvLayer'
import { TvScreen } from './tv/TvScreen'
import { LiveRow } from './tv/LiveRow'
import { liveTvEnabled } from './tv/liveTvEnabled'
import { pickChannel } from '@go10/core/tv/lineup'
import './styles/global.css'

/** The TMDB error state's only control, reachable by remote as well as touch. */
function ErrorBackButton({ onBack }: { onBack: () => void }) {
  const { ref, focused, activate } = useFocusable('external-error:back', 0, 0, onBack)
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="button"
      aria-label="Volver"
      className={`go-back${focused ? ' is-focused' : ''}`}
      onClick={activate}
    >
      <span className="go-back_chevron" aria-hidden="true" />
    </div>
  )
}

/** Opening on-demand playback ends live TV: two audio streams never play at once. */
function TvRouteSync({ isPlayer }: { isPlayer: boolean }) {
  const { close } = useTv()
  useEffect(() => {
    if (isPlayer) close()
  }, [isPlayer, close])
  return null
}

/** Hands the browse screens the TV context: App itself sits outside the provider. */
function BrowseTv({ children }: { children: (tv: ReturnType<typeof useTv>) => ReactNode }) {
  return <>{children(useTv())}</>
}

export default function App() {
  const { titles, loading, error } = useCatalog()
  const heroArt = useHeroArt()
  const { route, navigate } = useRoute()
  const lineup = useLineup(titles)
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
      case 'tv':
        navigate({ name: 'home' })
        break
      case 'home':
        exitAppIfTizen()
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

  // Every screen renders inside the TV provider, so a channel playing in the
  // mini-player survives navigation, TMDB's loading screens included.
  function screenFor(): ReactNode {
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
            <ErrorBackButton onBack={back} />
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

    if (resolved.name === 'tv') {
      const channel = lineup && liveTvEnabled() ? pickChannel(lineup, resolved.channel) : null
      if (!channel) {
        // No live TV here, or an unknown channel: /tv picks one, else Home.
        navigate(lineup && liveTvEnabled() && resolved.channel ? { name: 'tv', channel: null } : { name: 'home' }, { replace: true })
        return null
      }
      if (resolved.channel !== channel.id) {
        navigate({ name: 'tv', channel: channel.id }, { replace: true })
        return null
      }
      return (
        <FocusProvider key="tv" onBack={back}>
          <TvScreen
            channel={channel}
            onZap={(id) => navigate({ name: 'tv', channel: id }, { replace: true })}
            onOpenTitle={(key) => navigate({ name: 'title', key })}
            onBack={back}
          />
        </FocusProvider>
      )
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
          <BrowseTv>
            {(tv) => (
              <div className="go-browse">
                <Navbar route={route} onNavigate={navigate} onTvIntent={() => tv.preload()} />
                {resolved.name === 'home' ? (
                  <Home
                    titles={titles}
                    heroArt={heroArt}
                    onSelect={openTitle}
                    onResume={(title, row) => navigate({ name: 'play', key: title.key, videoId: rowKey(row) })}
                    collections={COLLECTIONS}
                    onOpenCollection={(collection) => navigate({ name: 'collection', id: collection.id })}
                    liveRow={
                      tv.lineup && liveTvEnabled()
                        ? (rowIndex) => <LiveRow rowIndex={rowIndex} onWatch={(id) => navigate({ name: 'tv', channel: id })} />
                        : undefined
                    }
                  />
                ) : resolved.name === 'catalog' ? (
                  <Catalog
                    titles={titles}
                    section={resolved.section}
                    query={resolved.query}
                    source={(route.name === 'catalog' && route.source) || 'all'}
                    onSelect={openTitle}
                  />
                ) : (
                  <Collection collection={resolved.collection} titles={resolved.titles} onSelect={openTitle} />
                )}
              </div>
            )}
          </BrowseTv>
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
            heroArt={heroArt}
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

  return (
    <TvProvider lineup={lineup}>
      <TvRouteSync isPlayer={route.name === 'play'} />
      {screenFor()}
      <TvLayer onOpen={(id) => navigate({ name: 'tv', channel: id })} />
    </TvProvider>
  )
}
