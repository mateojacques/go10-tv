import { useEffect, useRef, useState } from 'react'
import type { CatalogRow } from '../types'
import './Player.css'

/** How long to wait for the embed before offering the fallback. */
const LOAD_TIMEOUT_MS = 8000

export function Player({ row, onClose }: { row: CatalogRow; onClose: () => void }) {
  const [failed, setFailed] = useState(false)
  const loaded = useRef(false)

  useEffect(() => {
    loaded.current = false
    setFailed(false)
    const timer = setTimeout(() => {
      if (!loaded.current) setFailed(true)
    }, LOAD_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [row.video_id])

  const containerRef = useRef<HTMLDivElement>(null)

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
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const heading = row.series_title || row.title
  const season = row.season_number
    ? row.season_label || `Temporada ${row.season_number}`
    : null
  // Autoplay is opt-in per embed, and the tap/click/Enter that opened the
  // player already counts as the user gesture browsers require for it.
  const embedSrc = `${row.embed_url}${row.embed_url.includes('?') ? '&' : '?'}autoplay=1`

  return (
    <div className="go-player" ref={containerRef}>
      <div className="go-player_bar">
        <button type="button" className="go-player_back" onClick={onClose} aria-label="Volver">
          <span className="go-back_chevron" aria-hidden="true" />
        </button>
        <span className="go-player_mark" aria-hidden="true" />
        <span className="go-player_title">{heading}</span>
        {season && <span className="go-player_season">{season}</span>}
        <span className="go-player_hint">Pulsa Atrás para salir · F para pantalla completa</span>
      </div>

      {failed ? (
        <div className="go-player_fallback">
          <p className="go-player_fallback-msg">No se pudo reproducir aquí.</p>
          <a
            className="go-player_open"
            href={row.video_url}
            target="_blank"
            rel="noreferrer"
          >
            Abrir en ok.ru
          </a>
        </div>
      ) : (
        <iframe
          className="go-player_frame"
          src={embedSrc}
          title={row.title}
          allow="autoplay; fullscreen; encrypted-media"
          allowFullScreen
          onLoad={() => {
            loaded.current = true
          }}
        />
      )}
    </div>
  )
}
