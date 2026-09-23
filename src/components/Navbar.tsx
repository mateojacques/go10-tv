import { SearchBox } from './SearchBox'
import { useFocusable } from '../focus/useFocusable'
import { useFocusState } from '../focus/FocusProvider'
import { browseRoute, type Route, type Section } from '../router/route'
import './Navbar.css'

/** The navbar sits above everything else on the screen in the focus grid. */
export const NAV_ROW = -2

const SECTION_LABELS: Record<Exclude<Section, 'all'>, string> = {
  movie: 'Películas',
  show: 'Series',
}

function NavButton({
  id,
  col,
  className,
  active = false,
  ariaLabel,
  onSelect,
  children,
}: {
  id: string
  col: number
  className: string
  active?: boolean
  ariaLabel?: string
  onSelect: () => void
  children: React.ReactNode
}) {
  const { ref, focused, activate, tabIndex } = useFocusable(id, NAV_ROW, col, onSelect, {
    claimsInitialFocus: false,
  })
  return (
    <div
      ref={ref}
      tabIndex={tabIndex}
      role="button"
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      className={`${className}${active ? ' is-active' : ''}${focused ? ' is-focused' : ''}`}
      data-focused={focused}
      onClick={activate}
    >
      {children}
    </div>
  )
}

export function Navbar({
  route,
  onNavigate,
}: {
  route: Route
  onNavigate: (route: Route, options?: { replace?: boolean }) => void
}) {
  const { focus } = useFocusState()
  const section: Section = route.name === 'catalog' ? route.section : 'all'
  const query = route.name === 'catalog' ? route.query : ''
  const hasQuery = query.trim() !== ''
  const sectionLabel = section === 'all' ? null : SECTION_LABELS[section]
  const isBrowsing = (target: Section) => section === target && !hasQuery

  const openSection = (target: Exclude<Section, 'all'>) => {
    // Already there: don't stack a duplicate history entry.
    if (!isBrowsing(target)) onNavigate(browseRoute(target))
  }

  const onQueryChange = (value: string) => {
    if (value.trim() === '') {
      onNavigate(browseRoute(section), { replace: true })
    } else {
      // Only the keystroke that starts a search gets a history entry; the
      // rest refine it in place, so Back doesn't replay every letter.
      onNavigate({ name: 'catalog', section, query: value }, { replace: hasQuery })
    }
  }

  return (
    <nav className="go-nav" aria-label="Principal">
      <div className="go-wordmark">
        <span className="go-wordmark_dot" aria-hidden="true" />
        GO10 TV
      </div>

      <div className="go-nav_links">
        <NavButton
          id="nav:peliculas"
          col={0}
          className="go-nav_link"
          active={section === 'movie'}
          onSelect={() => openSection('movie')}
        >
          {SECTION_LABELS.movie}
        </NavButton>
        <NavButton
          id="nav:series"
          col={1}
          className="go-nav_link"
          active={section === 'show'}
          onSelect={() => openSection('show')}
        >
          {SECTION_LABELS.show}
        </NavButton>
      </div>

      <div className="go-nav_search">
        {hasQuery && sectionLabel && (
          <NavButton
            id="nav:scope"
            col={2}
            className="go-nav_scope"
            ariaLabel={`Quitar filtro ${sectionLabel}`}
            onSelect={() => {
              onNavigate({ name: 'catalog', section: 'all', query }, { replace: true })
              // The chip is about to unmount; keep focus where the user was headed.
              focus('nav:search')
            }}
          >
            {sectionLabel}
            <span className="go-nav_scope-x" aria-hidden="true">✕</span>
          </NavButton>
        )}
        <SearchBox
          row={NAV_ROW}
          col={3}
          value={query}
          placeholder={sectionLabel ? `Buscar en ${sectionLabel}` : 'Buscar'}
          onChange={onQueryChange}
        />
      </div>
    </nav>
  )
}
