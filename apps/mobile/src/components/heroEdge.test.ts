import { edgeStep } from './heroEdge'

describe('edgeStep', () => {
  it('← on Reproducir is the previous slide, → on Más información the next', () => {
    expect(edgeStep('left', 'play')).toBe(-1)
    expect(edgeStep('right', 'info')).toBe(1)
  })

  it('moves between the two buttons are not slide changes', () => {
    expect(edgeStep('right', 'play')).toBe(0)
    expect(edgeStep('left', 'info')).toBe(0)
  })

  it('ignores other keys and an unfocused hero', () => {
    expect(edgeStep('up', 'play')).toBe(0)
    expect(edgeStep('select', 'info')).toBe(0)
    expect(edgeStep('left', null)).toBe(0)
  })
})
