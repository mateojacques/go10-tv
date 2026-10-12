import { centerPointer, movePointer, pointerStep } from './pointerMove'

const size = { width: 960, height: 540 }

it('starts centred', () => {
  expect(centerPointer(size)).toEqual({ x: 480, y: 270, run: null })
})

it('moves 12 dp per press and accelerates while held', () => {
  expect([1, 3, 4, 9, 10].map(pointerStep)).toEqual([12, 12, 24, 24, 48])
  let p = centerPointer(size)
  p = movePointer(p, 'right', 0, size)
  expect(p.x).toBe(492)
  for (let i = 1; i <= 4; i++) p = movePointer(p, 'right', i * 50, size)
  expect(p.x).toBe(492 + 12 * 2 + 24 * 2) // presses 2-3 step 12, 4-5 step 24
})

it('stays on screen', () => {
  let p = movePointer({ x: 5, y: 5, run: null }, 'left', 0, size)
  p = movePointer(p, 'up', 1000, size)
  expect([p.x, p.y]).toEqual([0, 0])
  expect(movePointer({ x: 955, y: 535, run: null }, 'right', 0, size).x).toBe(959)
})
