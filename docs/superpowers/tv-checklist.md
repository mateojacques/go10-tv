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

## From Phase 5 (Seguir viendo, catalog, search, collections)
- [ ] Up from the hero reaches the navbar (Películas, Series, Buscar); Down returns to the hero.
- [ ] Seguir viendo sits after the collection strip; Select on a card starts playback directly; Back returns to Home with focus on that card.
- [ ] Películas / Series open with focus on the first card; Down/Right move through the grid and it keeps loading as focus goes down (no dead end at the bottom).
- [ ] Series from the Películas navbar swaps screens; Back from either goes to Home.
- [ ] Buscar opens the IME on the input; results update after a pause; Down leaves the input for the section chips, then the first result.
- [ ] A collection opens with focus on its first title; Back returns to Home with focus on its tile.

## From Phase 6 (External titles)
- [ ] With a query, Down from the section chips reaches Lenguaje original / Doblaje latino, then the first result.
- [ ] A TMDB result opens its Detail (Cargando título… first on a cold start); Back returns to the results with focus on that card.
- [ ] A vidlove title plays on the TV's system WebView; FF/RW and Left/Right seek; the bar has no play/pause button.
- [ ] A played TMDB title shows in Seguir viendo after a relaunch, and resumes where it stopped.
