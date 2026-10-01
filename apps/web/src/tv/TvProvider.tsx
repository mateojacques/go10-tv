import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import type { Lineup } from '@go10/core/tv/types'
import { pickChannel, writeLastChannel } from '@go10/core/tv/lineup'
import { okru } from '@go10/core/player/providers/okru'
import type { Rect, SlotHandle, SlotMode } from './TvSlot'
import { canPreview } from './canPreview'

export interface SlotState {
  id: number
  channelId: string
  role: 'main' | 'preview'
}

export interface TvApi {
  lineup: Lineup | null
  mainChannel: string | null
  /** True once the viewer has opened the TV screen since the layer was last closed. */
  activated: boolean
  /** True when the last watch() promoted a preview (the zap was instant). */
  promoted: boolean
  /** The channel on main has given up for now ("Señal interrumpida"). */
  mainFailed: boolean
  /** Whether the viewer wants sound. On by default: the embed starts muted, so it's asked for. */
  soundOn: boolean
  setSound(on: boolean): void
  /** A tap or key on the TV screen: a fresh user activation, so ask for sound again. */
  nudgeSound(): void
  preload(channelId?: string): void
  watch(channelId: string): void
  previewAt(channelId: string, rect: Rect): void
  endPreview(): void
  setScreen(screen: 'tv' | 'away'): void
  close(): void
  /** Internal to TvLayer: slots, modes and handle binding. */
  slots: SlotState[]
  modeOf(slot: SlotState): SlotMode
  previewRect: Rect | null
  bindHandle(slotId: number, handle: SlotHandle | null): void
  onSlotLoaded(slotId: number): void
  onSlotFailed(slotId: number, failed: boolean): void
}

/** A preload the viewer never followed up on is dropped after this long: it streams for nothing. */
export const STAGED_TTL_MS = 20_000

const TvContext = createContext<TvApi | null>(null)

export function useTv(): TvApi {
  const api = useContext(TvContext)
  if (!api) throw new Error('useTv() outside <TvProvider>')
  return api
}

/**
 * Owns the live TV slots for the whole app, above the routed screens, so a
 * channel survives navigation. Slots are only appended or removed, never
 * reordered: React moves reordered keyed nodes, and a moved iframe reloads.
 */
export function TvProvider({ lineup, children }: { lineup: Lineup | null; children: ReactNode }) {
  const [slots, setSlotsState] = useState<SlotState[]>([])
  // The source of truth for the actions below, read synchronously, so no
  // state updater has side effects (StrictMode runs updaters twice).
  const slotsRef = useRef<SlotState[]>([])
  const [screen, setScreenState] = useState<'tv' | 'away'>('away')
  const [activated, setActivated] = useState(false)
  const [promoted, setPromoted] = useState(false)
  const [previewRect, setPreviewRect] = useState<Rect | null>(null)
  const nextId = useRef(1)
  const handles = useRef(new Map<number, SlotHandle>())
  const [soundOn, setSoundOn] = useState(true)
  const soundRef = useRef(true)
  const [failedIds, setFailedIds] = useState<ReadonlySet<number>>(new Set())
  const [intent, renewIntent] = useReducer((n: number) => n + 1, 0)

  const commit = useCallback((next: SlotState[]) => {
    if (next === slotsRef.current) return
    slotsRef.current = next
    setSlotsState(next)
  }, [])
  const newSlot = useCallback((channelId: string, role: SlotState['role']): SlotState => ({ id: nextId.current++, channelId, role }), [])
  const without = useCallback((role: SlotState['role']) => slotsRef.current.filter((s) => s.role !== role), [])

  const main = slots.find((s) => s.role === 'main') ?? null
  const mainId = main?.id ?? null

  const preload = useCallback(
    (channelId?: string) => {
      if (!lineup) return
      renewIntent()
      if (slotsRef.current.some((s) => s.role === 'main')) return
      const channel = pickChannel(lineup, channelId ?? null)
      if (channel) commit([...slotsRef.current, newSlot(channel.id, 'main')])
    },
    [lineup, commit, newSlot],
  )

  const watch = useCallback(
    (channelId: string) => {
      writeLastChannel(channelId)
      setActivated(true)
      const current = slotsRef.current
      if (current.find((s) => s.role === 'main')?.channelId === channelId) {
        setPromoted(false)
        return
      }
      const preview = current.find((s) => s.role === 'preview' && s.channelId === channelId)
      setPromoted(Boolean(preview))
      commit(
        preview
          ? without('main').map((s) => (s === preview ? { ...s, role: 'main' as const } : s))
          : [...without('main'), newSlot(channelId, 'main')],
      )
    },
    [commit, newSlot, without],
  )

  const previewAt = useCallback(
    (channelId: string, rect: Rect) => {
      if (!canPreview()) return
      const current = slotsRef.current
      if (current.some((s) => s.role === 'main' && s.channelId === channelId)) return commit(without('preview'))
      setPreviewRect(rect)
      if (current.some((s) => s.role === 'preview' && s.channelId === channelId)) return
      commit([...without('preview'), newSlot(channelId, 'preview')])
    },
    [commit, newSlot, without],
  )

  const endPreview = useCallback(() => {
    if (slotsRef.current.some((s) => s.role === 'preview')) commit(without('preview'))
  }, [commit, without])

  const close = useCallback(() => {
    commit([])
    setActivated(false)
  }, [commit])

  const setScreen = useCallback(
    (next: 'tv' | 'away') => {
      setScreenState(next)
      if (next === 'away') endPreview()
    },
    [endPreview],
  )

  const modeOf = useCallback(
    (slot: SlotState): SlotMode => {
      if (slot.role === 'preview') return 'tile'
      if (screen === 'tv') return 'full'
      return activated ? 'mini' : 'staged'
    },
    [screen, activated],
  )

  // A staged channel nobody opened goes away; each fresh intent (hover, focus) keeps it.
  useEffect(() => {
    if (mainId === null || activated) return
    const timer = setTimeout(() => commit(without('main')), STAGED_TTL_MS)
    return () => clearTimeout(timer)
  }, [mainId, activated, intent, commit, without])

  // The click into TV is a user activation: tell a loaded main embed to play,
  // in case it was staged before any click and the browser held it back.
  const loadedMain = useCallback(() => {
    const handle = mainId === null ? undefined : handles.current.get(mainId)
    return handle?.isLoaded() ? handle : null
  }, [mainId])

  // ok.ru autoplays muted, and its own controls sit under the TV screen's
  // shield: sound is always asked for explicitly.
  const applySound = useCallback((handle: SlotHandle) => {
    if (soundRef.current) {
      handle.post(okru.unmuteMessage)
      handle.post(okru.volumeMessage?.(1))
    } else {
      handle.post(okru.muteMessage)
    }
  }, [])

  const playMain = useCallback(() => {
    const handle = loadedMain()
    if (!handle) return
    handle.post(okru.playMessage)
    applySound(handle)
  }, [loadedMain, applySound])

  const setSound = useCallback(
    (on: boolean) => {
      soundRef.current = on
      setSoundOn(on)
      const handle = loadedMain()
      if (handle) applySound(handle)
    },
    [loadedMain, applySound],
  )

  const nudgeSound = useCallback(() => {
    const handle = loadedMain()
    if (handle && soundRef.current) applySound(handle)
  }, [loadedMain, applySound])
  useEffect(() => {
    if (activated) playMain()
  }, [activated, playMain])

  const bindHandle = useCallback((slotId: number, handle: SlotHandle | null) => {
    if (handle) handles.current.set(slotId, handle)
    else handles.current.delete(slotId)
  }, [])

  const onSlotLoaded = useCallback(
    (slotId: number) => {
      // Previews are always silent; one gets its sound when promoted (main changes, see above).
      if (slotsRef.current.some((s) => s.id === slotId && s.role === 'preview')) {
        handles.current.get(slotId)?.post(okru.muteMessage)
        return
      }
      if (activated && slotId === mainId) playMain()
    },
    [activated, mainId, playMain],
  )

  const onSlotFailed = useCallback((slotId: number, failed: boolean) => {
    setFailedIds((current) => {
      if (current.has(slotId) === failed) return current
      const next = new Set(current)
      if (failed) next.add(slotId)
      else next.delete(slotId)
      return next
    })
  }, [])
  const mainFailed = mainId !== null && failedIds.has(mainId)

  const api = useMemo<TvApi>(
    () => ({
      lineup, mainChannel: main?.channelId ?? null, activated, promoted, mainFailed, soundOn, setSound, nudgeSound,
      preload, watch, previewAt, endPreview, setScreen, close,
      slots, modeOf, previewRect, bindHandle, onSlotLoaded, onSlotFailed,
    }),
    [lineup, main, activated, promoted, mainFailed, soundOn, setSound, nudgeSound, preload, watch, previewAt, endPreview, setScreen, close, slots, modeOf, previewRect, bindHandle, onSlotLoaded, onSlotFailed],
  )

  return <TvContext.Provider value={api}>{children}</TvContext.Provider>
}
