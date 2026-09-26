import { commandScript, hostHtml, parseHostMessage } from './hostPage'

describe('hostHtml', () => {
  it('embeds the src attribute-escaped and relays only the embed origin', () => {
    const html = hostHtml('https://ok.ru/videoembed/1?autoplay=1&fromTime=117', 'https://ok.ru')
    expect(html).toContain('src="https://ok.ru/videoembed/1?autoplay=1&amp;fromTime=117"')
    expect(html).toContain('var ORIGIN = "https://ok.ru";')
    expect(html).toContain('e.origin === ORIGIN && e.source === f.contentWindow')
    expect(html).not.toContain('sandbox=')
  })

  it('sandboxes the iframe when the provider asks', () => {
    expect(hostHtml('https://player.vidlove.cc/embed/movie/1', 'https://player.vidlove.cc', 'allow-scripts allow-same-origin'))
      .toContain('sandbox="allow-scripts allow-same-origin"')
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
