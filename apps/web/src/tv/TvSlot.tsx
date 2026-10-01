import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { Channel } from '@go10/core/tv/types'
import { createLiveSession } from '@go10/core/tv/liveSession'
import { scheduleAt } from '@go10/core/tv/schedule'
import { clockLabel, programLabel } from '@go10/core/tv/describe'
import { playerRetryReducer, initialPlayerRetryState, backoffMs } from '@go10/core/player/playerRetry'
import { LOAD_TIMEOUT_MS } from '@go10/core/player/playbackSession'
import { okru } from '@go10/core/player/providers/okru'
import { imageSrc } from '@go10/core/lib/imageSrc'
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
}: {
  channel: Channel
  epochMs: number
  mode: SlotMode
  rect?: Rect | null
  preview?: boolean
  bind?: (handle: SlotHandle | null) => void
  onLoaded?: () => void
}) {
  const [state, dispatch] = useReducer(playerRetryReducer, initialPlayerRetryState)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const loaded = useRef(false)
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const onLoadedRef = useRef(onLoaded)
  onLoadedRef.current = onLoaded

  const [session] = useState(() =>
    createLiveSession({
      plan: channel.plan,
      epochMs,
      send: (command) => frameRef.current?.contentWindow?.postMessage(command, okru.origin),
      onFinishedEarly: rerender,
    }),
  )

  // Every load and every retry rejoins the live second.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const src = useMemo(() => session.tune(), [state.reloadToken])
  const airing = session.current()

  const gaveUp = state.status === 'failed' || (preview && state.attempt > PREVIEW_RETRIES)

  useEffect(() => {
    if (!bind) return
    bind({
      post: (message) => frameRef.current?.contentWindow?.postMessage(message, okru.origin),
      isLoaded: () => loaded.current,
    })
    return () => bind(null)
  }, [bind])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== okru.origin || event.source !== frameRef.current?.contentWindow) return
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
          onLoad={() => {
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
