# Android TV checklist (run on real hardware)

Deferred from the phone-only phases. Run with the remote on a Google TV / Android TV device.

## From Phase 0 (player spike)
- [ ] Every remote key (D-pad, Select, Play/Pause, FF/RW) reaches `useTVEventHandler` while a WebView plays, with the WebView `focusable={false}`.
- [ ] The remote's Back reaches `BackHandler`.
- [ ] Autoplay and `timeupdate` work on the TV's system WebView.
- [ ] The app shows in the launcher's app row with its banner.

## From Phase 3 (Home)
- [ ] On launch, focus starts on the hero's **Reproducir**.
- [ ] Down from the hero lands on the collection strip, then row by row; focus never disappears.
- [ ] Moving down into a row, then back up and down again, returns to the card last focused in that row (focus guides), not the nearest card.
- [ ] Right along a row scrolls it; the focused card is fully visible, scaled up and ringed in lime.
- [ ] Holding Down through all rows keeps up (virtualised list mounts rows before focus reaches them).
- [ ] Scroll to the last row, then all the way back up: focus stays where you left it (the hero never re-takes it).
- [ ] Select on a card opens its screen; Back returns to Home with focus on that same card.
- [ ] Unfocused cards are dimmed; the focused one is at full brightness.

## From Phase 4 (Detail + Player)
- [ ] Opening a title puts focus on **Reproducir / Reanudar**.
- [ ] Down from Play reaches the season tabs, then the episode grid; Up/Down/Left/Right move tile by tile and the caption follows the focused episode.
- [ ] Leaving the grid and coming back returns to the last focused tile (focus guide).
- [ ] Back from Detail returns to Home with focus on the card that opened it.
- [ ] In the player, the WebView never takes focus: Left/Right seek 10 s, FF/RW seek 10 s, Play/Pause toggles (ok.ru), and **one press acts once** (key-down only).
- [ ] Select or Up opens the bar with focus on play/pause; Left/Right move between its buttons; Back closes it; Back again leaves to Detail.
- [ ] Back from the player returns focus to the Play button or the episode tile that started it.
- [ ] Media next/previous keys step episodes.
- [ ] The embed plays and reports progress on the TV's system WebView (Reanudar shows up afterwards).
