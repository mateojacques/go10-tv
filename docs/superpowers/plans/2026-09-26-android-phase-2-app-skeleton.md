# Android Phase 2: App Skeleton + Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `apps/mobile`, an Expo + react-native-tvos app in the workspace. It loads the live catalog and collections from `https://tv.go10.blog` with stale-while-revalidate caching, shows them as a plain title list on the phone, keeps working offline from its cache, and shows a "Sin conexión" screen with "Reintentar" when it has neither network nor cache.

**Architecture:**
- **Pure store:** the loading logic is a pure TypeScript store (`catalogStore`). It is injected with a `fetchText` function and a `TextCache`, so Jest can test every case of the spec's launch sequence with fakes.
- **Thin adapters:** separate small modules handle `fetch`, `expo-file-system`, MMKV and Expo config.
- **Screens:** a React context exposes the store to expo-router screens. Phase 2 has a single Home route rendering one of three components: loading, offline, or title list.
- **Shared logic:** CSV parsing, title building, collection validation, image paths and storage all come from `@go10/core`.

**Tech Stack:** Expo SDK 57, `react-native@npm:react-native-tvos@0.86-stable`, expo-router 57, react-native-mmkv 4 (with react-native-nitro-modules), expo-file-system 57 (`File`/`Paths` API), expo-image, expo-constants, Jest 29 + jest-expo + @testing-library/react-native 14.

**Spec:** `docs/superpowers/specs/2026-09-26-android-app-design.md`. Relevant sections: *Data flow (mobile)*, *Ports*, *Navigation, focus, layout → Device mode / Styling*, *Error handling*, *Testing*, *Builds*, *Phases → 2*. Also read `docs/superpowers/spikes/2026-09-26-android-player-spike.md` → *Surprises* for the tvos template quirks.

## Global Constraints

- **Devices:** test on the phone only (`adb` serial `ZY22MTK86Z`). No Android TV emulator; TV checks wait for real hardware.
- **Toolchain:** builds use `JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64`. The system default is JDK 25.
- **One APK for phone and TV:** always prebuild with `EXPO_TV=1`. The same APK runs on the phone.
- **Site URL:** `SITE_URL` defaults to `https://tv.go10.blog`. Always turn it into a base ending in `/` with `siteBase()` before passing it to `imageSrc` or building data URLs, because `imageSrc(path, base)` expects the trailing slash.
- **Config source:** the external-titles switch and TMDB token come from the root `.env.local` (`VITE_EXTERNAL_TITLES`, `VITE_TMDB_TOKEN`), the same file the web app uses. They are baked in at build time through `app.config.ts`. Phase 2 only installs the config and doesn't use it.
- **Progress keys:** watch progress and snapshots use core's keys, `go10:progress:*` and `go10:tmdb-title:*`, in MMKV.
- **React version:** React is **19.2.3** for the whole repo. React Native's renderer requires an exact React match, and Expo SDK 57 pins 19.2.3. This downgrades the web app from 19.3.0 to 19.2.3; the web suite must stay green.
- **Peer dependencies:** npm installs with `legacy-peer-deps=true`, set in the root `.npmrc`. react-native-tvos versions are semver prereleases (`0.86.3-0`), so ranges like `>=0.78` never match them. Consequence: peers are not auto-installed. Install `react-native-nitro-modules` and `test-renderer` explicitly.
- **Hermes check:** core must load on Hermes. Phase 1 already made `Intl.DisplayNames` lazy. React Native 0.86's `URLSearchParams` is a full implementation (checked in its source), so **no URL polyfill** is needed.
- **Test commands:** mobile tests run with Jest (`npm test -w @go10/mobile`). The root `npm test` runs every workspace. Core and web keep Vitest.
- **Out of scope:** fonts, the Home rows, focus guides and real screens (Phase 3 onward). Also out: `expo-dev-client`, because a plain debug build loaded from Metro is enough. The real launcher banner and icon are Phase 7; keep the template's banner for now.
- **Commit trailer:** every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A 200 response that isn't the file.** Netlify's SPA fallback answers any missing path with `index.html` and status 200. If the catalog or collections URL ever serves HTML, the app must keep its cached data and must not cache the HTML. With no cache, it must show "Sin conexión" and not an empty list. Tests: catalogStore "HTML instead of CSV" (Task 5).
2. **A corrupt or partial cached file must not lock itself in.** If the cached body doesn't parse, its ETag must not be sent. Otherwise the server answers `304` forever and the app never recovers. Test: catalogStore "corrupt cache" (Task 5).
3. **Fresh data must not reshuffle the screen mid-browse.** A background `200` is applied only on the next visit to Home (`applyPending`), never immediately. Test: catalogStore "applies an update only when asked" (Task 5).
4. **A network that never answers** (captive portal, dead Wi-Fi). The first launch must end in "Sin conexión", not spin forever. Test: httpText "times out" (Task 4).
5. **A failing disk write** (storage full) must not stop the app from showing the data it just downloaded. Test: catalogStore "cache write fails" (Task 5).

---

### Task 1: Workspace prep: one React, relaxed peers

**Files:**
- Create: `.npmrc`
- Modify: `package.json` (root: `overrides`), `apps/web/package.json` (react, react-dom), `package-lock.json`

**Interfaces:**
- Consumes: the Phase 1 workspace.
- Produces: an install where `react` and `react-dom` resolve to 19.2.3 everywhere, and where later `npx expo install` calls don't fail on tvos prerelease peers.

- [ ] **Step 1: Record the web baseline**

Run: `npm test 2>&1 | grep -E "Tests "`
Expected: `Tests  237 passed (237)` for core and `Tests  180 passed (180)` for web.

- [ ] **Step 2: Pin React and relax peers**

Create `.npmrc`:
```ini
# react-native-tvos versions are semver prereleases (0.86.3-0), which never
# satisfy peer ranges like ">=0.78"; without this every Expo install fails.
# Peers are therefore not auto-installed: add them explicitly.
legacy-peer-deps=true
```
Add to the root `package.json`:
```json
  "overrides": {
    "react": "19.2.3",
    "react-dom": "19.2.3"
  }
```
In `apps/web/package.json`, set `"react": "19.2.3"` and `"react-dom": "19.2.3"`.

Run: `npm install > /tmp/p2-install.log 2>&1; echo exit=$?; node -p 'require("react/package.json").version+" "+require("react-dom/package.json").version'`
Expected: `exit=0`, then `19.2.3 19.2.3`.

- [ ] **Step 3: Web and core still pass**

Run: `npm test 2>&1 | grep -E "Tests "; npm run build > /tmp/p2-build.log 2>&1; echo build=$?`
Expected: 237 and 180 passing, `build=0`.

- [ ] **Step 4: Commit**

```bash
git add .npmrc package.json apps/web/package.json package-lock.json
git commit -m "build: pin React 19.2.3 repo-wide and relax peer checks for react-native-tvos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Scaffold `apps/mobile` with its config from the root `.env.local`

**Files:**
- Create (from the Expo `with-tv` example): `apps/mobile/` with `package.json`, `metro.config.js`, `assets/`. Delete the template's `App.tsx`, `app.json`, `AGENTS.md`, `CLAUDE.md`, `README.md` and `package-lock.json`.
- Create: `apps/mobile/app.config.ts`, `apps/mobile/config/envFile.ts`, `apps/mobile/tsconfig.json`, `apps/mobile/.gitignore`, `apps/mobile/src/app/_layout.tsx`, `apps/mobile/src/app/index.tsx` (placeholders, replaced in Task 6)
- Test: `apps/mobile/config/envFile.test.ts`
- Modify: root `package.json` (`workspaces`)

**Interfaces:**
- Consumes: Task 1's install settings.
- Produces:
  - `parseEnvFile(text: string): Record<string, string>`
  - `mobileExtra(env: Record<string, string | undefined>): { siteUrl: string; externalTitles: string | undefined; tmdbToken: string | undefined }`
  - `DEFAULT_SITE_URL = 'https://tv.go10.blog'`
  - the Expo `extra` object carrying those three fields
  - package `@go10/mobile`, application id `blog.go10.tv`, and the scripts `test`, `typecheck`, `prebuild`, `android`

- [ ] **Step 1: Scaffold from the TV example and join the workspace**

```bash
cd apps && npx create-expo-app@latest mobile -e with-tv --no-install && cd ..
rm -f apps/mobile/App.tsx apps/mobile/app.json apps/mobile/AGENTS.md apps/mobile/CLAUDE.md apps/mobile/README.md apps/mobile/package-lock.json
```
In the root `package.json`, set `"workspaces": ["packages/*", "apps/web", "apps/mobile"]`.
In `apps/mobile/package.json`:
- set `"name": "@go10/mobile"` and `"main": "expo-router/entry"`;
- keep its `dependencies`, with `react` and `react-dom` at `19.2.3`;
- replace `"scripts"` with:
```json
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "prebuild": "EXPO_TV=1 expo prebuild --clean --platform android",
    "test": "jest",
    "typecheck": "tsc --noEmit"
  },
  "jest": { "preset": "jest-expo" },
```
Then run:
```bash
npm install > /tmp/p2-install.log 2>&1; echo exit=$?
cd apps/mobile
npx expo install expo-router expo-linking expo-constants react-native-screens react-native-safe-area-context expo-image expo-file-system react-native-mmkv react-native-nitro-modules jest-expo jest @types/jest
npm install -D @testing-library/react-native test-renderer
npm install @go10/core@*
cd ../..
```
Expected: every command exits 0. If a network error appears, rerun that command with the sandbox disabled.

- [ ] **Step 2: Check for the duplicate react-native copy the spike found**

Run: `npm ls react-native 2>&1 | grep -v deduped | grep react-native@ ; find node_modules apps/mobile/node_modules -path '*node_modules/react-native/node_modules/react-native/package.json' 2>/dev/null`
Expected: exactly one `react-native@npm:react-native-tvos@0.86…`, and no nested path. With peer auto-install off, the nested non-TV copy the spike saw shouldn't be installed.
- **If there is no nested copy:** go on.
- **If a nested copy exists:** add the spike's two fixes.
  - In `apps/mobile/metro.config.js`, just before `module.exports = config;`:
```js
// @react-native-tvos/virtualized-lists peers on core react-native, so npm can nest a
// second (non-TV) copy under node_modules/react-native. Resolve every `react-native`
// import from this app so only the tvos copy is bundled.
const appOrigin = require('path').join(__dirname, 'package.json');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native' || moduleName.startsWith('react-native/')) {
    return context.resolveRequest({ ...context, originModulePath: appOrigin }, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};
```
  - In `apps/mobile/tsconfig.json` `compilerOptions`, add `"paths": { "react-native": ["../../node_modules/react-native"] }`. Use `./node_modules/react-native` if that's where the tvos copy lives.
  - Record which case applied in the ledger.

- [ ] **Step 3: Write the failing env tests**

`apps/mobile/config/envFile.test.ts`:
```ts
import { DEFAULT_SITE_URL, mobileExtra, parseEnvFile } from './envFile'

describe('parseEnvFile', () => {
  it('reads KEY=value lines, skipping comments and blanks', () => {
    expect(parseEnvFile('# switches\nVITE_EXTERNAL_TITLES=on\n\nVITE_TMDB_TOKEN=abc.def\n')).toEqual({
      VITE_EXTERNAL_TITLES: 'on',
      VITE_TMDB_TOKEN: 'abc.def',
    })
  })

  it('unquotes values, trims spaces, accepts "export" and CRLF', () => {
    expect(parseEnvFile('export A="x y"\r\nB = \'z\' \r\nC=a=b\r\n')).toEqual({ A: 'x y', B: 'z', C: 'a=b' })
  })
})

describe('mobileExtra', () => {
  it('uses the web app variables for the external-titles switch and token', () => {
    expect(mobileExtra({ VITE_EXTERNAL_TITLES: 'on', VITE_TMDB_TOKEN: 't' })).toEqual({
      siteUrl: DEFAULT_SITE_URL,
      externalTitles: 'on',
      tmdbToken: 't',
    })
  })

  it('lets GO10_SITE_URL point the app at another deploy', () => {
    expect(mobileExtra({ GO10_SITE_URL: 'https://preview.example' }).siteUrl).toBe('https://preview.example')
  })

  it('is catalog-only on the live site when nothing is set', () => {
    expect(mobileExtra({})).toEqual({ siteUrl: 'https://tv.go10.blog', externalTitles: undefined, tmdbToken: undefined })
  })
})
```

- [ ] **Step 4: Run them to verify they fail**

Run: `npm test -w @go10/mobile`
Expected: FAIL with `Cannot find module './envFile'`.

- [ ] **Step 5: Implement the parser, the Expo config and the TS config**

`apps/mobile/config/envFile.ts`:
```ts
/** The live site; override with GO10_SITE_URL (e.g. a Netlify preview deploy). */
export const DEFAULT_SITE_URL = 'https://tv.go10.blog'

/** Minimal dotenv reader: KEY=value lines, optional `export`, optional quotes, # comments. */
export function parseEnvFile(text: string): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    if (line.trimStart().startsWith('#')) continue
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (!match) continue
    let value = match[2]
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1)
    vars[match[1]] = value
  }
  return vars
}

/**
 * What the app reads at runtime (Expo `extra`). The external-titles switch and
 * token are the web app's own variables, so one .env.local drives both apps.
 */
export function mobileExtra(env: Record<string, string | undefined>) {
  return {
    siteUrl: env.GO10_SITE_URL || DEFAULT_SITE_URL,
    externalTitles: env.VITE_EXTERNAL_TITLES,
    tmdbToken: env.VITE_TMDB_TOKEN,
  }
}
```
`apps/mobile/app.config.ts`:
```ts
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ConfigContext, ExpoConfig } from 'expo/config'
import { mobileExtra, parseEnvFile } from './config/envFile'

// The same file the web app reads: the repo root's .env.local.
const ROOT_ENV = join(__dirname, '..', '..', '.env.local')

export default ({ config }: ConfigContext): ExpoConfig => {
  const fileEnv = existsSync(ROOT_ENV) ? parseEnvFile(readFileSync(ROOT_ENV, 'utf8')) : {}
  return {
    ...config,
    name: 'GO10 TV',
    slug: 'go10-tv',
    scheme: 'go10',
    android: {
      package: 'blog.go10.tv',
      splash: { image: './assets/images/icon-1920x720.png', backgroundColor: '#08090c' },
    },
    plugins: [
      'expo-router',
      ['@react-native-tvos/config-tv', { androidTVBanner: './assets/images/icon-400x240.png' }],
    ],
    // Real environment variables win over the file (CI, one-off overrides).
    extra: mobileExtra({ ...fileEnv, ...process.env }),
  }
}
```
`apps/mobile/tsconfig.json`:
```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": { "strict": true, "types": ["jest", "node"] },
  "include": ["**/*.ts", "**/*.tsx"]
}
```
If Step 2 needed the `paths` fix, keep that entry inside `compilerOptions`.
`apps/mobile/.gitignore`:
```gitignore
# Generated by `expo prebuild` (continuous native generation): never edit or commit.
android/
ios/
.expo/
```
Placeholder routes so the app boots. Task 6 replaces both.
`apps/mobile/src/app/_layout.tsx`:
```tsx
import { Stack } from 'expo-router'

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
```
`apps/mobile/src/app/index.tsx`:
```tsx
import { Text, View } from 'react-native'

export default function Home() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#08090c' }}>
      <Text style={{ color: '#f2f4f0' }}>GO10 TV</Text>
    </View>
  )
}
```

- [ ] **Step 6: Run the tests, the typecheck and the resolved config**

Run:
```bash
npm test -w @go10/mobile 2>&1 | grep -E "Tests:"
npm run typecheck -w @go10/mobile; echo typecheck=$?
cd apps/mobile && npx expo config --type public --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const c=JSON.parse(s);console.log(c.android.package, c.extra.siteUrl, c.extra.externalTitles, c.extra.tmdbToken ? "token:set" : "token:unset")})'; cd ../..
```
Expected: `Tests: 5 passed, 5 total`, `typecheck=0`, and `blog.go10.tv https://tv.go10.blog on token:set`.
If `npx expo config` fails to load `./config/envFile` from `app.config.ts` (Expo's config loader may not transpile imported `.ts` files), rename it to `config/envFile.js` written as CommonJS (`module.exports = { DEFAULT_SITE_URL, parseEnvFile, mobileExtra }`, same bodies, no types), keep the tests importing it unchanged, and ledger it. The last line assumes the root `.env.local` has the switch on, as it does today. **Never print the token itself.**

- [ ] **Step 7: Bundle once to prove Metro resolves `@go10/core` and the router**

Run: `cd apps/mobile && EXPO_TV=1 npx expo export --platform android --output-dir /tmp/p2-export > /tmp/p2-export.log 2>&1; echo export=$?; tail -4 /tmp/p2-export.log; cd ../..`
Expected: `export=0` and an `.hbc` bundle listed. If Metro can't resolve a `@go10/core/...` subpath, read the error before changing anything. Metro's package-`exports` support is on by default in React Native 0.79+.

- [ ] **Step 8: Commit**

```bash
git add -A apps/mobile package.json package-lock.json
git status --short | grep -E "android/|ios/" && echo "STOP: native dirs staged" || true
git commit -m "feat(mobile): scaffold the Expo TV app in the workspace, configured from .env.local

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Platform adapters: MMKV storage, site base, install on startup

**Files:**
- Create: `apps/mobile/src/platform/mmkvStore.ts`, `apps/mobile/src/platform/install.ts`, `apps/mobile/src/config/appConfig.ts`
- Test: `apps/mobile/src/platform/mmkvStore.test.ts`, `apps/mobile/src/config/appConfig.test.ts`

**Interfaces:**
- Consumes: `KeyValueStore`, `setKeyValueStore` (`@go10/core/ports/keyValueStore`), `setExternalConfigSource` (`@go10/core/external/config`), and the Expo `extra` shape from Task 2.
- Produces:
  - `interface MMKVLike { getString(key: string): string | undefined; set(key: string, value: string): void; remove(key: string): boolean; getAllKeys(): string[] }`
  - `mmkvStore(mmkv: MMKVLike): KeyValueStore`
  - `interface AppExtra { siteUrl: string; externalTitles?: string; tmdbToken?: string }`
  - `appExtra(): AppExtra`
  - `siteBase(siteUrl: string): string`, which returns the URL with exactly one trailing `/`
  - the side-effect module `src/platform/install.ts`, which Task 6's `_layout.tsx` imports first

- [ ] **Step 1: Write the failing tests**

`apps/mobile/src/platform/mmkvStore.test.ts`:
```ts
import { readProgress, writeProgress } from '@go10/core/progress/progressStore'
import { keyValueStore, setKeyValueStore } from '@go10/core/ports/keyValueStore'
import { mmkvStore, type MMKVLike } from './mmkvStore'

function fakeMMKV(): MMKVLike & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    getString: (key) => values.get(key),
    set: (key, value) => void values.set(key, value),
    remove: (key) => values.delete(key),
    getAllKeys: () => [...values.keys()],
  }
}

describe('mmkvStore', () => {
  it('maps the KeyValueStore port onto MMKV', () => {
    const mmkv = fakeMMKV()
    const store = mmkvStore(mmkv)
    store.setItem('a', '1')
    expect(store.getItem('a')).toBe('1')
    expect(store.getItem('missing')).toBeNull()
    expect(store.keys()).toEqual(['a'])
    store.removeItem('a')
    expect(mmkv.values.size).toBe(0)
  })

  it('keeps watch progress under the same keys the web app uses', () => {
    const previous = keyValueStore()
    const mmkv = fakeMMKV()
    setKeyValueStore(mmkvStore(mmkv))
    try {
      writeProgress('v1', { time: 100, duration: 1000 })
      expect(JSON.parse(mmkv.values.get('go10:progress:v1')!).time).toBe(100)
      expect(readProgress('v1')?.time).toBe(100)
    } finally {
      setKeyValueStore(previous)
    }
  })
})
```
`apps/mobile/src/config/appConfig.test.ts`:
```ts
import { siteBase } from './appConfig'

describe('siteBase', () => {
  it('ends the site URL in exactly one slash, as imageSrc and the data URLs expect', () => {
    expect(siteBase('https://tv.go10.blog')).toBe('https://tv.go10.blog/')
    expect(siteBase('https://tv.go10.blog/')).toBe('https://tv.go10.blog/')
    expect(siteBase('https://tv.go10.blog//')).toBe('https://tv.go10.blog/')
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w @go10/mobile`
Expected: FAIL with `Cannot find module './mmkvStore'` and `Cannot find module './appConfig'`.

- [ ] **Step 3: Implement**

`apps/mobile/src/platform/mmkvStore.ts`:
```ts
import type { KeyValueStore } from '@go10/core/ports/keyValueStore'

/** The slice of react-native-mmkv v4's `MMKV` the store uses (a fake in tests). */
export interface MMKVLike {
  getString(key: string): string | undefined
  set(key: string, value: string): void
  remove(key: string): boolean
  getAllKeys(): string[]
}

/** Core's KeyValueStore over MMKV: synchronous, like localStorage on the web. */
export function mmkvStore(mmkv: MMKVLike): KeyValueStore {
  return {
    getItem: (key) => mmkv.getString(key) ?? null,
    setItem: (key, value) => mmkv.set(key, value),
    removeItem: (key) => {
      mmkv.remove(key)
    },
    keys: () => mmkv.getAllKeys(),
  }
}
```
`apps/mobile/src/config/appConfig.ts`:
```ts
import Constants from 'expo-constants'
import { DEFAULT_SITE_URL } from '../../config/envFile'

/** Baked in at build time by app.config.ts (see config/envFile.ts). */
export interface AppExtra {
  siteUrl: string
  externalTitles?: string
  tmdbToken?: string
}

export function appExtra(): AppExtra {
  const extra = (Constants.expoConfig?.extra ?? {}) as Partial<AppExtra>
  return { siteUrl: extra.siteUrl || DEFAULT_SITE_URL, externalTitles: extra.externalTitles, tmdbToken: extra.tmdbToken }
}

/** `imageSrc` and the data URLs append paths to this: exactly one trailing slash. */
export function siteBase(siteUrl: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/`
}
```
`apps/mobile/src/platform/install.ts`:
```ts
import { createMMKV } from 'react-native-mmkv'
import { setExternalConfigSource } from '@go10/core/external/config'
import { setKeyValueStore } from '@go10/core/ports/keyValueStore'
import { appExtra } from '../config/appConfig'
import { mmkvStore } from './mmkvStore'

/**
 * Imported first by the root layout, as a side effect, so core's storage and
 * config are wired before any screen module evaluates. Until this runs, core
 * would silently keep progress in memory.
 */
setKeyValueStore(mmkvStore(createMMKV({ id: 'go10' })))
setExternalConfigSource(() => {
  const { externalTitles, tmdbToken } = appExtra()
  return { externalTitles, tmdbToken }
})
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -w @go10/mobile 2>&1 | grep -E "Tests:"; npm run typecheck -w @go10/mobile; echo typecheck=$?`
Expected: `Tests: 8 passed, 8 total` and `typecheck=0`. This is the first mobile test that imports `@go10/core`. If Jest fails with a syntax error inside `packages/core/src/…` (TypeScript not transformed, because the file lives outside the app), add `apps/mobile/babel.config.js` with `module.exports = function (api) { api.cache(true); return { presets: ['babel-preset-expo'] } }` and rerun. If `createMMKV`'s options type rejects `{ id: 'go10' }`, check `node_modules/react-native-mmkv/lib/specs/MMKVFactory.nitro.d.ts` (or wherever `Configuration` is declared) for the field name, and ledger it.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src
git commit -m "feat(mobile): MMKV-backed storage port, site base URL, platform install

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Network and cache adapters

**Files:**
- Create: `apps/mobile/src/data/httpText.ts`, `apps/mobile/src/data/textCache.ts`, `apps/mobile/src/data/fileTextCache.ts`
- Test: `apps/mobile/src/data/httpText.test.ts`, `apps/mobile/src/data/fileTextCache.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type FetchResult = { status: 200; body: string; etag: string | null } | { status: 304 } | { status: 'error'; code: number }`
  - `type FetchText = (url: string, etag: string | null) => Promise<FetchResult>`. It rejects on network failure or timeout.
  - `FETCH_TIMEOUT_MS = 15000`
  - `createFetchText(fetchImpl?: typeof fetch, timeoutMs?: number): FetchText`
  - `interface CachedText { body: string; etag: string | null }`
  - `interface TextCache { read(name: string): CachedText | null; write(name: string, entry: CachedText): void }`
  - `memoryTextCache(): TextCache`
  - `fileTextCache(): TextCache`

- [ ] **Step 1: Write the failing tests**

`apps/mobile/src/data/httpText.test.ts`:
```ts
import { createFetchText } from './httpText'

function response(status: number, body = '', headers: Record<string, string> = {}) {
  return { status, ok: status >= 200 && status < 300, text: async () => body, headers: { get: (n: string) => headers[n.toLowerCase()] ?? null } }
}

describe('fetchText', () => {
  it('returns the body and ETag of a 200', async () => {
    const fetchImpl = jest.fn(async () => response(200, 'csv', { etag: '"v1"' }))
    await expect(createFetchText(fetchImpl as never)('https://x/data', null)).resolves.toEqual({ status: 200, body: 'csv', etag: '"v1"' })
    expect(fetchImpl.mock.calls[0][1].headers).toEqual({})
  })

  it('revalidates with If-None-Match and reports a 304', async () => {
    const fetchImpl = jest.fn(async () => response(304))
    await expect(createFetchText(fetchImpl as never)('https://x/data', '"v1"')).resolves.toEqual({ status: 304 })
    expect(fetchImpl.mock.calls[0][1].headers).toEqual({ 'If-None-Match': '"v1"' })
  })

  it('reports other statuses without a body', async () => {
    const fetchImpl = jest.fn(async () => response(503, 'down'))
    await expect(createFetchText(fetchImpl as never)('https://x/data', null)).resolves.toEqual({ status: 'error', code: 503 })
  })

  it('gives up on a network that never answers', async () => {
    jest.useFakeTimers()
    try {
      const fetchImpl = jest.fn((_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))))
      const pending = createFetchText(fetchImpl as never, 1000)('https://x/data', null)
      jest.advanceTimersByTime(1000)
      await expect(pending).rejects.toThrow('aborted')
    } finally {
      jest.useRealTimers()
    }
  })
})
```
`apps/mobile/src/data/fileTextCache.test.ts`:
```ts
const disk = new Map<string, string>()

jest.mock('expo-file-system', () => {
  class File {
    uri: string
    constructor(dir: { uri: string }, name: string) {
      this.uri = `${dir.uri}/${name}`
    }
    get exists() {
      return disk.has(this.uri)
    }
    create() {
      disk.set(this.uri, '')
    }
    write(text: string) {
      if (!disk.has(this.uri)) throw new Error('write to missing file')
      disk.set(this.uri, text)
    }
    textSync() {
      return disk.get(this.uri) ?? ''
    }
  }
  return { File, Paths: { document: { uri: 'doc' } } }
})

import { fileTextCache } from './fileTextCache'

beforeEach(() => disk.clear())

describe('fileTextCache', () => {
  it('reads back what it wrote, with its ETag', () => {
    const cache = fileTextCache()
    expect(cache.read('catalog.csv')).toBeNull()
    cache.write('catalog.csv', { body: 'a,b', etag: '"v1"' })
    expect(cache.read('catalog.csv')).toEqual({ body: 'a,b', etag: '"v1"' })
  })

  it('stores a missing ETag as none', () => {
    const cache = fileTextCache()
    cache.write('catalog.csv', { body: 'a,b', etag: null })
    expect(cache.read('catalog.csv')).toEqual({ body: 'a,b', etag: null })
  })

  it('never pairs a new body with an old ETag if a write stops halfway', () => {
    const cache = fileTextCache()
    cache.write('catalog.csv', { body: 'old', etag: '"v1"' })
    disk.set('doc/catalog.csv', 'new')      // the body was written...
    disk.set('doc/catalog.csv.etag', '')    // ...after the ETag was cleared, then the app died
    expect(cache.read('catalog.csv')).toEqual({ body: 'new', etag: null })
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w @go10/mobile -- src/data`
Expected: FAIL with `Cannot find module './httpText'` and `'./fileTextCache'`.

- [ ] **Step 3: Implement**

`apps/mobile/src/data/httpText.ts`:
```ts
export type FetchResult =
  | { status: 200; body: string; etag: string | null }
  | { status: 304 }
  | { status: 'error'; code: number }

/** Rejects on network failure or timeout; callers treat that like "no answer". */
export type FetchText = (url: string, etag: string | null) => Promise<FetchResult>

/** A dead Wi-Fi or captive portal can hang forever; the first launch must still end. */
export const FETCH_TIMEOUT_MS = 15000

export function createFetchText(fetchImpl: typeof fetch = fetch, timeoutMs = FETCH_TIMEOUT_MS): FetchText {
  return async (url, etag) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(url, {
        headers: etag ? { 'If-None-Match': etag } : {},
        signal: controller.signal,
      })
      if (response.status === 304) return { status: 304 }
      if (!response.ok) return { status: 'error', code: response.status }
      return { status: 200, body: await response.text(), etag: response.headers.get('etag') }
    } finally {
      clearTimeout(timer)
    }
  }
}
```
`apps/mobile/src/data/textCache.ts`:
```ts
export interface CachedText {
  body: string
  etag: string | null
}

/** Where downloaded data files live between launches. Methods may throw (disk full); callers catch. */
export interface TextCache {
  read(name: string): CachedText | null
  write(name: string, entry: CachedText): void
}

export function memoryTextCache(): TextCache {
  const entries = new Map<string, CachedText>()
  return {
    read: (name) => entries.get(name) ?? null,
    write: (name, entry) => void entries.set(name, entry),
  }
}
```
`apps/mobile/src/data/fileTextCache.ts`:
```ts
import { File, Paths } from 'expo-file-system'
import type { TextCache } from './textCache'

function writeText(file: File, text: string): void {
  if (!file.exists) file.create()
  file.write(text)
}

/**
 * Each entry is two files in the app's document directory: the body, and its
 * ETag beside it. Writes clear the ETag first and set it last, so a write cut
 * short can leave a body without an ETag (refetched in full next time), but
 * never a new body paired with an old ETag (which would 304 forever).
 */
export function fileTextCache(): TextCache {
  const body = (name: string) => new File(Paths.document, name)
  const etag = (name: string) => new File(Paths.document, `${name}.etag`)
  return {
    read(name) {
      const bodyFile = body(name)
      if (!bodyFile.exists) return null
      const etagFile = etag(name)
      return { body: bodyFile.textSync(), etag: (etagFile.exists && etagFile.textSync()) || null }
    },
    write(name, entry) {
      writeText(etag(name), '')
      writeText(body(name), entry.body)
      writeText(etag(name), entry.etag ?? '')
    },
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -w @go10/mobile 2>&1 | grep -E "Tests:"; npm run typecheck -w @go10/mobile; echo typecheck=$?`
Expected: `Tests: 15 passed, 15 total` and `typecheck=0`. If `File`'s constructor typing rejects `(Paths.document, name)`, check `node_modules/expo-file-system/build/File.d.ts`. It is declared as `constructor(...uris: (string | File | Directory)[])`, so this form is valid.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/data
git commit -m "feat(mobile): fetch with ETag revalidation and timeout; file-backed text cache

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The catalog store (stale-while-revalidate)

**Files:**
- Create: `apps/mobile/src/data/catalogStore.ts`
- Test: `apps/mobile/src/data/catalogStore.test.ts`

**Interfaces:**
- Consumes: `FetchText` and `FetchResult` (Task 4); `TextCache`, `CachedText` and `memoryTextCache` (Task 4); `parseCatalogCsv` and `buildTitles` (`@go10/core/catalog/loadCatalog`); `fromModules` (`@go10/core/collections/fromModules`); the types `CatalogRow`, `Title` (`@go10/core/types`) and `Collection` (`@go10/core/collections/types`).
- Produces:
  - `interface CatalogData { rows: CatalogRow[]; titles: Title[]; collections: Collection[] }`
  - `type CatalogState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: CatalogData }`
  - `interface CatalogStore { getState(): CatalogState; subscribe(listener: () => void): () => void; start(): Promise<void>; retry(): Promise<void>; applyPending(): void }`
  - `createCatalogStore(deps: { fetchText: FetchText; cache: TextCache; siteBase: string }): CatalogStore`
  - `parseCatalog(csv: string): CatalogRow[] | null`
  - `parseCollections(json: string): Collection[] | null`

- [ ] **Step 1: Write the failing tests**

`apps/mobile/src/data/catalogStore.test.ts`:
```ts
import type { FetchText } from './httpText'
import { memoryTextCache, type TextCache } from './textCache'
import { createCatalogStore, parseCatalog, parseCollections } from './catalogStore'

const BASE = 'https://tv.test/'
const HEADER = 'catalog_index,video_id,type,title,title_raw,series_id,series_title,season_number,season_label,episode_number,chapter_start_seconds,chapter_end_seconds,year,studio,source,genre,genre_secondary,quality,language,subtitled,duration_raw,duration_seconds,views,thumbnail,video_url,embed_url'
const row = (i: number, id: string, title: string) =>
  `${i},${id},movie,${title},${title},,,,,,,,2001,Pixar,Animax,Animación,,1080p,Español,false,1:30:00,5400,10,catalogo_files/${id}.webp,https://ok.ru/video/${id},https://ok.ru/videoembed/${id}`
const csv = (...titles: string[]) => [HEADER, ...titles.map((t, i) => row(i, String(100 + i), t))].join('\n')
const collection = (id: string, order: number) => ({ id, name: id, order, logo: `assets/collections/${id}/logo.svg`, tile: { color: '#000000' }, titles: ['100'] })
const HTML = '<!doctype html><html><head><title>GO10 TV</title></head><body><div id="root"></div></body></html>'

type Resource = { body: string; etag?: string } | 'down'

/** A fake site: answers 304 when the ETag matches, throws when a resource is 'down'. */
function site(resources: Record<string, Resource>) {
  const calls: { path: string; etag: string | null }[] = []
  const fetchText: FetchText = async (url, etag) => {
    const path = url.replace(BASE, '')
    calls.push({ path, etag })
    const resource = resources[path] ?? 'down'
    if (resource === 'down') throw new Error('offline')
    if (resource.etag && etag === resource.etag) return { status: 304 }
    return { status: 200, body: resource.body, etag: resource.etag ?? null }
  }
  return { fetchText, calls, resources }
}

const CATALOG = 'data/catalog.csv'
const COLLECTIONS = 'data/collections/index.json'
const titlesOf = (store: ReturnType<typeof createCatalogStore>) => {
  const state = store.getState()
  return state.status === 'ready' ? state.data.titles.map((t) => t.title) : state.status
}

function primed(cache: TextCache, catalog: string, etag = '"c1"') {
  cache.write('catalog.csv', { body: catalog, etag })
  cache.write('collections.json', { body: JSON.stringify([collection('pixar', 1)]), etag: '"k1"' })
  return cache
}

describe('parseCatalog', () => {
  it('parses a real catalog', () => {
    expect(parseCatalog(csv('A', 'B'))?.map((r) => r.video_id)).toEqual(['100', '101'])
  })

  it('rejects anything that is not the catalog', () => {
    expect(parseCatalog(HTML)).toBeNull()
    expect(parseCatalog('')).toBeNull()
    expect(parseCatalog(HEADER)).toBeNull()
  })
})

describe('parseCollections', () => {
  it('keeps valid collections in order and drops invalid ones', () => {
    const json = JSON.stringify([collection('pixar', 2), { id: 'broken' }, collection('disney', 1)])
    expect(parseCollections(json)?.map((c) => c.id)).toEqual(['disney', 'pixar'])
  })

  it('rejects anything that is not a JSON array', () => {
    expect(parseCollections(HTML)).toBeNull()
    expect(parseCollections('{"id":"x"}')).toBeNull()
  })
})

describe('catalogStore', () => {
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}))
  afterEach(() => jest.restoreAllMocks())

  it('first launch online: loads, shows the catalog and caches it', async () => {
    const { fetchText } = site({ [CATALOG]: { body: csv('A', 'B'), etag: '"c1"' }, [COLLECTIONS]: { body: JSON.stringify([collection('pixar', 1)]) } })
    const cache = memoryTextCache()
    const store = createCatalogStore({ fetchText, cache, siteBase: BASE })
    const started = store.start()
    expect(store.getState()).toEqual({ status: 'loading' })
    await started
    expect(titlesOf(store)).toEqual(['A', 'B'])
    const state = store.getState()
    expect(state.status === 'ready' && state.data.collections.map((c) => c.id)).toEqual(['pixar'])
    expect(cache.read('catalog.csv')).toEqual({ body: csv('A', 'B'), etag: '"c1"' })
  })

  it('first launch offline: shows the error, and Reintentar recovers once the site answers', async () => {
    const server = site({})
    const store = createCatalogStore({ fetchText: server.fetchText, cache: memoryTextCache(), siteBase: BASE })
    await store.start()
    expect(store.getState()).toEqual({ status: 'error' })
    server.resources[CATALOG] = { body: csv('A') }
    await store.retry()
    expect(titlesOf(store)).toEqual(['A'])
  })

  it('with a cache: shows it at once, before the network answers', async () => {
    const { fetchText } = site({ [CATALOG]: { body: csv('A'), etag: '"c1"' } })
    const store = createCatalogStore({ fetchText, cache: primed(memoryTextCache(), csv('A')), siteBase: BASE })
    const started = store.start()
    expect(titlesOf(store)).toEqual(['A'])
    await started
    expect(titlesOf(store)).toEqual(['A'])
  })

  it('revalidates with the cached ETag and changes nothing on a 304', async () => {
    const server = site({ [CATALOG]: { body: csv('A'), etag: '"c1"' }, [COLLECTIONS]: { body: '[]', etag: '"k1"' } })
    const store = createCatalogStore({ fetchText: server.fetchText, cache: primed(memoryTextCache(), csv('A')), siteBase: BASE })
    await store.start()
    expect(server.calls).toEqual(expect.arrayContaining([{ path: CATALOG, etag: '"c1"' }, { path: COLLECTIONS, etag: '"k1"' }]))
    store.applyPending()
    expect(titlesOf(store)).toEqual(['A'])
  })

  it('applies an update only when asked, so the screen never reshuffles mid-browse', async () => {
    const { fetchText } = site({ [CATALOG]: { body: csv('A', 'New'), etag: '"c2"' } })
    const store = createCatalogStore({ fetchText, cache: primed(memoryTextCache(), csv('A')), siteBase: BASE })
    const seen: string[][] = []
    store.subscribe(() => {
      const t = titlesOf(store)
      if (Array.isArray(t)) seen.push(t)
    })
    await store.start()
    expect(titlesOf(store)).toEqual(['A'])
    store.applyPending()
    expect(titlesOf(store)).toEqual(['A', 'New'])
    store.applyPending()
    expect(seen.at(-1)).toEqual(['A', 'New'])
  })

  it('keeps the cache when the site answers HTML instead of CSV (SPA fallback), and does not cache the HTML', async () => {
    const { fetchText } = site({ [CATALOG]: { body: HTML } })
    const cache = primed(memoryTextCache(), csv('A'))
    const store = createCatalogStore({ fetchText, cache, siteBase: BASE })
    await store.start()
    store.applyPending()
    expect(titlesOf(store)).toEqual(['A'])
    expect(cache.read('catalog.csv')?.body).toBe(csv('A'))
  })

  it('shows the error, not an empty list, when the first answer is HTML', async () => {
    const { fetchText } = site({ [CATALOG]: { body: HTML } })
    const store = createCatalogStore({ fetchText, cache: memoryTextCache(), siteBase: BASE })
    await store.start()
    expect(store.getState()).toEqual({ status: 'error' })
  })

  it('treats a corrupt cache as no cache, and refetches without its ETag so a 304 cannot lock it in', async () => {
    const server = site({ [CATALOG]: { body: csv('A'), etag: '"c1"' } })
    const cache = memoryTextCache()
    cache.write('catalog.csv', { body: 'catalog_index,video_id\n0,', etag: '"c1"' })
    const store = createCatalogStore({ fetchText: server.fetchText, cache, siteBase: BASE })
    await store.start()
    expect(server.calls.find((c) => c.path === CATALOG)?.etag).toBeNull()
    expect(titlesOf(store)).toEqual(['A'])
  })

  it('still shows fresh data when writing the cache fails (storage full)', async () => {
    const { fetchText } = site({ [CATALOG]: { body: csv('A') } })
    const cache: TextCache = { read: () => null, write: () => { throw new Error('ENOSPC') } }
    const store = createCatalogStore({ fetchText, cache, siteBase: BASE })
    await store.start()
    expect(titlesOf(store)).toEqual(['A'])
  })

  it('shows the catalog without collections when only the collections are unreachable', async () => {
    const { fetchText } = site({ [CATALOG]: { body: csv('A') } })
    const store = createCatalogStore({ fetchText, cache: memoryTextCache(), siteBase: BASE })
    await store.start()
    const state = store.getState()
    expect(state.status === 'ready' && state.data.collections).toEqual([])
  })

  it('keeps cached collections when the fresh index is not JSON', async () => {
    const { fetchText } = site({ [CATALOG]: { body: csv('A', 'B'), etag: '"c2"' }, [COLLECTIONS]: { body: HTML } })
    const store = createCatalogStore({ fetchText, cache: primed(memoryTextCache(), csv('A')), siteBase: BASE })
    await store.start()
    store.applyPending()
    const state = store.getState()
    expect(state.status === 'ready' && state.data.collections.map((c) => c.id)).toEqual(['pixar'])
    expect(titlesOf(store)).toEqual(['A', 'B'])
  })

  it('runs one load at a time', async () => {
    const server = site({ [CATALOG]: { body: csv('A') } })
    const store = createCatalogStore({ fetchText: server.fetchText, cache: memoryTextCache(), siteBase: BASE })
    await Promise.all([store.start(), store.retry()])
    expect(server.calls.filter((c) => c.path === CATALOG)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w @go10/mobile -- src/data/catalogStore`
Expected: FAIL with `Cannot find module './catalogStore'`.

- [ ] **Step 3: Implement**

`apps/mobile/src/data/catalogStore.ts`:
```ts
import { buildTitles, parseCatalogCsv } from '@go10/core/catalog/loadCatalog'
import { fromModules } from '@go10/core/collections/fromModules'
import type { Collection } from '@go10/core/collections/types'
import type { CatalogRow, Title } from '@go10/core/types'
import type { FetchText } from './httpText'
import type { CachedText, TextCache } from './textCache'

export interface CatalogData {
  rows: CatalogRow[]
  titles: Title[]
  collections: Collection[]
}

export type CatalogState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: CatalogData }

export interface CatalogStore {
  getState(): CatalogState
  subscribe(listener: () => void): () => void
  /** Show the cache at once (if any), then revalidate against the site. */
  start(): Promise<void>
  /** The "Reintentar" action: the same as start. */
  retry(): Promise<void>
  /** Swap in data a background refresh found. Called when Home comes into view. */
  applyPending(): void
}

interface Deps {
  fetchText: FetchText
  cache: TextCache
  siteBase: string
}

/** The catalog, or null for anything that isn't one (an HTML fallback page, a truncated download). */
export function parseCatalog(csv: string): CatalogRow[] | null {
  try {
    const rows = parseCatalogCsv(csv)
    return rows.length > 0 && rows.every((row) => typeof row.video_id === 'string' && row.video_id !== '') ? rows : null
  } catch {
    return null
  }
}

/** Valid collections in tile order (invalid entries dropped), or null when it isn't a JSON array. */
export function parseCollections(json: string): Collection[] | null {
  try {
    const raw: unknown = JSON.parse(json)
    if (!Array.isArray(raw)) return null
    // The index has no file names; a collection's id is its file name, so validation still checks it.
    const modules = Object.fromEntries(raw.map((c, i) => [`${(c as { id?: unknown } | null)?.id ?? `#${i}`}.json`, c]))
    return fromModules(modules).collections
  } catch {
    return null
  }
}

interface Resource<T> {
  name: string
  path: string
  parse(text: string): T | null
}

const CATALOG: Resource<CatalogRow[]> = { name: 'catalog.csv', path: 'data/catalog.csv', parse: parseCatalog }
const COLLECTIONS: Resource<Collection[]> = { name: 'collections.json', path: 'data/collections/index.json', parse: parseCollections }

export function createCatalogStore(deps: Deps): CatalogStore {
  let state: CatalogState = { status: 'loading' }
  let pending: CatalogData | null = null
  let inFlight: Promise<void> | null = null
  const listeners = new Set<() => void>()

  function set(next: CatalogState): void {
    state = next
    listeners.forEach((listener) => listener())
  }

  function readCache(name: string): CachedText | null {
    try {
      return deps.cache.read(name)
    } catch {
      return null
    }
  }

  /** The cached value, only if it still parses: a corrupt body is no cache at all. */
  function cached<T>(resource: Resource<T>): { entry: CachedText; value: T } | null {
    const entry = readCache(resource.name)
    const value = entry ? resource.parse(entry.body) : null
    return entry && value !== null ? { entry, value } : null
  }

  /** A fresh value from the site, or null (unchanged, unreachable, or not the right kind of file). */
  async function refresh<T>(resource: Resource<T>): Promise<T | null> {
    try {
      // Only a cache that parses may revalidate: its ETag must not pin a corrupt body with 304s.
      const etag = cached(resource)?.entry.etag ?? null
      const result = await deps.fetchText(deps.siteBase + resource.path, etag)
      if (result.status !== 200) return null
      const value = resource.parse(result.body)
      if (value === null) return null
      try {
        deps.cache.write(resource.name, { body: result.body, etag: result.etag })
      } catch {
        // Disk full or unwritable: still show what we just downloaded.
      }
      return value
    } catch {
      return null
    }
  }

  async function load(): Promise<void> {
    const rows = cached(CATALOG)?.value ?? null
    const current: CatalogData | null = rows
      ? { rows, titles: buildTitles(rows), collections: cached(COLLECTIONS)?.value ?? [] }
      : null
    set(current ? { status: 'ready', data: current } : { status: 'loading' })

    const [freshRows, freshCollections] = await Promise.all([refresh(CATALOG), refresh(COLLECTIONS)])
    const nextRows = freshRows ?? current?.rows ?? null
    if (!nextRows) {
      set({ status: 'error' })
      return
    }
    if (!freshRows && !freshCollections) return // unchanged (or unreachable) with a cache showing
    const next: CatalogData = {
      rows: nextRows,
      titles: freshRows ? buildTitles(freshRows) : current!.titles,
      collections: freshCollections ?? current?.collections ?? [],
    }
    if (current) pending = next
    else set({ status: 'ready', data: next })
  }

  function start(): Promise<void> {
    inFlight ??= load().finally(() => {
      inFlight = null
    })
    return inFlight
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    start,
    retry: start,
    applyPending() {
      if (!pending || state.status !== 'ready') return
      const data = pending
      pending = null
      set({ status: 'ready', data })
    },
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -w @go10/mobile 2>&1 | grep -E "Tests:"; npm run typecheck -w @go10/mobile; echo typecheck=$?`
Expected: `Tests: 31 passed, 31 total` (15 + 16) and `typecheck=0`.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/data
git commit -m "feat(mobile): stale-while-revalidate catalog store

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Screens: theme, catalog context, loading, offline and title list

**Files:**
- Create: `apps/mobile/src/theme.ts`, `apps/mobile/src/data/CatalogProvider.tsx`, `apps/mobile/src/components/LoadingScreen.tsx`, `apps/mobile/src/components/OfflineScreen.tsx`, `apps/mobile/src/components/TitleList.tsx`, `apps/mobile/src/components/HomeContent.tsx`
- Modify: `apps/mobile/src/app/_layout.tsx`, `apps/mobile/src/app/index.tsx`
- Test: `apps/mobile/src/components/OfflineScreen.test.tsx`, `apps/mobile/src/components/TitleList.test.tsx`, `apps/mobile/src/components/HomeContent.test.tsx`

**Interfaces:**
- Consumes: `CatalogStore`, `CatalogState`, `createCatalogStore` (Task 5); `createFetchText` (Task 4); `fileTextCache` (Task 4); `appExtra`, `siteBase` (Task 3); `src/platform/install` (Task 3); `imageSrc` (`@go10/core/lib/imageSrc`); `Title` (`@go10/core/types`).
- Produces:
  - `theme`: `color`, `space`, `size`, `card`, `radius`
  - `CatalogProvider({ children, store? })` and `useCatalog(): { state: CatalogState; store: CatalogStore }`
  - `OfflineScreen({ onRetry })`
  - `TitleList({ titles, imageBase })`
  - `HomeContent({ state, onRetry, imageBase })`

- [ ] **Step 1: Write the failing tests**

`apps/mobile/src/components/OfflineScreen.test.tsx`:
```tsx
import { render, screen, userEvent } from '@testing-library/react-native'
import { OfflineScreen } from './OfflineScreen'

describe('OfflineScreen', () => {
  it('says there is no connection and retries on Reintentar', async () => {
    const onRetry = jest.fn()
    await render(<OfflineScreen onRetry={onRetry} />)
    expect(screen.getByText('Sin conexión')).toBeTruthy()
    await userEvent.setup().press(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
```
`apps/mobile/src/components/TitleList.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react-native'
import type { Title } from '@go10/core/types'
import { TitleList } from './TitleList'

const title = (key: string, name: string, thumbnail: string): Title => ({
  key, kind: 'movie', title: name, year: null, studio: '', source: '', genre: '', genre_secondary: '',
  quality: '', language: '', subtitled: false, thumbnail, views: 0, durationSeconds: 0, catalogIndex: 0, seasons: [],
})

describe('TitleList', () => {
  it('lists every title with its count', async () => {
    await render(<TitleList titles={[title('a', 'Coraje', 'catalogo_files/a.webp'), title('b', 'Chowder', 'catalogo_files/b.webp')]} imageBase="https://tv.test/" />)
    expect(screen.getByText('2 títulos')).toBeTruthy()
    expect(screen.getByText('Coraje')).toBeTruthy()
    expect(screen.getByText('Chowder')).toBeTruthy()
  })

  it('loads catalog art from the site and TMDB art as-is', async () => {
    await render(<TitleList titles={[title('a', 'Coraje', 'catalogo_files/a.webp'), title('t', 'Film', 'https://image.tmdb.org/t/p/w780/x.jpg')]} imageBase="https://tv.test/" />)
    expect(screen.getByLabelText('Coraje').props.source).toEqual({ uri: 'https://tv.test/catalogo_files/a.webp' })
    expect(screen.getByLabelText('Film').props.source).toEqual({ uri: 'https://image.tmdb.org/t/p/w780/x.jpg' })
  })
})
```
`apps/mobile/src/components/HomeContent.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react-native'
import { HomeContent } from './HomeContent'

describe('HomeContent', () => {
  it('shows a spinner while loading', async () => {
    await render(<HomeContent state={{ status: 'loading' }} onRetry={jest.fn()} imageBase="https://tv.test/" />)
    expect(screen.getByLabelText('Cargando catálogo')).toBeTruthy()
  })

  it('shows the offline screen on error', async () => {
    await render(<HomeContent state={{ status: 'error' }} onRetry={jest.fn()} imageBase="https://tv.test/" />)
    expect(screen.getByText('Sin conexión')).toBeTruthy()
  })

  it('shows the titles when ready', async () => {
    const data = { rows: [], collections: [], titles: [] }
    await render(<HomeContent state={{ status: 'ready', data }} onRetry={jest.fn()} imageBase="https://tv.test/" />)
    expect(screen.getByText('0 títulos')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w @go10/mobile -- src/components`
Expected: FAIL with `Cannot find module './OfflineScreen'`, `'./TitleList'` and `'./HomeContent'`.

- [ ] **Step 3: Implement the theme and the components**

`apps/mobile/src/theme.ts`:
```ts
import { Platform } from 'react-native'

/**
 * The web app's tokens (apps/web/src/styles/tokens.css) in dp. TV sizes are
 * for a 1080p panel at 960x540 dp; phone sizes follow the web's mobile pass.
 * Fonts arrive with the Home screen (Phase 3).
 */
const tv = Platform.isTV

export const theme = {
  color: {
    bg: '#08090c',
    bgRaised: '#12141a',
    bgSunken: '#050609',
    hairline: 'rgba(242, 244, 240, 0.09)',
    accent: '#c6f24e',
    accentDim: '#7f9b2c',
    text: '#f2f4f0',
    textMuted: '#878d99',
  },
  space: { safeX: tv ? 48 : 20, safeY: tv ? 27 : 24, gap: tv ? 20 : 12 },
  size: { hero: tv ? 42 : 32, section: tv ? 22 : 20, card: tv ? 16 : 15, body: tv ? 17 : 16, meta: tv ? 15 : 14 },
  card: { width: tv ? 220 : 150 },
  radius: 8,
}
```
`apps/mobile/src/components/LoadingScreen.tsx`:
```tsx
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { theme } from '../theme'

export function LoadingScreen() {
  return (
    <View style={styles.root}>
      <ActivityIndicator size="large" color={theme.color.accent} accessibilityLabel="Cargando catálogo" />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.bg },
})
```
`apps/mobile/src/components/OfflineScreen.tsx`:
```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

/** No network and no cached catalog: the only way forward is to try again. */
export function OfflineScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Sin conexión</Text>
      <Text style={styles.body}>No se pudo cargar el catálogo. Revisá tu conexión e intentá de nuevo.</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Reintentar"
        hasTVPreferredFocus
        onPress={onRetry}
        style={({ focused, pressed }) => [styles.button, (focused || pressed) && styles.buttonActive]}
      >
        <Text style={styles.buttonText}>Reintentar</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: theme.space.safeX, backgroundColor: theme.color.bg },
  title: { color: theme.color.text, fontSize: theme.size.section, fontWeight: '700' },
  body: { color: theme.color.textMuted, fontSize: theme.size.body, textAlign: 'center' },
  button: { marginTop: 8, paddingHorizontal: 28, paddingVertical: 12, borderRadius: theme.radius, borderWidth: 2, borderColor: theme.color.accent },
  buttonActive: { backgroundColor: theme.color.accent },
  buttonText: { color: theme.color.text, fontSize: theme.size.body, fontWeight: '700' },
})
```
If the "Reintentar" label turns black on a lime background once pressed, that's Phase 3 polish. Keep it simple here.

`apps/mobile/src/components/TitleList.tsx`:
```tsx
import { Image } from 'expo-image'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { imageSrc } from '@go10/core/lib/imageSrc'
import type { Title } from '@go10/core/types'
import { theme } from '../theme'

/** Phase 2's stand-in for Home: every title, to prove the data path end to end. */
export function TitleList({ titles, imageBase }: { titles: Title[]; imageBase: string }) {
  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={styles.content}
      data={titles}
      keyExtractor={(t) => t.key}
      ListHeaderComponent={<Text style={styles.count}>{`${titles.length} títulos`}</Text>}
      renderItem={({ item }) => (
        <Pressable style={({ focused }) => [styles.item, focused && styles.itemFocused]}>
          <Image
            accessibilityLabel={item.title}
            source={{ uri: imageSrc(item.thumbnail, imageBase) }}
            style={styles.thumb}
            contentFit="cover"
          />
          <View style={styles.text}>
            <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
            {item.year !== null && <Text style={styles.meta}>{item.year}</Text>}
          </View>
        </Pressable>
      )}
    />
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  content: { paddingHorizontal: theme.space.safeX, paddingVertical: theme.space.safeY, gap: theme.space.gap },
  count: { color: theme.color.textMuted, fontSize: theme.size.meta, marginBottom: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: theme.space.gap, padding: 4, borderRadius: theme.radius, borderWidth: 2, borderColor: 'transparent' },
  itemFocused: { borderColor: theme.color.accent },
  thumb: { width: theme.card.width, height: (theme.card.width * 9) / 16, borderRadius: theme.radius, backgroundColor: theme.color.bgRaised },
  text: { flex: 1 },
  title: { color: theme.color.text, fontSize: theme.size.card, fontWeight: '600' },
  meta: { color: theme.color.textMuted, fontSize: theme.size.meta },
})
```
`apps/mobile/src/components/HomeContent.tsx`:
```tsx
import type { CatalogState } from '../data/catalogStore'
import { LoadingScreen } from './LoadingScreen'
import { OfflineScreen } from './OfflineScreen'
import { TitleList } from './TitleList'

export function HomeContent({ state, onRetry, imageBase }: { state: CatalogState; onRetry: () => void; imageBase: string }) {
  if (state.status === 'loading') return <LoadingScreen />
  if (state.status === 'error') return <OfflineScreen onRetry={onRetry} />
  return <TitleList titles={state.data.titles} imageBase={imageBase} />
}
```

- [ ] **Step 4: Run the component tests**

Run: `npm test -w @go10/mobile 2>&1 | grep -E "Tests:"`
Expected: `Tests: 37 passed, 37 total` (31 + 6).
If `userEvent.press` or `getByRole('button', { name })` behaves differently in @testing-library/react-native 14, check `node_modules/@testing-library/react-native/README.md` for the v14 API. Adapt the test mechanics only, not what it asserts, and ledger the change.

- [ ] **Step 5: Wire the provider and the routes**

`apps/mobile/src/data/CatalogProvider.tsx`:
```tsx
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { appExtra, siteBase } from '../config/appConfig'
import { createCatalogStore, type CatalogState, type CatalogStore } from './catalogStore'
import { fileTextCache } from './fileTextCache'
import { createFetchText } from './httpText'

const CatalogContext = createContext<CatalogStore | null>(null)

/** One store for the app's lifetime; `store` is injectable for tests. */
export function CatalogProvider({ children, store: injected }: { children: ReactNode; store?: CatalogStore }) {
  const [store] = useState(
    () => injected ?? createCatalogStore({ fetchText: createFetchText(), cache: fileTextCache(), siteBase: siteBase(appExtra().siteUrl) }),
  )
  useEffect(() => {
    void store.start()
  }, [store])
  return <CatalogContext.Provider value={store}>{children}</CatalogContext.Provider>
}

export function useCatalog(): { state: CatalogState; store: CatalogStore } {
  const store = useContext(CatalogContext)
  if (!store) throw new Error('useCatalog needs a CatalogProvider')
  const state = useSyncExternalStore(store.subscribe, store.getState)
  return { state, store }
}
```
`apps/mobile/src/app/_layout.tsx`:
```tsx
// First: wires core's storage and config before any other module evaluates.
import '../platform/install'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { CatalogProvider } from '../data/CatalogProvider'
import { theme } from '../theme'

export default function RootLayout() {
  return (
    <CatalogProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.color.bg } }} />
    </CatalogProvider>
  )
}
```
`apps/mobile/src/app/index.tsx`:
```tsx
import { useFocusEffect } from 'expo-router'
import { useCallback } from 'react'
import { HomeContent } from '../components/HomeContent'
import { appExtra, siteBase } from '../config/appConfig'
import { useCatalog } from '../data/CatalogProvider'

const imageBase = siteBase(appExtra().siteUrl)

export default function Home() {
  const { state, store } = useCatalog()
  // A background refresh is applied on arriving at Home, never mid-browse.
  useFocusEffect(useCallback(() => store.applyPending(), [store]))
  return <HomeContent state={state} onRetry={() => void store.retry()} imageBase={imageBase} />
}
```
If `expo-status-bar` isn't in `apps/mobile/package.json` (the template ships it), run `npx expo install expo-status-bar` inside `apps/mobile`.

- [ ] **Step 6: Run tests, typecheck and a bundle**

Run:
```bash
npm test -w @go10/mobile 2>&1 | grep -E "Tests:"
npm run typecheck -w @go10/mobile; echo typecheck=$?
cd apps/mobile && EXPO_TV=1 npx expo export --platform android --output-dir /tmp/p2-export > /tmp/p2-export.log 2>&1; echo export=$?; cd ../..
```
Expected: `Tests: 37 passed, 37 total`, `typecheck=0`, `export=0`.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): catalog context, loading/offline/list screens on expo-router

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: On the phone: build, install and the offline checks; docs

**Files:**
- Modify: `README.md` (new "Android app" section), `docs/superpowers/specs/2026-09-26-android-app-design.md` (Phase 2 status)

**Interfaces:**
- Consumes: everything above.
- Produces: the app running on the phone, and the Phase 2 "done when" confirmed.

- [ ] **Step 1: Prebuild and install on the phone**

Run in the background. A cold build takes about 10 minutes.
```bash
cd apps/mobile
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
npm run prebuild > /tmp/p2-prebuild.log 2>&1 && npx expo run:android --device ZY22MTK86Z --no-bundler > /tmp/p2-run.log 2>&1; echo exit=$?
```
Expected: `exit=0`, and `/tmp/p2-run.log` ends with the app installed and opened. Then start Metro (`npx expo start --port 8081` from `apps/mobile`, in the background, without `CI=1`, so reloads work) and run `adb -s ZY22MTK86Z reverse tcp:8081 tcp:8081`.
Check the manifest:
```bash
grep -E "leanback|touchscreen|banner" android/app/src/main/AndroidManifest.xml
```
Expected: leanback and touchscreen are both `required="false"`, and the banner is set.

- [ ] **Step 2: Online first launch**

Clear the app's data so this is a real first launch, then open the app:
```bash
adb -s ZY22MTK86Z shell pm clear blog.go10.tv
adb -s ZY22MTK86Z shell monkey -p blog.go10.tv -c android.intent.category.LAUNCHER 1
```
Ask the user to confirm on the phone:
- a spinner, then **"858 títulos"** and a scrolling list with thumbnails;
- the list scrolls smoothly.

Read `adb -s ZY22MTK86Z logcat -d -s ReactNativeJS:V | tail -20` for errors.

- [ ] **Step 3: Offline with a cache**

```bash
adb -s ZY22MTK86Z shell cmd connectivity airplane-mode enable
adb -s ZY22MTK86Z shell am force-stop blog.go10.tv
adb -s ZY22MTK86Z shell monkey -p blog.go10.tv -c android.intent.category.LAUNCHER 1
```
Metro still reaches the phone over USB (`adb reverse`), so only the site is unreachable. Ask the user to confirm the list appears at once, with the same "858 títulos". Thumbnails that were already shown come from expo-image's disk cache.

- [ ] **Step 4: Offline first launch, then Reintentar**

```bash
adb -s ZY22MTK86Z shell pm clear blog.go10.tv
adb -s ZY22MTK86Z shell monkey -p blog.go10.tv -c android.intent.category.LAUNCHER 1
```
Ask the user to confirm **"Sin conexión"** with a **Reintentar** button. Then run:
```bash
adb -s ZY22MTK86Z shell cmd connectivity airplane-mode disable
```
Ask the user to wait for the network to return, then tap **Reintentar**. Expected: the list appears.
If `cmd connectivity airplane-mode` isn't available on this Android build, ask the user to toggle airplane mode by hand instead.

- [ ] **Step 5: Document the app**

Add a section to `README.md`, after "Run":
```markdown
## Android app (apps/mobile)

An Expo + react-native-tvos app for Android TV and phones (one APK), built on
the same `@go10/core`. It fetches the catalog and collections from the live
site (`https://tv.go10.blog`, override with `GO10_SITE_URL`), caches them for
offline use, and reads the external-titles switch from the same root
`.env.local` as the web app. Needs the Android SDK and JDK 17.

```bash
cd apps/mobile
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
npm run prebuild                              # EXPO_TV=1 expo prebuild: one APK for TV and phone
npx expo run:android --device <adb serial>    # debug build, JS from Metro
npm test                                      # Jest
```
```
Update the "Tests" section so `npm test` mentions mobile. Use the real count from `npm test -w @go10/mobile`.
In the spec's *Phases* table, prefix the Phase 2 "Done when" cell with `✅ Done <date> (phone).`

- [ ] **Step 6: Full verification and commit**

Run:
```bash
npm test 2>&1 | grep -E "Tests:|Tests "
python3 -m pytest tests -q 2>&1 | tail -1
npm run typecheck; echo typecheck=$?
npm run build > /tmp/p2-build.log 2>&1; echo build=$?
git status --short | grep -E "apps/mobile/(android|ios)/" && echo "STOP: native dirs visible to git" || echo native-dirs-ignored
```
Expected: core 237, web 180, mobile 37 passing; Python 92; `typecheck=0`; `build=0`; `native-dirs-ignored`.
```bash
git add README.md docs/superpowers/specs/2026-09-26-android-app-design.md
git commit -m "docs: the Android app, and Phase 2 done on the phone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
