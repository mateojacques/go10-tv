import { useEffect, useRef, useState } from 'react'
import type { Channel, Schedule } from '@go10/core/tv/types'
import { programLabel, progressOf } from '@go10/core/tv/describe'
import { imageSrc } from '@go10/core/lib/imageSrc'
import { useFocusable } from '../focus/useFocusable'
import { useTv } from './TvProvider'

export const PREVIEW_DELAY_MS = 600

/** A channel and what it's airing right now. */
export function ChannelTile({
  channel,
  schedule,
  row,
  col,
  current = false,
  scope,
  onSelect,
  onKey,
}: {
  channel: Channel
  schedule: Schedule
  row: number
  col: number
  current?: boolean
  /** Prefix for the focus id, unique per screen ("tv", "live"). */
  scope: string
  onSelect: (channel: Channel) => void
  /** Extra remote keys while the tile is focused; return true when handled. */
  onKey?: (key: string) => boolean
}) {
  const tv = useTv()
  const { ref, focused, activate, tabIndex } = useFocusable(`${scope}:${channel.id}`, row, col, () => onSelect(channel), { onKey })
  const thumbRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const label = programLabel(schedule.current.unit)

  const [previewing, setPreviewing] = useState(false)
  const tvRef = useRef(tv)
  tvRef.current = tv

  /** Puts the preview over this tile's thumbnail, wherever it is on screen now. */
  const place = () => {
    const box = thumbRef.current?.getBoundingClientRect()
    if (box) tvRef.current.previewAt(channel.id, { top: box.top, left: box.left, width: box.width, height: box.height })
  }
  const startPreview = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      place()
      setPreviewing(true)
    }, PREVIEW_DELAY_MS)
  }
  const stopPreview = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setPreviewing(false)
    tv.endPreview()
  }

  // The preview is fixed-position: it follows the tile through scrolls (of the
  // page or the strip) and resizes.
  useEffect(() => {
    if (!previewing) return
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewing])

  // A remote resting on a tile previews it, like a mouse resting on it.
  useEffect(() => {
    if (!focused) return
    startPreview()
    return stopPreview
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  return (
    <div
      ref={ref}
      tabIndex={tabIndex}
      role="button"
      aria-label={`${channel.number} ${channel.name}: ${label}`}
      aria-current={current ? 'true' : undefined}
      className={`go-chtile${focused ? ' is-focused' : ''}${current ? ' is-current' : ''}`}
      data-focused={focused}
      onClick={activate}
      onPointerEnter={() => {
        tv.preload(channel.id)
        startPreview()
      }}
      onPointerLeave={stopPreview}
    >
      <div ref={thumbRef} className="go-chtile_thumb" style={{ backgroundColor: channel.collection.tile.color }}>
        <img className="go-chtile_img" src={imageSrc(schedule.current.unit.row.thumbnail)} alt="" loading="lazy" />
        <span className="go-chtile_badge">
          <img src={`/${channel.collection.logo}`} alt="" />
          <span>{channel.number}</span>
        </span>
      </div>
      <div className="go-chtile_progress">
        <i style={{ width: `${Math.round(progressOf(schedule) * 100)}%` }} />
      </div>
      <div className="go-chtile_label">{label}</div>
    </div>
  )
}
