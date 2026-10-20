import { useEffect, useMemo, useReducer } from 'react'
import { scheduleAt } from '@go10/core/tv/schedule'
import type { Lineup, Schedule } from '@go10/core/tv/types'

export const LIVE_REFRESH_MS = 5000

/**
 * What every collection channel is airing now, refreshed every few seconds and at
 * the next program boundary (apps/web/src/tv/useLiveNow.ts). YouTube lives have no schedule, so no entry.
 */
export function useLiveNow(lineup: Lineup | null): Map<string, Schedule> {
  const [tick, bump] = useReducer((n: number) => n + 1, 0)
  const now = useMemo(() => {
    const at = Date.now()
    return new Map(
      (lineup?.channels ?? []).flatMap((channel) =>
        channel.kind === 'schedule' ? [[channel.id, scheduleAt(channel.plan, lineup!.epochMs, at, 1)] as const] : [],
      ),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineup, tick])

  useEffect(() => {
    if (now.size === 0) return
    let boundary = Infinity
    for (const schedule of now.values()) boundary = Math.min(boundary, schedule.current.endsAt)
    const timer = setTimeout(bump, Math.max(0, Math.min(LIVE_REFRESH_MS, boundary - Date.now())))
    return () => clearTimeout(timer)
  }, [now])

  return now
}
