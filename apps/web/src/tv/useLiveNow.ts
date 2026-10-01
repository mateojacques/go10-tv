import { useEffect, useMemo, useReducer } from 'react'
import type { Lineup, Schedule } from '@go10/core/tv/types'
import { scheduleAt } from '@go10/core/tv/schedule'

export const LIVE_REFRESH_MS = 5000

/** What every channel is airing now, refreshed every few seconds and at the next program boundary. */
export function useLiveNow(lineup: Lineup | null): Map<string, Schedule> {
  const [tick, bump] = useReducer((n: number) => n + 1, 0)
  const now = useMemo(() => {
    const at = Date.now()
    return new Map((lineup?.channels ?? []).map((channel) => [channel.id, scheduleAt(channel.plan, lineup!.epochMs, at, 1)]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineup, tick])

  useEffect(() => {
    if (now.size === 0) return
    let boundary = Infinity
    for (const schedule of now.values()) boundary = Math.min(boundary, schedule.current.endsAt)
    const wait = Math.max(0, Math.min(LIVE_REFRESH_MS, boundary - Date.now()))
    const timer = setTimeout(bump, wait)
    return () => clearTimeout(timer)
  }, [now])

  return now
}
