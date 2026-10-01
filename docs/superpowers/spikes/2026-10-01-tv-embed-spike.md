# TV embed spike (2026-10-01)

Harness: a throwaway page embedding `https://ok.ru/videoembed/<id>` from localhost
(`.superpowers/spike-tv/harness.html`, not committed).

## 1. Muting a preview
- `{ action: 'mute' }` / `{ action: 'unmute' }` silence and restore the embed.
- `{ action: 'volume', value: 0 | 1 }` sets the volume.

## 2. Audio after a staged (hover) preload
Not answered directly. Observed instead, on the built feature: the TV plays
**muted** and, under the input shield, ok.ru's own unmute control can't be
reached. The embed starts muted when it autoplays.

## Decision
PREVIEW_AUDIO = 'mute' (previews post `mute` once loaded; a promoted preview gets `unmute`).
STAGED_FIX = 'play-message', extended: whenever main is (or becomes) loaded on an
activated TV, and on every tap or key on the TV screen (fresh user activation),
post `play`, `unmute` and `{ action: 'volume', value: 1 }`. The screen also gets
its own sound toggle, since ok.ru's controls sit under the shield.
