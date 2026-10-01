import { Redirect } from 'expo-router'
import { LoadingScreen } from '../../components/LoadingScreen'
import { useCatalog } from '../../data/CatalogProvider'
import { tvTarget } from '../../tv/tvTarget'
import { useLineup } from '../../tv/useLineup'

/** `/tv`: the last channel watched, else the default. */
export default function TvIndex() {
  const { state } = useCatalog()
  const lineup = useLineup(state.status === 'ready' ? state.data : null)
  if (state.status === 'loading') return <LoadingScreen />
  const target = tvTarget(lineup, null)
  if (target.kind !== 'redirect') return <Redirect href="/" />
  return <Redirect href={{ pathname: '/tv/[channel]', params: { channel: target.channelId } }} />
}
