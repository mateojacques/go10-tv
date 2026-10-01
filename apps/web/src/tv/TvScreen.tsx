import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { Channel } from '@go10/core/tv/types'
import { channelByNumber, stepChannel } from '@go10/core/tv/lineup'
import { clockLabel, programLabel, progressOf } from '@go10/core/tv/describe'
import { enterDigit, NUMBER_ENTRY_MS } from '@go10/core/tv/numberEntry'
import { useFocusState } from '../focus/FocusProvider'
import { useTv } from './TvProvider'
import { useLiveNow } from './useLiveNow'
import { ChannelTile } from './ChannelTile'
import { leanTv } from './leanTv'
import { tvKeyFromEvent, type TvKey } from './tvKey'
import './tv.css'

export const STRIP_IDLE_MS = 6000
export const ZAP_FLASH_MS = 400
/** TV hardware loads a channel only once the zapping has stopped this long: each ok.ru load is heavy there. */
export const ZAP_SETTLE_MS = 600
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
  const press = useRef<{ x: number; y: number } | null>(null)
  /** The channel this screen last showed, and the one actually watched before the current (PRE-CH). */
  const shown = useRef<string | null>(null)
  const watched = useRef<string | null>(null)
  const previous = useRef<string | null>(null)
  const stripRef = useRef<HTMLElement>(null)

  const { watch, hold, setScreen } = tv
  useEffect(() => {
    setScreen('tv')
    return () => setScreen('away')
  }, [setScreen])

  const tuneIn = useCallback(
    (id: string) => {
      if (watched.current && watched.current !== id) previous.current = watched.current
      watched.current = id
      watch(id)
    },
    [watch],
  )

  // Every arrival and every zap: tune in, open the strip, flash the number.
  useEffect(() => {
    focus(`tv:${channel.id}`)
    setStripOpen(true)
    bump()
    const from = shown.current
    shown.current = channel.id
    if (from === null || from === channel.id) {
      setFlash(null)
      tuneIn(channel.id)
      return
    }
    setFlash(channel.number)
    if (leanTv()) {
      // Black, with the number, until the zapping stops: then one load.
      hold()
      const timer = setTimeout(() => {
        tuneIn(channel.id)
        setFlash(null)
      }, ZAP_SETTLE_MS)
      return () => clearTimeout(timer)
    }
    tuneIn(channel.id)
    const timer = setTimeout(() => setFlash(null), ZAP_FLASH_MS)
    return () => clearTimeout(timer)
  }, [channel.id, channel.number, tuneIn, hold, focus])

  useEffect(() => {
    if (!stripOpen) return
    const timer = setTimeout(() => setStripOpen(false), STRIP_IDLE_MS)
    return () => clearTimeout(timer)
  }, [stripOpen, activity])

  const wake = useCallback(() => {
    setStripOpen(true)
    bump()
  }, [])

  // Every tap and key is a fresh user activation: the moment to ask the
  // embed for sound again, since it autoplays muted.
  const { nudgeSound, setSound, soundOn } = tv

  const zap = useCallback((step: 1 | -1) => onZap(stepChannel(lineup, channel.id, step).id), [lineup, channel.id, onZap])

  // The focus grid's arrows: Up/Down zap, Left/Right walk the strip.
  const onKey = useCallback(
    (key: string): boolean => {
      if (key === 'ArrowUp') {
        zap(-1)
        return true
      }
      if (key === 'ArrowDown') {
        zap(1)
        return true
      }
      return false
    },
    [zap],
  )

  const schedule = live.get(channel.id)
  const openInfo = () => {
    if (schedule) onOpenTitle(schedule.current.titleKey)
  }

  // A half-typed channel number ("1–") tunes on its own after a pause.
  const [entry, setEntry] = useState('')
  const entryRef = useRef('')
  const setPending = (pending: string) => {
    entryRef.current = pending
    setEntry(pending)
  }
  const tuneNumber = (number: number) => {
    const target = channelByNumber(lineup, number)
    if (target && target.id !== channel.id) onZap(target.id)
  }
  useEffect(() => {
    if (!entry) return
    const timer = setTimeout(() => {
      setPending('')
      tuneNumber(Number(entry))
    }, NUMBER_ENTRY_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry])

  // Every key but the focus grid's: kept in a ref, so the listener attaches once.
  const onTvKey = (key: TvKey) => {
    switch (key.type) {
      case 'zap':
        return zap(key.step)
      case 'digit': {
        const { pending, tune } = enterDigit(entryRef.current, key.digit, lineup.channels.map((c) => c.number))
        setPending(pending)
        if (tune !== null) tuneNumber(tune)
        return
      }
      case 'info':
        return openInfo()
      case 'previous':
        if (previous.current) onZap(previous.current)
        return
      case 'list':
        return focus(`tv:${channel.id}`)
      case 'sound':
        return setSound(!soundOn)
      case 'fullscreen':
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
        else document.documentElement.requestFullscreen?.().catch(() => {})
        return
    }
  }
  const onTvKeyRef = useRef(onTvKey)
  onTvKeyRef.current = onTvKey

  // Any key wakes the strip. The TV's own keys are taken here, ahead of the
  // focus grid; the arrows, OK and Back go on to it.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      wake()
      nudgeSound()
      const key = tvKeyFromEvent(event)
      if (!key) return
      event.preventDefault()
      event.stopImmediatePropagation()
      onTvKeyRef.current(key)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [wake, nudgeSound])

  // The embed takes DOM focus as it loads, and from then on the remote's keys
  // (Back included) go to ok.ru, not here: hand focus straight back to the
  // highlighted tile. Nothing is highlighted while a mouse or finger steers.
  useEffect(() => {
    function onWindowBlur() {
      setTimeout(() => stripRef.current?.querySelector<HTMLElement>('.go-chtile.is-focused')?.focus({ preventScroll: true }), 0)
    }
    window.addEventListener('blur', onWindowBlur)
    return () => window.removeEventListener('blur', onWindowBlur)
  }, [])

  // OK on the channel already playing: its program's page, or, on a TV whose
  // channel froze, the press the embed is waiting for.
  const onTile = (picked: Channel) => {
    if (picked.id !== channel.id) onZap(picked.id)
    else if (leanTv() && tv.mainStalled) tv.play()
    else openInfo()
  }

  // A dead signal keeps the channels in view: the way out is a zap.
  const open = stripOpen || tv.mainFailed
  const upNext = schedule?.next[0]

  return (
    <div className="go-tvscreen" role="region" aria-label="TV en vivo" onPointerMove={wake}>
      {/* Autoplay blocked (Safari): the tap has to land on the embed's own play button. */}
      <div
        className={`go-tv_shield${tv.mainStalled ? ' is-pass-through' : ''}`}
        onPointerDown={(event) => {
          press.current = { x: event.clientX, y: event.clientY }
          nudgeSound()
        }}
        onPointerUp={(event) => {
          const start = press.current
          press.current = null
          if (!start) return
          const dy = event.clientY - start.y
          if (Math.abs(dy) >= SWIPE_PX && Math.abs(dy) > Math.abs(event.clientX - start.x)) zap(dy < 0 ? 1 : -1)
          else if (open) setStripOpen(false)
          else wake()
        }}
      />

      {schedule && (
        <div className={`go-tv_now${open ? ' is-open' : ''}`}>
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
          {!leanTv() && (
            <button
              type="button"
              className="go-tv_sound"
              aria-label={soundOn ? 'Silenciar' : 'Activar sonido'}
              aria-pressed={!soundOn}
              onClick={() => setSound(!soundOn)}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
                {soundOn ? (
                  <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
                ) : (
                  <path d="M16 9l6 6M22 9l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                )}
              </svg>
            </button>
          )}
          <button type="button" className="go-tv_info" onClick={openInfo}>
            Ver ficha
          </button>
          <button type="button" className="go-tv_back" aria-label="Volver" onClick={onBack}>
            <span className="go-back_chevron" aria-hidden="true" />
          </button>
        </div>
      )}

      <nav ref={stripRef} className={`go-tv_strip${open ? ' is-open' : ''}`} aria-label="Canales" onPointerDown={wake}>
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
                onSelect={onTile}
                onKey={onKey}
              />
            ) : null
          })}
        </div>
      </nav>

      {tv.mainStalled && (
        <div className="go-tv_tap" role="status">
          {leanTv() ? 'Pulsá OK para ver' : 'Tocá para ver'}
        </div>
      )}

      {entry && (
        <div className="go-tv_entry" aria-live="polite">
          {entry}–
        </div>
      )}

      {flash !== null && (
        <div className={`go-tv_flash${tv.promoted ? '' : ' has-static'}`} aria-hidden="true">
          {flash}
        </div>
      )}
    </div>
  )
}
