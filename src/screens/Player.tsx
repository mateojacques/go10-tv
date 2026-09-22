import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type { CatalogRow } from '../types'
import { playerRetryReducer, initialPlayerRetryState, backoffMs } from './playerRetry'
import { markWatched, readProgress, resumeFromTime, writeProgress } from '../progress/progressStore'
import { buildEmbedSrc } from './embedSrc'
import { rowKey } from '../catalog/rowKey'
import './Player.css'

/** How long to wait for the embed before treating it as a load failure. */
const LOAD_TIMEOUT_MS = 8000

/** Origin ok.ru's /videoembed/ iframe posts playback events from. */
const OK_RU_ORIGIN = 'https://ok.ru'

/** `timeupdate` fires several times a second; storage only needs a few. */
const PROGRESS_SAVE_INTERVAL_MS = 5000

interface Position {
  videoId: string
  time: number
  duration: number
}

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
  // The latest position ok.ru reported, saved to storage at most every
  // PROGRESS_SAVE_INTERVAL_MS — and always on pause, reload, and close.
  const positionRef = useRef<Position | null>(null)
  const lastSaveRef = useRef(0)
  const videoIdRef = useRef(rowKey(row))
  videoIdRef.current = rowKey(row)
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
  const chapterEndRef = useRef(row.chapter_end_seconds)
  chapterEndRef.current = row.chapter_end_seconds
  const chapterDurationRef = useRef(row.duration_seconds)
  chapterDurationRef.current = row.duration_seconds

  const flushProgress = useCallback(() => {
    const position = positionRef.current
    if (!position) return
    writeProgress(position.videoId, position)
    lastSaveRef.current = Date.now()
  }, [])

  useEffect(() => {
    loaded.current = false
    dispatch({ type: 'reset' })
  }, [row.video_id])

  // Save where playback got to when switching video or closing the player.
  useEffect(() => {
    return () => {
      flushProgress()
      positionRef.current = null
    }
  }, [row.video_id, flushProgress])

  // ok.ru's /videoembed/ iframe posts playback events (`timeupdate`,
  // `ended`, ...) to the parent window — confirmed by inspecting real
  // traffic. This is the actual player state, unlike a wall-clock guess
  // from `duration_seconds`: immune to seeking, pausing, and buffering.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== OK_RU_ORIGIN) return
      if (event.source !== frameRef.current?.contentWindow) return
      const data = event.data as { event?: string; time?: number; duration?: number } | null
      const videoId = videoIdRef.current

      if (data?.event === 'timeupdate' && typeof data.time === 'number') {
        positionRef.current = { videoId, time: data.time, duration: data.duration ?? 0 }
        if (Date.now() - lastSaveRef.current >= PROGRESS_SAVE_INTERVAL_MS) flushProgress()

        const chapterEnd = chapterEndRef.current
        if (chapterEnd != null && data.time >= chapterEnd) {
          markWatched(videoId, chapterDurationRef.current)
          positionRef.current = null
          onEndedRef.current?.()
        }
      } else if (data?.event === 'paused') {
        flushProgress()
      } else if (data?.event === 'ended') {
        markWatched(videoId, positionRef.current?.duration || data.time || 0)
        positionRef.current = null
        onEndedRef.current?.()
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [flushProgress])

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

  // Computed once per video and per reload — never per render. Progress is
  // saved during playback, and recomputing here would change the iframe
  // `src` and restart the video every few seconds.
  const fromTime = useMemo(() => {
    flushProgress() // a reload should resume from the very latest position
    const resumeAt = resumeFromTime(readProgress(rowKey(row)))
    if (resumeAt !== null) return resumeAt
    // A chapter's own beginning isn't the file's beginning. row.video_id is
    // still the only thing gating recomputation (see the comment above) --
    // this only takes effect the render a genuinely new video starts loading.
    return row.chapter_start_seconds && row.chapter_start_seconds > 0 ? row.chapter_start_seconds : null
  }, [row.video_id, state.reloadToken, flushProgress])

  const handleLoad = useCallback(() => {
    loaded.current = true
    dispatch({ type: 'loaded' })
  }, [])

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
