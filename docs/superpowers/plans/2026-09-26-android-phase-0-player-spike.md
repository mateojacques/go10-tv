# Android Phase 0 — Player Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Answer one question with evidence: can a React Native (`react-native-tvos` on Expo) app host the ok.ru and vidlove iframe embeds in a WebView, receive their playback events, and drive them from the TV remote, on both the Android TV emulator and the user's phone? Output is a go/no-go on option C, written up as a findings document.

**Architecture:** A throwaway Expo TV app, outside the go10-tv repo, with a single screen: a full-screen WebView whose document is a tiny host page we own. The host page wraps the embed in an `<iframe>`, relays the embed's `postMessage` events to React Native, and forwards commands from React Native to the iframe. An on-screen log shows everything that happens. The remote keys (via `useTVEventHandler`) and `BackHandler` are wired to commands so their behaviour can be observed.

**Tech Stack:** Expo (the `with-tv` example: `react-native-tvos` + `@react-native-tvos/config-tv`), `react-native-webview`, Android Studio's Android TV emulator, `adb`.

**Spec:** `docs/superpowers/specs/2026-09-26-android-app-design.md` (sections *Player* and *Phases → 0*)

## Global Constraints

- **The spike code is throwaway.** It lives in `~/Repositorios/go10-tv-spike` (its own git repo, for convenience only) and is never merged into go10-tv. The only go10-tv change is the findings doc, plus `public/player-host.html` **only if** Task 4 needs option (b) and the user approves deploying it.
- **No TDD for the spike code.** Its "tests" are the verification matrix in Task 4, run on real targets. Unit tests for the production versions of this code belong to Phase 4.
- **Devices are checked by the user.** The executor builds and installs; the user watches the emulator and the phone and reports what they see. No automated emulator, screenshot or browser verification.
- **Never infer player state from wall-clock timers.** Every playback conclusion comes from events the embed actually posted, as they appear in the on-screen log.
- **`react-native-tvos` must match the Expo SDK's React Native version.** Use whatever the `with-tv` example pins; don't upgrade either one by hand.
- **Network commands may need the sandbox disabled.** `npm`, `curl` and Gradle downloads may fail inside the sandbox (ok.ru egress has failed here before). If one fails with a network error, rerun it with the sandbox disabled rather than retrying the same way.
- **Samples:** ok.ru `https://ok.ru/videoembed/15692556471022` (Hora de Aventura: Fionna y Cake T1, a 4 h season file, so seeks are easy to see). vidlove `https://player.vidlove.cc/embed/tv/1396/1/2` (Breaking Bad S1E2, used in the existing vidlove tests).
- **`SITE_URL`** is the go10-tv Netlify production URL. Ask the user for it in Task 1; it isn't in the repo.

## Review Focus

These are the ways the real app would most likely break that no code-level test would catch. Each one is a row in Task 4's matrix:

1. **The embed rejects the inline host page** (a referrer or parent-origin check against a `baseUrl` document that was never actually fetched from that origin). Expected: the video loads, or the log shows it didn't. That's what option (b) is for.
2. **The WebView takes the D-pad focus,** so arrow and media keys stop reaching `useTVEventHandler`. Expected: every key press shows up in the log while the video plays.
3. **The WebView consumes Back** for its own history, or Back never reaches `BackHandler`. Expected: the first Back press is logged by React Native, and the host page doesn't navigate.
4. **The embed navigates the top frame away** (ad click, `window.open`, "watch on ok.ru" link). Expected: `onShouldStartLoadWithRequest` blocks it, the block is logged, and the host page stays.
5. **Autoplay is blocked without a user gesture.** Expected: `started`/`play` then `timeupdate` events arrive with no tap or keypress.

---

### Task 1: Toolchain check and scaffold that runs on both targets

**Files:**
- Create: `~/Repositorios/go10-tv-spike/` (from the `with-tv` example)
- Modify: `~/Repositorios/go10-tv-spike/package.json` (`main`)
- Create: `~/Repositorios/go10-tv-spike/index.ts`
- Create: `~/Repositorios/go10-tv-spike/App.tsx` (placeholder, replaced in Task 2)
- Create: `~/Repositorios/go10-tv-spike/config.ts`

**Interfaces:**
- Produces: `SITE_URL: string` exported from `config.ts`; a project that `EXPO_TV=1 npx expo run:android` builds and installs; the root component `App` in `App.tsx`, registered by `index.ts`.

- [ ] **Step 1: Check the machine's prerequisites**

Run:
```bash
java -version 2>&1 | head -1
echo "ANDROID_HOME=${ANDROID_HOME:-unset}"
command -v adb emulator sdkmanager avdmanager || true
node -v && npm -v
```
Expected: JDK 17 (`openjdk version "17…`), `ANDROID_HOME` set, `adb` and `emulator` on the PATH, Node ≥ 20.
If anything is missing, **stop and tell the user exactly what to install**: Android Studio → SDK Manager (Android SDK Platform for the SDK the template targets, Platform-Tools, Emulator) and JDK 17. Don't try to install system packages yourself.

- [ ] **Step 2: Make sure there's an Android TV emulator (AVD)**

Run: `avdmanager list avd | grep -E "Name:|Device:"`
Expected: an AVD whose device is a TV profile (for example `tv_1080p`).
If there isn't one, ask the user to create it in Android Studio: Device Manager → Create Device → **TV** → "Television (1080p)" → a Google TV system image (API 34 or newer). Then ask them to start it: `emulator -avd <name> &`.

- [ ] **Step 3: Ask the user for `SITE_URL` and connect the phone**

Ask for the production Netlify URL of go10-tv (for example `https://<site>.netlify.app`).
Ask the user to enable USB debugging on the phone and plug it in. Then run: `adb devices -l`
Expected: two devices listed, `emulator-5554` (TV) and the phone's serial. Write both serials down; later steps use them as `$TV` and `$PHONE`.

- [ ] **Step 4: Scaffold from Expo's TV example**

Run:
```bash
cd ~/Repositorios
npx create-expo-app@latest go10-tv-spike -e with-tv
cd go10-tv-spike
npx expo install react-native-webview
grep -E '"(expo|react-native|react-native-webview)"' package.json
```
Expected: `react-native` points to `npm:react-native-tvos@…`, and `react-native-webview` is present. Write down the Expo SDK and the tvos version for the findings doc.

- [ ] **Step 5: Take over the entry point**

The example may use `expo-router`. The spike needs one screen, so replace the entry point with a plain root component.

Set `"main": "index.ts"` in `package.json`. If `app.json` lists `"expo-router"` under `plugins`, remove that entry.

Create `index.ts`:
```ts
import { registerRootComponent } from 'expo'
import App from './App'

registerRootComponent(App)
```

Create `config.ts`, using the URL from Step 3:
```ts
/** go10-tv's Netlify production URL: the host page's origin, as on the web. */
export const SITE_URL = 'https://<value the user gave in Step 3>'
```

Create a placeholder `App.tsx`:
```tsx
import { Platform, Text, View } from 'react-native'

export default function App() {
  return (
    <View style={{ flex: 1, backgroundColor: '#08090c', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#f2f4f0', fontSize: 32 }}>GO10 spike — isTV={String(Platform.isTV)}</Text>
    </View>
  )
}
```

- [ ] **Step 6: Build the TV variant and install it on both targets**

Run:
```bash
EXPO_TV=1 npx expo prebuild --clean
npx expo run:android --device "$TV"
npx expo run:android --device "$PHONE"
```
Expected: both builds install and launch, and the Metro dev server serves both.
Ask the user to confirm the emulator shows `isTV=true` and the phone shows `isTV=false`. **Record the result:** one TV-configured APK running on a phone is the spec's "one universal APK" assumption, so it goes in the findings doc.
Also ask the user to check whether the app appears in the **Android TV launcher's app row** (it may only show there once a banner exists; write down what they see).

- [ ] **Step 7: Commit (spike repo)**

```bash
git add -A && git commit -m "spike: scaffold Expo TV app"
```

---

### Task 2: Host page, WebView and event log

**Files:**
- Create: `~/Repositorios/go10-tv-spike/samples.ts`
- Create: `~/Repositorios/go10-tv-spike/hostHtml.ts`
- Create: `~/Repositorios/go10-tv-spike/player-host.html` (option (b), deployed only in Task 4 if needed)
- Modify: `~/Repositorios/go10-tv-spike/App.tsx` (replace the placeholder)

**Interfaces:**
- Consumes: `SITE_URL` from `config.ts`.
- Produces:
  - `interface Sample { label: string; origin: string; src: string; parse(data: unknown): Parsed | null; seek(time: number): unknown; play: unknown; pause: unknown }`
  - `type Parsed = { kind: 'time'; time: number; duration: number } | { kind: 'paused' } | { kind: 'playing' } | { kind: 'ended' }`
  - `SAMPLES: Sample[]`
  - `hostHtml(embedSrc: string, origin: string): string`
  - `type HostMode = 'inline' | 'remote'`
  - in `App.tsx`: `send(cmd: unknown)`, which runs `window.go10Command(cmd)` in the host page, and `log(line: string)`.

- [ ] **Step 1: Write the samples and parsers**

These mirror `src/screens/providers/okru.ts` and `vidlove.ts` in go10-tv. The `play`/`pause` payloads for vidlove are **candidates**, confirmed or replaced in Task 3.

`samples.ts`:
```ts
export type Parsed =
  | { kind: 'time'; time: number; duration: number }
  | { kind: 'paused' }
  | { kind: 'playing' }
  | { kind: 'ended' }

export interface Sample {
  label: string
  origin: string
  src: string
  parse(data: unknown): Parsed | null
  seek(time: number): unknown
  play: unknown
  pause: unknown
}

/** Some embeds post JSON strings rather than objects; accept both. */
function asObject(data: unknown): Record<string, any> | null {
  if (typeof data === 'string') {
    try { return JSON.parse(data) } catch { return null }
  }
  return data && typeof data === 'object' ? (data as Record<string, any>) : null
}

export const SAMPLES: Sample[] = [
  {
    label: 'ok.ru',
    origin: 'https://ok.ru',
    // fromTime=120: also checks that URL resume works inside the WebView.
    src: 'https://ok.ru/videoembed/15692556471022?autoplay=1&fromTime=120',
    parse(data) {
      const d = asObject(data)
      if (d?.event === 'timeupdate' && typeof d.time === 'number') return { kind: 'time', time: d.time, duration: d.duration ?? 0 }
      if (d?.event === 'started' || d?.event === 'resumed') return { kind: 'playing' }
      if (d?.event === 'paused') return { kind: 'paused' }
      if (d?.event === 'ended') return { kind: 'ended' }
      return null
    },
    seek: (time) => ({ action: 'seek', time }),
    play: { action: 'play' },
    pause: { action: 'pause' },
  },
  {
    label: 'vidlove',
    origin: 'https://player.vidlove.cc',
    src: 'https://player.vidlove.cc/embed/tv/1396/1/2?autoplay=true&autonext=false&episodelist=false&showNextEpisode=false',
    parse(data) {
      const d = asObject(data)
      if (d?.type !== 'PLAYER_EVENT') return null
      const e = d.data ?? {}
      if (e.event === 'timeupdate' && typeof e.currentTime === 'number') return { kind: 'time', time: e.currentTime, duration: e.duration ?? 0 }
      if (e.event === 'play') return { kind: 'playing' }
      if (e.event === 'pause') return { kind: 'paused' }
      if (e.event === 'ended') return { kind: 'ended' }
      return null
    },
    seek: (time) => ({ type: 'seek', time }),
    play: { type: 'play' },
    pause: { type: 'pause' },
  },
]
```

- [ ] **Step 2: Write the host page (option a, inline)**

`hostHtml.ts`:
```ts
/** Escapes a value for a double-quoted HTML attribute. */
function attr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

/**
 * The document the WebView loads: one iframe plus a relay. Embed messages
 * from `origin` go to RN as {kind:'embed'}; messages from any other origin
 * are reported as {kind:'other'} so the log shows what we'd be filtering.
 * RN sends commands with window.go10Command(cmd).
 */
export function hostHtml(embedSrc: string, origin: string): string {
  return `<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{border:0;width:100%;height:100%}</style>
</head><body>
<iframe id="f" src="${attr(embedSrc)}" allow="autoplay; fullscreen; encrypted-media" allowfullscreen></iframe>
<script>
  var ORIGIN = ${JSON.stringify(origin)};
  var f = document.getElementById('f');
  function send(o) { window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  window.addEventListener('message', function (e) {
    if (e.origin === ORIGIN && e.source === f.contentWindow) send({ kind: 'embed', data: e.data });
    else send({ kind: 'other', origin: e.origin });
  });
  window.go10Command = function (cmd) { f.contentWindow.postMessage(cmd, ORIGIN); };
  f.addEventListener('load', function () { send({ kind: 'iframe-load' }); });
  send({ kind: 'host', origin: location.origin, href: location.href });
</script>
</body></html>`
}
```

- [ ] **Step 3: Write the same host page as a static file (option b)**

`player-host.html` reads `src` and `origin` from its query string. It's used only if Task 4 shows the inline page is rejected.
```html
<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{border:0;width:100%;height:100%}</style>
</head><body>
<iframe id="f" allow="autoplay; fullscreen; encrypted-media" allowfullscreen></iframe>
<script>
  var params = new URLSearchParams(location.search);
  var ORIGIN = params.get('origin');
  var f = document.getElementById('f');
  function send(o) { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  window.addEventListener('message', function (e) {
    if (e.origin === ORIGIN && e.source === f.contentWindow) send({ kind: 'embed', data: e.data });
    else send({ kind: 'other', origin: e.origin });
  });
  window.go10Command = function (cmd) { f.contentWindow.postMessage(cmd, ORIGIN); };
  f.addEventListener('load', function () { send({ kind: 'iframe-load' }); });
  f.src = params.get('src');
  send({ kind: 'host', origin: location.origin, href: location.href });
</script>
</body></html>
```

- [ ] **Step 4: Write the player screen with the log**

Replace `App.tsx`. The remote keys and Back come in Task 3; this step gives on-screen buttons on the phone only, so nothing on TV can take focus.
```tsx
import { useCallback, useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes'
import { SITE_URL } from './config'
import { hostHtml } from './hostHtml'
import { SAMPLES, type Parsed } from './samples'

export type HostMode = 'inline' | 'remote'
const HOST_MODE: HostMode = 'inline'
const REMOTE_HOST = `${SITE_URL}/player-host.html`
const MAX_LOG = 14

export default function App() {
  const webRef = useRef<WebView>(null)
  const [sampleIndex, setSampleIndex] = useState(0)
  const [lines, setLines] = useState<string[]>([])
  const timeRef = useRef(0)
  const playingRef = useRef(false)
  const sample = SAMPLES[sampleIndex]

  const log = useCallback((line: string) => {
    const stamp = new Date().toISOString().slice(11, 19)
    setLines((prev) => [`${stamp} ${line}`, ...prev].slice(0, MAX_LOG))
  }, [])

  const send = useCallback((cmd: unknown) => {
    log(`→ ${JSON.stringify(cmd)}`)
    webRef.current?.injectJavaScript(`window.go10Command(${JSON.stringify(cmd)}); true;`)
  }, [log])

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    const msg = JSON.parse(e.nativeEvent.data)
    if (msg.kind !== 'embed') {
      log(`[${msg.kind}] ${JSON.stringify({ ...msg, kind: undefined })}`)
      return
    }
    const parsed: Parsed | null = sample.parse(msg.data)
    if (!parsed) {
      log(`embed (unparsed) ${JSON.stringify(msg.data).slice(0, 120)}`)
      return
    }
    if (parsed.kind === 'time') {
      // timeupdate fires several times a second; log once per 5 s of playback
      // or on any jump (a seek), so seeks are visible in the log.
      const jumped = Math.abs(parsed.time - timeRef.current) > 2
      if (jumped || Math.floor(parsed.time / 5) !== Math.floor(timeRef.current / 5)) {
        log(`time ${parsed.time.toFixed(1)} / ${parsed.duration.toFixed(0)}`)
      }
      timeRef.current = parsed.time
      return
    }
    if (parsed.kind === 'playing') playingRef.current = true
    if (parsed.kind === 'paused') playingRef.current = false
    log(`event ${parsed.kind}`)
  }, [log, sample])

  const onShouldStart = useCallback((req: ShouldStartLoadRequest) => {
    // Sub-frame loads (the embed itself, its ads) are fine; only the top frame is guarded.
    if (req.isTopFrame === false) return true
    const allowed =
      req.url === 'about:blank' ||
      req.url.startsWith(SITE_URL) ||
      (HOST_MODE === 'remote' && req.url.startsWith(REMOTE_HOST))
    if (!allowed) log(`BLOCKED top-frame nav → ${req.url.slice(0, 100)}`)
    return allowed
  }, [log])

  const seekBy = useCallback((delta: number) => {
    send(sample.seek(Math.max(0, timeRef.current + delta)))
  }, [send, sample])

  const togglePlay = useCallback(() => {
    send(playingRef.current ? sample.pause : sample.play)
  }, [send, sample])

  const nextSample = useCallback(() => {
    setSampleIndex((i) => (i + 1) % SAMPLES.length)
    timeRef.current = 0
    playingRef.current = false
    log('--- switched sample ---')
  }, [log])

  const source =
    HOST_MODE === 'inline'
      ? { html: hostHtml(sample.src, sample.origin), baseUrl: SITE_URL }
      : { uri: `${REMOTE_HOST}?src=${encodeURIComponent(sample.src)}&origin=${encodeURIComponent(sample.origin)}` }

  return (
    <View style={styles.root}>
      <WebView
        key={`${sampleIndex}-${HOST_MODE}`}
        ref={webRef}
        style={styles.web}
        source={source}
        originWhitelist={['*']}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={onShouldStart}
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo
        setSupportMultipleWindows={false}
        focusable={!Platform.isTV}
      />
      <View style={styles.log} pointerEvents="none">
        <Text style={styles.logTitle}>{sample.label} · host={HOST_MODE} · isTV={String(Platform.isTV)}</Text>
        {lines.map((l, i) => <Text key={i} style={styles.logLine}>{l}</Text>)}
      </View>
      {!Platform.isTV && (
        <View style={styles.buttons}>
          <Btn label="-10" onPress={() => seekBy(-10)} />
          <Btn label="play/pause" onPress={togglePlay} />
          <Btn label="+10" onPress={() => seekBy(10)} />
          <Btn label="next sample" onPress={nextSample} />
        </View>
      )}
    </View>
  )
}

function Btn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.btn} onPress={onPress}>
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  web: { flex: 1, backgroundColor: '#000' },
  log: { position: 'absolute', top: 8, left: 8, maxWidth: '60%', backgroundColor: 'rgba(0,0,0,0.7)', padding: 8 },
  logTitle: { color: '#c6f24e', fontSize: Platform.isTV ? 18 : 12, fontWeight: '700' },
  logLine: { color: '#f2f4f0', fontSize: Platform.isTV ? 16 : 11, fontFamily: 'monospace' },
  buttons: { position: 'absolute', bottom: 16, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 8 },
  btn: { backgroundColor: 'rgba(198,242,78,0.9)', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 6 },
  btnText: { color: '#08090c', fontWeight: '700' },
})
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. If `isTopFrame` or `ShouldStartLoadRequest` doesn't resolve with the installed `react-native-webview` version, find the type's current name in `node_modules/react-native-webview/lib/WebViewTypes.d.ts` and import that instead. Write down which version you used.

- [ ] **Step 6: Reload both targets and do a first smoke check**

Metro hot-reloads JS; if it doesn't, press `r` in the Metro terminal. (No native changes since Task 1: `react-native-webview` was already installed before the prebuild.)
Ask the user to report the first log lines on each device: the `[host]` line (origin and href), `[iframe-load]`, and whether any `event`/`time` lines appear for ok.ru.

- [ ] **Step 7: Commit (spike repo)**

```bash
git add -A && git commit -m "spike: WebView host page, embed relay and event log"
```

---

### Task 3: Remote keys, Back, and vidlove play/pause

**Files:**
- Modify: `~/Repositorios/go10-tv-spike/App.tsx`
- Modify: `~/Repositorios/go10-tv-spike/samples.ts` (vidlove `play`/`pause`, if Step 1 finds the real shape)

**Interfaces:**
- Consumes: `send`, `log`, `seekBy`, `togglePlay`, `nextSample` from Task 2's `App.tsx`; `SAMPLES`.
- Produces: the key map as the spec's *TV remote* table defines it (in spike form): Play/Pause and Select → toggle; FF and Right → +10 s; RW and Left → −10 s; Down → next sample (spike only); Back → logged and consumed.

- [ ] **Step 1: Look for vidlove's play/pause command in its bundle**

Run from the scratchpad directory:
```bash
curl -sL https://player.vidlove.cc/embed/movie/155 -o vidlove.html
grep -o 'assets/index-[A-Za-z0-9_-]*\.js' vidlove.html | head -1
curl -sL "https://player.vidlove.cc/$(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' vidlove.html | head -1)" -o vidlove.js
grep -o '.\{0,300\}seekto.\{0,600\}' vidlove.js | head -3
```
Expected: the `message` handler that switches on `type|event|action`. Read it for play/pause/toggle cases and write down the exact payload shape.
- If it has them, set `play`/`pause` in the vidlove entry of `samples.ts` to that shape.
- If it has none, keep the candidates. Task 4 records that play/pause isn't supported and the spec's fallback applies (play/pause disabled for vidlove titles).
- If `curl` is blocked, rerun it with the sandbox disabled. If it's still blocked, skip this step and rely on Task 4's live test.

- [ ] **Step 2: Add the remote key handler and Back handling**

In `App.tsx`, add `useEffect` to the existing `react` import and `BackHandler, useTVEventHandler` to the existing `react-native` import:
```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { BackHandler, Platform, Pressable, StyleSheet, Text, useTVEventHandler, View } from 'react-native'
```
Then add inside `App`, after `nextSample`:
```tsx
  // Every TV key is logged, so the matrix shows which ones actually arrive
  // while the WebView is on screen.
  useTVEventHandler((evt) => {
    if (!evt?.eventType || evt.eventType === 'blur' || evt.eventType === 'focus') return
    log(`key ${evt.eventType}`)
    switch (evt.eventType) {
      case 'playPause':
      case 'select':
        togglePlay()
        break
      case 'fastForward':
      case 'right':
        seekBy(10)
        break
      case 'rewind':
      case 'left':
        seekBy(-10)
        break
      case 'down':
        nextSample()
        break
    }
  })

  // Consume Back so we can see it arrive; the real app pops the stack here.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      log('key back (BackHandler)')
      return true
    })
    return () => sub.remove()
  }, [log])
```
If `useTVEventHandler` isn't exported from `react-native` in this tvos version, import it from wherever the `with-tv` example's own code imports it, and write that path down.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Quick check that keys arrive on the emulator**

Ask the user to press the arrow keys and Enter on the emulator (the keyboard or the extended-controls D-pad), then run:
```bash
adb -s "$TV" shell input keyevent KEYCODE_MEDIA_PLAY_PAUSE
adb -s "$TV" shell input keyevent KEYCODE_MEDIA_FAST_FORWARD
adb -s "$TV" shell input keyevent KEYCODE_MEDIA_REWIND
adb -s "$TV" shell input keyevent KEYCODE_BACK
```
Expected: one `key …` line per press in the log. If none appear, don't debug here. That's Review Focus #2, and Task 4 records it.

- [ ] **Step 5: Commit (spike repo)**

```bash
git add -A && git commit -m "spike: remote key map, back handling, vidlove commands"
```

---

### Task 4: Run the verification matrix

**Files:**
- Modify (only in the option (b) branch, with the user's approval): `go10-tv/public/player-host.html`, copied from the spike's `player-host.html`
- Modify (only in the option (b) branch): `~/Repositorios/go10-tv-spike/App.tsx` (`HOST_MODE = 'remote'`)

**Interfaces:**
- Consumes: the running spike app from Tasks 1–3.
- Produces: a filled-in matrix (pass / fail / notes for each cell) that Task 5 copies into the findings doc.

- [ ] **Step 1: Run the matrix with `HOST_MODE = 'inline'`**

Go through each row with the user, first on the TV emulator (keys) and then on the phone (buttons and touch). For each cell record **pass / fail and the evidence**, meaning the log lines the user reads out. Run each row for ok.ru, then press Down (TV) or "next sample" (phone) and run it for vidlove.

| # | Check | How | Pass looks like |
|---|---|---|---|
| M1 | Embed loads in the inline host | open the sample | the video frame renders; `[iframe-load]` is logged |
| M2 | Autoplay with no gesture (RF #5) | touch nothing | `event playing` and then `time …` lines |
| M3 | ok.ru URL resume | ok.ru only | the first `time` is ≈120 |
| M4 | Events reach RN | watch 30 s | `time` lines advance, and `[other]` lines show which origins we're filtering out |
| M5 | Seek command | TV: Right/FF, Left/RW · phone: ±10 | the next `time` jumps by ≈10 s |
| M6 | Play/pause command | TV: Play/Pause and Select · phone: button | `event paused` / `event playing` follow each `→` line |
| M7 | Keys still arrive while the video plays (RF #2) | TV: every key from Task 3 Step 4 | one `key …` per press, with focus never stuck in the WebView |
| M8 | Back reaches RN (RF #3) | TV: Back · phone: the back gesture | `key back (BackHandler)`, and the host page doesn't navigate |
| M9 | Top frame can't be navigated away (RF #4) | phone: tap the embed's ok.ru logo / title / any ad; TV: n/a | `BLOCKED top-frame nav → …` and the video stays |
| M10 | `ended` arrives | ok.ru: seek near the end (send `seek` to `duration - 5` with repeated FF, or on the phone temporarily change the `+10` button to `+3600`); vidlove: the same | `event ended` |
| M11 | Embed fullscreen on the phone | phone: the embed's own fullscreen button | fullscreen works, or record how it fails (the real app does its own landscape/immersive mode, so this is information, not a blocker) |

- [ ] **Step 2: Decide whether option (b) is needed**

If **M1, M2 or M4 fails for either provider** with the inline host, and the log suggests a referrer or origin problem (for example `[other]` shows no events from the embed's origin, or the embed displays an "embedding not allowed" message), option (b) is needed. Otherwise skip to Step 4.

- [ ] **Step 3 (only if Step 2 says so): Try option (b), the served host page**

Ask the user first. This deploys a file to their production site. If they approve:
```bash
cp ~/Repositorios/go10-tv-spike/player-host.html ~/Repositorios/go10-tv/public/player-host.html
cd ~/Repositorios/go10-tv && git add public/player-host.html && git commit -m "spike: serve player-host.html for the Android player spike

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Then ask the user how their site deploys (a push to main, or a manual deploy) and let them trigger it. Once `curl -sI "$SITE_URL/player-host.html"` returns `200`, set `HOST_MODE = 'remote'` in the spike's `App.tsx`, reload, and rerun rows M1–M9 in a second column.

- [ ] **Step 4: Record the results**

Write the filled-in matrix into the scratchpad as `matrix.md` (inline column, and the remote column if Step 3 ran), plus the versions from Task 1 Step 4 and Task 2 Step 5, and the launcher and universal-APK observations from Task 1 Step 6.

---

### Task 5: Findings doc and go/no-go

**Files:**
- Create: `go10-tv/docs/superpowers/spikes/2026-09-26-android-player-spike.md`

**Interfaces:**
- Consumes: `matrix.md` from Task 4 and the Task 3 Step 1 bundle notes.
- Produces: the findings doc that the Phase 1 and Phase 4 plans build on.

- [ ] **Step 1: Apply the decision rule**

- **GO (option C holds):** M1, M2, M4, M5, M7 and M8 pass for **ok.ru** on **both** targets, in either host mode. (ok.ru is the whole catalog, so it's the one that has to work.)
- **GO with caveats:** as above, but vidlove fails M6 (play/pause) or M11, or M9 fails. Each caveat names the spec change it forces.
- **NO-GO → option A:** ok.ru fails M1, M2 or M4 in both host modes, or M7 fails (keys don't reach RN while the WebView is on screen) with no workaround found in the tvos or webview docs. Record why, because the same WebView constraint would also apply to a Kotlin app, and the Option A spec has to address it.

- [ ] **Step 2: Write the findings doc**

Use this structure, filled in from `matrix.md`:
```markdown
# Android player spike — findings

Date: 2026-09-26 · Spec: docs/superpowers/specs/2026-09-26-android-app-design.md (Phase 0)

## Verdict
GO | GO with caveats | NO-GO — one paragraph on why.

## Versions
Expo SDK …, react-native-tvos …, react-native-webview …, TV emulator image …, phone model / Android version …

## Matrix
(the table from Task 4, with the inline and remote columns, TV and phone, ok.ru and vidlove)

## Decisions this settles for the spec
- Host page: inline `baseUrl` (a) or served `player-host.html` (b).
- vidlove play/pause: the command shape, or "unsupported → disabled".
- Key event names as they actually arrive (`playPause`, `fastForward`, …) and the Back path.
- One TV-configured APK on a phone: works / doesn't.
- Launcher row: does the app show without a banner?

## Surprises
Anything the spec didn't anticipate, each with the spec section it touches.
```

- [ ] **Step 3: Update the spec if the findings change it**

For each "Decisions" line that differs from the spec's current text (for example the host mode chosen, or vidlove play/pause being unsupported), edit the matching sentence in `docs/superpowers/specs/2026-09-26-android-app-design.md`, and change its status line to `Phase 0 done (GO | GO with caveats | NO-GO)`.

- [ ] **Step 4: Commit (go10-tv)**

```bash
cd ~/Repositorios/go10-tv
git add docs/superpowers/spikes/2026-09-26-android-player-spike.md docs/superpowers/specs/2026-09-26-android-app-design.md
git commit -m "docs: Android player spike findings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Report to the user**

Give the verdict, the caveats, and the next step: **GO** → write the Phase 1 plan (monorepo + core); **NO-GO** → brainstorm the Option A spec. The spike repo `~/Repositorios/go10-tv-spike` stays on disk for reference. It's never merged.
