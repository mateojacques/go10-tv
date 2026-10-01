# Live TV on Android: checklist (an Android TV box and a phone)

Needs a site deployed with `data/channels.json` (any web build from the
`android-live-tv` branch on publishes it), or point the app at a local
build: `npm run build -w @go10/web && npx vite preview --host` in
`apps/web`, then `GO10_SITE_URL=http://<lan-ip>:4173 npx expo start`.

## Sound and picture
- [ ] A channel plays **with sound** from the start (the app posts unmute + volume after load). If silent: note whether ok.ru's own mute icon shows.
- [ ] No ok.ru title or control bar peeks out at 1080p, nor on a phone in landscape (`OKRU_CHROME_PX` in `hostPage.ts`, 64 today).
- [ ] Nothing covers the picture while it plays.
- [ ] The screen doesn't dim or sleep after 10+ minutes of TV (if it does: keep the screen awake on `/tv`).

## Remote (Android TV)
- [ ] Up/Down and CH+/CH− zap; holding Down loads only where it stops (black with the number meanwhile).
- [ ] Left/Right bring the strip, focused on the playing channel; Left/Right then move along it; it hides after 6 s.
- [ ] OK while watching does nothing; OK on the playing tile hides the strip; OK on another tile tunes it.
- [ ] Info shows the strip.
- [ ] Back with the strip open closes it; Back again returns to Home (not to `/tv`, not through every zap).
- [ ] Back still works after the channel has loaded and after several zaps (the WebView never takes focus).
- [ ] Play/Pause, FF/RW do nothing.
- [ ] Home: the navbar's TV item and the En vivo ahora row are reachable with the D-pad.

## Phone
- [ ] `/tv` turns landscape and immersive; leaving restores portrait and the system bars.
- [ ] A tap shows the strip and bar; another tap hides them; a vertical swipe zaps (up = next).
- [ ] The sound button mutes and unmutes; the back button leaves.
- [ ] Locking and unlocking the phone rejoins the live second.

## Failure paths
- [ ] Airplane mode on a channel: "Reconectando…", then "Señal interrumpida" with the strip open; zapping still works.
- [ ] A site without `data/channels.json` (today's production until it's redeployed): no TV item, no En vivo ahora row, no crash.

## Sync
- [ ] The same channel on the web and on the TV shows the same program within a few seconds.
