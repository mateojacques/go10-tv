import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { Channel } from '@go10/core/tv/types'
import { channelByNumber, stepChannel } from '@go10/core/tv/lineup'
import { clockLabel, programLabel, progressOf } from '@go10/core/tv/describe'
import { useFocusState } from '../focus/FocusProvider'
import { useTv } from './TvProvider'
import { useLiveNow } from './useLiveNow'
import { ChannelTile } from './ChannelTile'
import './tv.css'

export const STRIP_IDLE_MS = 6000
export const ZAP_FLASH_MS = 400
/** A shield gesture moving less than this is a tap; more, vertically, is a zap. */
const SWIPE_PX = 60

/** `/tv/:channel`: the video (in the TV layer, beneath), the now-playing bar and the channel strip. */
export function TvScreen({
  channel,
  onZap,
  onOpenTitle,
  onBack,
}: {
  channel: Channel
  onZap: (channelId: string) => void
  onOpenTitle: (titleKey: string) => void
  onBack: () => void
}) {
  const tv = useTv()
  const lineup = tv.lineup!
  const live = useLiveNow(lineup)
  const { focus } = useFocusState()
  const [stripOpen, setStripOpen] = useState(true)
  const [activity, bump] = useReducer((n: number) => n + 1, 0)
  const [flash, setFlash] = useState<number | null>(null)
  const firstChannel = useRef(true)
  const press = useRef<{ x: number; y: number } | null>(null)

  const { watch, setScreen } = tv
  useEffect(() => {
    setScreen('tv')
    return () => setScreen('away')
  }, [setScreen])

  // Every arrival and every zap: tune in, open the strip, flash the number.
  useEffect(() => {
    watch(channel.id)
    focus(`tv:${channel.id}`)
    setStripOpen(true)
    bump()
    if (firstChannel.current) {
      firstChannel.current = false
      return
    }
    setFlash(channel.number)
    const timer = setTimeout(() => setFlash(null), ZAP_FLASH_MS)
    return () => clearTimeout(timer)
  }, [channel.id, channel.number, watch, focus])

  useEffect(() => {
    if (!stripOpen) return
    const timer = setTimeout(() => setStripOpen(false), STRIP_IDLE_MS)
    return () => clearTimeout(timer)
  }, [stripOpen, activity])

  const wake = useCallback(() => {
    setStripOpen(true)
    bump()
  }, [])

  // Any key wakes the strip; the focus grid still handles the key itself.
  useEffect(() => {
    window.addEventListener('keydown', wake, true)
    return () => window.removeEventListener('keydown', wake, true)
  }, [wake])

  const zap = useCallback((step: 1 | -1) => onZap(stepChannel(lineup, channel.id, step).id), [lineup, channel.id, onZap])

  const onKey = useCallback(
    (key: string): boolean => {
      if (key === 'ArrowUp' || key === 'PageUp') {
        zap(-1)
        return true
      }
      if (key === 'ArrowDown' || key === 'PageDown') {
        zap(1)
        return true
      }
      if (/^[1-9]$/.test(key)) {
        const target = channelByNumber(lineup, Number(key))
        if (target) onZap(target.id)
        return true
      }
      if (key === 'f' || key === 'F') {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
        else document.documentElement.requestFullscreen?.().catch(() => {})
        return true
      }
      return false
    },
    [zap, lineup, onZap],
  )

  const schedule = live.get(channel.id)
  const upNext = schedule?.next[0]

  return (
    <div className="go-tv" role="region" aria-label="TV en vivo" onPointerMove={wake}>
      <div
        className="go-tv_shield"
        onPointerDown={(event) => (press.current = { x: event.clientX, y: event.clientY })}
        onPointerUp={(event) => {
          const start = press.current
          press.current = null
          if (!start) return
          const dy = event.clientY - start.y
          if (Math.abs(dy) >= SWIPE_PX && Math.abs(dy) > Math.abs(event.clientX - start.x)) zap(dy < 0 ? 1 : -1)
          else if (stripOpen) setStripOpen(false)
          else wake()
        }}
      />

      {schedule && (
        <div className={`go-tv_now${stripOpen ? ' is-open' : ''}`}>
          <span className="go-tv_chip">
            <img src={`/${channel.collection.logo}`} alt="" />
            {channel.number}
          </span>
          <div className="go-tv_now-text">
            <strong className="go-tv_program">{programLabel(schedule.current.unit)}</strong>
            {upNext && (
              <span className="go-tv_next">
                A continuación: {programLabel(upNext.unit)} · {clockLabel(upNext.startsAt)}
              </span>
            )}
            <span className="go-tv_progress">
              <i style={{ width: `${Math.round(progressOf(schedule) * 100)}%` }} />
            </span>
          </div>
          <button type="button" className="go-tv_info" onClick={() => onOpenTitle(schedule.current.titleKey)}>
            Ver ficha
          </button>
          <button type="button" className="go-tv_back" aria-label="Volver" onClick={onBack}>
            <span className="go-back_chevron" aria-hidden="true" />
          </button>
        </div>
      )}

      <nav className={`go-tv_strip${stripOpen ? ' is-open' : ''}`} aria-label="Canales" onPointerDown={wake}>
        <div className="go-tv_track">
          {lineup.channels.map((c, col) => {
            const s = live.get(c.id)
            return s ? (
              <ChannelTile
                key={c.id}
                channel={c}
                schedule={s}
                row={0}
                col={col}
                current={c.id === channel.id}
                scope="tv"
                onSelect={(picked) => onZap(picked.id)}
                onKey={onKey}
              />
            ) : null
          })}
        </div>
      </nav>

      {flash !== null && (
        <div className={`go-tv_flash${tv.promoted ? '' : ' has-static'}`} aria-hidden="true">
          {flash}
        </div>
      )}
    </div>
  )
}
