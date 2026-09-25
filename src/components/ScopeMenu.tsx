import { useEffect, useId, useRef, useState } from 'react'

export interface ScopeOption<T extends string> {
  value: T
  label: string
}

export interface ScopeGroup<T extends string> {
  label: string
  value: T
  options: ScopeOption<T>[]
  onChange: (value: T) => void
}

/**
 * The phone search's scope picker: a compact chip at the start of the field
 * that opens a small menu of radio groups (section, and source when external
 * titles are on). Off the focus grid — the TV layout keeps its own chips.
 *
 * Presses never take focus from the search input, so the field (and the
 * phone's keyboard) stays open while the scope changes.
 */
export function ScopeMenu({ label, groups }: { label: string; groups: ScopeGroup<string>[] }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    // Capture phase, ahead of FocusProvider: Escape closes the menu, not the
    // search or the screen beneath it.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      event.preventDefault()
      setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  const keepInputFocus = (event: React.PointerEvent) => event.preventDefault()

  return (
    <div
      ref={rootRef}
      className="go-scopemenu"
      // The field around it would otherwise treat the press as "edit".
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className={`go-scopemenu_trigger${open ? ' is-open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Buscar en: ${label}`}
        onPointerDown={keepInputFocus}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
        <span className="go-scopemenu_caret" aria-hidden="true" />
      </button>

      {open && (
        <div id={menuId} role="menu" className="go-scopemenu_menu">
          {groups.map((group) => (
            <div key={group.label} role="group" aria-label={group.label} className="go-scopemenu_group">
              <span className="go-scopemenu_heading" aria-hidden="true">
                {group.label}
              </span>
              {group.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={option.value === group.value}
                  className="go-scopemenu_item"
                  onPointerDown={keepInputFocus}
                  onClick={() => {
                    setOpen(false)
                    if (option.value !== group.value) group.onChange(option.value)
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
