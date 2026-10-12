import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { frameScript } from '@go10/core/player/bridge/frameScript'
import {
  BRIDGE_ORIGINS, mergeCaps, parseBridgeMessage, setCommand, type BridgeSetting, type CapsReport, type MergedCaps,
} from '@go10/core/player/bridge/protocol'
import { installBridge, type InstallResult } from './embedBridge'
import { bridgeScript } from './hostPage'

export type BridgeStatus = 'off' | 'pending' | 'timeout' | InstallResult
export interface BridgeLogEntry { at: number; text: string }

export interface EmbedBridge {
  /** The host page may load (the script is in place, or we gave up waiting). */
  ready: boolean
  status: BridgeStatus
  caps: MergedCaps
  log: BridgeLogEntry[]
  /** A `{kind:'bridge'}` host message's data. */
  handle(data: unknown): void
  /** Resolves true when the embed confirms, false on failure or after SET_TIMEOUT_MS. */
  set(setting: BridgeSetting, value: string): Promise<boolean>
}

export const INSTALL_TIMEOUT_MS = 2000
export const SET_TIMEOUT_MS = 3000
const LOG_SIZE = 20

/**
 * The embed bridge for one player (spec: Android TV player controls → 2):
 * installs the frame script before each WebView loads its page, keeps the
 * merged settings the frames report, and sends choices back.
 */
export function useEmbedBridge({ enabled, webRef, viewTag, reloadToken }: {
  enabled: boolean
  webRef: RefObject<{ injectJavaScript(script: string): void } | null>
  viewTag: () => number | null
  /** Changes on every WebView (re)mount: a new WebView needs the script again. */
  reloadToken: number
}): EmbedBridge {
  const [status, setStatus] = useState<BridgeStatus>(enabled ? 'pending' : 'off')
  const [reports, setReports] = useState<Map<string, CapsReport>>(() => new Map())
  const [log, setLog] = useState<BridgeLogEntry[]>([])
  const pending = useRef(new Map<number, (ok: boolean) => void>())
  const nextId = useRef(1)
  const viewTagRef = useRef(viewTag)
  viewTagRef.current = viewTag
  const script = useMemo(() => frameScript(), [])

  const note = useCallback((text: string) => {
    setLog((entries) => [...entries, { at: Date.now(), text }].slice(-LOG_SIZE))
  }, [])

  useEffect(() => {
    if (!enabled) return
    let live = true
    setStatus('pending')
    setReports(new Map())
    const timer = setTimeout(() => {
      if (!live) return
      live = false
      setStatus('timeout')
      note('instalación: timeout')
    }, INSTALL_TIMEOUT_MS)
    void installBridge(viewTagRef.current(), script, BRIDGE_ORIGINS).then((result) => {
      if (!live) return
      live = false
      clearTimeout(timer)
      setStatus(result)
      note(`instalación: ${result}`)
    })
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [enabled, reloadToken, script, note])

  const caps = useMemo(() => mergeCaps(reports.values()), [reports])

  const handle = useCallback((data: unknown) => {
    const message = parseBridgeMessage(data)
    if (!message) return
    if (message.kind === 'caps') {
      const { report } = message
      const key = `${report.source}@${report.frame}`
      setReports((current) => {
        // Re-inserted, so the latest report sits last (mergeCaps prefers it).
        const next = new Map(current)
        next.delete(key)
        return next.set(key, report)
      })
      note(`caps ${report.source}: ${Object.keys(report.caps).join(', ') || '—'}`)
    } else if (message.kind === 'bye') {
      setReports((current) => new Map([...current].filter(([, r]) => r.frame !== message.frame)))
      note(`frame ${message.frame} cerrado`)
    } else {
      pending.current.get(message.id)?.(message.ok)
      pending.current.delete(message.id)
      note(`resultado #${message.id}: ${message.ok ? 'ok' : `falló${message.error ? ` (${message.error})` : ''}`}`)
    }
  }, [note])

  const set = useCallback((setting: BridgeSetting, value: string) => {
    const choice = caps[setting]
    if (!choice) return Promise.resolve(false)
    const id = nextId.current++
    webRef.current?.injectJavaScript(bridgeScript(setCommand(id, choice, setting, value)))
    note(`set #${id} ${setting}=${value}`)
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        pending.current.delete(id)
        resolve(false)
      }, SET_TIMEOUT_MS)
      pending.current.set(id, (ok) => {
        clearTimeout(timer)
        resolve(ok)
      })
    })
  }, [caps, webRef, note])

  return { ready: !enabled || status !== 'pending', status: enabled ? status : 'off', caps, log, handle, set }
}
