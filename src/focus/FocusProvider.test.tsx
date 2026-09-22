import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { FocusProvider } from './FocusProvider'
import { useFocusable } from './useFocusable'

function Cell({
  id,
  row,
  col,
  onEnter,
}: {
  id: string
  row: number
  col: number
  onEnter?: () => void
}) {
  const { ref, focused, activate } = useFocusable(id, row, col, onEnter ?? (() => {}))
  return (
    <div ref={ref} data-testid={id} data-focused={focused} onClick={activate}>
      {id}
    </div>
  )
}

function Grid({ onBack, onEnter }: { onBack?: () => void; onEnter?: () => void }) {
  return (
    <FocusProvider onBack={onBack ?? (() => {})}>
      <Cell id="a" row={0} col={0} onEnter={onEnter} />
      <Cell id="b" row={0} col={1} />
      <Cell id="c" row={1} col={0} />
      <Cell id="d" row={1} col={1} />
    </FocusProvider>
  )
}

/** The single element currently reporting focus. Throws if that is not exactly one. */
function focusedId() {
  const focused = document.querySelectorAll('[data-focused="true"]')
  expect(focused).toHaveLength(1)
  return focused[0].textContent
}

const press = (key: string) => fireEvent.keyDown(window, { key })

describe('FocusProvider', () => {
  it('focuses the first registered item', () => {
    render(<Grid />)
    expect(focusedId()).toBe('a')
  })

  it('moves focus right and left within a row', () => {
    render(<Grid />)
    press('ArrowRight')
    expect(focusedId()).toBe('b')
    press('ArrowLeft')
    expect(focusedId()).toBe('a')
  })

  it('moves focus down and up between rows, holding the column', () => {
    render(<Grid />)
    press('ArrowRight')
    press('ArrowDown')
    expect(focusedId()).toBe('d')
    press('ArrowUp')
    expect(focusedId()).toBe('b')
  })

  it('does not move past the edges', () => {
    render(<Grid />)
    press('ArrowLeft')
    expect(focusedId()).toBe('a')
    press('ArrowUp')
    expect(focusedId()).toBe('a')
  })

  it('keeps exactly one focused element at all times', () => {
    render(<Grid />)
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowDown']) {
      press(key)
      expect(document.querySelectorAll('[data-focused="true"]')).toHaveLength(1)
    }
  })

  it('activates the focused item on Enter', () => {
    const onEnter = vi.fn()
    render(<Grid onEnter={onEnter} />)
    press('Enter')
    expect(onEnter).toHaveBeenCalledTimes(1)
  })

  it('does not activate an item that is not focused', () => {
    const onEnter = vi.fn()
    render(<Grid onEnter={onEnter} />)
    press('ArrowRight')
    press('Enter')
    expect(onEnter).not.toHaveBeenCalled()
  })

  it('activates an item on click/tap without a prior focus move', () => {
    const onEnter = vi.fn()
    const { getByTestId } = render(<Grid onEnter={onEnter} />)
    fireEvent.click(getByTestId('a'))
    expect(onEnter).toHaveBeenCalledTimes(1)
  })

  it('moves focus to the clicked item, even if it was not already focused', () => {
    const { getByTestId } = render(<Grid />)
    expect(focusedId()).toBe('a')
    fireEvent.click(getByTestId('d'))
    expect(focusedId()).toBe('d')
  })

  it('calls onBack for Escape and Backspace', () => {
    const onBack = vi.fn()
    render(<Grid onBack={onBack} />)
    press('Escape')
    press('Backspace')
    expect(onBack).toHaveBeenCalledTimes(2)
  })

  it('stops listening once unmounted', () => {
    const onBack = vi.fn()
    const { unmount } = render(<Grid onBack={onBack} />)
    unmount()
    press('Escape')
    expect(onBack).not.toHaveBeenCalled()
  })

  it('moves focus to the nearest column when the next row is narrower', () => {
    render(
      <FocusProvider onBack={() => {}}>
        <Cell id="a" row={0} col={0} />
        <Cell id="b" row={0} col={1} />
        <Cell id="c" row={0} col={2} />
        <Cell id="only" row={1} col={0} />
      </FocusProvider>,
    )
    press('ArrowRight')
    press('ArrowRight')
    expect(focusedId()).toBe('c')
    press('ArrowDown')
    expect(focusedId()).toBe('only')
  })
})

describe('FocusProvider when disabled', () => {
  it('ignores keys but keeps the screen and its focus mounted', () => {
    const onBack = vi.fn()
    const onEnter = vi.fn()
    render(
      <FocusProvider onBack={onBack} enabled={false}>
        <Cell id="a" row={0} col={0} onEnter={onEnter} />
        <Cell id="b" row={0} col={1} />
      </FocusProvider>,
    )
    expect(focusedId()).toBe('a')

    press('ArrowRight')
    press('Enter')
    press('Escape')

    expect(focusedId()).toBe('a')
    expect(onEnter).not.toHaveBeenCalled()
    expect(onBack).not.toHaveBeenCalled()
  })
})
