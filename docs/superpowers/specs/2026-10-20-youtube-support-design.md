# YouTube support — design

Date: 2026-10-20

## Intent

The owner wants to hand-add YouTube videos (movies, episodes) to the catalog and YouTube
lives to the live TV lineup, and have them behave exactly like ok.ru does today on every
platform: web, Android phone, Android TV and Tizen. "Exactly like ok.ru" means the remote
works the same: it starts by itself, Left/Right seek, Play/Pause toggles, and the volume and
mute keys control the sound. Embedding a YouTube iframe is the easy part. The real job is
making it a fully remote-controlled player.

## Goals

1. **YouTube catalog rows play like ok.ru rows** on all four platforms:
   - autoplay;
   - resume from saved progress;
   - Left/Right ±10 s seek with the on-screen feedback (coalesced, as today);
   - Play/Pause, Play and Pause keys;
   - previous/next episode and auto-next on `ended`;
   - "watched" marks and progress bars;
   - chapters of a single file (`chapter_start_seconds` / `chapter_end_seconds`) seek
     within the loaded embed, as they do for ok.ru;
   - the retry/timeout/fallback flow ("Abrir en YouTube").
2. **YouTube lives as live TV channels.** These are hand-added entries in
   `data/channels.json`, listed next to the 24/7 channels. Opening one always plays at the
   latest available position (the live edge). They show up in channel up/down, number
   entry, the TV screen, the Home live row and the mobile `/tv` screens.
3. **Volume and mute from the remote** work on YouTube content. On Tizen and Android TV
   these keys already go to the TV's own system volume and never pass through the app
   (`apps/web/src/platformTizen.ts` deliberately doesn't register them). That stays as is:
   it works for any provider. The only volume work in the app is the live TV sound toggle,
   which today posts ok.ru's mute/unmute/volume messages (`TvProvider.tsx`, `LiveVideo.tsx`)
   and must go through the channel's provider instead.

## Non-goals

- No ingest tooling: no YouTube finder, no crawler, no YouTube Data API. The owner adds rows
  and channels by hand.
- No seeking or progress on lives. There's no DVR/rewind window, no "watched", no resume.
  Left/Right on a live channel do whatever they do on the TV screen today (nothing seeks).
- No YouTube playlists as series, and no resolving `@handle` URLs (that would need the API).
- No changes to how ok.ru or vidlove behave.

## Anti-goals (failure even if it "works")

- A YouTube video that plays but where the remote's keys get swallowed by the YouTube iframe
  (focus stolen), so Back/seek stop working. Every platform's existing focus-keeping must
  cover YouTube.
- A path that only works on web. Tizen (packaged, `file://` origin, Chromium 69 era) and the
  Android TV WebView are the platforms that matter most.
- Pop-up/new-window ads (see README "Player providers: no pop-up ads, ever"). YouTube's own
  in-player ads are accepted. If YouTube ever opens windows or tabs, it fails this rule like
  any other host.

## Constraints and known facts

- Provider abstraction: `packages/core/src/player/providers/` (`EmbedProvider`). Today
  `providerFor(row)` picks by the `row.external` flag (TMDB → vidlove, everything else →
  ok.ru).
- Player screens: `apps/web/src/screens/Player.tsx` (web + Tizen) and
  `apps/mobile/src/components/PlayerView.tsx` (phone + Android TV, through the inline
  `hostHtml` page in `apps/mobile/src/player/hostPage.ts`, loaded with `baseUrl` = the site,
  so the embed sees an https origin). Both drive playback through `createPlaybackSession`
  (`packages/core/src/player/playbackSession.ts`) and the shared key map
  (`playerKeys.ts`).
- Live TV is hard-wired to ok.ru and to collection schedules: `packages/core/src/tv/`
  (`lineup.ts`, `validateChannels.ts`, `plan.ts`, `types.ts`) and
  `apps/web/src/tv/{TvProvider,TvSlot,TvScreen,ChannelTile,LiveRow}.tsx`,
  `apps/mobile/src/tv/{LiveVideo,TvScreenView,ChannelTile,LiveRow}.tsx`. These import
  `okru` directly.
- Channel number ranges today: network ≤ 99, franchise 101–199, decade ≥ 201 (highest in
  use: 206).
- The Tizen prod build runs from a `file://` origin (`apps/tizen/scripts/build-prod.sh`).
  YouTube's embed refuses to play without a valid referrer/origin (player errors 152/153).
  This is the biggest technical risk.
- The YouTube iframe player API over raw `postMessage`, with no `iframe_api` script needed
  (verify in the spike):
  - the embed URL needs `enablejsapi=1`;
  - the parent posts the string `{"event":"listening","id":<n>,"channel":"widget"}` until
    the iframe replies;
  - the iframe then posts JSON strings `{"event":"infoDelivery","info":{currentTime,
    duration, playerState, ...}}` and `{"event":"onStateChange","info":<state>}`, where
    the states are 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued, −1 unstarted;
  - commands are `{"event":"command","func":"seekTo"|"playVideo"|"pauseVideo"|"mute"|"unMute"|"setVolume","args":[...]}`;
  - start time is the `start=<int seconds>` URL param (whole seconds only).
- TV installs: the owner runs them (`sdb install` fails silently; use push +
  `0 vd_appinstall <app id>`).

## Decisions

These came from the owner:
- No ingest tooling. Movies and episodes go into the catalog by hand (`data/catalog.csv` /
  series files, same columns as today, with `embed_url` a YouTube embed URL). Lives go into
  `data/channels.json` by hand.
- Lives are live TV channels next to the 24/7 ones, with basic behavior: always the live edge.
- Normal videos get full parity with ok.ru's remote behavior.

These are my calls (the owner can override them):
- **The provider is picked by `embed_url`'s host.** It's YouTube if the host is
  `youtube.com`, `www.youtube.com`, `youtube-nocookie.com`, `www.youtube-nocookie.com` or
  `youtu.be`. Otherwise `external` → vidlove, else ok.ru. The provider normalizes whatever
  YouTube URL the owner pasted (watch, youtu.be, /embed/, /live/, /shorts/) to the canonical
  embed URL. `video_id` is the 11-character YouTube id.
- **Embed host is `www.youtube-nocookie.com`**, with `enablejsapi=1&autoplay=1&playsinline=1&rel=0`,
  plus `start` for resume and an `origin` param when the page has an http(s) origin. Fall back
  to `www.youtube.com` if the spike shows nocookie misbehaves on a target.
- **`EmbedProvider` grows a handshake hook**, for example `handshakeMessage` posted on load
  and re-posted every ~250 ms until the first message arrives, plus `serialize` (YouTube
  takes JSON strings, ok.ru takes objects). The session and both player screens use these
  generically, never `if (youtube)`.
- **`origin` becomes a list or predicate** if needed: YouTube replies may come from either
  host. Keep the "trust only the provider's origin and the iframe's own window" rule.
- **YouTube's `start` param is whole seconds**, so resume floors the saved position. That's
  acceptable.
- **Tizen origin fix (only if the spike confirms error 152/153 on the packaged build):** the
  site publishes a tiny relay page (e.g. `apps/web/public/yt.html`). It embeds the YouTube
  iframe from the real https site origin and forwards messages both ways. On a non-http(s)
  page origin, the YouTube provider's `src` points at the relay and its trusted origin is
  the site. Web and Android keep embedding YouTube directly. The relay must be ES5 (Tizen's
  Chromium).
- **Live channel config.** A channel entry has either `collection` (today's schedule
  channels) or `youtube` (a live), never both:
  ```json
  { "id": "lofi-girl", "number": 301, "name": "Lofi Girl", "youtube": "https://www.youtube.com/watch?v=jfKfPfyJRdk" }
  ```
  - `youtube` takes a video/live URL or id, or a channel URL with a `UC…` id
    (`https://www.youtube.com/channel/UC…`). A video id plays
    `embed/<id>?autoplay=1`. A channel id plays `embed/live_stream?channel=UC…`, which
    survives the stream being restarted with a new id.
  - `name` is required for YouTube channels, since there's no collection to borrow it from.
    An optional `logo` (asset path or URL) falls back to the YouTube thumbnail
    (`https://i.ytimg.com/vi/<id>/hqdefault_live.jpg`), and then to the name on a plain tile
    for channel-id lives.
- **Number range for lives: 301–399.** Group "En vivo". The decade range becomes 201–299
  (nothing in use is above 206). Update the validator and its tests.
- **The lineup `Channel` becomes a tagged union:** `{ kind: 'schedule', collection, plan, … }`
  | `{ kind: 'live', source: { videoId } | { channelId }, … }`. Everything that reads `plan`
  or `collection` narrows on `kind` first. Live channels have no "now playing" title. The
  screen shows the channel name and "En vivo".
- **Loading at the live edge:** the embed is always loaded fresh with no `start`. Opening or
  returning to a live channel reloads it, so it lands at the edge. The schedule drift
  correction in `TvSlot`/`LiveVideo` (the re-seeks to the schedule) is skipped for lives.
- **Sound on live TV:** the existing sound-on/sound-off flow (autoplays muted, then asks for
  sound) calls the channel's provider `muteMessage`/`unmuteMessage`/`volumeMessage` instead
  of `okru`. YouTube's `setVolume` takes 0–100, ok.ru's 0–1. Each provider maps from the
  shared 0..1.
- **Home live-row previews** play YouTube lives muted, the same as ok.ru channels, with the
  same "one embed at a time on a TV" rule.
- **YouTube's own controls stay on** (`controls=1`), as ok.ru's do: touch screens use them,
  and the TV overlay sits on top as it does now.
- **The Android TV embed bridge** (`useEmbedBridge`, quality/settings picker) has no YouTube
  adapter. The picker just reports no options. The native module's "WebView never takes
  focus" step must still run for YouTube rows, so check it isn't gated on the bridge being
  enabled for the provider.

## Plan shape: spike first

**Step 0 (throwaway, owner runs TV installs):** a test YouTube row and a test live channel,
built on Tizen prod (`file://`), Tizen dev, the Android TV APK and the phone APK. Check:
- it plays (or shows error 152/153);
- the `listening` handshake gets `infoDelivery` back;
- `seekTo` and `pauseVideo` work;
- autoplay works with and without mute;
- the remote's keys still reach the app afterwards (the focus is not stolen).

Suggested test content: Big Buck Bunny `aqz-KE-bpKQ` (normal video), Lofi Girl
`jfKfPfyJRdk` (live). The results decide whether the relay page is needed and which embed
host to use. Record them in `docs/superpowers/spikes/2026-10-20-youtube-embed-probe.md`.

Then: core provider + tests → web/Tizen player → mobile player → channel config and lineup
union → web live TV → mobile live TV → release bump (feature: X, per release versioning) and
CHANGELOG.

## Left to the builder

- The exact shape of the handshake/serialize additions to `EmbedProvider`.
- How `ended` is detected (`playerState` 0 in `infoDelivery` or `onStateChange`), and how
  ads are kept from polluting progress. During an ad, YouTube reports `currentTime` near 0
  or the ad's time. Ignore time updates that would jump progress backwards before the first
  real playing state, or use `videoData`/`adState` if they're present.
- Error handling: YouTube's `onError` (embedding disabled 101/150, removed 100) goes straight
  to the existing `failed` fallback instead of waiting for retries.
- Tests in the existing style (Vitest in core/web, Jest in mobile), including the channel
  validator and the data test with a YouTube channel entry.
