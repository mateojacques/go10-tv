# Tizen Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package `apps/web` as a sideloadable Samsung Tizen TV app, and get a working dev-shell loop running on the user's real Tizen 5.5 TV.

**Architecture:** No new React app — `apps/web` is fixed up for Tizen's older engine (build target, CSS `gap` fallback, Back-key/exit wiring) and a new `apps/tizen` workspace wraps it for packaging only: a dev-shell `.wgt` that loads the LAN Vite dev server for fast iteration, and a prod-bundle `.wgt` that packages the real `vite build` output for full-fidelity checks.

**Tech Stack:** Vite/React (`apps/web`, unchanged), Tizen Studio CLI (`tizen`, `sdb`), Tizen Web App packaging (`config.xml`/`.wgt`).

**Spec:** `docs/superpowers/specs/2026-09-28-tizen-port-design.md`

## Global Constraints

- Target engine: Tizen 5.5 / Chromium ~69 (Samsung 2020 T5300 series, firmware `T-KTS2UABC-2743.0`) — every compatibility fix in this plan is scoped to that engine, not a newer one.
- Sideload only — no Samsung Seller Office submission, no distributor certificate; a free self-issued author certificate is sufficient.
- No Tizen emulator testing — all TV-specific behavior is validated on the user's real hardware only.
- `apps/mobile` (Android/Android TV) is untouched by this plan.
- Tizen-only code must be a true no-op everywhere `window.tizen` doesn't exist (web, mobile-web, every existing test) — this app has no Tizen-only fork of its logic, just guarded additions.
- No new build dependency for the CSS `gap` fix — it's a handful of `@supports` fallback blocks, not a PostCSS plugin.
- Packaging artifacts live in `apps/tizen`, never mixed into `apps/web`.

## Review Focus

- Chromium 69 lacks runtime globals/methods (`globalThis`, `String.prototype.matchAll`, `Promise.allSettled`) that a syntax-only build-target fix won't polyfill — a person's TV could still get a blank screen or a mid-session crash even after the build-target fix. (Task 1)
- `installTizenPlatform`/`exitAppIfTizen` must be true no-ops everywhere `tizen` is undefined — a person opening the regular site in any normal browser must never see a crash from Tizen-only code paths. (Task 3)
- Pressing Back while the player overlay is open must go back to the detail screen, never exit the app outright — a person mid-episode who backs out once shouldn't lose the whole app. (Task 4)
- A missing `tv.inputdevice` privilege in `config.xml` throws a `WebAPIException` on `registerKey` at runtime on real hardware — the privilege list must not drift from what the code actually calls. (Tasks 5/6, cross-checked against Task 3)
- Changing Vite's global `build.target` could silently change output for the existing Netlify web deploy too — a person visiting the regular web site must see no regression. (Task 1)

---

### Task 1: Pin the Vite build target for Tizen's engine, and audit for runtime API gaps

**Files:**
- Modify: `apps/web/vite.config.ts`

**Interfaces:**
- Produces: no new exports — this only changes the JS syntax level Vite/esbuild emits for every build (web and Tizen alike).

- [ ] **Step 1: Add the build target**

In `apps/web/vite.config.ts`, add a `build` block to `defineConfig`:

```ts
export default defineConfig({
  plugins: [react(), collectionsIndex()],
  // Chromium 69 (Tizen 5.5, this project's TV target) can't parse optional
  // chaining or nullish coalescing at all -- an un-pinned build ships a
  // blank screen on it, not just rough edges.
  build: {
    target: 'chrome69',
  },
  // .env.local (the external-titles switch and TMDB token) lives at the repo root.
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    // External titles are off for the suite; tests that need them stub these.
    env: { VITE_EXTERNAL_TITLES: 'off', VITE_TMDB_TOKEN: '' },
  },
})
```

- [ ] **Step 2: Run the full existing web test suite to confirm no regression**

Run: `cd apps/web && npx vitest run`
Expected: PASS, same as before this change (this step exists because a global `build.target` change is exactly the kind of thing that could silently affect the existing Netlify web deploy too).

- [ ] **Step 3: Build and audit the output for runtime APIs the target won't polyfill**

`esbuild`'s `target` lowers *syntax* (e.g. optional chaining becomes explicit checks) but does not polyfill missing *runtime* APIs. Chromium 69 lacks `globalThis` (Chrome 71+), `String.prototype.matchAll` (Chrome 73+), and `Promise.allSettled` (Chrome 76+) — if the bundle calls any of these, they'll throw at runtime on the real TV even though the build succeeds.

Run:
```bash
cd apps/web && npm run build
grep -rlE "queueMicrotask|globalThis|matchAll|allSettled|fromEntries|replaceAll|\.at\(|structuredClone|Object\.hasOwn|findLast|randomUUID|replaceChildren|Promise\.any" dist/assets/*.js
```
Expected: no matches, or only matches already guarded by a `typeof X === 'function'` check (inspect each one — a raw string match can't tell guarded from unguarded on its own). If it finds an unguarded match, fix it (e.g. `Promise.resolve().then(...)` in place of a bare `queueMicrotask` call) before moving on; this list was widened after the final review found an unguarded `queueMicrotask` call in `FocusProvider.tsx` that this task's original narrower grep missed. Keep widening this list on future dependency bumps.

- [ ] **Step 4: Commit**

```bash
git add apps/web/vite.config.ts
git commit -m "build: pin Vite's build target to Tizen 5.5's Chromium 69 engine"
```

---

### Task 2: Fix flex `gap` compatibility for Chromium 69

**Files:**
- Modify: `apps/web/src/components/Row.css`
- Modify: `apps/web/src/components/Navbar.css`
- Modify: `apps/web/src/components/Card.css`
- Modify: `apps/web/src/screens/Catalog.css`

**Interfaces:** none — CSS only, no exports change.

Chromium didn't support `gap` on flex containers until v84; this app's flex rows currently rely on it for spacing (grid `gap`, e.g. `.go-catalog_grid`, is fine — grid-gap support predates Chromium 69). The fix is an `@supports not (gap: 1rem)` fallback block per file, using the `> * + * { margin-left: … }` pattern, which only activates in engines that lack flex-gap support and otherwise changes nothing. The TV viewport never triggers this app's phone breakpoints (`max-width: 720px` / `374px`), so only the base-level flex+gap rules need a fallback — the mobile-only overrides don't apply on a TV and are skipped.

- [ ] **Step 1: Append the fallback block to `Row.css`**

```css
/* Chromium 69 (Tizen 5.5) doesn't support gap on flex containers -- fall back
   to margins. The TV viewport never hits a mobile breakpoint, so only the
   base rules need a fallback. */
@supports not (gap: 1rem) {
  .go-row_label > * + * {
    margin-left: 0.75rem;
  }

  .go-row_track > * + * {
    margin-left: var(--go-gap);
  }
}
```

- [ ] **Step 2: Append the fallback block to `Navbar.css`**

```css
/* Chromium 69 (Tizen 5.5) doesn't support gap on flex containers -- fall back
   to margins. The TV viewport never hits the mobile breakpoints above, so
   only the base rules need a fallback. */
@supports not (gap: 1rem) {
  .go-nav > * + * {
    margin-left: 2.5rem;
  }

  .go-wordmark > * + * {
    margin-left: 0.5rem;
  }

  .go-nav_links > * + * {
    margin-left: 0.5rem;
  }

  .go-nav_search > * + * {
    margin-left: 0.75rem;
  }

  .go-nav_scope > * + * {
    margin-left: 0.5rem;
  }

  .go-search > * + * {
    margin-left: 0.625rem;
  }

  .go-scopemenu_trigger > * + * {
    margin-left: 0.375rem;
  }

  .go-scopemenu_item > * + * {
    margin-left: 1rem;
  }
}
```

- [ ] **Step 3: Append the fallback block to `Card.css`**

```css
@supports not (gap: 1rem) {
  .go-card_tags > * + * {
    margin-left: 0.375rem;
  }
}
```

- [ ] **Step 4: Append the fallback block to `Catalog.css`**

```css
/* .go-catalog_title wraps; the margin fallback below can look uneven on a
   wrapped line -- acceptable since it's a legacy-engine-only fallback, but
   confirm it looks fine on-device in Task 8. */
@supports not (gap: 1rem) {
  .go-catalog_title > * + * {
    margin-left: 0.875rem;
  }
}
```

- [ ] **Step 5: Run the existing test suite to confirm no regression**

Run: `cd apps/web && npx vitest run`
Expected: PASS — these are pure additions gated by `@supports not (...)`, invisible to every browser that already supports flex `gap`, so no existing test should change behavior.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/Row.css apps/web/src/components/Navbar.css apps/web/src/components/Card.css apps/web/src/screens/Catalog.css
git commit -m "fix: fall back to margins for flex gap on Chromium 69 (Tizen 5.5)"
```

---

### Task 3: `installTizenPlatform` and `exitAppIfTizen`

**Files:**
- Create: `apps/web/src/platformTizen.ts`
- Test: `apps/web/src/platformTizen.test.ts`

**Interfaces:**
- Produces: `installTizenPlatform(): void`, `exitAppIfTizen(): void` — both consumed by Task 4.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/platformTizen.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installTizenPlatform, exitAppIfTizen } from './platformTizen'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('installTizenPlatform', () => {
  it('does nothing outside a packaged Tizen app', () => {
    expect(() => installTizenPlatform()).not.toThrow()
  })

  it('registers the Back key and forwards it as an Escape keydown', () => {
    const registerKey = vi.fn()
    vi.stubGlobal('tizen', { tvinputdevice: { registerKey } })

    installTizenPlatform()
    expect(registerKey).toHaveBeenCalledWith('Back')

    const onEscape = vi.fn()
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') onEscape()
    })

    // Tizen's physical Back/Return button always reports keyCode 10009,
    // regardless of firmware version -- unlike `event.key`, which has
    // varied across Tizen releases.
    const backEvent = new KeyboardEvent('keydown', {})
    Object.defineProperty(backEvent, 'keyCode', { value: 10009 })
    window.dispatchEvent(backEvent)

    expect(onEscape).toHaveBeenCalled()
  })
})

describe('exitAppIfTizen', () => {
  it('does nothing outside a packaged Tizen app', () => {
    expect(() => exitAppIfTizen()).not.toThrow()
  })

  it('exits the current Tizen application', () => {
    const exit = vi.fn()
    vi.stubGlobal('tizen', { application: { getCurrentApplication: () => ({ exit }) } })

    exitAppIfTizen()
    expect(exit).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run src/platformTizen.test.ts`
Expected: FAIL — `Cannot find module './platformTizen'`

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/platformTizen.ts

/** Tizen's Web Device API, present only inside a packaged Tizen Web App. */
declare const tizen:
  | {
      tvinputdevice: { registerKey: (key: string) => void }
      application: { getCurrentApplication: () => { exit: () => void } }
    }
  | undefined

/** Tizen's own code for the physical Back/Return remote button, stable across every Tizen version. */
const TIZEN_BACK_KEYCODE = 10009

/**
 * Registers the physical Back/Return remote button -- Tizen doesn't deliver
 * it to the page at all otherwise -- and forwards it as the same synthetic
 * Escape keydown a real keyboard's Escape already produces, so
 * FocusProvider's existing Escape handling needs no changes. A no-op outside
 * a packaged Tizen app (web, mobile-web, tests).
 */
export function installTizenPlatform(): void {
  if (typeof tizen === 'undefined') return
  tizen.tvinputdevice.registerKey('Back')
  window.addEventListener('keydown', (event) => {
    if (event.keyCode === TIZEN_BACK_KEYCODE) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    }
  })
}

/**
 * Exits the app -- called from App.tsx's back() when there's nowhere left to
 * navigate to (the Home route). A no-op outside a packaged Tizen app.
 */
export function exitAppIfTizen(): void {
  if (typeof tizen === 'undefined') return
  tizen.application.getCurrentApplication().exit()
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run src/platformTizen.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/platformTizen.ts apps/web/src/platformTizen.test.ts
git commit -m "feat: add installTizenPlatform and exitAppIfTizen"
```

---

### Task 4: Wire the Tizen platform into `main.tsx` and `App.tsx`

**Files:**
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`

**Interfaces:**
- Consumes: `installTizenPlatform(): void`, `exitAppIfTizen(): void` from Task 3 (`./platformTizen`).

- [ ] **Step 1: Write the failing tests**

Add this new `describe` block to the end of `apps/web/src/App.test.tsx` (the file's existing top-level `afterEach` already calls `vi.unstubAllGlobals()`, so no extra cleanup is needed here):

```ts
describe('Tizen back/exit', () => {
  it('exits the app when Back is pressed at Home', async () => {
    const exit = vi.fn()
    vi.stubGlobal('tizen', { application: { getCurrentApplication: () => ({ exit }) } })

    render(<App />)
    await screen.findByRole('heading', { name: 'Foo Movie' })

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(exit).toHaveBeenCalled()
  })

  it('does not exit the app when Back is pressed while the player is open', async () => {
    const exit = vi.fn()
    vi.stubGlobal('tizen', { application: { getCurrentApplication: () => ({ exit }) } })

    window.history.replaceState({}, '', '/title/111/play/111')
    render(<App />)
    await waitFor(() => expect(document.querySelector('.go-player_frame')).not.toBeNull())

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(window.location.pathname).toBe('/title/111'))
    expect(exit).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run src/App.test.tsx -t "Tizen back/exit"`
Expected: FAIL — `route.name === 'home'` currently falls through `back()`'s switch doing nothing, so `exit` is never called in the first test.

- [ ] **Step 3: Wire `exitAppIfTizen` into `App.tsx`'s `back()`**

In `apps/web/src/App.tsx`, add the import:

```ts
import { exitAppIfTizen } from './platformTizen'
```

And add a `case 'home':` to the `back()` switch (`apps/web/src/App.tsx:33-48`):

```ts
  const back = useCallback(() => {
    switch (route.name) {
      case 'play':
        navigate({ name: 'title', key: route.key })
        break
      case 'title':
        navigate(lastBrowseRoute.current)
        break
      case 'collection':
        navigate({ name: 'home' })
        break
      case 'catalog':
        navigate({ name: 'home' })
        break
      case 'home':
        exitAppIfTizen()
        break
    }
  }, [route, navigate])
```

- [ ] **Step 4: Wire `installTizenPlatform` into `main.tsx`**

In `apps/web/src/main.tsx`:

```ts
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installWebPlatform } from './platform'
import { installTizenPlatform } from './platformTizen'

installWebPlatform()
installTizenPlatform()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="go-grain" aria-hidden="true" />
    <App />
  </StrictMode>,
)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run src/App.test.tsx`
Expected: PASS (every existing test in the file, plus the 2 new ones)

- [ ] **Step 6: Run the full suite once more**

Run: `cd apps/web && npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/main.tsx apps/web/src/App.tsx apps/web/src/App.test.tsx
git commit -m "feat: exit on Back at Home, and register Tizen's Back key at startup"
```

---

### Task 5: Scaffold the dev-shell Tizen packaging project

**Files:**
- Create: `apps/tizen/dev/config.xml`
- Create: `apps/tizen/dev/index.html`
- Create: `apps/tizen/dev/icon.png`
- Create: `apps/tizen/scripts/install-dev.sh`
- Create: `apps/tizen/.gitignore`

**Interfaces:** none — packaging only, consumed only by Task 7/8's manual steps.

`PKGID12345` below is a placeholder: Tizen assigns a real 10-character package id when you create your author certificate/profile in Tizen Studio (Task 7) — replace every occurrence of `PKGID12345` in both `apps/tizen/dev/config.xml` and `apps/tizen/prod/config.xml` (Task 6) with that value once you have it. Likewise, `192.168.1.100` in `dev/index.html` is a placeholder for your dev machine's actual LAN IP.

- [ ] **Step 1: Create `apps/tizen/dev/config.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets"
        xmlns:tizen="http://tizen.org/ns/widgets"
        id="http://go10.tv/GO10TVDev"
        version="1.0.0"
        viewmodes="maximized">
    <!-- PKGID12345 is a placeholder: replace both occurrences (id and
         package) with the 10-character package id Tizen Studio assigns you
         in Task 7. -->
    <tizen:application id="PKGID12345.GO10TVDev" package="PKGID12345" required_version="5.5"/>
    <name>GO10 TV (Dev)</name>
    <icon src="icon.png"/>
    <content src="index.html"/>
    <feature name="http://tizen.org/feature/screen.size.all"/>
    <tizen:privilege name="http://tizen.org/privilege/internet"/>
    <tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>
    <!-- Without these, Tizen's WARP security model blocks fetch/XHR to
         external origins (catalog data, TMDB, ok.ru/vidlove, Google Fonts)
         and blocks the top-level navigation to the LAN dev server below. A
         wildcard is fine for a sideload-only app that never goes through
         store review. -->
    <access origin="*" subdomains="true"/>
    <tizen:allow-navigation>*</tizen:allow-navigation>
    <tizen:setting screen-orientation="landscape" context-menu="disable" background-support="disable" encryption="disable" install-location="auto" hwkey-event="enable"/>
    <tizen:profile name="tv-samsung"/>
</widget>
```

- [ ] **Step 2: Create `apps/tizen/dev/index.html`**

```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>GO10 TV (Dev)</title>
  </head>
  <body>
    <script>
      // Replace with your dev machine's LAN IP. The TV must be able to reach
      // it, and both of these must already be running in apps/web (two
      // terminals):
      //   npx vite build --watch          (rebuilds dist/ on save, with
      //                                     build.target applied -- the raw
      //                                     `vite dev` server does NOT apply
      //                                     build.target, and its HMR client
      //                                     itself uses syntax Chromium 69
      //                                     can't parse, so it blank-screens
      //                                     this TV)
      //   npx vite preview --host         (serves dist/ on the LAN; --host
      //                                     is required, it doesn't listen
      //                                     on the LAN otherwise)
      // There's no HMR this way -- reload the TV app after each rebuild.
      window.location.replace('http://192.168.1.100:4173')
    </script>
  </body>
</html>
```

- [ ] **Step 3: Copy the app icon**

```bash
cp apps/mobile/assets/images/icon.png apps/tizen/dev/icon.png
```

- [ ] **Step 4: Create `apps/tizen/scripts/install-dev.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Packages and installs the dev-shell Tizen app, which just loads the LAN
# Vite dev server -- run this once (or whenever apps/tizen/dev/ itself
# changes, not per apps/web code change). Requires Tizen Studio's CLI tools
# (tizen, sdb) on PATH, the "go10-tizen" security profile created (Task 7),
# and the TV already `sdb connect`-ed (Task 7).

cd "$(dirname "$0")/../dev"
rm -rf .buildResult
tizen build-web -- . -out .buildResult
tizen package -t wgt -s go10-tizen -- .buildResult
WGT=$(ls .buildResult/*.wgt | head -n1)
tizen install -n "$WGT"
```

- [ ] **Step 5: Make the script executable**

```bash
chmod +x apps/tizen/scripts/install-dev.sh
```

- [ ] **Step 6: Create `apps/tizen/.gitignore`**

```
dev/.buildResult/
prod/.buildResult/
prod/index.html
prod/assets/
prod/data/
```

- [ ] **Step 7: Validate the XML is well-formed**

Run: `python3 -c "import xml.dom.minidom as m; m.parse('apps/tizen/dev/config.xml')"`
Expected: no output, exit code 0 (a parse error would print a traceback and exit non-zero)

- [ ] **Step 8: Commit**

```bash
git add apps/tizen/dev apps/tizen/scripts/install-dev.sh apps/tizen/.gitignore
git commit -m "feat(tizen): scaffold the dev-shell Tizen packaging project"
```

---

### Task 6: Scaffold the prod-bundle Tizen packaging project

**Files:**
- Create: `apps/tizen/prod/config.xml`
- Create: `apps/tizen/prod/icon.png`
- Create: `apps/tizen/scripts/build-prod.sh`

**Interfaces:**
- Consumes: `apps/web`'s `npm run build` output (`apps/web/dist/`).

- [ ] **Step 1: Create `apps/tizen/prod/config.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets"
        xmlns:tizen="http://tizen.org/ns/widgets"
        id="http://go10.tv/GO10TV"
        version="1.0.0"
        viewmodes="maximized">
    <!-- PKGID12345 is the same placeholder as apps/tizen/dev/config.xml --
         replace both occurrences with your real package id (Task 7). -->
    <tizen:application id="PKGID12345.GO10TV" package="PKGID12345" required_version="5.5"/>
    <name>GO10 TV</name>
    <icon src="icon.png"/>
    <content src="index.html"/>
    <feature name="http://tizen.org/feature/screen.size.all"/>
    <tizen:privilege name="http://tizen.org/privilege/internet"/>
    <tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>
    <!-- Without this, Tizen's WARP security model blocks fetch/XHR to
         external origins: catalog data, TMDB, the ok.ru/vidlove iframes,
         Google Fonts. A wildcard is fine for a sideload-only app that never
         goes through store review. -->
    <access origin="*" subdomains="true"/>
    <tizen:setting screen-orientation="landscape" context-menu="disable" background-support="disable" encryption="disable" install-location="auto" hwkey-event="enable"/>
    <tizen:profile name="tv-samsung"/>
</widget>
```

- [ ] **Step 2: Copy the app icon**

```bash
cp apps/mobile/assets/images/icon.png apps/tizen/prod/icon.png
```

- [ ] **Step 3: Create `apps/tizen/scripts/build-prod.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Builds apps/web for production, stages the output into
# apps/tizen/prod/ (alongside its config.xml and icon.png), packages it as a
# Tizen wgt, and installs it to the connected TV -- for periodic full-
# fidelity, fully local/offline checks. Requires Tizen Studio's CLI tools
# (tizen, sdb) on PATH, the "go10-tizen" security profile created (Task 7),
# and the TV already `sdb connect`-ed (Task 7).

cd "$(dirname "$0")/../../.."

# --base ./ (not the default "/"): a Tizen web app is served from a
# file:// origin, where an absolute "/assets/..." path resolves to the
# filesystem root instead of the app's own directory. This overrides only
# this build, not apps/web's default (Netlify) build.
cd apps/web
npx tsc -b
npx vite build --base ./
cd ../..

cd apps/tizen/prod
rm -rf index.html assets data .buildResult
cp -r ../../web/dist/. .

tizen build-web -- . -out .buildResult
tizen package -t wgt -s go10-tizen -- .buildResult
WGT=$(ls .buildResult/*.wgt | head -n1)
tizen install -n "$WGT"
```

- [ ] **Step 4: Make the script executable**

```bash
chmod +x apps/tizen/scripts/build-prod.sh
```

- [ ] **Step 5: Validate the XML is well-formed**

Run: `python3 -c "import xml.dom.minidom as m; m.parse('apps/tizen/prod/config.xml')"`
Expected: no output, exit code 0

- [ ] **Step 6: Commit**

```bash
git add apps/tizen/prod/config.xml apps/tizen/prod/icon.png apps/tizen/scripts/build-prod.sh
git commit -m "feat(tizen): scaffold the prod-bundle Tizen packaging project"
```

---

### Task 7 (manual, human-performed): Install Tizen Studio and pair the TV

No code in this task — it's interactive setup on your machine and your TV's remote, which nothing in this session can do for you. Come back to this plan once it's done.

- [ ] **Step 1: Put the TV into Developer Mode**

On the TV: open the **Apps** screen, then type `12345` (on-screen number pad or a connected keyboard). A hidden **Developer mode** menu appears — toggle it on, enter your dev machine's IP address, and restart the TV.

- [ ] **Step 2: Install Tizen Studio**

Download and install Tizen Studio (with the **TV Extension** package) from Samsung's developer site onto this dev machine.

- [ ] **Step 3: Create an author certificate/profile**

In Tizen Studio's **Certificate Manager**, create a new author certificate and a security profile named `go10-tizen` (matching the `-s go10-tizen` used by both scripts in Tasks 5/6). This is free and self-issued — no Samsung approval needed for sideloading. Note the **10-character package id** it assigns; you'll need it for Step 4.

- [ ] **Step 4: Fill in the real package id**

Replace every occurrence of `PKGID12345` with that package id in:
- `apps/tizen/dev/config.xml`
- `apps/tizen/prod/config.xml`

- [ ] **Step 5: Connect to the TV**

With Tizen Studio's CLI tools on `PATH` and the TV on the same LAN:

```bash
sdb connect <TV_IP>:26101
```

---

### Task 8 (manual, human-performed): Sideload and validate

No code in this task beyond filling in one placeholder — this is the hardware validation the whole plan builds toward. Work through it in order; a failure partway through points back at a specific earlier task.

- [ ] **Step 1: Fill in your dev machine's LAN IP**

In `apps/tizen/dev/index.html`, replace `192.168.1.100` with your dev machine's actual LAN IP (the same one the TV must reach).

- [ ] **Step 2: Start the watch build and preview server**

The raw `vite dev` server doesn't apply `build.target`, and its own HMR client uses syntax Chromium 69 can't parse either — both blank-screen this TV. Use the built, lowered output instead, in two terminals:

```bash
cd apps/web && npx vite build --watch
```

```bash
cd apps/web && npx vite preview --host
```

Leave both running. There's no HMR this way — reload the TV app after each rebuild.

- [ ] **Step 3: Install the dev shell**

```bash
./apps/tizen/scripts/install-dev.sh
```

Launch **GO10 TV (Dev)** from the TV's app list.

- [ ] **Step 4: Work through the validation checklist**

In order, on the TV:

1. The app launches at all. *A blank screen here means Task 1's build-target fix didn't fully resolve — check the browser console via Tizen Studio's Web Inspector for a syntax error.*
2. D-pad navigation visibly moves focus between cards/rows.
3. OK/Enter activates the focused item.
4. Back navigates back through screens, and **exits the app from Home**. *No response here means the `tv.inputdevice` privilege or the `registerKey('Back')` call (Task 3/5) isn't wired correctly — check Web Inspector for a `WebAPIException`.*
5. ok.ru and vidlove iframe playback works, with audio.
6. Card/row spacing looks correct (not touching/overlapping). *If it doesn't, revisit Task 2's fallback values against what's actually rendering.*

- [ ] **Step 5: Periodically, validate the full-fidelity prod build**

```bash
./apps/tizen/scripts/build-prod.sh
```

Launch **GO10 TV** (not "(Dev)") from the TV's app list and re-run the same checklist. This is what confirms the dev-shell loop's fidelity gap (a `.wgt` pointing at a remote URL runs under different Tizen network/security policy than a fully local one) hasn't hidden anything.
