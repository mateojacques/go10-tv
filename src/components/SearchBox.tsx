import { useEffect, useRef, useState } from 'react'
import { useFocusable } from '../focus/useFocusable'
import { useFocusState } from '../focus/FocusProvider'

/**
 * The navbar's search field, in two states.
 *
 * *Selected*: focus is on the box but not in the input, so moving across the
 * navbar with the remote doesn't pop the TV's on-screen keyboard up. Enter
 * (or a tap) starts *editing*: the real input takes DOM focus and gets the
 * caret, Left/Right and Backspace. Enter or Down leave for the first result;
 * Up or Escape stop editing without going anywhere — Escape never backs out
 * of a half-typed search.
 */
export function SearchBox({
  value,
  placeholder,
  onChange,
  row,
  col,
}: {
  value: string
  placeholder: string
  onChange: (value: string) => void
  row: number
  col: number
}) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { move } = useFocusState()

  const { ref, focused, activate, tabIndex } = useFocusable('nav:search', row, col, () => setEditing(true), {
    claimsInitialFocus: false,
    onKey: (key) => {
      if (!editing) return false
      if (key === 'Enter' || key === 'ArrowDown') {
        setEditing(false)
        move('ArrowDown', { alignStart: true })
        return true
      }
      if (key === 'ArrowUp' || key === 'Escape') {
        setEditing(false)
        return true
      }
      return false
    },
  })

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
    } else if (focused) {
      // Stopped editing but still selected: park DOM focus on the box itself,
      // which closes the keyboard and keeps the TV's remote driver engaged.
      // That's needed both when focus is still in the input (Escape/Up) and
      // when the keyboard closed on its own (Done/Cancel) and blurred it to
      // <body> — where Backspace would otherwise mean "back", not "delete".
      const active = document.activeElement
      if (active === inputRef.current || !ref.current?.contains(active)) {
        ref.current?.focus({ preventScroll: true })
      }
    }
  }, [editing, focused, ref])

  return (
    <div
      ref={ref}
      tabIndex={tabIndex}
      className={`go-search${focused ? ' is-focused' : ''}${editing ? ' is-editing' : ''}`}
      data-focused={focused}
      onClick={activate}
    >
      <span className="go-search_icon" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        className="go-search_input"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        tabIndex={-1}
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        // A tap lands straight in the input, skipping "selected".
        onFocus={activate}
        // Covers tapping elsewhere and a TV keyboard's own Done/Cancel keys.
        onBlur={() => setEditing(false)}
      />
    </div>
  )
}
