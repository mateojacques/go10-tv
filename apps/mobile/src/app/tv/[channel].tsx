import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { LoadingScreen } from '../../components/LoadingScreen'
import { appExtra, siteBase } from '../../config/appConfig'
import { useCatalog } from '../../data/CatalogProvider'
import { TvScreenView } from '../../tv/TvScreenView'
import { tvTarget } from '../../tv/tvTarget'
import { useLineup } from '../../tv/useLineup'

const siteUrl = siteBase(appExtra().siteUrl)

/** `/tv/<channel>`: an unknown channel picks one as `/tv` does; no channels at all goes Home. */
export default function TvChannelScreen() {
  const { channel } = useLocalSearchParams<{ channel: string }>()
  const { state } = useCatalog()
  const lineup = useLineup(state.status === 'ready' ? state.data : null)
  if (state.status === 'loading') return <LoadingScreen />
  const target = tvTarget(lineup, channel ?? null)
  if (target.kind === 'home') return <Redirect href="/" />
  if (target.kind === 'redirect') return <Redirect href={{ pathname: '/tv/[channel]', params: { channel: target.channelId } }} />
  return (
    <TvScreenView
      lineup={lineup!}
      channel={target.channel}
      siteUrl={siteUrl}
      imageBase={siteUrl}
      // Same screen, new channel: Back still leaves TV instead of replaying every zap.
      onZap={(id) => router.setParams({ channel: id })}
      onBack={() => router.back()}
    />
  )
}
