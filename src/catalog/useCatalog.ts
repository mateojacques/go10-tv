import { useEffect, useState } from 'react'
import type { CatalogRow, Title } from '../types'
import { parseCatalogCsv, buildTitles } from './loadCatalog'

interface CatalogState {
  rows: CatalogRow[]
  titles: Title[]
  loading: boolean
  error: string | null
}

export function useCatalog(): CatalogState {
  const [state, setState] = useState<CatalogState>({
    rows: [], titles: [], loading: true, error: null,
  })

  useEffect(() => {
    let cancelled = false

    fetch('/data/catalog.csv')
      .then((response) => {
        if (!response.ok) throw new Error(`catalog.csv: ${response.status}`)
        return response.text()
      })
      .then((text) => {
        if (cancelled) return
        const rows = parseCatalogCsv(text)
        setState({ rows, titles: buildTitles(rows), loading: false, error: null })
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setState({ rows: [], titles: [], loading: false, error: error.message })
        }
      })

    return () => { cancelled = true }
  }, [])

  return state
}
