import { describe, expect, it } from 'vitest'
import { enterDigit } from './numberEntry'

const UP_TO_15 = Array.from({ length: 15 }, (_, i) => i + 1)

describe('enterDigit', () => {
  it('waits on a digit that could start a longer number', () => {
    expect(enterDigit('', '1', UP_TO_15)).toEqual({ pending: '1', tune: null })
  })

  it('tunes at once when no longer number starts with the digit', () => {
    expect(enterDigit('', '3', UP_TO_15)).toEqual({ pending: '', tune: 3 })
  })

  it('tunes the second digit straight away', () => {
    expect(enterDigit('1', '2', UP_TO_15)).toEqual({ pending: '', tune: 12 })
  })

  it('tunes a number that is not a channel too: the caller decides it is nothing', () => {
    expect(enterDigit('1', '9', UP_TO_15)).toEqual({ pending: '', tune: 19 })
  })

  it('waits on 0, the start of nothing yet', () => {
    expect(enterDigit('', '0', UP_TO_15)).toEqual({ pending: '0', tune: null })
  })

  it('reads a leading 0 as nothing: 0 then 7 is 7', () => {
    expect(enterDigit('0', '7', UP_TO_15)).toEqual({ pending: '', tune: 7 })
  })

  it('with nine channels or fewer, every digit tunes at once', () => {
    expect(enterDigit('', '1', [1, 2, 3])).toEqual({ pending: '', tune: 1 })
  })
})
