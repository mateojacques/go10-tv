// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { describe, expect, it, vi } from 'vitest'

const HTML = readFileSync(fileURLToPath(new URL('../public/yt.html', import.meta.url)), 'utf8')
const EMBED = 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?enablejsapi=1'

/** The relay at `?src=`, with its parent and inner frame's postMessage spied on. */
function relay(src: string) {
  const dom = new JSDOM(HTML, { url: `https://tv.go10.blog/yt.html?src=${encodeURIComponent(src)}`, runScripts: 'dangerously' })
  const win = dom.window
  const frame = win.document.querySelector('iframe')
  const toParent = vi.fn()
  // A top-level JSDOM page is its own parent: stand a fake one in.
  const parent = { postMessage: toParent }
  Object.defineProperty(win, 'parent', { value: parent, configurable: true })
  const toEmbed = vi.fn()
  if (frame?.contentWindow) Object.defineProperty(frame.contentWindow, 'postMessage', { value: toEmbed, configurable: true })
  const receive = (data: unknown, source: unknown, origin: string) =>
    win.dispatchEvent(new win.MessageEvent('message', { data, origin, source: source as Window }))
  return { win, frame, parent, toParent, toEmbed, receive }
}

describe('yt.html relay', () => {
  it('embeds only YouTube', () => {
    expect(relay('https://evil.example/embed/x').frame).toBeNull()
    expect(relay(EMBED).frame?.getAttribute('src')).toBe(EMBED)
  })

  it("passes the app's commands on to the embed", () => {
    const r = relay(EMBED)
    r.receive('{"event":"listening"}', r.parent, 'null')
    expect(r.toEmbed).toHaveBeenCalledWith('{"event":"listening"}', 'https://www.youtube-nocookie.com')
  })

  it("passes the embed's reports up to the app", () => {
    const r = relay(EMBED)
    r.receive('{"event":"infoDelivery"}', r.frame!.contentWindow, 'https://www.youtube-nocookie.com')
    expect(r.toParent).toHaveBeenCalledWith('{"event":"infoDelivery"}', '*')
  })

  it('ignores everyone else', () => {
    const r = relay(EMBED)
    r.receive('x', r.frame!.contentWindow, 'https://evil.example')
    r.receive('y', {}, 'https://www.youtube-nocookie.com')
    expect(r.toParent).not.toHaveBeenCalled()
    expect(r.toEmbed).not.toHaveBeenCalled()
  })
})
