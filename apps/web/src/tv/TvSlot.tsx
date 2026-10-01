import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { Channel } from '@go10/core/tv/types'
import { createLiveSession } from '@go10/core/tv/liveSession'
import { scheduleAt } from '@go10/core/tv/schedule'
import { clockLabel, programLabel } from '@go10/core/tv/describe'
import { playerRetryReducer, initialPlayerRetryState, backoffMs } from '@go10/core/player/playerRetry'
import { LOAD_TIMEOUT_MS } from '@go10/core/player/playbackSession'
import { okru } from '@go10/core/player/providers/okru'
import { imageSrc } from '@go10/core/lib/imageSrc'
import { tvDebug } from './debugLog'
import './tv.css'

export type SlotMode = 'staged' | 'full' | 'tile' | 'mini'

export interface Rect {
  top: number
  left: number
  width: number
  height: number
}

export interface SlotHandle {
  post(message: unknown): void
  isLoaded(): boolean
}

/** How many retries a preview gets before it settles for the thumbnail. */
const PREVIEW_RETRIES = 1

/**
 * Loaded, but the position hasn't moved for this long: something in the embed
 * waits for a real tap (Safari's autoplay block, or an ok.ru ad iOS won't
 * start), so the viewer must be able to reach it.
 */
export const STALL_MS = 4000

/**
 * One channel's embed, kept on the live schedule. It never moves in the DOM
 * (a moved iframe reloads); `mode` only changes where CSS puts it.
 */
export function TvSlot({
  channel,
  epochMs,
  mode,
  rect,
  preview = false,
  bind,
  onLoaded,
  onReady,
  onFailedChange,
  onStalledChange,
}: {
  channel: Channel
  epochMs: number
  mode: SlotMode
  rect?: Rect | null
  preview?: boolean
  bind?: (handle: SlotHandle | null) => void
  onLoaded?: () => void
  /** Fired once per load, on the embed's first message: its player is up and listening. */
  onReady?: () => void
  /** True while the slot has given up ("Señal interrumpida"), false once it retunes. */
  onFailedChange?: (failed: boolean) => void
  /** True while loaded but not moving (autoplay blocked, an ad waiting for a tap), false once it moves. */
  onStalledChange?: (stalled: boolean) => void
}) {
  const [state, dispatch] = useReducer(playerRetryReducer, initialPlayerRetryState)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const loaded = useRef(false)
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const onLoadedRef = useRef(onLoaded)
  onLoadedRef.current = onLoaded
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  const heard = useRef(false)
  const [stalled, setStalled] = useState(false)
  /** When the position last moved (or the frame loaded), and where it was. */
  const lastProgressAt = useRef(0)
  const lastTime = useRef<number | null>(null)
  const onStalledChangeRef = useRef(onStalledChange)
  onStalledChangeRef.current = onStalledChange

  const [session] = useState(() =>
    createLiveSession({
      plan: channel.plan,
      epochMs,
      send: (command) => {
        tvDebug(channel.id, 'send', command)
        frameRef.current?.contentWindow?.postMessage(command, okru.origin)
      },
      onFinishedEarly: rerender,
    }),
  )

  // Every load and every retry rejoins the live second.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const src = useMemo(() => {
    heard.current = false
    const next = session.tune()
    tvDebug(channel.id, 'tune', next)
    return next
  }, [state.reloadToken])

  // ?tvdebug=1 only. Playback reports arrive several times a second: one line every 2 s.
  const lastTimeLog = useRef(0)
  function logMessage(event: MessageEvent) {
    const isTime = /timeupdate/.test(JSON.stringify(event.data))
    if (isTime && Date.now() - lastTimeLog.current < 2000) return
    if (isTime) lastTimeLog.current = Date.now()
    tvDebug(channel.id, `recv ${event.origin}`, event.data)
  }
  useEffect(() => tvDebug(channel.id, 'status', `${state.status} attempt=${state.attempt}`), [channel.id, state.status, state.attempt])
  useEffect(() => tvDebug(channel.id, 'mode', mode), [channel.id, mode])

  // Not moving for STALL_MS, at any point after loading: the viewer has to tap
  // the embed. A program that ended early is waiting on purpose, not stalled.
  useEffect(() => {
    if (state.status !== 'ready') {
      setStalled(false)
      return
    }
    const timer = setInterval(() => {
      setStalled(!session.finishedEarly() && Date.now() - lastProgressAt.current >= STALL_MS)
    }, 1000)
    return () => clearInterval(timer)
  }, [state.status, state.reloadToken, session])

  useEffect(() => {
    tvDebug(channel.id, 'stalled', String(stalled))
    onStalledChangeRef.current?.(stalled)
  }, [channel.id, stalled])
  const airing = session.current()

  const gaveUp = state.status === 'failed' || (preview && state.attempt > PREVIEW_RETRIES)

  const onFailedChangeRef = useRef(onFailedChange)
  onFailedChangeRef.current = onFailedChange
  useEffect(() => {
    onFailedChangeRef.current?.(gaveUp)
  }, [gaveUp])

  useEffect(() => {
    if (!bind) return
    bind({
      post: (message) => {
        tvDebug(channel.id, 'post', message)
        frameRef.current?.contentWindow?.postMessage(message, okru.origin)
      },
      isLoaded: () => loaded.current,
    })
    return () => bind(null)
  }, [bind])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source === frameRef.current?.contentWindow) logMessage(event)
      if (event.origin !== okru.origin || event.source !== frameRef.current?.contentWindow) return
      if (!heard.current) {
        heard.current = true
        onReadyRef.current?.()
      }
      const row = session.current()?.unit.row
      const report = row ? okru.parse(event.data, row) : null
      if (report?.kind === 'time' && report.time !== lastTime.current) {
        lastTime.current = report.time
        lastProgressAt.current = Date.now()
        setStalled(false)
      }
      session.handle(event.data)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [session])

  // The on-demand Player's retry loop, unchanged: timeout → backoff → remount.
  useEffect(() => {
    if (gaveUp) return
    if (state.status === 'loading') {
      const timer = setTimeout(() => {
        if (!loaded.current) dispatch({ type: 'timeout' })
      }, LOAD_TIMEOUT_MS)
      return () => clearTimeout(timer)
    }
    if (state.status === 'retrying') {
      const timer = setTimeout(() => {
        loaded.current = false
        dispatch({ type: 'retryLoadStarted' })
      }, backoffMs(state.attempt))
      return () => clearTimeout(timer)
    }
  }, [state.status, state.attempt, state.reloadToken, gaveUp])

  // The program boundary. A dead slot retunes from scratch there, so the channel never stays down.
  const endsAt = airing?.endsAt ?? 0
  useEffect(() => {
    if (!endsAt) return
    const timer = setTimeout(() => {
      if (gaveUp || session.sync(endsAt) === 'load') {
        loaded.current = false
        dispatch({ type: 'reset' })
      } else {
        rerender()
      }
    }, Math.max(0, endsAt - Date.now()))
    return () => clearTimeout(timer)
  }, [endsAt, gaveUp, session])

  // Back from a hidden tab or a sleeping device: rejoin live.
  useEffect(() => {
    function onVisibility() {
      tvDebug(channel.id, 'visibility', document.visibilityState)
      if (document.visibilityState !== 'visible') return
      if (gaveUp || session.sync() === 'load') {
        loaded.current = false
        dispatch({ type: 'reset' })
      } else {
        rerender()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [gaveUp, session])

  const upNext = () => {
    const after = scheduleAt(channel.plan, epochMs, endsAt, 1).current
    return `${programLabel(after.unit)} a las ${clockLabel(after.startsAt)}`
  }

  const style = mode === 'tile' && rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height } : undefined

  return (
    <div className={`go-tvslot go-tvslot--${mode}`} data-channel={channel.id} style={style}>
      {gaveUp ? (
        preview ? (
          airing && <img className="go-tvslot_thumb" src={imageSrc(airing.unit.row.thumbnail)} alt="" />
        ) : (
          <div className="go-tvslot_card" role="status">
            <strong>Señal interrumpida</strong>
            <span>Volvemos con {upNext()}</span>
          </div>
        )
      ) : (
        <iframe
          key={state.reloadToken}
          ref={frameRef}
          className="go-tvslot_frame"
          src={src}
          title={airing ? programLabel(airing.unit) : channel.name}
          allow="autoplay; fullscreen; encrypted-media"
          allowFullScreen
          // Live TV: Space and the arrows must never reach the embed's own controls.
          tabIndex={-1}
          onLoad={() => {
            tvDebug(channel.id, 'iframe load')
            lastProgressAt.current = Date.now()
            lastTime.current = null
            loaded.current = true
            dispatch({ type: 'loaded' })
            onLoadedRef.current?.()
          }}
        />
      )}
      {!preview && !gaveUp && state.status === 'retrying' && (
        <div className="go-tvslot_reconnecting" role="status">
          Reconectando…
        </div>
      )}
      {!gaveUp && session.finishedEarly() && (
        <div className="go-tvslot_card" role="status">
          <span>A continuación: {upNext()}</span>
        </div>
      )}
    </div>
  )
}
