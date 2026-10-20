# YouTube embed probe — 2026-10-20

The probe was a throwaway page. It embeds YouTube with `enablejsapi=1`, posts the `listening` handshake every 250 ms, then auto-sends `seekTo` and `pauseVideo` and logs every message. It ran in desktop Chrome, both headless and headed via CDP, from three kinds of origin:
- an http origin (`http://localhost`);
- a `file://` origin, which is what the packaged Tizen app has;
- a `file://` parent that goes through a relay page served over http.

| Case | Host | Result |
|---|---|---|
| Video `aqz-KE-bpKQ`, http parent | nocookie | plays; `initialDelivery`, `onReady`, then `infoDelivery` (partial updates); `start=20` honoured; `seekTo` and `pauseVideo` work |
| Same, `file://` parent | nocookie and youtube.com | `onError 153` (no referrer) |
| Same, `file://` parent → http relay → YouTube | nocookie | plays; events relayed; `seekTo` works |
| Live by video id `gCNeDWCI0vo` | nocookie | plays at the live edge; `currentTime` is stream time (~7.1e6 s); `duration` grows |
| Live by `embed/live_stream?channel=UCNye-wNBqNL5ZzHSJj3l8Bg` | nocookie | plays |
| Lofi Girl `jfKfPfyJRdk`; NASA channel live_stream | both | `onError 150` (owner disallows embedding) |

Findings that shape the build:

- **Relay needed on Tizen: yes.** A `file://` parent always gets 153; through a relay page it works.
- **Host: `www.youtube-nocookie.com`.**
- **State comes inside `infoDelivery.info.playerState`.** No `onStateChange` messages arrived after the handshake. `infoDelivery` is partial: `duration` and `playerState` only appear when they change.
- **Errors arrive as `{"event":"onError","info":<code>}`.**
- **Some lives can't be embedded (150).** They should fall back like any other embed error. Lofi Girl, the spec's example, is one of them.
- **Not verified here:** Tizen's Chromium 69 itself, and the Android WebView. Those are checked on the devices at release (plan Task 11).
