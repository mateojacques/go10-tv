import { router } from 'expo-router'
import { rowKey } from '@go10/core/catalog/rowKey'
import type { Collection } from '@go10/core/collections/types'
import type { Section } from '@go10/core/catalog/selectTitles'
import type { CatalogRow, Title } from '@go10/core/types'

/** Every screen routes through here, so Back behaves the same wherever a title was opened. */
export function openTitle(title: Title): void {
  router.push({ pathname: '/title/[key]', params: { key: title.key } })
}

export function playTitle(title: Title, row: CatalogRow): void {
  router.push({ pathname: '/title/[key]/play/[videoId]', params: { key: title.key, videoId: rowKey(row) } })
}

export function openCollection(collection: Collection): void {
  router.push({ pathname: '/coleccion/[id]', params: { id: collection.id } })
}

/** From Home a section stacks; from the other section it swaps in place, so Back still lands on Home. */
export function openSection(section: 'movie' | 'show', replace: boolean): void {
  const href = section === 'movie' ? '/peliculas' : '/series'
  if (replace) router.replace(href)
  else router.push(href)
}

/** The search screen, scoped to the section it was opened from (`en`, as on the web's /buscar). */
export function openSearch(section: Section): void {
  if (section === 'all') router.push('/buscar')
  else router.push({ pathname: '/buscar', params: { en: section === 'movie' ? 'peliculas' : 'series' } })
}

/** Back to Home, dropping everything stacked above it. */
export function goHome(): void {
  if (router.canDismiss()) router.dismissAll()
}
