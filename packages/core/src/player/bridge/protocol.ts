/**
 * Messages between the script injected into the embed frames (frameScript.ts)
 * and the app (spec: Android TV player controls → 2). Frames post
 * `{go10Bridge: 'caps' | 'result', …}` to the top window; the app sends
 * `{go10Bridge: 'set', …}` to every frame and only the addressed adapter in
 * the addressed frame acts.
 */

/** Origins whose frames get the bridge script (and whose bridge messages are trusted). */
export const BRIDGE_ORIGINS = ['https://ok.ru', 'https://player.vidlove.cc']

export const BRIDGE_SETTINGS = ['quality', 'subtitles', 'audio', 'speed', 'server'] as const
export type BridgeSetting = (typeof BRIDGE_SETTINGS)[number]

/** The generic adapter on the frame's <video>; provider adapters win over it. */
export const HTML5_SOURCE = 'html5'

export const SETTING_LABELS: Record<BridgeSetting, string> = {
  quality: 'Calidad', subtitles: 'Subtítulos', audio: 'Audio', speed: 'Velocidad', server: 'Servidor',
}

export interface BridgeOption { value: string; label: string }
export interface BridgeChoice { options: BridgeOption[]; current: string | null }
export type BridgeCaps = Partial<Record<BridgeSetting, BridgeChoice>>
export interface CapsReport { source: string; frame: string; caps: BridgeCaps }

export type BridgeMessage =
  | { kind: 'caps'; report: CapsReport }
  | { kind: 'result'; id: number; ok: boolean; error?: string }

export type MergedChoice = BridgeChoice & { source: string; frame: string }
export type MergedCaps = Partial<Record<BridgeSetting, MergedChoice>>

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A choice with at least two well-formed options; anything else is not a choice. */
function parseChoice(raw: unknown): BridgeChoice | null {
  if (!isRecord(raw) || !Array.isArray(raw.options)) return null
  const options = raw.options
    .filter((o): o is BridgeOption => isRecord(o) && typeof o.value === 'string' && typeof o.label === 'string')
    .map(({ value, label }) => ({ value, label }))
  if (options.length < 2) return null
  const current = typeof raw.current === 'string' && options.some((o) => o.value === raw.current) ? raw.current : null
  return { options, current }
}

export function parseBridgeMessage(data: unknown): BridgeMessage | null {
  if (!isRecord(data)) return null
  if (data.go10Bridge === 'caps' && typeof data.source === 'string' && typeof data.frame === 'string' && isRecord(data.caps)) {
    const caps: BridgeCaps = {}
    for (const setting of BRIDGE_SETTINGS) {
      const parsed = parseChoice(data.caps[setting])
      if (parsed) caps[setting] = parsed
    }
    return { kind: 'caps', report: { source: data.source, frame: data.frame, caps } }
  }
  if (data.go10Bridge === 'result' && typeof data.id === 'number' && typeof data.ok === 'boolean') {
    return typeof data.error === 'string'
      ? { kind: 'result', id: data.id, ok: data.ok, error: data.error }
      : { kind: 'result', id: data.id, ok: data.ok }
  }
  return null
}

/** One choice per setting: a provider adapter's first, else the html5 adapter's. */
export function mergeCaps(reports: Iterable<CapsReport>): MergedCaps {
  const ordered = [...reports].sort((a, b) => Number(a.source === HTML5_SOURCE) - Number(b.source === HTML5_SOURCE))
  const merged: MergedCaps = {}
  for (const { source, frame, caps } of ordered) {
    for (const setting of BRIDGE_SETTINGS) {
      const choice = caps[setting]
      if (choice && !merged[setting]) merged[setting] = { ...choice, source, frame }
    }
  }
  return merged
}

export function setCommand(id: number, choice: MergedChoice, setting: BridgeSetting, value: string) {
  return { go10Bridge: 'set', id, source: choice.source, frame: choice.frame, setting, value }
}
