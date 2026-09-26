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
- [ ] Select on a card opens its screen; Back returns to Home with focus on that same card.
- [ ] Unfocused cards are dimmed; the focused one is at full brightness.
