import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type { CatalogRow } from '../types'
import { playerRetryReducer, initialPlayerRetryState, backoffMs } from './playerRetry'
import { markWatched, readProgress, resumeFromTime, writeProgress } from '../progress/progressStore'
import { providerFor } from './providers'
import { rowKey } from '../catalog/rowKey'
import './Player.css'

/** How long to wait for the embed before treating it as a load failure. */
const LOAD_TIMEOUT_MS = 8000

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
  const provider = providerFor(row)
  // Kept in refs for the message listener, which never re-subscribes.
  const providerRef = useRef(provider)
  providerRef.current = provider
  const rowRef = useRef(row)
  rowRef.current = row
  // For providers that can't start mid-video from the URL: where to seek
  // once the embed first reports playback.
  const pendingSeekRef = useRef<number | null>(null)

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

  const prevRowRef = useRef(row)

  // Two rows sharing a `video_id` are chapters of the *same* file: jumping
  // between them should seek the already-loaded iframe, not remount it (the
  // effect above only reloads when `video_id` itself changes).
  useEffect(() => {
    const prev = prevRowRef.current
    prevRowRef.current = row
    if (prev.video_id !== row.video_id) return // a different file -- the effect above handles reloading it
    if (rowKey(prev) === rowKey(row)) return // same chapter -- nothing to do

    flushProgress() // save the outgoing chapter's position under its own key first
    videoIdRef.current = rowKey(row)
    positionRef.current = null
    frameRef.current?.contentWindow?.postMessage(
      providerRef.current.seekMessage(row.chapter_start_seconds ?? 0),
      providerRef.current.origin,
    )
  }, [row, flushProgress])

  // Save where playback got to when switching video or closing the player.
  useEffect(() => {
    return () => {
      flushProgress()
      positionRef.current = null
    }
  }, [row.video_id, flushProgress])

  // The embed posts its real playback state to this window (each provider
  // parses its own format). Unlike a wall-clock guess from
  // `duration_seconds`, it's immune to seeking, pausing, and buffering.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const current = providerRef.current
      if (event.origin !== current.origin) return
      if (event.source !== frameRef.current?.contentWindow) return
      const parsed = current.parse(event.data, rowRef.current)
      if (!parsed) return
      const videoId = videoIdRef.current

      if (parsed.kind === 'time') {
        const resumeAt = pendingSeekRef.current
        if (resumeAt !== null) {
          pendingSeekRef.current = null
          frameRef.current?.contentWindow?.postMessage(current.seekMessage(resumeAt), current.origin)
        }

        positionRef.current = { videoId, time: parsed.time, duration: parsed.duration }
        if (Date.now() - lastSaveRef.current >= PROGRESS_SAVE_INTERVAL_MS) flushProgress()

        const chapterEnd = chapterEndRef.current
        if (chapterEnd != null && parsed.time >= chapterEnd) {
          markWatched(videoId, chapterDurationRef.current)
          positionRef.current = null
          onEndedRef.current?.()
        }
      } else if (parsed.kind === 'paused') {
        flushProgress()
      } else {
        markWatched(videoId, positionRef.current?.duration || parsed.time || 0)
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

  // Reloads restart the embed from zero too, so re-arm on each one.
  useEffect(() => {
    pendingSeekRef.current = provider.resumesViaUrl ? null : fromTime
  }, [fromTime, state.reloadToken, provider])

  const handleLoad = useCallback(() => {
    loaded.current = true
    dispatch({ type: 'loaded' })
  }, [])

  const heading = row.series_title || row.title
  const season = row.season_number
    ? row.season_label || `Temporada ${row.season_number}`
    : null

  const embedSrc = provider.src(row, provider.resumesViaUrl ? fromTime : null)

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
            {provider.fallbackLabel}
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
          sandbox={provider.sandbox}
          onLoad={handleLoad}
        />
      )}
    </div>
  )
}
