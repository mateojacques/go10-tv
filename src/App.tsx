import { useCallback, useState } from 'react'
import { useCatalog } from './catalog/useCatalog'
import { FocusProvider } from './focus/FocusProvider'
import { Home } from './screens/Home'
import { Detail } from './screens/Detail'
import type { CatalogRow, Title } from './types'
import './styles/global.css'

type View = { name: 'home' } | { name: 'detail'; title: Title }

export default function App() {
  const { titles, loading, error } = useCatalog()
  const [view, setView] = useState<View>({ name: 'home' })

  const back = useCallback(() => setView({ name: 'home' }), [])

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

  return (
    // Remounting on view change gives each screen a clean focus registry with
    // its first item focused, instead of inheriting the previous screen's grid.
    <FocusProvider key={view.name} onBack={back}>
      {view.name === 'home' && (
        <Home titles={titles} onSelect={(title) => setView({ name: 'detail', title })} />
      )}
      {view.name === 'detail' && (
        <Detail
          title={view.title}
          onPlay={(row: CatalogRow) => console.log('play', row.embed_url)}
        />
      )}
    </FocusProvider>
  )
}
