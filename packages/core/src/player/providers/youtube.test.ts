import { afterEach, describe, expect, it } from 'vitest'
import { catalogRow } from '../../tv/testing'
import { configureYoutube, createYoutubeParser, youtube, youtubeEmbedSrc } from './youtube'

const row = catalogRow({ video_id: 'aqz-KE-bpKQ', embed_url: 'https://youtu.be/aqz-KE-bpKQ', video_url: 'https://youtu.be/aqz-KE-bpKQ' })
const EMBED = 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?enablejsapi=1&autoplay=1&playsinline=1&rel=0'
const msg = (event: string, info: unknown) => JSON.stringify({ event, info })
const command = (func: string, args: unknown[] = []) => JSON.stringify({ event: 'command', func, args })

afterEach(() => configureYoutube({ pageOrigin: null, relayUrl: null }))

describe('youtube provider: src', () => {
  it('builds the nocookie embed with the start floored', () => {
    expect(youtube.src(row, 61.9)).toBe(`${EMBED}&start=61`)
  })

  it('leaves the start out at the top', () => {
    expect(youtube.src(row, null)).toBe(EMBED)
    expect(youtube.src(row, 0)).toBe(EMBED)
  })

  it("names the page's origin when it has one", () => {
    configureYoutube({ pageOrigin: 'https://tv.go10.blog', relayUrl: null })
    expect(youtube.src(row, 61.9)).toBe(`${EMBED}&start=61&origin=https%3A%2F%2Ftv.go10.blog`)
    expect(youtube.origin).toBe('https://www.youtube-nocookie.com')
  })

  it('goes through the relay page when there is one, and trusts its origin', () => {
    configureYoutube({ pageOrigin: null, relayUrl: 'https://tv.go10.blog/yt.html' })
    const src = new URL(youtube.src(row, 61.9))
    expect(src.origin + src.pathname).toBe('https://tv.go10.blog/yt.html')
    expect(src.searchParams.get('src')).toBe(`${EMBED}&start=61&origin=https%3A%2F%2Ftv.go10.blog`)
    expect(youtube.origin).toBe('https://tv.go10.blog')
  })

  it('embeds a channel source as its current live stream', () => {
    expect(youtubeEmbedSrc({ channelId: 'UCSJ4gkVC6NrvII8umztf0Ow' }, {})).toBe(
      'https://www.youtube-nocookie.com/embed/live_stream?channel=UCSJ4gkVC6NrvII8umztf0Ow&enablejsapi=1&autoplay=1&playsinline=1&rel=0',
    )
  })

  it('can start muted', () => {
    expect(youtubeEmbedSrc({ videoId: 'aqz-KE-bpKQ' }, { mute: true })).toBe(`${EMBED}&mute=1`)
  })
})

describe('youtube provider: commands', () => {
  it('speaks the iframe API as JSON strings', () => {
    expect(youtube.seekMessage(42.5)).toBe(command('seekTo', [42.5, true]))
    expect(youtube.playMessage).toBe(command('playVideo'))
    expect(youtube.pauseMessage).toBe(command('pauseVideo'))
    expect(youtube.muteMessage).toBe(command('mute'))
    expect(youtube.unmuteMessage).toBe(command('unMute'))
    expect(youtube.volumeMessage?.(1)).toBe(command('setVolume', [100]))
    expect(youtube.volumeMessage?.(0.333)).toBe(command('setVolume', [33]))
  })

  it('has the listening handshake', () => {
    expect(youtube.handshakeMessage).toBe('{"event":"listening","id":1,"channel":"widget"}')
  })

  it('resumes through the URL and falls back to YouTube', () => {
    expect(youtube.resumesViaUrl).toBe(true)
    expect(youtube.fallbackLabel).toBe('Abrir en YouTube')
  })
})

describe('youtube provider: parse', () => {
  it('reads time, pause and the end from infoDelivery', () => {
    const parse = createYoutubeParser()
    expect(parse(msg('infoDelivery', { currentTime: 12, duration: 600, playerState: 1 }))).toEqual({ kind: 'time', time: 12, duration: 600 })
    expect(parse(msg('infoDelivery', { playerState: 2 }))).toEqual({ kind: 'paused' })
    expect(parse(msg('infoDelivery', { currentTime: 599.9, playerState: 0 }))).toEqual({ kind: 'ended', time: 599.9 })
  })

  it('keeps the last duration across partial updates', () => {
    const parse = createYoutubeParser()
    parse(msg('infoDelivery', { currentTime: 1, duration: 600, playerState: 1 }))
    expect(parse(msg('infoDelivery', { currentTime: 2 }))).toEqual({ kind: 'time', time: 2, duration: 600 })
  })

  it('reports playing when the state alone says so', () => {
    const parse = createYoutubeParser()
    expect(parse(msg('infoDelivery', { playerState: 1 }))).toEqual({ kind: 'playing' })
    expect(parse(msg('onStateChange', 1))).toEqual({ kind: 'playing' })
  })

  it('reports embed errors', () => {
    expect(createYoutubeParser()(msg('onError', 150))).toEqual({ kind: 'error', code: 150 })
  })

  it('ignores objects, broken JSON, buffering and other events', () => {
    const parse = createYoutubeParser()
    expect(parse({ event: 'infoDelivery', info: { currentTime: 1 } })).toBeNull()
    expect(parse('{nope')).toBeNull()
    expect(parse(msg('infoDelivery', { playerState: 3 }))).toBeNull()
    expect(parse(msg('onReady', null))).toBeNull()
    expect(parse(msg('apiInfoDelivery', { namespaces: [] }))).toBeNull()
  })

  it('backs the provider with one shared parser', () => {
    expect(youtube.parse(msg('infoDelivery', { currentTime: 3, duration: 9 }), row)).toEqual({ kind: 'time', time: 3, duration: 9 })
  })
})
