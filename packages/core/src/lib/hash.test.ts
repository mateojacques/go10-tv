import { describe, expect, it } from 'vitest'
import { hash01 } from './hash'

describe('hash01', () => {
  it('is stable, in [0, 1), and depends on both seed and key', () => {
    const a = hash01(7, 'coraje')
    expect(hash01(7, 'coraje')).toBe(a)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(1)
    expect(hash01(8, 'coraje')).not.toBe(a)
    expect(hash01(7, 'chowder')).not.toBe(a)
  })
})
