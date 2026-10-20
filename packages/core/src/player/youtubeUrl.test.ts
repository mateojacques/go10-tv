import { describe, expect, it } from 'vitest'
import { isYoutubeUrl, parseYoutube } from './youtubeUrl'

const VIDEO = { videoId: 'aqz-KE-bpKQ' }
const CHANNEL = { channelId: 'UCSJ4gkVC6NrvII8umztf0Ow' }

describe('parseYoutube', () => {
  it.each([
    'https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=30',
    'https://youtu.be/aqz-KE-bpKQ',
    'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?start=5',
    'https://www.youtube.com/live/aqz-KE-bpKQ?si=x',
    'https://www.youtube.com/shorts/aqz-KE-bpKQ',
    'https://m.youtube.com/watch?v=aqz-KE-bpKQ',
    'aqz-KE-bpKQ',
  ])('reads the video id from %s', (input) => {
    expect(parseYoutube(input)).toEqual(VIDEO)
  })

  it.each([
    'https://www.youtube.com/channel/UCSJ4gkVC6NrvII8umztf0Ow',
    'https://www.youtube.com/embed/live_stream?channel=UCSJ4gkVC6NrvII8umztf0Ow',
  ])('reads the channel id from %s', (input) => {
    expect(parseYoutube(input)).toEqual(CHANNEL)
  })

  it.each(['https://www.youtube.com/@LofiGirl', 'https://ok.ru/video/1', '', 'abc'])('rejects %s', (input) => {
    expect(parseYoutube(input)).toBeNull()
  })
})

describe('isYoutubeUrl', () => {
  it.each([
    'https://youtube.com/watch?v=aqz-KE-bpKQ',
    'https://www.youtube.com/embed/aqz-KE-bpKQ',
    'https://m.youtube.com/watch?v=aqz-KE-bpKQ',
    'https://youtube-nocookie.com/embed/aqz-KE-bpKQ',
    'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ',
    'https://youtu.be/aqz-KE-bpKQ',
  ])('is true for %s', (url) => {
    expect(isYoutubeUrl(url)).toBe(true)
  })

  it.each(['https://ok.ru/videoembed/1', 'https://notyoutube.com/x', 'not a url'])('is false for %s', (url) => {
    expect(isYoutubeUrl(url)).toBe(false)
  })
})
