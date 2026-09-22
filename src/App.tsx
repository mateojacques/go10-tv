import { useCatalog } from './catalog/useCatalog'
import './styles/global.css'

export default function App() {
  const { titles, loading, error } = useCatalog()

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
    <div className="go-state">
      <span className="go-state_mark">GO10 TV</span>
      <p className="go-state_msg">{titles.length} títulos</p>
    </div>
  )
}
