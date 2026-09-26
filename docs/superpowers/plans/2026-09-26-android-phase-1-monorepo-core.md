# Android Phase 1 — Monorepo + Shared Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the repo into npm workspaces, with today's web app at `apps/web` and its platform-free logic in `packages/core` (`@go10/core`) behind small ports. The web app must behave exactly as before, and the site must additionally publish `/data/collections/index.json` for the mobile app.

**Architecture:** First a pure move (`git mv` into `apps/web`, workspace root, fixed symlinks and script paths), proven by the unchanged test suite and build. Then the pure modules move again into `packages/core`, keeping their relative layout so their internal imports survive untouched, and a one-off script rewrites the web app's imports to `@go10/core/<path>`. Finally, the three modules that touched `localStorage` or `import.meta.env` switch to injected ports (`KeyValueStore`, the external-config source), and the web app installs its adapters at startup.

**Tech Stack:** npm workspaces, TypeScript 6, Vite 8, Vitest 5 (jsdom), React 19 (web only), papaparse, Python 3 + pytest (the unchanged data pipeline).

**Spec:** `docs/superpowers/specs/2026-09-26-android-app-design.md` (sections *Architecture → Repo layout / Ports / Stays platform-specific / Collections published as JSON*, *Testing*, *Phases → 1*)

## Global Constraints

- **The web app's behaviour doesn't change.** Same routes, same storage keys (`go10:progress:*`, `go10:tmdb-title:*`, `go10:catalog:v1`), same env variables (`VITE_EXTERNAL_TITLES`, `VITE_TMDB_TOKEN`), same served URLs (`/data/catalog.csv`, `/data/aniyomi/…`, `/assets/…`, `/catalogo_files/…`).
- **Test gate.** The spec says "288 JS + 43 Python". The real baseline on `main` today is **398 JS tests in 45 files (one of them stale and failing) and 91 Python tests**. After Task 1 the gate is 398/398 JS + 91/91 Python. Every later task keeps every one of those tests passing, and new tests only add to the count. Task 8 corrects the spec's numbers.
- **Package names:** `@go10/core` (`packages/core`) and `@go10/web` (`apps/web`). Core is consumed as TypeScript source, with no build step. Its `package.json` `exports` maps `"./*"` to `"./src/*.ts"`, so imports look like `@go10/core/catalog/rowKey`.
- **Core is platform-free:** no `localStorage`/`sessionStorage`/`window.`/`document.`/`navigator.`, no `import.meta.env`/`import.meta.glob`, no React. Task 5 adds a test that enforces this. `fetch`, `URL`, `AbortSignal` and `console` are allowed; React Native has them too.
- **Ports in this phase:** `KeyValueStore` (sync `getItem`/`setItem`/`removeItem`/`keys`) and the external-config source. `imageSrc` takes a base URL. **`CatalogSource` is deliberately not built here.** Its only consumer is the mobile loader, which is written in Phase 2. The web app keeps its current `useCatalog` fetch.
- **What stays in the web app:** React components, CSS, `focus/*`, `router/useRoute.ts`, `catalog/useCatalog.ts`, `catalog/catalogCache.ts`, `external/useTmdbSearch.ts`, `external/useTmdbTitle.ts`, `screens/*.tsx`, `screens/useGridColumns.ts`, and `collections/collections.ts` (the `import.meta.glob`).
- **The Python pipeline stays at the root.** Only its output paths change, from `public/data/…` to `apps/web/public/data/…`.
- **No push and no deploy without asking.** Task 8 asks the user to deploy and then checks the live URLs.
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

1. **Two copies of a core module.** If the web app and core ever resolve `@go10/core/progress/progressStore` to different module instances, `installWebPlatform()` configures one while the app writes progress to the other's in-memory default, and **watch progress silently stops persisting**. Pinned by `apps/web/src/platform.test.ts` (Task 5): after installing the platform, progress written through core lands in `localStorage`.
2. **`localStorage` that throws on access** (blocked site data, some private modes). It must never crash startup or playback. Today every access is inside a `try`. Pinned by the `webStorageStore` getter design and by the "storage that throws" test in `progressStore.test.ts` (Task 5).
3. **Running the Python scripts after the move** must write where the web app now serves from, not recreate a stale root `public/`. Pinned by `tests/test_paths.py` (Task 2).
4. **A malformed collection JSON** must fail the build and name the file, not publish a broken or partial `index.json`. Pinned by `buildCollectionsIndex` tests (Task 7).
5. **The deployed site losing files after the move** (broken `public/` symlinks → no thumbnails or artwork; a moved CSV → empty catalog; a missing Aniyomi feed → breaks the installed Aniyomi extension). Checked by the `dist/` listing in Tasks 2 and 7, and by the live `curl` checks in Task 8.

---

### Task 1: Fix the stale Collection banner test

Commit `5f2b2c5` ("style: remove background color and border of header in Collection page") deliberately dropped the banner's tile colour, but `src/screens/Collection.test.tsx` still expects it. So the suite is red on `main` before any work starts.

**Files:**
- Modify: `src/screens/Collection.test.tsx:54-59`

**Interfaces:**
- Consumes: nothing.
- Produces: a fully green baseline (398/398).

- [ ] **Step 1: Confirm the failure**

Run: `npx vitest run src/screens/Collection.test.tsx`
Expected: FAIL on `shows a banner in the tile colour with the logo` (`expected '' to be 'rgb(228, 0, 124)'`).

- [ ] **Step 2: Update the test to the intended design**

Replace the test at lines 54-59 with:
```tsx
  it('shows a banner with the logo and no tile colour behind it', () => {
    renderPage()
    const banner = document.querySelector('.go-collection_banner') as HTMLElement
    expect(banner.style.backgroundColor).toBe('')
    expect(banner.querySelector('img')?.getAttribute('src')).toBe('/assets/collections/cartoon-network/logo.svg')
  })
```

- [ ] **Step 3: Run the whole suite**

Run: `npx vitest run 2>&1 | tail -4`
Expected: `Tests  398 passed (398)`, `Test Files  45 passed (45)`.

- [ ] **Step 4: Commit**

```bash
git add src/screens/Collection.test.tsx
git commit -m "test: match the Collection banner to its colourless design

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Move the web app into `apps/web` under npm workspaces

**Files:**
- Move (git mv): `src/`, `index.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `public/` → `apps/web/`
- Create: `apps/web/package.json`
- Modify: `package.json` (becomes the workspace root), `package-lock.json` (regenerated)
- Modify: `apps/web/public/assets`, `apps/web/public/catalogo_files` (symlink targets)
- Modify: `apps/web/src/collections/collections.ts` (glob path)
- Modify: `apps/web/src/collections/collections.data.test.ts` (path independent of cwd)
- Modify: `scripts/parse_catalog.py:1,19`, `scripts/build_aniyomi_feed.py:1,16-17`, `scripts/detect_chapters.py:27`
- Modify: `netlify.toml`
- Create: `tests/test_paths.py`

**Interfaces:**
- Consumes: the green baseline from Task 1.
- Produces: the root scripts `npm test` (runs every workspace), `npm run build` (the web build), `npm run dev`; `apps/web` as package `@go10/web`; web output in `apps/web/dist`; the catalog at `apps/web/public/data/catalog.csv`.

- [ ] **Step 1: Write the failing path test (Python)**

Create `tests/test_paths.py`:
```python
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

import build_aniyomi_feed
import detect_chapters
import parse_catalog

WEB_PUBLIC = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "apps", "web", "public"))


def test_catalog_outputs_live_in_the_web_app():
    """The scripts must write where the web app serves from (apps/web/public), not a stale root public/."""
    for path in (parse_catalog.OUTPUT_CSV, build_aniyomi_feed.CATALOG_CSV, detect_chapters.OUTPUT_CSV):
        assert os.path.normpath(path) == os.path.join(WEB_PUBLIC, "data", "catalog.csv")
        assert os.path.isfile(path), path
    assert os.path.normpath(build_aniyomi_feed.OUTPUT_DIR) == os.path.join(WEB_PUBLIC, "data", "aniyomi")
    assert os.path.isdir(build_aniyomi_feed.OUTPUT_DIR)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python3 -m pytest tests/test_paths.py -q`
Expected: FAIL (the paths still point at the root `public/`).

- [ ] **Step 3: Move the web app**

```bash
mkdir -p apps/web
rm -rf dist   # stale, gitignored build output from before the move
git mv src index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json public apps/web/
# The public/ symlinks were relative to the old location; repoint them at the root folders.
ln -sfn ../../../assets apps/web/public/assets
ln -sfn ../../../catalogo_files apps/web/public/catalogo_files
ls apps/web/public/assets/collections >/dev/null && ls apps/web/public/catalogo_files | head -1
```
Expected: the last command prints one `.webp` name. Both symlinks resolve.

- [ ] **Step 4: Split `package.json` into a workspace root and the web package**

Create `apps/web/package.json`. It takes over the root's current scripts and dependencies; the shared test tooling moves to the root:
```json
{
  "name": "@go10/web",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc -b"
  },
  "dependencies": {
    "papaparse": "^5.7.0",
    "react": "^19.2.8",
    "react-dom": "^19.2.8"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^7.0.1",
    "@testing-library/react": "^16.3.3",
    "@types/papaparse": "^5.5.2",
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.7",
    "@vitejs/plugin-react": "^6.1.1",
    "vite": "^8.3.0"
  }
}
```
Replace the root `package.json` with:
```json
{
  "name": "go10-tv",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "workspaces": ["packages/*", "apps/web"],
  "scripts": {
    "dev": "npm run dev -w @go10/web",
    "build": "npm run build -w @go10/web",
    "test": "npm run test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present"
  },
  "devDependencies": {
    "@types/node": "^24.13.3",
    "jsdom": "^29.1.1",
    "typescript": "~6.0.2",
    "vitest": "^5.0.1"
  }
}
```
`apps/mobile` isn't listed in the workspaces yet. Phase 2 adds it, since Expo's Metro setup for a monorepo is a Phase 2 concern.

Then reinstall:
```bash
rm -rf node_modules package-lock.json
npm install > /tmp/npm-install.log 2>&1; echo exit=$?; tail -3 /tmp/npm-install.log
```
Expected: `exit=0`. If it fails with a network error, rerun it with the sandbox disabled.

- [ ] **Step 5: Fix the two paths inside the web app**

In `apps/web/src/collections/collections.ts`, the glob now needs two more `../`:
```ts
const loaded = fromModules(
  import.meta.glob<unknown>('../../../../data/collections/*.json', { eager: true, import: 'default' }),
)
```
In `apps/web/src/collections/collections.data.test.ts`, replace `const PUBLIC = join(process.cwd(), 'public')` with a path that doesn't depend on the working directory, and add the import:
```ts
import { fileURLToPath } from 'node:url'
```
```ts
// Relative to this file, so the suite passes from the repo root or apps/web.
const PUBLIC = fileURLToPath(new URL('../../public', import.meta.url))
```

- [ ] **Step 6: Point the Python scripts at the web app's `public/`**

`scripts/parse_catalog.py`:
```python
"""Turn the scraped ok.ru catalog HTML into apps/web/public/data/catalog.csv.
```
```python
OUTPUT_CSV = os.path.join(ROOT, "apps", "web", "public", "data", "catalog.csv")
```
`scripts/build_aniyomi_feed.py`:
```python
"""Build the Aniyomi extension feed (apps/web/public/data/aniyomi/) from apps/web/public/data/catalog.csv.
```
```python
CATALOG_CSV = os.path.join(ROOT, "apps", "web", "public", "data", "catalog.csv")
OUTPUT_DIR = os.path.join(ROOT, "apps", "web", "public", "data", "aniyomi")
```
`scripts/detect_chapters.py`:
```python
OUTPUT_CSV = os.path.join(ROOT, "apps", "web", "public", "data", "catalog.csv")
```
Only change the first line of each module docstring shown above; leave the rest of the docstring as it is.

- [ ] **Step 7: Point Netlify at the workspace build**

`netlify.toml`:
```toml
[build]
  command = "npm run build"
  publish = "apps/web/dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

- [ ] **Step 8: Run every test**

Run:
```bash
python3 -m pytest tests/ -q 2>&1 | tail -2
npm test 2>&1 | grep -E "Test Files|Tests "
```
Expected: `92 passed` (91 + the new path test), and `Tests  398 passed (398)` / `Test Files  45 passed (45)`.

- [ ] **Step 9: Build and check that the output serves the same files**

Run:
```bash
npm run build > /tmp/build.log 2>&1; echo exit=$?; tail -3 /tmp/build.log
D=apps/web/dist
ls $D/index.html $D/data/catalog.csv $D/data/aniyomi/index.json
ls $D/assets/collections | head -3; ls $D/catalogo_files | head -1
cmp $D/data/catalog.csv apps/web/public/data/catalog.csv && echo csv-identical
test ! -e public && test ! -e dist && echo no-stale-root-output
```
Expected: `exit=0`, every `ls` succeeds, then `csv-identical` and `no-stale-root-output`.

- [ ] **Step 10: Commit**

```bash
git add -A
git status --short | head -20   # expect only renames under apps/web, package files, scripts, netlify.toml, tests/test_paths.py
git commit -m "build: move the web app to apps/web under npm workspaces

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `packages/core` scaffold and the `KeyValueStore` port

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`
- Create: `packages/core/src/ports/keyValueStore.ts`
- Test: `packages/core/src/ports/keyValueStore.test.ts`

**Interfaces:**
- Consumes: the workspace root from Task 2 (`packages/*` is already listed in the workspaces).
- Produces (`@go10/core/ports/keyValueStore`):
  - `interface KeyValueStore { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; keys(): string[] }`
  - `interface StorageLike { readonly length: number; key(index: number): string | null; getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }`
  - `memoryStore(): KeyValueStore`
  - `webStorageStore(getStorage: () => StorageLike): KeyValueStore`
  - `setKeyValueStore(store: KeyValueStore): void`
  - `keyValueStore(): KeyValueStore`

- [ ] **Step 1: Create the package**

`packages/core/package.json`:
```json
{
  "name": "@go10/core",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "exports": { "./*": "./src/*.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "papaparse": "^5.7.0"
  },
  "devDependencies": {
    "@types/papaparse": "^5.5.2"
  }
}
```
`packages/core/tsconfig.json` uses the web app's compiler flags. `vite/client` is only there for the test setup's `import.meta.env`; the Task 5 guard test keeps it out of source files.
```json
{
  "compilerOptions": {
    "target": "es2023",
    "lib": ["ES2023", "DOM"],
    "module": "esnext",
    "types": ["vite/client", "node"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```
`packages/core/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // jsdom only so tests can exercise the web adapter against a real localStorage.
    environment: 'jsdom',
    globals: true,
    // External titles are off for the suite; tests that need them stub these.
    env: { VITE_EXTERNAL_TITLES: 'off', VITE_TMDB_TOKEN: '' },
  },
})
```
Then run `npm install` so the workspace links `@go10/core`.

- [ ] **Step 2: Write the failing tests**

`packages/core/src/ports/keyValueStore.test.ts`:
```ts
import { afterEach, describe, expect, it } from 'vitest'
import { keyValueStore, memoryStore, setKeyValueStore, webStorageStore } from './keyValueStore'

afterEach(() => localStorage.clear())

describe('memoryStore', () => {
  it('stores, lists and removes values', () => {
    const store = memoryStore()
    store.setItem('a', '1')
    store.setItem('b', '2')
    expect(store.getItem('a')).toBe('1')
    expect(store.getItem('missing')).toBeNull()
    expect(store.keys().sort()).toEqual(['a', 'b'])
    store.removeItem('a')
    expect(store.keys()).toEqual(['b'])
  })

  it('lists keys as a snapshot, so removing while iterating is safe', () => {
    const store = memoryStore()
    for (const key of ['a', 'b', 'c']) store.setItem(key, key)
    for (const key of store.keys()) store.removeItem(key)
    expect(store.keys()).toEqual([])
  })
})

describe('webStorageStore', () => {
  it('delegates to the Web Storage it is given', () => {
    const store = webStorageStore(() => localStorage)
    store.setItem('k', 'v')
    expect(localStorage.getItem('k')).toBe('v')
    expect(store.getItem('k')).toBe('v')
    expect(store.keys()).toEqual(['k'])
    store.removeItem('k')
    expect(localStorage.getItem('k')).toBeNull()
  })

  it('lists keys as a snapshot, so removing while iterating is safe', () => {
    const store = webStorageStore(() => localStorage)
    for (const key of ['a', 'b', 'c']) store.setItem(key, key)
    for (const key of store.keys()) store.removeItem(key)
    expect(localStorage.length).toBe(0)
  })

  it('reaches for the storage on every call, so a storage that throws on access throws where callers catch', () => {
    const store = webStorageStore(() => {
      throw new Error('SecurityError')
    })
    expect(() => store.getItem('k')).toThrow('SecurityError')
    expect(() => store.setItem('k', 'v')).toThrow('SecurityError')
    expect(() => store.keys()).toThrow('SecurityError')
  })
})

describe('keyValueStore', () => {
  it('is the store last installed', () => {
    const previous = keyValueStore()
    const installed = memoryStore()
    setKeyValueStore(installed)
    expect(keyValueStore()).toBe(installed)
    setKeyValueStore(previous)
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npm test -w @go10/core`
Expected: FAIL, `Failed to resolve import "./keyValueStore"`.

- [ ] **Step 4: Implement the port**

`packages/core/src/ports/keyValueStore.ts`:
```ts
/**
 * Where core keeps small persistent values (watch progress, TMDB snapshots).
 * Synchronous on purpose, so the code using it stays synchronous: the web
 * app backs it with localStorage, the mobile app with MMKV. Any method may
 * throw (storage disabled, quota exceeded); callers treat storage as
 * best-effort and catch.
 */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  /** Every key, as a snapshot: removing items while iterating it is safe. */
  keys(): string[]
}

/** The part of the Web Storage API the web adapter uses. */
export interface StorageLike {
  readonly length: number
  key(index: number): string | null
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function memoryStore(): KeyValueStore {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: (key) => {
      values.delete(key)
    },
    keys: () => [...values.keys()],
  }
}

/**
 * `getStorage` runs on every call rather than once: merely touching
 * `localStorage` can throw (blocked site data), and that has to surface
 * inside the caller's try/catch, never at startup.
 */
export function webStorageStore(getStorage: () => StorageLike): KeyValueStore {
  return {
    getItem: (key) => getStorage().getItem(key),
    setItem: (key, value) => getStorage().setItem(key, value),
    removeItem: (key) => getStorage().removeItem(key),
    keys: () => {
      const storage = getStorage()
      const keys: string[] = []
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (key !== null) keys.push(key)
      }
      return keys
    },
  }
}

// Until an app installs its store, values live in memory for the session.
let current: KeyValueStore = memoryStore()

export function setKeyValueStore(store: KeyValueStore): void {
  current = store
}

export function keyValueStore(): KeyValueStore {
  return current
}
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npm test -w @go10/core && npm run typecheck -w @go10/core`
Expected: `Tests  6 passed (6)`, and the typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/core package.json package-lock.json
git commit -m "feat(core): add the @go10/core package and its KeyValueStore port

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Move the pure modules into core and rewrite the web imports

This is a move, not a rewrite. Files keep their relative layout inside `packages/core/src`, except that the player logic under `screens/` goes to `player/`. Every relative import between moved files still points at the same neighbour. Behaviour is unchanged; the existing tests are the proof.

**Files:**
- Move to `packages/core/src/` (each with its `.test.ts` where one exists):
  - `types.ts`
  - `catalog/{buildRows,loadCatalog,rowKey,selectTitles}.ts`
  - `collections/{resolveCollection,types,validateCollection}.ts`
  - `progress/{describe,progressStore,titleProgress}.ts`
  - `router/{route,resolveRoute}.ts` (and `route.external.test.ts`)
  - `search/search.ts`
  - `external/{config,mergeSearch,snapshots,testing}.ts`, `external/tmdb/{client,keys,map,search,title}.ts`
  - `lib/{format,imageSrc}.ts`
  - `screens/{embedSrc,groupSeasons,nextEpisode,playerRetry}.ts` → `player/`
  - `screens/providers/*` → `player/providers/`
- Create: `packages/core/src/collections/fromModules.ts` (split out of the web's `collections.ts`); `collections/collections.test.ts` moves to `packages/core/src/collections/fromModules.test.ts`
- Modify: `packages/core/src/external/mergeSearch.ts` (owns `TmdbSearchState`); `apps/web/src/external/useTmdbSearch.ts` (imports it from core)
- Modify: `apps/web/src/collections/collections.ts`; `apps/web/package.json` (depends on `@go10/core`)
- Modify: every `apps/web/src/**` file that imports a moved module (done by the script in Step 3)

**Interfaces:**
- Consumes: `@go10/core` package (Task 3).
- Produces: every moved module at `@go10/core/<new path>` with unchanged exports, plus `@go10/core/collections/fromModules` → `fromModules(modules: Record<string, unknown>): { files: CollectionFile[]; collections: Collection[] }`, and `TmdbSearchState` exported from `@go10/core/external/mergeSearch`.

- [ ] **Step 1: Move the files**

```bash
W=apps/web/src C=packages/core/src
mkdir -p $C/{catalog,collections,progress,router,search,external/tmdb,lib,player/providers}
git mv $W/types.ts $C/types.ts
for f in buildRows loadCatalog rowKey selectTitles; do git mv $W/catalog/$f.ts $C/catalog/; git mv $W/catalog/$f.test.ts $C/catalog/; done
for f in resolveCollection validateCollection; do git mv $W/collections/$f.ts $C/collections/; git mv $W/collections/$f.test.ts $C/collections/; done
git mv $W/collections/types.ts $C/collections/types.ts
git mv $W/collections/collections.test.ts $C/collections/fromModules.test.ts
git mv $W/progress/describe.ts $C/progress/
for f in progressStore titleProgress; do git mv $W/progress/$f.ts $C/progress/; git mv $W/progress/$f.test.ts $C/progress/; done
for f in route resolveRoute; do git mv $W/router/$f.ts $C/router/; git mv $W/router/$f.test.ts $C/router/; done
git mv $W/router/route.external.test.ts $C/router/
git mv $W/search/search.ts $W/search/search.test.ts $C/search/
for f in config mergeSearch snapshots; do git mv $W/external/$f.ts $C/external/; git mv $W/external/$f.test.ts $C/external/; done
git mv $W/external/testing.ts $C/external/testing.ts
git mv $W/external/tmdb/* $C/external/tmdb/
for f in format imageSrc; do git mv $W/lib/$f.ts $C/lib/; git mv $W/lib/$f.test.ts $C/lib/; done
for f in embedSrc groupSeasons nextEpisode playerRetry; do git mv $W/screens/$f.ts $C/player/; git mv $W/screens/$f.test.ts $C/player/; done
git mv $W/screens/providers/* $C/player/providers/
find $C -name '*.test.ts' | wc -l
```
Expected: `26` test files in core.

- [ ] **Step 2: Split `fromModules` out of the web's `collections.ts`, and give `TmdbSearchState` a core home**

Create `packages/core/src/collections/fromModules.ts`, holding the function exactly as it is today:
```ts
import type { Collection, CollectionFile } from './types'
import { validateCollection } from './validateCollection'

/**
 * Split out from the glob so it can be tested with fixtures. A structurally
 * malformed file is left out of `collections` (with a warning) so one bad
 * hand edit can't crash Home; `files` keeps it for `collections.data.test.ts`,
 * which validates everything, including keys and assets.
 */
export function fromModules(modules: Record<string, unknown>): {
  files: CollectionFile[]
  collections: Collection[]
} {
  const files = Object.entries(modules)
    .map(([path, raw]) => ({ fileName: path.slice(path.lastIndexOf('/') + 1), raw }))
    .sort((a, b) => a.fileName.localeCompare(b.fileName))
  const collections = files
    .filter((file) => {
      const errors = validateCollection(file, {})
      if (errors.length > 0) console.warn(`Skipping collection: ${errors.join('; ')}`)
      return errors.length === 0
    })
    .map((file) => file.raw as Collection)
    .sort((a, b) => a.order - b.order)
  return { files, collections }
}
```
In `packages/core/src/collections/fromModules.test.ts`, change `import { fromModules } from './collections'` to `import { fromModules } from './fromModules'`.

Replace `apps/web/src/collections/collections.ts` with:
```ts
import { fromModules } from '@go10/core/collections/fromModules'

const loaded = fromModules(
  import.meta.glob<unknown>('../../../../data/collections/*.json', { eager: true, import: 'default' }),
)

/** Every collection file as written, for validation. */
export const COLLECTION_FILES = loaded.files

/** Every collection, in Home tile order. */
export const COLLECTIONS = loaded.collections
```

In `packages/core/src/external/mergeSearch.ts`, delete `import type { TmdbSearchState } from './useTmdbSearch'` and declare it there, copied from `useTmdbSearch.ts`:
```ts
export interface TmdbSearchState {
  status: 'off' | 'pending' | 'done' | 'failed'
  titles: Title[]
}
```
In `packages/core/src/external/mergeSearch.test.ts`, change `import type { TmdbSearchState } from './useTmdbSearch'` to `import type { TmdbSearchState } from './mergeSearch'`.
In `apps/web/src/external/useTmdbSearch.ts`, delete its `interface TmdbSearchState { … }` block, and add the following below its imports. The `export type` keeps the other web files that import it from here working.
```ts
import type { TmdbSearchState } from '@go10/core/external/mergeSearch'
export type { TmdbSearchState }
```

Add the dependency to `apps/web/package.json` `dependencies`: `"@go10/core": "*"`. Then run `npm install`.

- [ ] **Step 3: Rewrite the web imports with a one-off script**

Save this as `/tmp/rewrite-imports.mjs`. It's not committed.
```js
// Rewrites relative imports in apps/web/src that point at files now in packages/core/src.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const WEB = resolve('apps/web/src')
const CORE = resolve('packages/core/src')
// Old location (relative to apps/web/src, no extension) → new location in core.
const moved = (old) => (old.startsWith('screens/') ? 'player/' + old.slice('screens/'.length) : old)

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : []
  })
}

function coreTarget(fromFile, spec) {
  const old = relative(WEB, resolve(dirname(fromFile), spec)).replaceAll('\\', '/')
  if (old.startsWith('..')) return null
  const target = moved(old)
  for (const candidate of [target, `${target}/index`]) {
    if (existsSync(join(CORE, `${candidate}.ts`))) return `@go10/core/${candidate}`
  }
  return null
}

const PATTERN = /((?:from|import)\s*\(?\s*)(['"])(\.{1,2}\/[^'"]+)\2/g
let changed = 0
for (const file of files(WEB)) {
  const text = readFileSync(file, 'utf8')
  const next = text.replace(PATTERN, (match, lead, quote, spec) => {
    const target = coreTarget(file, spec)
    return target ? `${lead}${quote}${target}${quote}` : match
  })
  if (next !== text) {
    writeFileSync(file, next)
    changed++
  }
}
console.log(`rewrote imports in ${changed} files`)
```
Run: `node /tmp/rewrite-imports.mjs && grep -rn "@go10/core" apps/web/src | wc -l`
Expected: `rewrote imports in N files` with N > 20, and a non-zero count of `@go10/core` imports.

- [ ] **Step 4: Check that no import still points at a file that moved**

Run: `npm run typecheck`
Expected: exits 0 for both workspaces. A `Cannot find module './…'` error names an import the script missed, most likely a non-standard form. Fix it by hand to `@go10/core/<path>` and rerun.

- [ ] **Step 5: Run every test**

Run: `npm test 2>&1 | grep -E "Test Files|Tests "`
Expected, per workspace: core `Test Files  27 passed (27)` (the 26 moved + `keyValueStore`) and web `Test Files  19 passed (19)`. Tests total **404** = 398 + 6 from Task 3. Nothing fails.
Also run: `npm run build > /tmp/build.log 2>&1; echo exit=$?`
Expected: `exit=0`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: move platform-free logic into @go10/core

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Put storage and env behind ports; the web app installs its adapters

**Files:**
- Modify: `packages/core/src/progress/progressStore.ts`, `packages/core/src/external/snapshots.ts`, `packages/core/src/external/config.ts`
- Create: `packages/core/src/test/platform.ts`, `packages/core/src/test/setup.ts`
- Modify: `packages/core/vitest.config.ts` (`setupFiles`)
- Create: `apps/web/src/platform.ts`
- Modify: `apps/web/src/main.tsx`, `apps/web/src/test/setup.ts`
- Test: `packages/core/src/progress/progressStore.test.ts` (add), `packages/core/src/external/snapshots.test.ts` (add), `packages/core/src/external/config.test.ts` (add), `packages/core/src/noPlatformGlobals.test.ts` (new), `apps/web/src/platform.test.ts` (new)

**Interfaces:**
- Consumes: `KeyValueStore`, `memoryStore`, `webStorageStore`, `setKeyValueStore`, `keyValueStore` (Task 3).
- Produces:
  - `@go10/core/external/config`: `interface ExternalConfigValues { externalTitles: string | undefined; tmdbToken: string | undefined }`, `setExternalConfigSource(source: () => ExternalConfigValues): void`, and unchanged `externalTitlesEnabled(): boolean`, `tmdbToken(): string`.
  - `@go10/core/test/platform`: `installTestPlatform(): void` (core tests only).
  - `apps/web/src/platform.ts`: `installWebPlatform(): void`.

- [ ] **Step 1: Write the failing tests**

Add to the end of `packages/core/src/progress/progressStore.test.ts`, and add the imports `keyValueStore, memoryStore, setKeyValueStore, webStorageStore` from `'../ports/keyValueStore'`:
```ts
describe('through the installed KeyValueStore', () => {
  it('reads and writes the store the app installed, not localStorage directly', () => {
    const previous = keyValueStore()
    const store = memoryStore()
    setKeyValueStore(store)
    try {
      writeProgress('v-port', { time: 100, duration: 1000 })
      expect(store.getItem('go10:progress:v-port')).not.toBeNull()
      expect(localStorage.getItem('go10:progress:v-port')).toBeNull()
      expect(readProgress('v-port')?.time).toBe(100)
      expect(Object.keys(listProgress())).toEqual(['v-port'])
    } finally {
      setKeyValueStore(previous)
    }
  })

  it('never throws when the storage itself throws on access', () => {
    const previous = keyValueStore()
    setKeyValueStore(webStorageStore(() => {
      throw new Error('SecurityError')
    }))
    try {
      expect(readProgress('v')).toBeNull()
      expect(() => writeProgress('v', { time: 100, duration: 1000 })).not.toThrow()
      expect(() => markWatched('v', 1000)).not.toThrow()
      expect(listProgress()).toEqual({})
    } finally {
      setKeyValueStore(previous)
    }
  })
})
```
If `markWatched` or `listProgress` isn't already in that file's import from `'./progressStore'`, add it.

Add to the end of `packages/core/src/external/snapshots.test.ts`, with the same `ports/keyValueStore` imports (`'../ports/keyValueStore'`):
```ts
describe('through the installed KeyValueStore', () => {
  it('saves and lists snapshots in the store the app installed', () => {
    const previous = keyValueStore()
    const store = memoryStore()
    setKeyValueStore(store)
    try {
      const title = mapMovie({ id: 155, title: 'The Dark Knight', release_date: '2008-07-16', runtime: 152 } as never)
      saveSnapshot(title)
      expect(store.keys()).toEqual([`go10:tmdb-title:${title.key}`])
      expect(readSnapshot(title.key)?.key).toBe(title.key)
      expect(listSnapshots().map((t) => t.key)).toEqual([title.key])
    } finally {
      setKeyValueStore(previous)
    }
  })
})
```
If that file already builds its fixture titles with a local helper, use that helper instead of the inline `mapMovie` call.

Add to `packages/core/src/external/config.test.ts`, importing `setExternalConfigSource` from `'./config'` and `installTestPlatform` from `'../test/platform'`:
```ts
describe('setExternalConfigSource', () => {
  it('reads the switch and token from the installed source on every call', () => {
    let token = 'first'
    setExternalConfigSource(() => ({ externalTitles: 'on', tmdbToken: token }))
    try {
      expect(externalTitlesEnabled()).toBe(true)
      token = 'second'
      expect(tmdbToken()).toBe('second')
    } finally {
      installTestPlatform()
    }
  })
})
```

Create `packages/core/src/noPlatformGlobals.test.ts`:
```ts
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('.', import.meta.url))

/** Core runs in the browser and in React Native: nothing either one lacks. */
const FORBIDDEN: [string, RegExp][] = [
  ['localStorage', /\blocalStorage\b/],
  ['sessionStorage', /\bsessionStorage\b/],
  ['window', /\bwindow\./],
  ['document', /\bdocument\./],
  ['navigator', /\bnavigator\./],
  ['import.meta', /import\.meta\.(env|glob)/],
  ['react', /from ['"]react(-dom)?['"]/],
]

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'test' ? [] : sources(path)
    return name.endsWith('.ts') && !name.endsWith('.test.ts') && name !== 'testing.ts' ? [path] : []
  })
}

/** Comments may talk about localStorage; only code counts. */
const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('core source', () => {
  it('uses no browser, bundler or React globals', () => {
    const violations = sources(SRC).flatMap((file) => {
      const code = stripComments(readFileSync(file, 'utf8'))
      return FORBIDDEN.filter(([, pattern]) => pattern.test(code)).map(([name]) => `${relative(SRC, file)}: ${name}`)
    })
    expect(violations).toEqual([])
  })
})
```

Create `apps/web/src/platform.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { externalTitlesEnabled } from '@go10/core/external/config'
import { readProgress, writeProgress } from '@go10/core/progress/progressStore'
import { installWebPlatform } from './platform'

afterEach(() => {
  vi.unstubAllEnvs()
  localStorage.clear()
})

describe('installWebPlatform', () => {
  it('keeps watch progress in localStorage, under the keys the web app always used', () => {
    installWebPlatform()
    writeProgress('v1', { time: 100, duration: 1000 })
    expect(JSON.parse(localStorage.getItem('go10:progress:v1')!).time).toBe(100)
    expect(readProgress('v1')?.time).toBe(100)
  })

  it('reads the external-titles switch from the Vite env on every call', () => {
    installWebPlatform()
    expect(externalTitlesEnabled()).toBe(false)
    vi.stubEnv('VITE_EXTERNAL_TITLES', 'on')
    vi.stubEnv('VITE_TMDB_TOKEN', 'tok')
    expect(externalTitlesEnabled()).toBe(true)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test 2>&1 | grep -E "FAIL|✗|×|Tests " | head -20`
Expected failures:
- The progress and snapshot "installed KeyValueStore" tests: the value lands in `localStorage`, not the store.
- The `setExternalConfigSource` test and `platform.test.ts`: the modules don't exist yet.
- The guard test: `progress/progressStore.ts: localStorage`, `external/snapshots.ts: localStorage`, `external/config.ts: import.meta`.

The "throws on access" test may already pass. That's expected: today's code catches everything. It pins the behaviour through the change.

- [ ] **Step 3: Route `progressStore` through the port**

In `packages/core/src/progress/progressStore.ts`, add `import { keyValueStore } from '../ports/keyValueStore'` at the top. Then replace `save`, `readProgress` and `listProgress` with:
```ts
function save(videoId: string, progress: Progress): void {
  try {
    keyValueStore().setItem(PREFIX + videoId, JSON.stringify(progress))
  } catch {
    // ignore — private mode, quota exceeded, or storage disabled
  }
}

export function readProgress(videoId: string): Progress | null {
  try {
    return parse(keyValueStore().getItem(PREFIX + videoId))
  } catch {
    return null
  }
}
```
```ts
export function listProgress(): Record<string, Progress> {
  const entries: Record<string, Progress> = {}
  try {
    const store = keyValueStore()
    for (const key of store.keys()) {
      if (!key.startsWith(PREFIX)) continue
      const progress = parse(store.getItem(key))
      if (progress) entries[key.slice(PREFIX.length)] = progress
    }
  } catch {
    // ignore
  }
  return entries
}
```

- [ ] **Step 4: Route `snapshots` through the port**

In `packages/core/src/external/snapshots.ts`, add `import { keyValueStore } from '../ports/keyValueStore'`. Then replace `entries`, `prune`, `saveSnapshot` and `readSnapshot` with:
```ts
function entries(): Entry[] {
  const found: Entry[] = []
  try {
    const store = keyValueStore()
    for (const storageKey of store.keys()) {
      if (!storageKey.startsWith(PREFIX)) continue
      const raw = store.getItem(storageKey)
      const snapshot = parse(raw)
      if (snapshot) found.push({ storageKey, size: raw?.length ?? 0, snapshot })
    }
  } catch {
    // ignore
  }
  return found.sort((a, b) => b.snapshot.savedAt - a.snapshot.savedAt)
}

/** Drops the oldest snapshots beyond the count limit or the size budget; the newest always stays. */
function prune(): void {
  const store = keyValueStore()
  let total = 0
  entries().forEach(({ storageKey, size }, index) => {
    total += size
    if (index > 0 && (index >= SNAPSHOT_LIMIT || total > SNAPSHOT_BUDGET_CHARS)) store.removeItem(storageKey)
  })
}

export function saveSnapshot(title: Title, now: number = Date.now()): void {
  const storageKey = PREFIX + title.key
  const value = JSON.stringify({ savedAt: now, title })
  try {
    const store = keyValueStore()
    try {
      store.setItem(storageKey, value)
    } catch {
      // Full: make room by dropping the oldest other snapshot, then try once more.
      const oldest = entries().filter((entry) => entry.storageKey !== storageKey).pop()
      if (!oldest) return
      store.removeItem(oldest.storageKey)
      store.setItem(storageKey, value)
    }
    prune()
  } catch {
    // ignore — private mode, quota exceeded, or storage disabled
  }
}

export function readSnapshot(key: string): Title | null {
  try {
    return parse(keyValueStore().getItem(PREFIX + key))?.title ?? null
  } catch {
    return null
  }
}
```
Keep the size-budget comment, but make the sentence platform-neutral: "…and web storage is ~5M characters per origin, shared with watch progress…".

- [ ] **Step 5: Give the external config an injectable source**

Replace `packages/core/src/external/config.ts` with:
```ts
/**
 * Build-time switch for external titles (TMDB search + vidlove playback).
 * Off unless the switch is `on` *and* a TMDB token is set; off, the app is
 * exactly the catalog-only app. Each app installs where the values come
 * from (web: Vite env; mobile: Expo config). Read per call so tests can stub it.
 */
export interface ExternalConfigValues {
  externalTitles: string | undefined
  tmdbToken: string | undefined
}

let source: () => ExternalConfigValues = () => ({ externalTitles: undefined, tmdbToken: undefined })

export function setExternalConfigSource(next: () => ExternalConfigValues): void {
  source = next
}

export function externalTitlesEnabled(): boolean {
  const { externalTitles, tmdbToken } = source()
  return externalTitles === 'on' && Boolean(tmdbToken)
}

/** TMDB v4 read-access token. Ships in the bundle: read-only by design. */
export function tmdbToken(): string {
  return source().tmdbToken ?? ''
}
```

- [ ] **Step 6: Install the test platform in core, and the web platform in the app and its tests**

`packages/core/src/test/platform.ts`:
```ts
/// <reference types="vite/client" />
import { setExternalConfigSource } from '../external/config'
import { setKeyValueStore, webStorageStore } from '../ports/keyValueStore'

/** What core's tests run on: jsdom's localStorage, and Vitest's env (stubbable with vi.stubEnv). */
export function installTestPlatform(): void {
  setKeyValueStore(webStorageStore(() => localStorage))
  setExternalConfigSource(() => ({
    externalTitles: import.meta.env.VITE_EXTERNAL_TITLES,
    tmdbToken: import.meta.env.VITE_TMDB_TOKEN,
  }))
}
```
`packages/core/src/test/setup.ts`:
```ts
import { installTestPlatform } from './platform'

installTestPlatform()
```
Add `setupFiles: ['./src/test/setup.ts'],` to the `test` block in `packages/core/vitest.config.ts`.

`apps/web/src/platform.ts`:
```ts
import { setExternalConfigSource } from '@go10/core/external/config'
import { setKeyValueStore, webStorageStore } from '@go10/core/ports/keyValueStore'

/** Wires core to the browser: localStorage for progress and snapshots, Vite's env for the external-titles switch. */
export function installWebPlatform(): void {
  setKeyValueStore(webStorageStore(() => localStorage))
  setExternalConfigSource(() => ({
    externalTitles: import.meta.env.VITE_EXTERNAL_TITLES,
    tmdbToken: import.meta.env.VITE_TMDB_TOKEN,
  }))
}
```
In `apps/web/src/main.tsx`, add `import { installWebPlatform } from './platform'` after the existing imports, and call `installWebPlatform()` on the line before `createRoot(…)`.
In `apps/web/src/test/setup.ts`, add `import { installWebPlatform } from '../platform'` and a top-level `installWebPlatform()` call above the `beforeEach`.

- [ ] **Step 7: Run everything**

Run: `npm run typecheck && npm test 2>&1 | grep -E "Test Files|Tests "`
Expected: the typecheck exits 0, every test passes, and the total is **412** = 404 + 7 in core (2 progress, 1 snapshots, 1 config, 1 guard… plus any `it` you split) + 2 web `platform` tests. If your count differs from 412, recount the `it(` blocks you added rather than accepting the number: the gate is that nothing failed and no pre-existing test disappeared.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(core): put storage and env behind ports; web installs its adapters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Core API additions for mobile: `imageSrc` base URL and the featured title

**Files:**
- Modify: `packages/core/src/lib/imageSrc.ts`
- Test: `packages/core/src/lib/imageSrc.test.ts`
- Create: `packages/core/src/featured.ts`
- Modify: `apps/web/src/screens/Home.tsx` (import the constants instead of declaring them)

**Interfaces:**
- Consumes: nothing new.
- Produces: `imageSrc(path: string, base?: string): string`, where `base` defaults to `'/'` and must end with `/`; `@go10/core/featured` → `FEATURED_SERIES_ID: string`, `FEATURED_ART: { small: string; large: string }`.

- [ ] **Step 1: Write the failing test**

Add to `packages/core/src/lib/imageSrc.test.ts`, inside the `describe`:
```ts
  it('roots a relative path at another site when given a base URL', () => {
    expect(imageSrc('catalogo_files/a.webp', 'https://tv.go10.blog/')).toBe('https://tv.go10.blog/catalogo_files/a.webp')
    expect(imageSrc('https://image.tmdb.org/t/p/w780/x.jpg', 'https://tv.go10.blog/')).toBe('https://image.tmdb.org/t/p/w780/x.jpg')
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @go10/core -- src/lib/imageSrc.test.ts`
Expected: FAIL, received `/catalogo_files/a.webp`.

- [ ] **Step 3: Implement**

`packages/core/src/lib/imageSrc.ts`:
```ts
/**
 * Catalog art is a path relative to the site root; TMDB art is an absolute URL.
 * The web app serves the art itself (`/`); the mobile app passes the site's URL.
 */
export function imageSrc(path: string, base = '/'): string {
  return /^https?:\/\//.test(path) ? path : `${base}${path}`
}
```

- [ ] **Step 4: Move the featured-title constants**

Create `packages/core/src/featured.ts`, moving these two constants and their comments out of `Home.tsx`:
```ts
/** The hero is a fixed promo slot, not derived from the catalog. Shared so web and mobile feature the same title. */
export const FEATURED_SERIES_ID = 'spidey-y-sus-sorprendentes-amigos'

/**
 * Full-resolution key art for the promo slot. Catalog thumbnails are only
 * 368x210, so a title without its own key art falls back to the blurred
 * backdrop plus a small crisp thumbnail.
 */
export const FEATURED_ART = {
  small: 'assets/spidey/spidey-hero-960.webp',
  large: 'assets/spidey/spidey-hero-1920.webp',
}
```
In `apps/web/src/screens/Home.tsx`, delete both declarations and their comments, and add `import { FEATURED_ART, FEATURED_SERIES_ID } from '@go10/core/featured'` with the other imports.

- [ ] **Step 5: Run everything**

Run: `npm run typecheck && npm test 2>&1 | grep -E "Test Files|Tests "`
Expected: exits 0; all pass; the total is one more than after Task 5.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(core): imageSrc base URL and shared featured title

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Publish `/data/collections/index.json` from the web build

**Files:**
- Create: `apps/web/build/collectionsIndex.ts`
- Test: `apps/web/build/collectionsIndex.test.ts`
- Modify: `apps/web/vite.config.ts`, `apps/web/tsconfig.node.json` (`include`)

**Interfaces:**
- Consumes: `data/collections/*.json` at the repo root.
- Produces: `buildCollectionsIndex(dir: string): string`, returning a JSON array of every collection file's parsed contents, sorted by file name. A file that isn't JSON throws an `Error` whose message starts with its file name. The build emits it as `data/collections/index.json`. The mobile app validates each entry and drops invalid ones, so structurally invalid but parseable files are included.

- [ ] **Step 1: Write the failing tests**

`apps/web/build/collectionsIndex.test.ts`:
```ts
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildCollectionsIndex } from './collectionsIndex.ts'

let dir: string
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function fixture(files: Record<string, string>): string {
  dir = mkdtempSync(join(tmpdir(), 'collections-'))
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text)
  return dir
}

describe('buildCollectionsIndex', () => {
  it('publishes every collection file as one array, in file-name order', () => {
    const index = buildCollectionsIndex(fixture({
      'pixar.json': '{"id":"pixar","order":2}',
      'disney.json': '{"id":"disney","order":1}',
      'notes.txt': 'not a collection',
    }))
    expect(JSON.parse(index)).toEqual([{ id: 'disney', order: 1 }, { id: 'pixar', order: 2 }])
  })

  it('keeps a structurally invalid collection: the app validates and drops it', () => {
    const index = buildCollectionsIndex(fixture({ 'odd.json': '{"id":"odd"}' }))
    expect(JSON.parse(index)).toEqual([{ id: 'odd' }])
  })

  it('fails the build, naming the file, when one is not JSON', () => {
    expect(() => buildCollectionsIndex(fixture({ 'broken.json': '{"id": ' }))).toThrow(/^broken\.json: not valid JSON/)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w @go10/web -- build/collectionsIndex.test.ts`
Expected: FAIL, `Failed to resolve import "./collectionsIndex.ts"`.

- [ ] **Step 3: Implement**

`apps/web/build/collectionsIndex.ts`:
```ts
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Every collection file in `dir` as one JSON array, sorted by file name, so
 * the mobile app can fetch them all at `/data/collections/index.json`. It
 * validates each one itself; only a file that isn't JSON at all stops the
 * build, since publishing it would silently drop that collection.
 */
export function buildCollectionsIndex(dir: string): string {
  const collections = readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const text = readFileSync(join(dir, name), 'utf8')
      try {
        return JSON.parse(text) as unknown
      } catch (error) {
        throw new Error(`${name}: not valid JSON (${(error as Error).message})`)
      }
    })
  return JSON.stringify(collections)
}
```

- [ ] **Step 4: Emit it from the build**

`apps/web/vite.config.ts`:
```ts
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { buildCollectionsIndex } from './build/collectionsIndex.ts'

const COLLECTIONS_DIR = fileURLToPath(new URL('../../data/collections', import.meta.url))

/** Publishes data/collections/*.json as /data/collections/index.json for the mobile app. */
function collectionsIndex(): Plugin {
  return {
    name: 'go10-collections-index',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'data/collections/index.json', source: buildCollectionsIndex(COLLECTIONS_DIR) })
    },
  }
}

export default defineConfig({
  plugins: [react(), collectionsIndex()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    // External titles are off for the suite; tests that need them stub these.
    env: { VITE_EXTERNAL_TITLES: 'off', VITE_TMDB_TOKEN: '' },
  },
})
```
If `vitest/config` doesn't re-export `Plugin`, import `type Plugin` from `'vite'` instead.
In `apps/web/tsconfig.node.json`, set `"include": ["vite.config.ts", "build"]`.

- [ ] **Step 5: Run everything and check the build output**

Run:
```bash
npm run typecheck && npm test 2>&1 | grep -E "Test Files|Tests "
npm run build > /tmp/build.log 2>&1; echo exit=$?
node -e 'const a=JSON.parse(require("fs").readFileSync("apps/web/dist/data/collections/index.json","utf8")); console.log(a.length, a.map(c=>c.id).join(","))'
ls data/collections/*.json | wc -l
```
Expected: all tests pass (3 more than after Task 6). `exit=0`. The node line prints `7 adult-swim,cartoon-network,disney,fox,jetix,pixar,warner-bros`, and the `ls` count is `7`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(web): publish /data/collections/index.json for the mobile app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Docs, final verification, and the live-site check

**Files:**
- Modify: `README.md` (Run, Data, Tests sections)
- Modify: `docs/superpowers/specs/2026-09-26-android-app-design.md` (Phase 1 gate numbers; status)

**Interfaces:**
- Consumes: everything above.
- Produces: a documented workspace, and a confirmed live deploy.

- [ ] **Step 1: Update the README**

- **Run:** `npm install` and `npm run dev` are unchanged, now run at the repo root. Add one sentence on the layout: "The web app lives in `apps/web`; its platform-free logic (catalog parsing, rows, search, progress, routing, TMDB mapping, player providers) is `packages/core` (`@go10/core`), shared with the upcoming Android app."
- **Data:** every `public/data/…` path becomes `apps/web/public/data/…`.
- **Collections:** add: "The build also publishes every collection as `/data/collections/index.json`, which the Android app fetches."
- **Tests:** replace the two lines with the real counts from the final run (Step 2):
```bash
python3 -m pytest tests/ -v   # <N> — parser, genres, merge, feed, output paths
npm test                      # <M> — core (logic) + web (components), every workspace
```
Replace `<N>` and `<M>` with the numbers printed in Step 2.

- [ ] **Step 2: Final verification**

Run:
```bash
python3 -m pytest tests/ -q 2>&1 | tail -1
npm run typecheck; echo typecheck=$?
npm test 2>&1 | grep -E "Test Files|Tests "
npm run build > /tmp/build.log 2>&1; echo build=$?
ls apps/web/dist/data/catalog.csv apps/web/dist/data/aniyomi/index.json apps/web/dist/data/collections/index.json
```
Expected: Python `92 passed`, `typecheck=0`, every JS test passes (baseline 398, plus 6 + 9 + 1 + 3 new = 417; confirm by summing the two workspaces), `build=0`, and all three files listed.

- [ ] **Step 3: Correct the spec's gate numbers**

In the spec's *Testing* section, replace `**Phase 1 gate: all 288 JS tests and 43 Python tests pass.**` with `**Phase 1 gate: all 398 JS tests and 91 Python tests that existed at the start of Phase 1 pass** (the spec originally quoted stale README counts).` In the *Phases* table, prefix the Phase 1 "Done when" cell with `✅ Done <date>.`, using today's date.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/specs/2026-09-26-android-app-design.md
git commit -m "docs: document the workspace layout and Phase 1 gate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Ask the user to deploy, then check the live site**

Deploying is outward-facing, so **ask first**. Tell the user that the Netlify build command stays `npm run build`, the publish directory is now `apps/web/dist` (set in `netlify.toml`), and that if the Netlify UI overrides the base or publish directory, it needs clearing. Once they've pushed or deployed, run:
```bash
for p in / /data/catalog.csv /data/aniyomi/index.json /data/collections/index.json /catalogo_files/$(ls catalogo_files | head -1) /assets/spidey/spidey-hero-960.webp; do
  printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "https://tv.go10.blog$p")" "$p"
done
curl -s https://tv.go10.blog/data/collections/index.json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).length))'
```
Expected: `200` for every path, and `7`. Also ask the user to open the site and play something, as their usual manual check.
