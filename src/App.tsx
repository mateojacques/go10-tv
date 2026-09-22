import { useState } from 'react'
import { useCatalog } from './catalog/useCatalog'
import { FocusProvider } from './focus/FocusProvider'
import { Home } from './screens/Home'
import type { Title } from './types'
import './styles/global.css'

export default function App() {
  const { titles, loading, error } = useCatalog()
  const [selected, setSelected] = useState<Title | null>(null)

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
    <FocusProvider onBack={() => setSelected(null)}>
      <Home titles={titles} onSelect={setSelected} />
      {selected && <div className="go-state">Seleccionado: {selected.title}</div>}
    </FocusProvider>
  )
}
