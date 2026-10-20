import { createMMKV } from 'react-native-mmkv'
import { setExternalConfigSource } from '@go10/core/external/config'
import { setKeyValueStore } from '@go10/core/ports/keyValueStore'
import { configureYoutube } from '@go10/core/player/providers/youtube'
import { appExtra } from '../config/appConfig'
import { mmkvStore } from './mmkvStore'

/**
 * Imported first by the root layout, as a side effect, so core's storage and
 * config are wired before any screen module evaluates. Until this runs, core
 * would silently keep progress in memory.
 */
setKeyValueStore(mmkvStore(createMMKV({ id: 'go10' })))
setExternalConfigSource(() => {
  const { externalTitles, tmdbToken } = appExtra()
  return { externalTitles, tmdbToken }
})
// The host page runs on the site's origin (its baseUrl), so YouTube addresses its messages there; no relay needed.
configureYoutube({ pageOrigin: new URL(appExtra().siteUrl).origin, relayUrl: null })
