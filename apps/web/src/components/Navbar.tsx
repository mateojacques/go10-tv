import { SearchBox } from './SearchBox'
import { ScopeMenu, type ScopeGroup } from './ScopeMenu'
import { useFocusable } from '../focus/useFocusable'
import { useFocusState } from '../focus/FocusProvider'
import { browseRoute, type Route, type Section } from '@go10/core/router/route'
import { externalTitlesEnabled } from '@go10/core/external/config'
import { SEARCH_SOURCES, type SearchSource } from '@go10/core/external/mergeSearch'
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
  const source: SearchSource = (route.name === 'catalog' && route.source) || 'all'
  const sourceIndex = SEARCH_SOURCES.findIndex((option) => option.value === source)
  const nextSource = SEARCH_SOURCES[(sourceIndex + 1) % SEARCH_SOURCES.length]
  // Carried through every search navigation, like the section scope.
  const scope = source === 'all' ? {} : { source }
  const chooseSource = (target: SearchSource) =>
    onNavigate(
      target === 'all' ? { name: 'catalog', section, query } : { name: 'catalog', section, query, source: target },
      { replace: true },
    )

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
      onNavigate({ name: 'catalog', section, query: value, ...scope }, { replace: hasQuery })
    }
  }

  // Phones: one menu instead of the chips, which don't fit beside the field.
  const chooseSection = (target: Section) => {
    if (hasQuery) onNavigate({ name: 'catalog', section: target, query, ...scope }, { replace: true })
    else onNavigate(browseRoute(target), { replace: true })
  }
  const scopeGroups: ScopeGroup<string>[] = [
    {
      label: 'Sección',
      value: section,
      options: [
        { value: 'all', label: 'Todo' },
        { value: 'movie', label: SECTION_LABELS.movie },
        { value: 'show', label: SECTION_LABELS.show },
      ],
      onChange: (value) => chooseSection(value as Section),
    },
  ]
  if (hasQuery && externalTitlesEnabled()) {
    scopeGroups.push({
      label: 'Fuente',
      value: source,
      options: SEARCH_SOURCES,
      onChange: (value) => chooseSource(value as SearchSource),
    })
  }

  return (
    <nav className={`go-nav${hasQuery ? ' has-query' : ''}`} aria-label="Principal">
      <button
        type="button"
        className="go-wordmark"
        aria-label="Ir al inicio"
        onClick={() => onNavigate({ name: 'home' })}
      >
        <span className="go-wordmark_dot" aria-hidden="true" />
        GO10 TV
      </button>

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
              onNavigate({ name: 'catalog', section: 'all', query, ...scope }, { replace: true })
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
          leading={<ScopeMenu label={sectionLabel ?? 'Todo'} groups={scopeGroups} />}
        />
        {hasQuery && externalTitlesEnabled() && (
          // In the navbar, not above the grid: Enter/Down from the search box
          // must keep landing on the first result.
          <NavButton
            id="nav:source"
            col={4}
            className="go-nav_scope go-nav_source"
            // One chip cycling through the sources: the remote's Left/Right
            // stay free to move between the navbar's controls.
            ariaLabel={`Fuente: ${SEARCH_SOURCES[sourceIndex].label}. Cambiar a ${nextSource.label}`}
            onSelect={() => chooseSource(nextSource.value)}
          >
            {SEARCH_SOURCES[sourceIndex].label}
          </NavButton>
        )}
        {/* Phones only: the way out of the expanded search. Off the focus grid
            (and hidden) at TV widths, where the field is always open. */}
        <button
          type="button"
          className="go-nav_cancel"
          aria-label="Cerrar búsqueda"
          // Keep the input focused through the press, so the field doesn't
          // collapse under the finger before the click lands.
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            if (hasQuery) onQueryChange('')
            const active = document.activeElement
            if (active instanceof HTMLElement) active.blur()
          }}
        >
          <span className="go-nav_cancel-x" aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}
