/** @jest-environment jsdom */
import { hostHtml } from './hostPage'

// Runs the host page's own script against a jsdom document.
const listeners: EventListener[] = []
afterEach(() => listeners.splice(0).forEach((l) => window.removeEventListener('message', l)))

function load(bridgeOrigins: string[]) {
  const html = hostHtml('about:blank', 'https://ok.ru', { bridgeOrigins })
  document.documentElement.innerHTML = html.replace(/^<!doctype html>\s*<html>/, '').replace(/<\/html>$/, '')
  const sent: unknown[] = []
  ;(window as unknown as { ReactNativeWebView: object }).ReactNativeWebView = { postMessage: (m: string) => sent.push(JSON.parse(m)) }
  const script = document.querySelector('script')!.textContent!
  const add = window.addEventListener.bind(window)
  const spy = jest.spyOn(window, 'addEventListener').mockImplementation((type: string, l: any, o?: any) => {
    if (type === 'message') listeners.push(l)
    add(type, l, o)
  })
  new Function(script)()
  spy.mockRestore()
  return sent
}
const message = (data: unknown, origin: string) => window.dispatchEvent(new MessageEvent('message', { data, origin }))

it('relays bridge messages by origin, even from nested frames', () => {
  const sent = load(['https://ok.ru', 'https://player.vidlove.cc'])
  message({ go10Bridge: 'caps', source: 'html5' }, 'https://player.vidlove.cc')
  message({ go10Bridge: 'caps', source: 'evil' }, 'https://ads.example')
  expect(sent).toEqual([{ kind: 'bridge', data: { go10Bridge: 'caps', source: 'html5' } }])
})

it('never passes a bridge message on as an embed event', () => {
  const sent = load([])
  message({ go10Bridge: 'caps' }, 'https://ok.ru')
  expect(sent).toEqual([])
})

it('broadcasts a bridge command to the embed frame and its children', () => {
  load(['https://ok.ru'])
  const frame = document.getElementById('f') as HTMLIFrameElement
  const inner = { postMessage: jest.fn(), frames: { length: 0 } }
  const outer = { postMessage: jest.fn(), frames: { length: 1, 0: inner } }
  Object.defineProperty(frame, 'contentWindow', { value: outer })
  ;(window as unknown as { go10Bridge: (cmd: unknown) => void }).go10Bridge({ go10Bridge: 'set', id: 1 })
  expect(outer.postMessage).toHaveBeenCalledWith({ go10Bridge: 'set', id: 1 }, '*')
  expect(inner.postMessage).toHaveBeenCalledWith({ go10Bridge: 'set', id: 1 }, '*')
  frame.remove() // jsdom's teardown would try to close the stub window
})
