import { useTv } from './TvProvider'
import { useLiveNow } from './useLiveNow'
import { ChannelTile } from './ChannelTile'
import '../components/Row.css'
import './tv.css'

/** Home's "En vivo ahora": every channel and what it's airing, one tap from tuning in. */
export function LiveRow({ rowIndex, onWatch }: { rowIndex: number; onWatch: (channelId: string) => void }) {
  const { lineup } = useTv()
  const live = useLiveNow(lineup)
  if (!lineup) return null
  return (
    <section className="go-row go-row--live">
      <h2 className="go-row_label">
        <span className="go-live-dot" aria-hidden="true" />
        En vivo ahora
      </h2>
      <div className="go-row_track">
        {lineup.channels.map((channel, col) => {
          const schedule = live.get(channel.id)
          return schedule ? (
            <ChannelTile key={channel.id} channel={channel} schedule={schedule} row={rowIndex} col={col} scope="live" onSelect={(c) => onWatch(c.id)} />
          ) : null
        })}
      </div>
    </section>
  )
}
