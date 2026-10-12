import { describe, expect, it } from 'vitest'
import { mergeCaps, parseBridgeMessage, setCommand } from './protocol'

const choice = (current: string, ...values: string[]) => ({ options: values.map((v) => ({ value: v, label: v.toUpperCase() })), current })

describe('parseBridgeMessage', () => {
  it('reads a caps report and keeps only real choices', () => {
    const msg = parseBridgeMessage({
      go10Bridge: 'caps', source: 'okru', frame: 'a1',
      caps: { quality: choice('hd', 'sd', 'hd'), speed: choice('1', '1'), bogus: choice('x', 'x', 'y'), audio: { options: 'nope' } },
    })
    // a single option is not a choice; unknown settings and malformed ones are dropped
    expect(msg).toEqual({ kind: 'caps', report: { source: 'okru', frame: 'a1', caps: { quality: choice('hd', 'sd', 'hd') } } })
  })

  it('drops options without a string value/label and a current that is not an option', () => {
    const msg = parseBridgeMessage({
      go10Bridge: 'caps', source: 's', frame: 'f',
      caps: { subtitles: { options: [{ value: 'off', label: 'Desactivados' }, { value: 1, label: 'x' }, { value: 'es', label: 'Español' }], current: 'fr' } },
    })
    expect(msg).toEqual({
      kind: 'caps',
      report: { source: 's', frame: 'f', caps: { subtitles: { options: [{ value: 'off', label: 'Desactivados' }, { value: 'es', label: 'Español' }], current: null } } },
    })
  })

  it('reads results and ignores everything else', () => {
    expect(parseBridgeMessage({ go10Bridge: 'result', id: 3, ok: false, error: 'no menu' })).toEqual({ kind: 'result', id: 3, ok: false, error: 'no menu' })
    expect(parseBridgeMessage({ go10Bridge: 'result', id: '3', ok: true })).toBeNull()
    expect(parseBridgeMessage({ event: 'timeupdate' })).toBeNull()
    expect(parseBridgeMessage(null)).toBeNull()
    expect(parseBridgeMessage('{"go10Bridge":"caps"}')).toBeNull()
  })
})

describe('mergeCaps', () => {
  it('prefers a provider adapter over html5 for the same setting, and fills gaps from html5', () => {
    const merged = mergeCaps([
      { source: 'html5', frame: 'f1', caps: { speed: choice('1', '1', '2'), subtitles: choice('off', 'off', '0') } },
      { source: 'okru', frame: 'f2', caps: { quality: choice('hd', 'sd', 'hd'), subtitles: choice('off', 'off', 'es') } },
    ])
    expect(merged.quality).toMatchObject({ source: 'okru', frame: 'f2' })
    expect(merged.subtitles).toMatchObject({ source: 'okru', current: 'off' })
    expect(merged.speed).toMatchObject({ source: 'html5', frame: 'f1' })
  })
})

describe('setCommand', () => {
  it('addresses the frame and adapter that reported the choice', () => {
    const merged = mergeCaps([{ source: 'okru', frame: 'f2', caps: { quality: choice('hd', 'sd', 'hd') } }])
    expect(setCommand(7, merged.quality!, 'quality', 'sd')).toEqual({ go10Bridge: 'set', id: 7, source: 'okru', frame: 'f2', setting: 'quality', value: 'sd' })
  })
})
