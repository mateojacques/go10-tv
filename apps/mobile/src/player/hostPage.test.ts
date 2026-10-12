import { bridgeScript, commandScript, hostHtml, parseHostMessage } from './hostPage'

describe('hostHtml', () => {
  it('embeds the src attribute-escaped and relays only the embed origin', () => {
    const html = hostHtml('https://ok.ru/videoembed/1?autoplay=1&fromTime=117', 'https://ok.ru')
    expect(html).toContain('src="https://ok.ru/videoembed/1?autoplay=1&amp;fromTime=117"')
    expect(html).toContain('var ORIGIN = "https://ok.ru";')
    expect(html).toContain('e.origin === ORIGIN && e.source === f.contentWindow')
    expect(html).not.toContain('sandbox=')
  })

})

describe('commandScript', () => {
  it('posts the command through the host page', () => {
    expect(commandScript({ action: 'seek', time: 10 })).toBe('window.go10Command({"action":"seek","time":10}); true;')
  })
})

describe('parseHostMessage', () => {
  it('reads embed messages and the iframe load', () => {
    expect(parseHostMessage('{"kind":"embed","data":{"event":"paused"}}')).toEqual({ kind: 'embed', data: { event: 'paused' } })
    expect(parseHostMessage('{"kind":"loaded"}')).toEqual({ kind: 'loaded' })
  })

  it('ignores anything else', () => {
    expect(parseHostMessage('not json')).toBeNull()
    expect(parseHostMessage('{"kind":"other"}')).toBeNull()
    expect(parseHostMessage('null')).toBeNull()
  })
})

describe('hostHtml crop', () => {
  it('crops the embed chrome when asked', () => {
    const html = hostHtml('https://ok.ru/videoembed/1', 'https://ok.ru', { cropPx: 64 })
    expect(html).toContain('top:-64px')
    expect(html).toContain('height:calc(100% + 128px)')
  })

  it('does not crop by default', () => {
    expect(hostHtml('https://ok.ru/videoembed/1', 'https://ok.ru')).not.toContain('top:-')
  })
})

describe('bridge relay', () => {
  it('relays go10Bridge messages from bridge origins only, and broadcasts commands to every frame', () => {
    const html = hostHtml('https://ok.ru/videoembed/1', 'https://ok.ru', { bridgeOrigins: ['https://ok.ru', 'https://player.vidlove.cc'] })
    expect(html).toContain('var BRIDGE = ["https://ok.ru","https://player.vidlove.cc"]')
    expect(html).toContain('window.go10Bridge = function')
    expect(bridgeScript({ go10Bridge: 'set', id: 1 })).toBe('window.go10Bridge({"go10Bridge":"set","id":1}); true;')
  })

  it('has no bridge relay unless asked (live TV)', () => {
    expect(hostHtml('https://ok.ru/videoembed/1', 'https://ok.ru')).toContain('var BRIDGE = []')
  })

  it('parses bridge messages', () => {
    expect(parseHostMessage(JSON.stringify({ kind: 'bridge', data: { go10Bridge: 'caps' } }))).toEqual({ kind: 'bridge', data: { go10Bridge: 'caps' } })
  })
})
