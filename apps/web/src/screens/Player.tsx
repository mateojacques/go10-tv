import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { CatalogRow } from '@go10/core/types'
import { playerRetryReducer, initialPlayerRetryState, backoffMs } from '@go10/core/player/playerRetry'
import { createPlaybackSession, LOAD_TIMEOUT_MS } from '@go10/core/player/playbackSession'
import { backAction, playerKeyAction, type PlayerAction } from '@go10/core/player/playerKeys'
import { providerFor } from '@go10/core/player/providers/index'
import { rowLabel } from '@go10/core/progress/describe'
import { remoteKeyFromEvent } from '../player/remoteKey'
import './Player.css'

/** Seek presses this close together go to the embed as one seek. */
const SEEK_COALESCE_MS = 400

/** How long the on-screen feedback for a key stays up. */
const FEEDBACK_MS = 1200

/** What the last remote key did, shown on screen: the embed reacts late on a TV. */
type Feedback = { kind: 'seek'; delta: number; target: number } | { kind: 'play' | 'pause' }

/** 75 -> "1:15", 3725 -> "1:02:05". */
function clock(seconds: number): string {
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
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
  /** Fired when the embed reports the end of the row (the file's, or its chapter's). */
  onEnded?: () => void
  /** Jump to a sibling episode: the bar's buttons, or the remote's previous/next track keys. */
  onPrev?: () => void
  onNext?: () => void
}) {
  const [state, dispatch] = useReducer(playerRetryReducer, initialPlayerRetryState)
  // The bar overlays the video, folded away to a small handle until wanted.
  const [barOpen, setBarOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const loaded = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const playRef = useRef<HTMLButtonElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const provider = providerFor(row)
  const canTogglePlay = Boolean(provider.playMessage && provider.pauseMessage)

  // Kept in refs so the window listeners never need to re-subscribe when
  // these change across renders.
  const providerRef = useRef(provider)
  providerRef.current = provider
  const onEndedRef = useRef(onEnded)
  onEndedRef.current = onEnded
  const onPrevRef = useRef(onPrev)
  onPrevRef.current = onPrev
  const onNextRef = useRef(onNext)
  onNextRef.current = onNext
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const barOpenRef = useRef(barOpen)
  barOpenRef.current = barOpen
  const playingRef = useRef(playing)
  playingRef.current = playing

  // One session for the player's life; it follows the row as episodes
  // change. The embed's own reports drive progress (saved at most every few
  // seconds, and always on pause, reload and close), never a clock.
  const [session] = useState(() =>
    createPlaybackSession({
      send: (command) => frameRef.current?.contentWindow?.postMessage(command, providerRef.current.origin),
      onEnded: () => onEndedRef.current?.(),
      onPlayingChange: setPlaying,
      seekCoalesceMs: SEEK_COALESCE_MS,
    }),
  )

  // A new file starts over: fresh retry state and a reload (the reset bumps reloadToken).
  const videoRef = useRef(row.video_id)
  useEffect(() => {
    if (videoRef.current === row.video_id) return
    videoRef.current = row.video_id
    loaded.current = false
    dispatch({ type: 'reset' })
  }, [row.video_id])

  // Computed once per load (a new file or a reload), never per render: a new
  // src would restart the video. load() also saves the outgoing position, so
  // a reload resumes from the very latest one.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const embedSrc = useMemo(() => session.load(row), [state.reloadToken])

  // Two rows sharing a `video_id` are chapters of the same file: moving
  // between them seeks the loaded embed instead of reloading it.
  useEffect(() => {
    session.select(row)
  }, [row, session])

  useEffect(() => () => session.flush(), [session])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== providerRef.current.origin) return
      if (event.source !== frameRef.current?.contentWindow) return
      session.handle(event.data)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [session])

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
  }, [state.status, state.attempt, state.reloadToken])

  useEffect(() => {
    if (!feedback) return
    const timer = setTimeout(() => setFeedback(null), FEEDBACK_MS)
    return () => clearTimeout(timer)
  }, [feedback])

  // The remote (spec: docs/superpowers/specs/2026-09-29-tizen-remote-player-
  // and-performance-design.md, 1A): the same key map as the Android app.
  useEffect(() => {
    function run(action: PlayerAction) {
      switch (action.type) {
        case 'seekBy': {
          const target = session.seekBy(action.delta)
          if (target === null) return
          // Quick presses add up on screen, as they do in the one seek sent.
          setFeedback((current) => ({
            kind: 'seek',
            delta: (current?.kind === 'seek' ? current.delta : 0) + action.delta,
            target,
          }))
          return
        }
        case 'togglePlay':
        case 'play':
        case 'pause': {
          if (!session.canTogglePlay()) return
          const play = action.type === 'togglePlay' ? !playingRef.current : action.type === 'play'
          playingRef.current = play // before the re-render: a second quick press toggles back
          session.setPlaying(play)
          setFeedback({ kind: play ? 'play' : 'pause' })
          return
        }
        case 'openBar':
          setBarOpen(true)
          return
        case 'next':
          onNextRef.current?.()
          return
        case 'previous':
          onPrevRef.current?.()
      }
    }

    // Left/Right step through the open bar's buttons; the page has no
    // spatial navigation of its own here, and Chromium's may be off.
    function stepInBar(step: -1 | 1) {
      const buttons = Array.from(barRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      const next = buttons[Math.min(buttons.length - 1, Math.max(0, index + step))]
      next?.focus({ preventScroll: true })
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' || event.key === 'Backspace') {
        event.preventDefault()
        if (backAction(barOpenRef.current) === 'closeBar') setBarOpen(false)
        else onCloseRef.current()
        return
      }
      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault()
        if (document.fullscreenElement) {
          document.exitFullscreen()
        } else {
          containerRef.current?.requestFullscreen().catch(() => {})
        }
        return
      }
      if (event.key === 'r' || event.key === 'R') {
        event.preventDefault()
        loaded.current = false
        dispatch({ type: 'manualReload' })
        return
      }

      const key = remoteKeyFromEvent(event)
      if (!key) return
      if (barOpenRef.current && (key === 'left' || key === 'right')) {
        event.preventDefault()
        stepInBar(key === 'left' ? -1 : 1)
        return
      }
      const action = playerKeyAction(key, barOpenRef.current)
      if (!action) return
      // Also keeps OK on the handle from clicking it closed again.
      event.preventDefault()
      run(action)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [session])

  // The player has no custom spatial-nav grid of its own (unlike every other
  // screen -- see useFocusable.ts): its buttons are plain, natively
  // focusable <button>s. The ok.ru/vidlove iframe can take DOM focus the
  // moment it loads, and once it does, the remote's keys (Back included) go
  // to the iframe's own document and never reach this page at all. Nothing
  // here needs the iframe focused (playback is driven entirely by
  // postMessage), so a real button is kept focused instead -- the handle
  // while the bar is folded away, play/pause (else the close button) once
  // it's open -- and reclaimed the moment the iframe takes it (which
  // surfaces here as this window blurring).
  useEffect(() => {
    const target = barOpen ? (playRef.current ?? closeRef.current) : handleRef.current
    target?.focus({ preventScroll: true })
    function onWindowBlur() {
      setTimeout(() => target?.focus({ preventScroll: true }), 0)
    }
    window.addEventListener('blur', onWindowBlur)
    return () => window.removeEventListener('blur', onWindowBlur)
  }, [barOpen])

  const handleLoad = useCallback(() => {
    loaded.current = true
    dispatch({ type: 'loaded' })
  }, [])

  const heading = row.series_title || row.title
  const position = rowLabel(row)

  return (
    <div className="go-player" ref={containerRef}>
      <button
        ref={handleRef}
        type="button"
        className="go-player_handle"
        aria-expanded={barOpen}
        aria-controls="go-player-bar"
        aria-label={barOpen ? 'Ocultar controles' : 'Mostrar controles'}
        onClick={() => setBarOpen((open) => !open)}
      >
        <span className="go-player_handle-chevron" aria-hidden="true" />
      </button>

      <div
        ref={barRef}
        id="go-player-bar"
        className={`go-player_bar${barOpen ? ' is-open' : ''}`}
        inert={!barOpen}
      >
        <button ref={closeRef} type="button" className="go-player_btn" onClick={onClose} aria-label="Volver">
          <span className="go-back_chevron" aria-hidden="true" />
        </button>
        <div className="go-player_heading">
          <span className="go-player_title">{heading}</span>
          {position && <span className="go-player_season">{position}</span>}
        </div>
        {(onPrev || onNext || canTogglePlay) && (
          <div className="go-player_controls">
            {(onPrev || onNext) && (
              <button
                type="button"
                className="go-player_btn"
                onClick={onPrev}
                disabled={!onPrev}
                aria-label="Episodio anterior"
              >
                <span className="go-player_step go-player_step--prev" aria-hidden="true" />
              </button>
            )}
            {/* vidlove has no play/pause command: no button (as on Android). */}
            {canTogglePlay && (
              <button
                ref={playRef}
                type="button"
                className="go-player_btn"
                onClick={() => {
                  const play = !playingRef.current
                  playingRef.current = play
                  session.setPlaying(play)
                }}
                aria-label={playing ? 'Pausar' : 'Reproducir'}
              >
                <span className={`go-player_glyph go-player_glyph--${playing ? 'pause' : 'play'}`} aria-hidden="true" />
              </button>
            )}
            {(onPrev || onNext) && (
              <button
                type="button"
                className="go-player_btn"
                onClick={onNext}
                disabled={!onNext}
                aria-label="Episodio siguiente"
              >
                <span className="go-player_step" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>

      {feedback && (
        <div className="go-player_feedback" role="status">
          {feedback.kind === 'seek' ? (
            <>
              <span className="go-player_feedback-delta">
                {feedback.delta < 0 ? '−' : '+'}
                {Math.abs(feedback.delta)} s
              </span>
              <span className="go-player_feedback-time">{clock(feedback.target)}</span>
            </>
          ) : (
            <span className={`go-player_glyph go-player_glyph--${feedback.kind}`} aria-label={feedback.kind === 'play' ? 'Reproduciendo' : 'En pausa'} />
          )}
        </div>
      )}

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
          onLoad={handleLoad}
        />
      )}
    </div>
  )
}
