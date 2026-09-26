import { Redirect } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CatalogView } from '../components/CatalogView'
import { LoadingScreen } from '../components/LoadingScreen'
import { NAV_HEIGHT, Navbar } from '../components/Navbar'
import { appExtra, siteBase } from '../config/appConfig'
import { useCatalog } from '../data/CatalogProvider'
import { theme } from '../theme'
import { goHome, openSearch, openSection, openTitle } from './navigate'

const imageBase = siteBase(appExtra().siteUrl)

/** Películas or Series: the section's whole grid under the navbar. */
export function SectionScreen({ section }: { section: 'movie' | 'show' }) {
  const { state } = useCatalog()
  const insets = useSafeAreaInsets()
  if (state.status === 'loading') return <LoadingScreen />
  if (state.status !== 'ready') return <Redirect href="/" />
  return (
    <View style={styles.root}>
      <CatalogView titles={state.data.titles} section={section} query="" imageBase={imageBase} onSelect={openTitle} top={NAV_HEIGHT + insets.top} preferFirst />
      <Navbar section={section} onHome={goHome} onSection={(target) => openSection(target, true)} onSearch={() => openSearch(section)} />
    </View>
  )
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: theme.color.bg } })
