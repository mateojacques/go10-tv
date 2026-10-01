# Live TV on Tizen: checklist (run on the T5300)

Attach DevTools as in `tizen-sdb-setup.md` §5 to read key codes:
`addEventListener('keydown', (e) => console.log(e.key, e.keyCode), true)`.

## Remote
- [ ] Which keys arrive at all: CH+ (427), CH− (428), 0–9 (48–57), Info (457), PRE-CH (10190), CH LIST (10073). Missing ones are fine: Up/Down, Left/Right, OK and Back cover everything.
- [ ] Back leaves `/tv` even after the channel has loaded (the embed takes focus as it loads; the screen takes it back).
- [ ] Back still works after zapping several times.
- [ ] Play/Pause, FF/RW do nothing.
- [ ] The TV's own volume and mute keys change the sound; the channel plays with sound from the start.

## Picture
- [ ] No ok.ru title or control bar peeks out at 1080p (`--go-okru-chrome` in `tv.css`, 64px today).
- [ ] A zap shows black with the number, then the new channel; holding Up loads only where it stops.
- [ ] When a channel freezes (an ad, autoplay), "Pulsá OK para ver" shows, and OK gets it playing.

## Speed
- [ ] Moving along the strip feels as quick as Home's rows.
- [ ] If it doesn't: record a DevTools Performance trace of five Right presses on the strip.
