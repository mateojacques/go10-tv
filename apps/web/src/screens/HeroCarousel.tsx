import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { CatalogRow, Title } from '@go10/core/types'
import type { HeroSlide } from '@go10/core/hero/pickHero'
import { heroMeta } from '@go10/core/catalog/describeTitle'
import { imageSrc } from '@go10/core/lib/imageSrc'
import { listProgress } from '@go10/core/progress/progressStore'
import { playedFraction, titleProgress } from '@go10/core/progress/titleProgress'
import { remainingLabel, rowLabel } from '@go10/core/progress/describe'
import { Backdrop } from '../components/Backdrop'
import { ProgressBar } from '../components/ProgressBar'
import { useFocusable } from '../focus/useFocusable'
import { SLIDE_MS, useCarousel } from './useCarousel'

/** How far a finger must travel sideways before the carousel treats it as a swipe. */
const SWIPE_PX = 40

function HeroButton({ id, col, onEnter, onKey, variant, children }: {
  id: string
  col: number
  onEnter: () => void
  onKey?: (key: string) => boolean
  variant: 'primary' | 'secondary'
  children: ReactNode
}) {
  const { ref, focused, activate, tabIndex } = useFocusable(id, -1, col, onEnter, { onKey })
  return (
    <div
      ref={ref}
      tabIndex={tabIndex}
      role="button"
      className={`go-hero_cta go-hero_cta--${variant}${focused ? ' is-focused' : ''}`}
      data-focused={focused}
      onClick={activate}
    >
      {children}
    </div>
  )
}

/** A same-size stand-in for an inactive slide's button: holds the layout, joins no focus grid. */
function StaticButton({ variant, children }: { variant: 'primary' | 'secondary'; children: ReactNode }) {
  return <div className={`go-hero_cta go-hero_cta--${variant}`}>{children}</div>
}

function Stage({ slide, art, active, near, onArtError }: {
  slide: HeroSlide
  art: HeroSlide['art']
  active: boolean
  /**
   * Active or one step either side of it. Only these hold their full-screen
   * art: enough to crossfade either way, without every slide's image
   * decoded at once in a TV's small GPU memory.
   */
  near: boolean
  onArtError: () => void
}) {
  return (
    <div className={`go-hero_stage${active ? ' is-active' : ''}${art ? '' : ' is-blurred'}`} aria-hidden="true">
      {!near ? null : art ? (
        <div className="go-hero_frame">
          <img
            className="go-hero_key"
            src={imageSrc(art.large)}
            srcSet={`${imageSrc(art.small)} 960w, ${imageSrc(art.large)} 1920w`}
            sizes="100vw"
            alt=""
            fetchPriority={active ? 'high' : 'low'}
            onError={onArtError}
          />
        </div>
      ) : (
        <>
          <Backdrop thumbnail={slide.title.thumbnail} />
          {/* Narrow screens: the thumbnail itself fills the 16:9 art frame (CSS shows it ≤ 900px). */}
          <div className="go-hero_frame go-hero_frame--thumb">
            <img className="go-hero_key go-hero_key--thumb" src={imageSrc(slide.title.thumbnail)} alt="" />
          </div>
        </>
      )}
    </div>
  )
}

export function HeroCarousel({ slides, onPlay, onInfo }: {
  slides: HeroSlide[]
  onPlay: (title: Title, row: CatalogRow) => void
  onInfo: (title: Title) => void
}) {
  const [hovered, setHovered] = useState(false)
  const [failed, setFailed] = useState<ReadonlySet<number>>(new Set())
  const { index, go } = useCarousel(slides.length, hovered)
  const progress = useMemo(() => listProgress(), [])
  const many = slides.length > 1
  const artOf = (i: number) => (failed.has(i) ? null : slides[i].art)
  const activeArt = artOf(index)
  const isNear = (i: number) => {
    const distance = Math.abs(i - index)
    return Math.min(distance, slides.length - distance) <= 1
  }

  const prev = () => go(index - 1)
  const next = () => go(index + 1)

  // Touch screens: a horizontal swipe changes slide; vertical drags still scroll the page.
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0]
    swipeStart.current = event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY } : null
  }
  const onTouchEnd = (event: React.TouchEvent) => {
    const start = swipeStart.current
    swipeStart.current = null
    if (!many || !start) return
    const touch = event.changedTouches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return
    if (dx < 0) next()
    else prev()
  }

  return (
    <header
      className={`go-hero go-hero--carousel${activeArt ? ' has-art' : ''}`}
      aria-roledescription="carousel"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => (swipeStart.current = null)}
    >
      {slides.map((slide, i) => (
        <Stage
          key={slide.title.key}
          slide={slide}
          art={artOf(i)}
          active={i === index}
          near={isNear(i)}
          onArtError={() => setFailed((f) => new Set(f).add(i))}
        />
      ))}

      <div className="go-hero_slides">
        {slides.map((slide, i) => {
          const active = i === index
          const title = slide.title
          const tp = title.seasons[0] ? titleProgress(title, progress) : null
          const resuming = tp?.mode === 'resume' ? tp.progress : null
          const position = tp && tp.mode !== 'start' ? rowLabel(tp.row) : ''
          const playLabel = (
            <>
              <span className="go-hero_play" aria-hidden="true" />
              {resuming ? 'Reanudar' : 'Reproducir'}
              {position && <span className="go-hero_cta-note">{position}</span>}
            </>
          )
          const infoLabel = (
            <>
              <span className="go-hero_info" aria-hidden="true" />
              Más información
            </>
          )
          return (
            <div
              key={title.key}
              className={`go-hero_slide${active ? ' is-active' : ''}`}
              aria-roledescription="slide"
              aria-label={`${i + 1} de ${slides.length}`}
              aria-hidden={!active}
              inert={!active}
            >
              <div className="go-hero_body">
                <p className="go-hero_eyebrow">
                  <span className="go-hero_badge">Destacado</span>
                  {title.kind === 'show' ? 'Serie' : 'Película'}
                  {title.studio && ` · ${title.studio}`}
                </p>
                <h1 className="go-hero_title">{title.title}</h1>
                <p className="go-hero_meta">
                  {heroMeta(title).map((item, n) => (
                    <span key={n}>
                      {n > 0 && <span className="go-hero_sep" aria-hidden="true" />}
                      {item}
                    </span>
                  ))}
                </p>
                <div className="go-hero_genres">
                  {[title.genre, title.genre_secondary].filter(Boolean).map((genre) => (
                    <span key={genre} className="go-chip">{genre}</span>
                  ))}
                </div>
                <div className="go-hero_actions">
                  {tp &&
                    (active ? (
                      <HeroButton
                        id="hero:play"
                        col={0}
                        variant="primary"
                        onEnter={() => onPlay(title, tp.row)}
                        onKey={(key) => (many && key === 'ArrowLeft' ? (prev(), true) : false)}
                      >
                        {playLabel}
                      </HeroButton>
                    ) : (
                      <StaticButton variant="primary">{playLabel}</StaticButton>
                    ))}
                  {active ? (
                    <HeroButton
                      id="hero:select"
                      col={1}
                      variant="secondary"
                      onEnter={() => onInfo(title)}
                      // The last button: → changes slide. Without Reproducir it is also the first, so ← does too.
                      onKey={(key) => (many && (key === 'ArrowRight' || (!tp && key === 'ArrowLeft')) ? (key === 'ArrowRight' ? next() : prev(), true) : false)}
                    >
                      {infoLabel}
                    </HeroButton>
                  ) : (
                    <StaticButton variant="secondary">{infoLabel}</StaticButton>
                  )}
                </div>
                {resuming && (
                  <div className="go-hero_resume">
                    <ProgressBar fraction={playedFraction(resuming)} className="go-hero_progress" />
                    <span>{remainingLabel(resuming)}</span>
                  </div>
                )}
              </div>
              {/* No key art, wide screens: the thumbnail crisp at close to its native 368x210. */}
              {!artOf(i) && (
                <figure className="go-hero_art">
                  <img src={imageSrc(title.thumbnail)} alt="" />
                </figure>
              )}
            </div>
          )
        })}
      </div>

      {many && (
        <>
          <button type="button" tabIndex={-1} className="go-hero_arrow go-hero_arrow--prev" aria-label="Anterior" onClick={prev} />
          <button type="button" tabIndex={-1} className="go-hero_arrow go-hero_arrow--next" aria-label="Siguiente" onClick={next} />
          <div className="go-hero_dots">
            {slides.map((slide, i) => (
              <button
                key={slide.title.key}
                type="button"
                tabIndex={-1}
                className={`go-hero_dot${i === index ? ' is-active' : ''}${hovered ? ' is-paused' : ''}`}
                style={{ ['--go-slide-ms' as string]: `${SLIDE_MS}ms` }}
                aria-label={`Ir a la diapositiva ${i + 1}`}
                aria-current={i === index}
                onClick={() => go(i)}
              />
            ))}
          </div>
        </>
      )}
    </header>
  )
}
