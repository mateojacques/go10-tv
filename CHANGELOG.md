# Changelog

Releases of the GO10 TV apps (Android APK and Tizen). The version is
`X.Y.Z`, bumped by what the release brings:

- **X — new feature.** Something the app couldn't do before.
- **Y — new content.** Titles added to the catalog, nothing else changed.
- **Z — bugfix.**

The version is set in `apps/mobile/app.config.ts` (with Android's
`versionCode`, which must go up by one every release), in
`apps/mobile/package.json` and in `apps/tizen/prod/config.xml`.

## 2.1.0 — 2026-10-22

New content: a Brazilian telenovela, and Dragon Ball Super: Beerus in Latin
American Spanish.

- *Avenida Brasil*: 160 episodes, dubbed in Latin American Spanish.
- *Dragon Ball Super: Beerus*: episodes 1 and 2 in Latin American Spanish.
  They replace the subtitled Japanese episode 1.

## 2.0.0 — 2026-10-20

New feature: YouTube. Videos and lives from YouTube play with the remote
just like ok.ru, on the web, Android (phone and TV) and Tizen.

- A catalog row whose `embed_url` is a YouTube link plays on YouTube. It
  starts by itself, resumes where you left off, seeks ±10 s with Left/Right,
  and has Play/Pause, previous/next and auto-next. A video YouTube won't let
  other sites play opens the "Abrir en YouTube" fallback right away. Ads
  YouTube plays first never count as progress.
- YouTube lives are live TV channels, numbered 301–399 and listed under
  "En vivo". Add one to `data/channels.json` with `name` and `youtube` (a
  video link, or a channel's `/channel/UC…` link to follow whatever it
  streams). They always open at the latest point.
- *LoL Bootcamp NA* on 301: League of Legends pros streaming their NA
  bootcamp.
- The Tizen app plays YouTube through `yt.html` on the site, since YouTube
  refuses to play inside a packaged app.

## 1.2.0 — 2026-10-15

New content: six decade channels, each with the ten titles Latin America
remembers most from that decade.

- *Años 70*, *Años 80*, *Años 90*, *Años 2000*, *Años 2010* and *Años 2020*:
  24/7 channels 201–206, listed under "Décadas" in TV, and a third strip of
  collections on Home, two rows below the franchises.
- Home now shows the franchises strip after "Seguir viendo" instead of right
  under the networks strip.

## 1.1.0 — 2026-10-15

New content: the lacartoons Oficial catalog, all in Spanish (Latin American dub).

- 379 new titles: 374 series, *Los Caballeros del Zodiaco: La Saga de Hades*
  and four Disney films (*Saludos Amigos*, *Los Tres Caballeros*,
  *Ritmo y Melodía*, *Vida Salvaje*).
- More episodes for *Bakugan Battle Brawlers*, *La Pantera Rosa*,
  *Tom y Jerry* and *¿Qué hay de nuevo Scooby-Doo?*.

## 1.0.0

First release.
