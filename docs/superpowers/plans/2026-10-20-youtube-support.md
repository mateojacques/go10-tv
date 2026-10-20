# YouTube Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hand-added YouTube catalog rows play with full remote control (like ok.ru) on web, Android phone, Android TV and Tizen, and hand-added YouTube lives air as live TV channels at the live edge.

**Architecture:** A third `EmbedProvider` (`youtube`) speaks YouTube's iframe postMessage API. The provider is picked by `embed_url` host. Two generic additions make it work everywhere:
- a handshake (YouTube only talks after it hears `listening`);
- an `error` event, which goes straight to the fallback.

Live TV's `Channel` becomes a tagged union, `schedule | live`. Slots get their session from the channel kind, and sound and play go through semantic slot methods instead of raw ok.ru messages. If the spike shows packaged Tizen (`file://`) can't embed YouTube, a site-hosted relay page fronts the embed there.

**Tech Stack:** TypeScript, React (Vite) for web/Tizen, Expo/React Native + react-native-webview for Android, Vitest (core, web), Jest (mobile).

**Spec:** `docs/superpowers/specs/2026-10-20-youtube-support-design.md`

## Global Constraints

- `packages/core` must not touch platform globals (`noPlatformGlobals.test.ts`). Page origin and relay URL reach core through a setter, as `setExternalConfigSource` does.
- Embed host: `https://www.youtube-nocookie.com`. Params: `enablejsapi=1&autoplay=1&playsinline=1&rel=0`, `start=<int>` for resume, `origin=<page origin>` when known.
- Recognized YouTube hosts: `youtube.com`, `www.youtube.com`, `m.youtube.com`, `youtube-nocookie.com`, `www.youtube-nocookie.com`, `youtu.be`.
- Commands are JSON **strings**: `{"event":"command","func":<name>,"args":[…]}`. Handshake: `{"event":"listening","id":1,"channel":"widget"}`.
- Live channel numbers: 301–399, group label `En vivo`. Decade range becomes 201–299.
- Live channel entry: `id`, `number`, `name` (required), `youtube` (required), optional `logo`; no `collection`, `blockMinutes`, `exclude`.
- Fallback label for YouTube: `Abrir en YouTube`.
- Code running inside the relay page or TV WebViews is ES5 (Tizen's Chromium 69).
- No changes to ok.ru or vidlove behavior. Existing tests stay green.
- Release: X = feature, Y = content, Z = bugfix, so this is **2.0.0**. Bump `app.config.ts` (+`versionCode`), `package.json`, the Tizen `config.xml`s, and `CHANGELOG.md`.

## Review Focus

1. **Remote focus after YouTube loads.** On Tizen and Android TV, Back/Left/Right must still reach the app after the YouTube iframe loads and after an ad. Covered by Task 4's focus test and the device checklist in Task 11.
2. **Ads polluting progress.** A pre-roll reports a `currentTime` near 0 (or the ad's time), and must not overwrite a saved resume point. Covered by Task 2's `parse` test and Task 3's "does not save before the first real playing state" test.
3. **Embedding disabled or video removed** (error 100/101/150): goes to the fallback at once, not after 4 retries. Covered by Task 3's `onError` test and Task 4's Player test.
4. **A live channel opened twice, or back from a hidden tab,** lands at the live edge, not where it was. Covered by Task 8's `sync()` → `'load'` test.
5. **A hand edit with a bad `youtube` value** (a `@handle` URL, a typo): the channel is skipped with a warning and the data test fails. Covered by Task 7's validator tests.

---

### Task 0: Spike — does YouTube's postMessage API work on each target? (throwaway)

**Files:**
- Create: `apps/tizen/probe/index.html`, `apps/tizen/probe/config.xml` (copy of `prod/config.xml` with id `Go10TVprb1.GO10Probe`, name `GO10 Probe`). Delete both after the spike.
- Create: `docs/superpowers/spikes/2026-10-20-youtube-embed-probe.md`

- [ ] **Step 1: Write the probe page.** It's ES5 and needs no build. It embeds `https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?enablejsapi=1&autoplay=1&playsinline=1` and posts the `listening` string every 250 ms until a message arrives. It prints every message (origin + data, truncated) on screen. Keys:
  - Left/Right: `seekTo` ±10 s;
  - Enter: `pauseVideo`/`playVideo` toggle;
  - `1`: reload with the Lofi live `jfKfPfyJRdk`;
  - `2`: reload with `www.youtube.com` instead of nocookie;
  - `3`: reload via `https://tv.go10.blog/yt-probe.html` (the same page published under `apps/web/public/` for this step only).
- [ ] **Step 2: Package it** with the `tz` commands from `apps/tizen/scripts/build-prod.sh`, pointed at `apps/tizen/probe`. Ask the owner to install it (push + `0 vd_appinstall Go10TVprb1.GO10Probe`; `sdb install` fails silently) and to report or photograph the screen for each key.
- [ ] **Step 3: Check the Android TV / phone WebView path.** Temporarily point an existing catalog row's `embed_url` at the YouTube embed in a dev build, or load the probe page via `hostHtml` with `baseUrl` = site. Record whether `infoDelivery` arrives and whether `seekTo` and `pauseVideo` work.
- [ ] **Step 4: Record the results** in the spike doc as a table:
  - target × {plays, error code shown, `infoDelivery` received, seek works, pause works, live plays, which host};
  - a one-line verdict: **relay needed on Tizen: yes/no**, **host: nocookie/youtube.com**.
- [ ] **Step 5: Delete the probe files** (keep the spike doc) and commit the doc.

```bash
git add docs/superpowers/spikes/2026-10-20-youtube-embed-probe.md
git commit -m "docs(spike): YouTube embed probe results"
```

If the verdict changes the host, update Global Constraints before Task 2. If the relay isn't needed, skip Task 6.

---

### Task 1: Parse YouTube URLs

**Files:**
- Create: `packages/core/src/player/youtubeUrl.ts`
- Test: `packages/core/src/player/youtubeUrl.test.ts`

**Interfaces:**
- Produces:
  - `type YoutubeSource = { videoId: string } | { channelId: string }`
  - `isYoutubeUrl(url: string): boolean`
  - `parseYoutube(input: string): YoutubeSource | null`

- [ ] **Step 1: Write failing tests.** `parseYoutube` maps each of these to `{ videoId: 'aqz-KE-bpKQ' }`:
  - `https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=30`
  - `https://youtu.be/aqz-KE-bpKQ`
  - `https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?start=5`
  - `https://www.youtube.com/live/aqz-KE-bpKQ?si=x`
  - `https://www.youtube.com/shorts/aqz-KE-bpKQ`
  - `https://m.youtube.com/watch?v=aqz-KE-bpKQ`
  - the bare id `aqz-KE-bpKQ`

  It maps `https://www.youtube.com/channel/UCSJ4gkVC6NrvII8umztf0Ow` and `…/embed/live_stream?channel=UCSJ4gkVC6NrvII8umztf0Ow` to `{ channelId: 'UCSJ4gkVC6NrvII8umztf0Ow' }`. It returns `null` for `https://www.youtube.com/@LofiGirl`, `https://ok.ru/video/1`, `''`, `'abc'`. `isYoutubeUrl` is true for the hosts in Global Constraints and false for `https://ok.ru/videoembed/1` and `https://notyoutube.com/x`.
- [ ] **Step 2: Run them and confirm they fail.** `cd packages/core && npx vitest run src/player/youtubeUrl.test.ts`
- [ ] **Step 3: Implement.** Video id: `/^[A-Za-z0-9_-]{11}$/`. Channel id: `/^UC[A-Za-z0-9_-]{22}$/`. Use `new URL` in a try/catch.
- [ ] **Step 4: Run them and confirm they pass.**
- [ ] **Step 5: Commit** `feat(core): parse YouTube URLs`

---

### Task 2: The youtube provider and `providerFor` by host

**Files:**
- Modify: `packages/core/src/player/providers/types.ts`, `packages/core/src/player/providers/index.ts`
- Create: `packages/core/src/player/providers/youtube.ts`
- Test: `packages/core/src/player/providers/youtube.test.ts`, `packages/core/src/player/providers/index.test.ts` (create)

**Interfaces:**
- Consumes: `parseYoutube`, `isYoutubeUrl` (Task 1).
- Produces:
  - `PlayerEvent` gains `| { kind: 'playing' } | { kind: 'error'; code: number }`.
  - `EmbedProvider` gains `handshakeMessage?: unknown` (posted until the embed first speaks).
  - `EmbedProvider.volumeMessage` stays `(volume: number) => unknown` with `volume` in 0..1. YouTube maps it to `setVolume` with `Math.round(volume * 100)`.
  - `configureYoutube(config: { pageOrigin: string | null; relayUrl: string | null }): void` from `youtube.ts`.
  - `youtube: EmbedProvider`. `origin` is a getter: the relay's origin when `relayUrl` is set, else `https://www.youtube-nocookie.com`.
  - `youtubeEmbedSrc(source: YoutubeSource, opts: { start?: number | null; mute?: boolean }): string`, which Task 8 uses for lives.
  - `createYoutubeParser(): (data: unknown) => PlayerEvent | null`
  - `providerFor(row)`: `isYoutubeUrl(row.embed_url)` → `youtube`, else `row.external` → `vidlove`, else `okru`.

- [ ] **Step 1: Write failing tests** for `youtube`:
  - `src(row, 61.9)` for a row with `embed_url` `https://youtu.be/aqz-KE-bpKQ` equals `https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?enablejsapi=1&autoplay=1&playsinline=1&rel=0&start=61`.
  - After `configureYoutube({ pageOrigin: 'https://tv.go10.blog', relayUrl: null })`, the same src ends with `&origin=https%3A%2F%2Ftv.go10.blog`.
  - After `configureYoutube({ pageOrigin: null, relayUrl: 'https://tv.go10.blog/yt.html' })`, src is `https://tv.go10.blog/yt.html?src=<encoded embed src>` and `youtube.origin` is `https://tv.go10.blog`. Reset the config in `afterEach`.
  - `seekMessage(42.5)` is `'{"event":"command","func":"seekTo","args":[42.5,true]}'`. `playMessage` and `pauseMessage` are `playVideo` and `pauseVideo` with `args: []`. `muteMessage` is `mute`, `unmuteMessage` is `unMute`, `volumeMessage(1)` is `setVolume` with `[100]`.
  - `handshakeMessage` is `'{"event":"listening","id":1,"channel":"widget"}'`.
  - `parse`:
    - a JSON string of infoDelivery `{currentTime: 12, duration: 600, playerState: 1}` → `{kind:'time', time:12, duration:600}`;
    - `playerState: 2` → `{kind:'paused'}`;
    - `playerState: 0` → `{kind:'ended', time: <currentTime>}`;
    - `onStateChange` with `info: 1` → `{kind:'playing'}`;
    - `onError` with `info: 150` → `{kind:'error', code:150}`;
    - an object (not a string), garbage JSON or another event → `null`;
    - infoDelivery carrying `currentTime` but no `playerState` → `time` (YouTube sends partial updates).
  - `resumesViaUrl` is `true`. `fallbackLabel` is `'Abrir en YouTube'`.
  - `index.test.ts`: `providerFor` returns `youtube` for a youtube.com `embed_url`, `vidlove` for `external: true` with a vidlove url, and `okru` for an ok.ru row.
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/player/providers`
- [ ] **Step 3: Implement** `youtube.ts` and the type and `providerFor` changes. `src` uses `row.embed_url` → `parseYoutube` → `youtubeEmbedSrc`. A `channelId` source uses `embed/live_stream?channel=<id>`. Floor `start` and omit it when ≤ 0. Partial `infoDelivery` messages carry only changed fields, so the parser keeps the last `currentTime`, `duration` and `playerState` in a closure from `createYoutubeParser()`. `youtube.parse` uses one module-level instance (the on-demand player shows one video at a time), and Task 8 creates its own instance per live slot.
- [ ] **Step 4: Run core tests.** `cd packages/core && npx vitest run && npx tsc -p tsconfig.json`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(core): youtube embed provider, picked by embed_url host`

---

### Task 3: Handshake, `playing` and `error` in the playback session

**Files:**
- Create: `packages/core/src/player/handshake.ts`
- Modify: `packages/core/src/player/playbackSession.ts`
- Test: `packages/core/src/player/handshake.test.ts`, `packages/core/src/player/playbackSession.test.ts`

**Interfaces:**
- Consumes: `EmbedProvider.handshakeMessage`, the `PlayerEvent` kinds `playing` and `error` (Task 2).
- Produces:
  - `HANDSHAKE_INTERVAL_MS = 250`, `HANDSHAKE_MAX_TRIES = 40`
  - `startHandshake(message: unknown, send: (m: unknown) => void, timers?: { set: typeof setInterval; clear: typeof clearInterval }): { stop(): void }`. It sends at once, then every interval, up to the max tries.
  - `PlaybackSession.attach(): void`. Call it on every iframe/WebView `load`. It starts the handshake if the provider has one and stops it on the first message `parse` recognizes; `load()` and `flush`-on-unmount also stop it.
  - `createPlaybackSession({ …, onError?: (code: number) => void })`

- [ ] **Step 1: Write failing tests** (fake timers):
  - `startHandshake` sends 1 + n times, stops after `stop()`, and never exceeds 40.
  - Session with the youtube provider: `attach()` sends the handshake. After `handle(<infoDelivery string>)` no more handshakes go out.
  - `handle(onError 101)` calls `onError(101)` once and writes no progress.
  - **Ad guard:** row with saved progress at 300 s. Before any `playing` event, an infoDelivery with `currentTime: 3` does not overwrite the saved progress (`readProgress` still 300 after `flush()`). After `{kind:'playing'}` arrives with `currentTime ≥ 299`, saves resume normally. The guard is generic: it applies only while `provider.handshakeMessage` exists, so the ok.ru tests stay unchanged.
  - ok.ru: `attach()` sends nothing.
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/player/handshake.test.ts src/player/playbackSession.test.ts`
- [ ] **Step 3: Implement.** In `handle`, a `playing` event sets `playing = true` and opens the "real playback" gate. Until the gate opens, `time` events update `lastDuration` only and don't touch `position` or `lastTime`, so seeks still use the resume target. `error` calls `onError`.
- [ ] **Step 4: Run all core tests and the typecheck.** Expected: pass.
- [ ] **Step 5: Commit** `feat(core): embed handshake and error events in the playback session`

---

### Task 4: Web/Tizen on-demand Player uses the new session hooks

**Files:**
- Modify: `apps/web/src/screens/Player.tsx`, `apps/web/src/platform.ts`, `apps/web/src/env.d.ts`
- Test: `apps/web/src/screens/Player.youtube.test.tsx` (create, modeled on `Player.vidlove.test.tsx`)

**Interfaces:**
- Consumes: `session.attach()`, `onError` (Task 3); `configureYoutube` (Task 2).
- Produces: `installWebPlatform()` calls `configureYoutube({ pageOrigin: /^https?:$/.test(location.protocol) ? location.origin : null, relayUrl: import.meta.env.VITE_YT_RELAY ?? null })`. Declare `VITE_YT_RELAY?: string` in `env.d.ts`.

- [ ] **Step 1: Write failing tests** with a YouTube row:
  - the iframe src starts with `https://www.youtube-nocookie.com/embed/`;
  - firing the iframe `load` posts the handshake string to the frame;
  - an infoDelivery message from origin `https://www.youtube-nocookie.com` (source = frame) followed by ArrowRight posts a `seekTo` string after the 400 ms coalesce;
  - MediaPlayPause posts `pauseVideo`;
  - an `onError` 150 message shows `No se pudo reproducir aquí.` and an `Abrir en YouTube` link, with no retry wait;
  - the window `blur` refocus test, repeated for the YouTube row: focus returns to the handle.
- [ ] **Step 2: Run them and confirm they fail.** `cd apps/web && npx vitest run src/screens/Player.youtube.test.tsx`
- [ ] **Step 3: Implement.**
  - `handleLoad` calls `session.attach()`.
  - Pass `onError: () => dispatch({ type: 'fail' })` to `createPlaybackSession`. If `playerRetryReducer` has no immediate-fail action, add `{ type: 'fail' }` in `packages/core/src/player/playerRetry.ts` with a test there.
  - Wire `configureYoutube` in `platform.ts`.
- [ ] **Step 4: Run the web suite and typecheck.** `npx vitest run && npx tsc -b`. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): YouTube rows in the on-demand player`

---

### Task 5: Android (phone + TV) on-demand Player

**Files:**
- Modify: `apps/mobile/src/components/PlayerView.tsx`, the mobile platform install (where `setKeyValueStore` is called; find with `grep -rn setKeyValueStore apps/mobile/src`)
- Test: `apps/mobile/src/components/PlayerView.test.tsx`

**Interfaces:**
- Consumes: `session.attach()`, `onError`, `configureYoutube`.
- Produces: the mobile platform calls `configureYoutube({ pageOrigin: <site origin from appConfig>, relayUrl: null })`. The host page is served with `baseUrl` = site, so no relay is needed.

- [ ] **Step 1: Write failing tests:**
  - a YouTube row renders the WebView with `hostHtml` using origin `https://www.youtube-nocookie.com`;
  - a `{kind:'loaded'}` host message injects `commandScript(<handshake string>)`;
  - an `{kind:'embed', data:<onError 150 string>}` message shows the fallback with `Abrir en YouTube`;
  - on a TV UI, `installBridge` is still called for a YouTube row. The native install step makes the WebView non-focusable, which the remote depends on. Check that the bridge's `enabled` doesn't depend on the provider; if it does, decouple the focus step.
- [ ] **Step 2: Run them and confirm they fail.** `cd apps/mobile && npx jest src/components/PlayerView.test.tsx`
- [ ] **Step 3: Implement.** Wire `onError` to an immediate fail, call `session.attach()` on `loaded`, and configure YouTube.
- [ ] **Step 4: Run the mobile suite and typecheck.** `npx jest && npx tsc --noEmit`. Expected: pass.
- [ ] **Step 5: Commit** `feat(mobile): YouTube rows in the on-demand player`

---

### Task 6: Tizen relay page (only if Task 0 says "relay needed")

**Files:**
- Create: `apps/web/public/yt.html`
- Modify: `.env.tizen` (add `VITE_YT_RELAY=https://tv.go10.blog/yt.html`)
- Test: `apps/web/build/ytRelay.test.ts` (create; jsdom)

**Interfaces:**
- Consumes: the `?src=<encoded embed url>` contract from Task 2.
- Produces: a page that embeds `src` (only when `src` starts with `https://www.youtube-nocookie.com/embed/` or `https://www.youtube.com/embed/`, otherwise blank). It forwards parent → embed with target origin = the embed's origin, and embed → parent with `'*'` (the parent is `file://`, origin `null`). Messages are dropped unless they come from `window.parent` or the inner frame respectively. ES5, inline script, black full-bleed iframe with `allow="autoplay; fullscreen; encrypted-media"`.

- [ ] **Step 1: Write failing tests.** Load the HTML into jsdom:
  - a non-YouTube `src` creates no iframe;
  - a message from the parent is re-posted to the inner frame;
  - a message from the inner frame is re-posted to the parent;
  - a message from any other source is ignored.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement** `yt.html` and set `VITE_YT_RELAY` in `.env.tizen`.
- [ ] **Step 4: Run the tests and confirm they pass,** then `npx vite build --base ./ --mode tizen` builds.
- [ ] **Step 5: Commit** `feat(tizen): relay page so packaged builds can embed YouTube`

---

### Task 7: Live channels in `channels.json`, validation and lineup

**Files:**
- Modify: `packages/core/src/tv/types.ts`, `packages/core/src/tv/validateChannels.ts`, `packages/core/src/tv/lineup.ts`, `packages/core/src/tv/groups.ts`
- Test: `validateChannels.test.ts`, `lineup.test.ts`, `groups.test.ts` in the same folder, and `apps/web/src/tv/channels.data.test.ts` (unchanged, must stay green)

**Interfaces:**
- Consumes: `parseYoutube` (Task 1).
- Produces:
  - `ChannelConfig = ScheduleChannelConfig | LiveChannelConfig`. `ScheduleChannelConfig` is today's shape. `LiveChannelConfig` is `{ id; number; name: string; youtube: string; logo?: string }`.
  - `type ChannelGroupId = CollectionGroup | 'live'`
  - `Channel = ScheduleChannel | LiveChannel`:
    - `ScheduleChannel`: `{ kind: 'schedule'; id; number; name; group: CollectionGroup; collection: Collection; plan: ChannelPlan }`
    - `LiveChannel`: `{ kind: 'live'; id; number; name; group: 'live'; source: YoutubeSource; logo: string | null; thumbnail: string | null }`. `thumbnail` is `https://i.ytimg.com/vi/<id>/hqdefault_live.jpg` for a video source, `null` for a channel source.
  - `isLive(channel: Channel): channel is LiveChannel`
  - `channelGroups` adds `{ group: 'live', label: 'En vivo' }` after decades. `ChannelGroup.label` gains `'En vivo'` and `group` becomes `ChannelGroupId`.

- [ ] **Step 1: Write failing tests:**
  - validator accepts `{id:'lofi-girl', number:301, name:'Lofi Girl', youtube:'https://www.youtube.com/watch?v=jfKfPfyJRdk'}`;
  - validator rejects it with:
    - no `name` → `name is required for a youtube channel`;
    - `youtube: 'https://www.youtube.com/@LofiGirl'` → `youtube must be a video URL/id or a channel URL with a UC… id`;
    - both `youtube` and `collection` → `use either collection or youtube, not both`;
    - number 205 or 400 → `a live channel's number must be from 301 to 399`;
  - a decade channel numbered 301 → `a decade channel's number must be from 201 to 299`;
  - `resolveLineup` returns a live channel with `kind:'live'`, `group:'live'` and the thumbnail URL, sorted among the others by number;
  - `channelGroups` puts it last under `En vivo`;
  - existing schedule-channel tests get `kind: 'schedule'` in their expectations.
- [ ] **Step 2: Run them and confirm they fail.** `cd packages/core && npx vitest run src/tv`
- [ ] **Step 3: Implement.** Branch on `'youtube' in entry` first in `validateChannelEntry` and in `resolveLineup`. Catalog-context checks (collection exists, can air) apply to schedule channels only.
- [ ] **Step 4: Run core tests and typecheck.** Typecheck failures in apps/web and apps/mobile are expected; Tasks 9 and 10 fix them. Core itself must be clean.
- [ ] **Step 5: Commit** `feat(core): YouTube live channels in channels.json`

---

### Task 8: A live session per channel kind

**Files:**
- Create: `packages/core/src/tv/youtubeLiveSession.ts`, `packages/core/src/tv/sessionFor.ts`
- Modify: `packages/core/src/tv/liveSession.ts` (the `LiveSession` interface gains the members below; the schedule session implements them with ok.ru)
- Test: `youtubeLiveSession.test.ts`, `sessionFor.test.ts` in the same folder

**Interfaces:**
- Consumes: `LiveChannel` (Task 7); `youtubeEmbedSrc`, `createYoutubeParser`, `youtube` (Task 2); `startHandshake` (Task 3).
- Produces:
  - `LiveSession` gains:
    - `origin: string` (where `post` and message checks go);
    - `attach(): void` (call on frame load);
    - `playMessage: unknown`;
    - `soundMessages(on: boolean): unknown[]` (ok.ru: `[unmute, volume(1)]` / `[mute]`; YouTube the same via its provider);
    - `parseTime(data: unknown): number | null` (for the stall detector, replacing direct `okru.parse` in slots).
  - `current()` returns `null` for a live channel. `sync()` always returns `'load'`, so returning from a hidden tab reloads at the live edge.
  - `createYoutubeLiveSession({ channel: LiveChannel, send }): LiveSession`. `tune()` returns `youtubeEmbedSrc(channel.source, { start: null })`. `handle` stops the handshake on the first recognized message. A `paused` event sends `playVideo`, rate-limited by `RESUME_INTERVAL_MS`, as live TV can't be paused. There's no drift logic.
  - `createSessionFor({ channel, epochMs, send, onFinishedEarly }): LiveSession` dispatches on `channel.kind`.

- [ ] **Step 1: Write failing tests:**
  - YouTube live `tune()` has no `start=`;
  - two `tune()` calls give the same src;
  - `sync()` → `'load'`;
  - `attach()` then a message stops the handshake;
  - paused → `playVideo` sent once within 3 s;
  - `parseTime` on infoDelivery returns `currentTime`;
  - `soundMessages(true)` is `[unMute, setVolume 100]`;
  - `createSessionFor` returns a schedule session for a schedule channel (its `tune()` contains `fromTime=`);
  - the existing `liveSession.test.ts` still passes, plus tests for `origin`, `soundMessages` and `parseTime` on the ok.ru session.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run core tests.** Expected: pass.
- [ ] **Step 5: Commit** `feat(core): live sessions per channel kind`

---

### Task 9: Web/Tizen live TV supports live channels

**Files:**
- Modify: `apps/web/src/tv/TvSlot.tsx`, `TvProvider.tsx`, `TvScreen.tsx`, `ChannelTile.tsx`, `useLiveNow.ts` (all in that folder)
- Test: `TvSlot.test.tsx`, `TvProvider.test.tsx`, `ChannelTile.test.tsx`, `TvScreen.test.tsx` in the same folder

**Interfaces:**
- Consumes: `createSessionFor`, `LiveSession` members (Task 8); `isLive`, `LiveChannel` (Task 7).
- Produces:
  - `SlotHandle` becomes `{ play(): void; setSound(on: boolean): void; isLoaded(): boolean }`; `post` is removed. `TvProvider` no longer imports `okru`.
  - `useLiveNow` returns schedules for schedule channels only: `Map<string, Schedule>` with no entry for live ids. Callers treat a missing entry as "En vivo".

- [ ] **Step 1: Write failing tests** with a live channel fixture:
  - TvSlot renders an iframe whose src starts with `https://www.youtube-nocookie.com/embed/jfKfPfyJRdk`;
  - frame load posts the handshake;
  - a `visibilitychange` to visible remounts the iframe (new `key`);
  - there is no "A continuación" card;
  - a failed non-preview slot shows `Señal interrumpida` without an "up next" line;
  - TvProvider's sound toggle on a live main slot posts `unMute` and `setVolume [100]` strings;
  - ChannelTile shows the YouTube thumbnail and the name, with `En vivo` instead of a program label and no progress bar;
  - TvScreen's info strip shows `En vivo` and the channel `logo` if set;
  - existing ok.ru tests stay green after switching from `post` to `play`/`setSound`.
- [ ] **Step 2: Run them and confirm they fail.** `cd apps/web && npx vitest run src/tv`
- [ ] **Step 3: Implement.** Narrow with `isLive` wherever `channel.plan` or `channel.collection` is read. For tile colour, use `theme`'s surface token when there's no collection.
- [ ] **Step 4: Run the full web suite and `npx tsc -b`.** Expected: pass.
- [ ] **Step 5: Commit** `feat(web): YouTube lives on live TV`

---

### Task 10: Mobile live TV supports live channels

**Files:**
- Modify: `apps/mobile/src/tv/LiveVideo.tsx`, `TvScreenView.tsx`, `ChannelTile.tsx`, `useLiveNow.ts`, `LiveRow.tsx` (all in that folder)
- Test: `LiveVideo.test.tsx`, `ChannelTile.test.tsx`, `TvScreenView.test.tsx` in the same folder

**Interfaces:**
- Consumes: the same as Task 9. The host page origin comes from `session.origin`.

- [ ] **Step 1: Write failing tests** mirroring Task 9:
  - LiveVideo uses `hostHtml(<youtube src>, 'https://www.youtube-nocookie.com', { cropPx: 0 })` (`OKRU_CHROME_PX` stays ok.ru-only);
  - `loaded` injects the handshake;
  - the sound toggle injects `unMute`/`setVolume`;
  - ChannelTile shows the thumbnail and `En vivo`;
  - TvScreenView's chip uses `logo` or the name.
- [ ] **Step 2: Run them and confirm they fail.** `cd apps/mobile && npx jest src/tv`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full mobile suite and `npx tsc --noEmit`.** Expected: pass.
- [ ] **Step 5: Commit** `feat(mobile): YouTube lives on live TV`

---

### Task 11: Device verification and release 2.0.0

**Files:**
- Modify: `data/channels.json` (only if the owner gives a live to add; never invent one), `CHANGELOG.md`, `apps/mobile/app.config.ts` (version + `versionCode`), `apps/mobile/package.json`, `apps/web/package.json` (whichever carry the app version today), `apps/tizen/prod/config.xml`, `apps/tizen/dev/config.xml`

- [ ] **Step 1: Run every suite.** `npm test` in `packages/core`, `apps/web` and `apps/mobile`, plus each typecheck. Expected: all pass.
- [ ] **Step 2: Build the APK and Tizen wgt.** `npm run build:release` in `apps/mobile`, and `apps/tizen/scripts/build-prod.sh` (stop before install). Use a temporary local test row (Big Buck Bunny) and test live (Lofi Girl). Ask the owner to install and check each platform:
  - autoplay;
  - resume;
  - Left/Right seek with feedback;
  - Play/Pause;
  - next/previous and auto-next;
  - the volume and mute keys (system);
  - Back works after an ad;
  - the live opens at the edge, and channel up/down works on and off it.

  Remove the test row and channel afterwards unless the owner keeps them.
- [ ] **Step 3: Bump to 2.0.0** (see Global Constraints). Add a CHANGELOG entry: "YouTube: videos and lives play with full remote control on every platform."
- [ ] **Step 4: Commit** `chore(release): 2.0.0`
