import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { useCatalog } from './catalog/useCatalog'

function App() {
  const { titles, loading, error } = useCatalog()

  if (loading) return <p>Cargando catálogo…</p>
  if (error) return <p>Error al cargar el catálogo: {error}</p>
  return <p>{titles.length} títulos cargados</p>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
