import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { CatalogRow } from '../types'
import { playerRetryReducer, initialPlayerRetryState, backoffMs } from './playerRetry'
import { markResumeStart, readResumeFromTime, clearResume } from './resume'
import { buildEmbedSrc } from './embedSrc'
import './Player.css'

/** How long to wait for the embed before treating it as a load failure. */
const LOAD_TIMEOUT_MS = 8000

export function Player({
  row,
  onClose,
  onEnded,
}: {
  row: CatalogRow
  onClose: () => void
  /** Fired once, roughly when this row's playback should be finishing. */
  onEnded?: () => void
}) {
  const [state, dispatch] = useReducer(playerRetryReducer, initialPlayerRetryState)
  const loaded = useRef(false)
  // Tracks whether this video_id has ever loaded successfully, so the resume
  // clock starts once per viewing session and isn't reset by retries/reloads.
  const startedRef = useRef(false)
  const endedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loaded.current = false
    startedRef.current = false
    clearTimeout(endedTimer.current)
    dispatch({ type: 'reset' })
  }, [row.video_id])

  useEffect(() => {
    return () => clearResume(row.video_id)
  }, [row.video_id])

  useEffect(() => {
    return () => clearTimeout(endedTimer.current)
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
      if (onEnded && row.duration_seconds > 0) {
        const remainingMs = Math.max(0, row.duration_seconds - (fromTime ?? 0)) * 1000
        endedTimer.current = setTimeout(onEnded, remainingMs)
      }
    }
    dispatch({ type: 'loaded' })
  }, [row.video_id, row.duration_seconds, fromTime, onEnded])

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
