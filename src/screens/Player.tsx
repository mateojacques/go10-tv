import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { CatalogRow } from '../types'
import { playerRetryReducer, initialPlayerRetryState, backoffMs } from './playerRetry'
import { markResumeStart, readResumeFromTime, clearResume } from './resume'
import { buildEmbedSrc } from './embedSrc'
import './Player.css'

/** How long to wait for the embed before treating it as a load failure. */
const LOAD_TIMEOUT_MS = 8000

/** Origin ok.ru's /videoembed/ iframe posts playback events from. */
const OK_RU_ORIGIN = 'https://ok.ru'

export function Player({
  row,
  onClose,
  onEnded,
  onPrev,
  onNext,
}: {
  row: CatalogRow
  onClose: () => void
  /** Fired when the ok.ru embed reports its "ended" playback event. */
  onEnded?: () => void
  /** Shift+ArrowLeft / Shift+ArrowRight — jump to a sibling episode. */
  onPrev?: () => void
  onNext?: () => void
}) {
  const [state, dispatch] = useReducer(playerRetryReducer, initialPlayerRetryState)
  const loaded = useRef(false)
  // Tracks whether this video_id has ever loaded successfully, so the resume
  // clock starts once per viewing session and isn't reset by retries/reloads.
  const startedRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)

  // Kept in refs so the message/keydown listeners never need to re-subscribe
  // when these callbacks change identity across renders.
  const onEndedRef = useRef(onEnded)
  onEndedRef.current = onEnded
  const onPrevRef = useRef(onPrev)
  onPrevRef.current = onPrev
  const onNextRef = useRef(onNext)
  onNextRef.current = onNext

  useEffect(() => {
    loaded.current = false
    startedRef.current = false
    dispatch({ type: 'reset' })
  }, [row.video_id])

  useEffect(() => {
    return () => clearResume(row.video_id)
  }, [row.video_id])

  // ok.ru's /videoembed/ iframe posts playback events (`timeupdate`,
  // `ended`, ...) to the parent window — confirmed by inspecting real
  // traffic. This is the actual player state, unlike a wall-clock guess
  // from `duration_seconds`: immune to seeking, pausing, and buffering.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== OK_RU_ORIGIN) return
      if (event.source !== frameRef.current?.contentWindow) return
      if ((event.data as { event?: string } | null)?.event === 'ended') {
        onEndedRef.current?.()
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
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
  }, [state.status, state.attempt])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' || event.key === 'Backspace') {
        event.preventDefault()
        onClose()
      } else if (event.key === 'f' || event.key === 'F') {
        event.preventDefault()
        if (document.fullscreenElement) {
          document.exitFullscreen()
        } else {
          containerRef.current?.requestFullscreen().catch(() => {})
        }
      } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault()
        loaded.current = false
        dispatch({ type: 'manualReload' })
      } else if (event.shiftKey && event.key === 'ArrowLeft') {
        event.preventDefault()
        onPrevRef.current?.()
      } else if (event.shiftKey && event.key === 'ArrowRight') {
        event.preventDefault()
        onNextRef.current?.()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const fromTime = readResumeFromTime(row.video_id)

  const handleLoad = useCallback(() => {
    loaded.current = true
    if (!startedRef.current) {
      startedRef.current = true
      markResumeStart(row.video_id)
    }
    dispatch({ type: 'loaded' })
  }, [row.video_id])

  const heading = row.series_title || row.title
  const season = row.season_number
    ? row.season_label || `Temporada ${row.season_number}`
    : null

  const embedSrc = buildEmbedSrc(row.embed_url, fromTime)

  return (
    <div className="go-player" ref={containerRef}>
      <div className="go-player_bar">
        <button type="button" className="go-player_back" onClick={onClose} aria-label="Volver">
          <span className="go-back_chevron" aria-hidden="true" />
        </button>
        <span className="go-player_mark" aria-hidden="true" />
        <span className="go-player_title">{heading}</span>
        {season && <span className="go-player_season">{season}</span>}
        <span className="go-player_hint">
          Pulsa Atrás para salir · F para pantalla completa · R para recargar
          {(onPrev || onNext) && ' · Shift + ←/→ para episodio anterior/siguiente'}
        </span>
      </div>

      {state.status === 'retrying' && (
        <div className="go-player_reconnecting" role="status">
          Reconectando…
        </div>
      )}

      {state.status === 'failed' ? (
        <div className="go-player_fallback">
          <p className="go-player_fallback-msg">No se pudo reproducir aquí.</p>
          <a className="go-player_open" href={row.video_url} target="_blank" rel="noreferrer">
            Abrir en ok.ru
          </a>
        </div>
      ) : (
        <iframe
          key={state.reloadToken}
          ref={frameRef}
          className="go-player_frame"
          src={embedSrc}
          title={row.title}
          allow="autoplay; fullscreen; encrypted-media"
          allowFullScreen
          onLoad={handleLoad}
        />
      )}
    </div>
  )
}
