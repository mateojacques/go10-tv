import { useCallback, useState } from 'react'
import { useCatalog } from './catalog/useCatalog'
import { FocusProvider } from './focus/FocusProvider'
import { Home } from './screens/Home'
import { Detail } from './screens/Detail'
import { Player } from './screens/Player'
import type { CatalogRow, Title } from './types'
import './styles/global.css'

type View =
  | { name: 'home' }
  | { name: 'detail'; title: Title }
  | { name: 'player'; title: Title; row: CatalogRow }

export default function App() {
  const { titles, loading, error } = useCatalog()
  const [view, setView] = useState<View>({ name: 'home' })

  // Back pops one level: player -> detail -> home.
  const back = useCallback(() => {
    setView((current) =>
      current.name === 'player' ? { name: 'detail', title: current.title } : { name: 'home' },
    )
  }, [])

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

  const playing = view.name === 'player'
  // The player is an overlay on top of the detail screen, so the screen beneath
  // keeps its identity — and its chosen season — while playback is open.
  const screen = playing ? 'detail' : view.name

  return (
    <>
      <FocusProvider key={screen} onBack={back} enabled={!playing}>
        {view.name === 'home' && (
          <Home titles={titles} onSelect={(title) => setView({ name: 'detail', title })} />
        )}
        {(view.name === 'detail' || playing) && (
          <Detail
            title={view.title}
            onPlay={(row) => setView({ name: 'player', title: view.title, row })}
            onBack={back}
          />
        )}
      </FocusProvider>

      {playing && <Player row={view.row} onClose={back} />}
    </>
  )
}
