import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { appExtra, siteBase } from '../config/appConfig'
import { createCatalogStore, type CatalogState, type CatalogStore } from './catalogStore'
import { fileTextCache } from './fileTextCache'
import { createFetchText } from './httpText'

const CatalogContext = createContext<CatalogStore | null>(null)

/** One store for the app's lifetime; `store` is injectable for tests. */
export function CatalogProvider({ children, store: injected }: { children: ReactNode; store?: CatalogStore }) {
  const [store] = useState(
    () => injected ?? createCatalogStore({ fetchText: createFetchText(), cache: fileTextCache(), siteBase: siteBase(appExtra().siteUrl) }),
  )
  useEffect(() => {
    void store.start()
  }, [store])
  return <CatalogContext.Provider value={store}>{children}</CatalogContext.Provider>
}

export function useCatalog(): { state: CatalogState; store: CatalogStore } {
  const store = useContext(CatalogContext)
  if (!store) throw new Error('useCatalog needs a CatalogProvider')
  const state = useSyncExternalStore(store.subscribe, store.getState)
  return { state, store }
}
