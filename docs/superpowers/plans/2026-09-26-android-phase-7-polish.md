# Android Phase 7 — Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship-ready v1: GO10 TV launcher icon, splash and Android TV banner (replacing Expo's placeholders); the phone player in landscape and immersive fullscreen; a signed, universal release APK built locally with a stable keystore.

**Architecture:** Brand images are rendered by a small, tested Python script from the web's wordmark (lime dot + "GO10 TV" in Bricolage Grotesque ExtraBold on the app background) and committed. Player chrome is one hook around `expo-screen-orientation` and `expo-navigation-bar`, a no-op on TV. Release signing is an Expo config plugin that adds a `release` signing config to the generated `app/build.gradle`, fed by Gradle properties kept in `~/.gradle/gradle.properties` (outside git), so `prebuild --clean` never loses it.

**Tech Stack:** Expo SDK 57 (`expo-screen-orientation` ~57.0.2, `expo-navigation-bar` ~57.0.2, `expo-splash-screen`, config plugins), react-native-tvos 0.86, Pillow 10 (brand images), JDK 17 `keytool`, Android build-tools 36.1.0 `apksigner`; Jest + RNTL 14, pytest.

**Spec:** `docs/superpowers/specs/2026-09-26-android-app-design.md` (Phase 7 row; *Decisions* — TV launcher banner/icon; phone player forces landscape and immersive fullscreen; one universal APK; *Player → Phone*; *Builds*).

## Global Constraints

- One universal APK for phone and TV; sideloaded with `adb install`; not on the Play Store.
- Release: `npx expo prebuild` + `./gradlew assembleRelease` locally → one universal APK (all ABIs). A local keystore, kept out of git and stable across builds so updates install over the previous version.
- `@react-native-tvos/config-tv` sets the TV manifest (leanback launcher, banner, touchscreen not required).
- Phone player: locks to landscape (`expo-screen-orientation`) and goes immersive (status and navigation bars hidden); leaving it restores portrait. Touch goes straight to the embed's own controls. TV: untouched.
- Machine: `JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64` for every Gradle run.
- Secrets: the keystore and its passwords never enter the repo, logs or messages.
- Faithful port: brand colours are the web tokens (`#08090c` background, `#f2f4f0` text, `#c6f24e` accent).

## Review Focus

1. **Leaving the player any way at all** (Back, the bar's Volver, auto-advance to another file keeps it) — portrait and the system bars come back on unmount. Pinned in Task 2 (`restores portrait and the system bars when the player closes`).
2. **TV** — the chrome hook never touches orientation or the navigation bar there. Pinned in Task 2 (`does nothing on TV`).
3. **A release build without the signing properties** — fails loudly instead of silently shipping a debug-signed "release". Pinned in Task 3 (`signs release builds with the release config only`), verified in Task 4 by `apksigner`.
4. **`prebuild --clean` twice** — the signing block is added once, not duplicated. Pinned in Task 3 (`is idempotent`).
5. **Adaptive icon masks** (circle, squircle) — the mark stays inside Android's 66 % safe zone. Pinned in Task 1 (`keeps the adaptive foreground inside the safe zone`).

---

### Task 1: GO10 brand images

**Files:**
- Create: `apps/mobile/scripts/brand_images.py`
- Create: `tests/test_brand_images.py`
- Create (generated, committed): `apps/mobile/assets/images/icon.png`, `adaptive-icon.png`, `splash-icon.png`, `tv-banner.png`
- Delete: the Expo placeholders `apps/mobile/assets/images/icon-{400x240,760x760,800x480,1280x768,1920x720,2320x720,3840x1440,4640x1440}.png`
- Modify: `apps/mobile/app.config.ts`

**Interfaces:**
- Produces: `render(out_dir: Path) -> dict[str, Path]` (keys `icon`, `adaptive`, `splash`, `banner`); CLI `python3 apps/mobile/scripts/brand_images.py [out_dir]` (default `apps/mobile/assets/images`).

- [ ] **Step 1: Write the failing test**

`tests/test_brand_images.py`:

```python
"""The app's brand images: sizes, backgrounds, and the adaptive icon's safe zone."""
import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "apps/mobile/scripts/brand_images.py"
FONT = ROOT / "node_modules/@expo-google-fonts/bricolage-grotesque/800ExtraBold/BricolageGrotesque_800ExtraBold.ttf"

pytestmark = pytest.mark.skipif(not FONT.exists(), reason="needs npm install (the wordmark font)")

BG = (8, 9, 12, 255)


def load():
    spec = importlib.util.spec_from_file_location("brand_images", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def images(tmp_path_factory):
    from PIL import Image

    paths = load().render(tmp_path_factory.mktemp("brand"))
    return {name: Image.open(path) for name, path in paths.items()}


def test_sizes(images):
    assert images["icon"].size == (1024, 1024)
    assert images["adaptive"].size == (1024, 1024)
    assert images["splash"].size == (512, 512)
    assert images["banner"].size == (640, 360)


def test_icon_and_banner_are_opaque_on_the_app_background(images):
    for name in ("icon", "banner"):
        image = images[name].convert("RGBA")
        assert image.getpixel((0, 0)) == BG
        assert image.getpixel((image.width - 1, image.height - 1)) == BG


def test_foregrounds_are_transparent_around_the_mark(images):
    for name in ("adaptive", "splash"):
        assert images[name].convert("RGBA").getpixel((0, 0))[3] == 0


def test_keeps_the_adaptive_foreground_inside_the_safe_zone(images):
    # Android masks adaptive icons to the centre 66 %: 1024 * 0.17 = 174 px margin each side.
    left, top, right, bottom = images["adaptive"].getchannel("A").getbbox()
    assert left >= 174 and top >= 174 and right <= 1024 - 174 and bottom <= 1024 - 174


def test_the_mark_is_drawn_in_the_brand_colours(images):
    colours = {pixel for _, pixel in images["banner"].convert("RGBA").getcolors(1 << 20)}
    assert (198, 242, 78, 255) in colours  # the accent dot
    assert (242, 244, 240, 255) in colours  # the wordmark
```

- [ ] **Step 2: Run to verify it fails**

Run: `python3 -m pytest tests/test_brand_images.py -q`
Expected: FAIL — the script file does not exist (`FileNotFoundError` from `spec_from_file_location`/`exec_module`).

- [ ] **Step 3: Implement**

`apps/mobile/scripts/brand_images.py`:

```python
#!/usr/bin/env python3
"""
Renders the Android app's brand images from the GO10 TV wordmark (the web
navbar's lime dot + "GO10 TV", Bricolage Grotesque ExtraBold, on the app
background): the launcher icon, the adaptive-icon foreground, the splash
mark and the Android TV launcher banner.

    python3 apps/mobile/scripts/brand_images.py [out_dir]
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
FONT = ROOT / "node_modules/@expo-google-fonts/bricolage-grotesque/800ExtraBold/BricolageGrotesque_800ExtraBold.ttf"
DEFAULT_OUT = ROOT / "apps/mobile/assets/images"

# apps/web/src/styles/tokens.css
BG = (8, 9, 12, 255)
TEXT = (242, 244, 240, 255)
ACCENT = (198, 242, 78, 255)
CLEAR = (0, 0, 0, 0)


def draw_mark(image: Image.Image, lines: list[str], font_px: int) -> None:
    """Centres the wordmark: a lime dot before the first line; later lines in the accent colour."""
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(str(FONT), font_px)
    dot = round(font_px * 0.34)
    dot_gap = round(font_px * 0.2)
    line_gap = round(font_px * 0.14)
    boxes = [draw.textbbox((0, 0), line, font=font) for line in lines]
    heights = [bottom - top for _, top, _, bottom in boxes]
    widths = [right - left for left, _, right, _ in boxes]
    y = (image.height - (sum(heights) + line_gap * (len(lines) - 1))) / 2
    for index, (line, (left, top, _, _)) in enumerate(zip(lines, boxes)):
        lead = dot + dot_gap if index == 0 else 0
        x = (image.width - (widths[index] + lead)) / 2
        if index == 0:
            middle = y + heights[0] / 2
            draw.ellipse([x, middle - dot / 2, x + dot, middle + dot / 2], fill=ACCENT)
        draw.text((x + lead - left, y - top), line, font=font, fill=TEXT if index == 0 else ACCENT)
        y += heights[index] + line_gap


def render(out_dir: Path) -> dict[str, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    specs = {
        # Legacy launchers and Expo's `icon`: full bleed.
        "icon": ("icon.png", (1024, 1024), BG, ["GO10", "TV"], 250),
        # Adaptive foreground over `backgroundColor`: inside the 66 % safe zone.
        "adaptive": ("adaptive-icon.png", (1024, 1024), CLEAR, ["GO10", "TV"], 165),
        # expo-splash-screen's image, on the same background colour.
        "splash": ("splash-icon.png", (512, 512), CLEAR, ["GO10", "TV"], 120),
        # Android TV launcher banner (320x180 dp, drawn at xhdpi).
        "banner": ("tv-banner.png", (640, 360), BG, ["GO10 TV"], 104),
    }
    paths = {}
    for name, (file_name, size, background, lines, font_px) in specs.items():
        image = Image.new("RGBA", size, background)
        draw_mark(image, lines, font_px)
        path = out_dir / file_name
        image.save(path, optimize=True)
        paths[name] = path
    return paths


if __name__ == "__main__":
    for path in render(Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT).values():
        print(path.relative_to(ROOT) if path.is_relative_to(ROOT) else path)
```

- [ ] **Step 4: Run to verify it passes**

Run: `python3 -m pytest tests/test_brand_images.py -q`
Expected: PASS (5 tests). If the safe-zone test fails, lower the adaptive `font_px` until it passes (and ledger the value).

- [ ] **Step 5: Generate, look, and wire them up**

Run: `python3 apps/mobile/scripts/brand_images.py` then view `apps/mobile/assets/images/icon.png` and `tv-banner.png` (Read tool) and confirm the mark is centred and legible.

Delete the placeholders: `git rm apps/mobile/assets/images/icon-*.png`.

`apps/mobile/app.config.ts` — in the returned object, after `scheme`:

```ts
    icon: './assets/images/icon.png',
    android: {
      package: 'blog.go10.tv',
      adaptiveIcon: { foregroundImage: './assets/images/adaptive-icon.png', backgroundColor: '#08090c' },
    },
```

(replacing the existing `android: { package: 'blog.go10.tv' },`), and in `plugins`, replace the config-tv entry's banner and add the splash:

```ts
      ['expo-splash-screen', { image: './assets/images/splash-icon.png', imageWidth: 180, backgroundColor: '#08090c' }],
      ['@react-native-tvos/config-tv', { androidTVBanner: './assets/images/tv-banner.png' }],
```

Run: `cd apps/mobile && npx expo config --type public | grep -E "icon|banner|splash" ; cd ../..`
Expected: the new paths appear; no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/scripts tests/test_brand_images.py apps/mobile/assets apps/mobile/app.config.ts
git commit -m "feat(mobile): GO10 TV launcher icon, splash and TV banner, rendered from the wordmark"
```

---

### Task 2: Phone player in landscape and immersive fullscreen

**Files:**
- Modify: `apps/mobile/package.json` (via `npx expo install expo-screen-orientation expo-navigation-bar`)
- Create: `apps/mobile/src/platform/playerChrome.ts`, `playerChrome.test.tsx`
- Modify: `apps/mobile/src/components/PlayerView.tsx`, `PlayerView.test.tsx` (mock the hook)
- Modify: `apps/mobile/src/app/_layout.tsx`

**Interfaces:**
- Produces: `usePlayerChrome(tv = Platform.isTV): void` — landscape + hidden navigation bar while mounted, portrait + visible bar after; `usePortraitOnPhone(tv = Platform.isTV): void` — the rest of the phone app stays portrait.

- [ ] **Step 1: Install**

Run: `cd apps/mobile && npx expo install expo-screen-orientation expo-navigation-bar; cd ../..`
Expected: `package.json` gains `expo-screen-orientation` ~57.0.2 and `expo-navigation-bar` ~57.0.2. (If `expo install` exits non-zero only because it can't edit the dynamic config, that is the Phase 3 situation: neither module needs a config plugin, so continue.)

- [ ] **Step 2: Write the failing test**

`apps/mobile/src/platform/playerChrome.test.tsx`:

```tsx
import { renderHook } from '@testing-library/react-native'
import * as NavigationBar from 'expo-navigation-bar'
import * as ScreenOrientation from 'expo-screen-orientation'
import { usePlayerChrome, usePortraitOnPhone } from './playerChrome'

jest.mock('expo-screen-orientation', () => ({
  lockAsync: jest.fn(() => Promise.resolve()),
  OrientationLock: { LANDSCAPE: 'LANDSCAPE', PORTRAIT_UP: 'PORTRAIT_UP' },
}))
jest.mock('expo-navigation-bar', () => ({ setVisibilityAsync: jest.fn(() => Promise.resolve()) }))
const lock = ScreenOrientation.lockAsync as jest.Mock
const bar = NavigationBar.setVisibilityAsync as jest.Mock

beforeEach(() => {
  lock.mockClear()
  bar.mockClear()
})

describe('usePlayerChrome', () => {
  it('goes landscape and hides the navigation bar on a phone', async () => {
    await renderHook(() => usePlayerChrome(false))
    expect(lock).toHaveBeenCalledWith('LANDSCAPE')
    expect(bar).toHaveBeenCalledWith('hidden')
  })

  it('restores portrait and the system bars when the player closes', async () => {
    const { unmount } = await renderHook(() => usePlayerChrome(false))
    lock.mockClear()
    bar.mockClear()
    await unmount()
    expect(lock).toHaveBeenCalledWith('PORTRAIT_UP')
    expect(bar).toHaveBeenCalledWith('visible')
  })

  it('does nothing on TV', async () => {
    const { unmount } = await renderHook(() => usePlayerChrome(true))
    await unmount()
    expect(lock).not.toHaveBeenCalled()
    expect(bar).not.toHaveBeenCalled()
  })

  it('never throws when the platform refuses', async () => {
    lock.mockRejectedValueOnce(new Error('unsupported'))
    bar.mockRejectedValueOnce(new Error('unsupported'))
    await expect(renderHook(() => usePlayerChrome(false))).resolves.toBeTruthy()
  })
})

describe('usePortraitOnPhone', () => {
  it('keeps the phone app portrait, and leaves a TV alone', async () => {
    await renderHook(() => usePortraitOnPhone(false))
    expect(lock).toHaveBeenCalledWith('PORTRAIT_UP')
    lock.mockClear()
    await renderHook(() => usePortraitOnPhone(true))
    expect(lock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -w @go10/mobile -- src/platform/playerChrome.test.tsx`
Expected: FAIL — `./playerChrome` not found.

- [ ] **Step 4: Implement**

`apps/mobile/src/platform/playerChrome.ts`:

```ts
import * as NavigationBar from 'expo-navigation-bar'
import * as ScreenOrientation from 'expo-screen-orientation'
import { useEffect } from 'react'
import { Platform } from 'react-native'

const ignore = () => {}

/**
 * Phone playback (spec: Player → Phone): landscape and immersive while the
 * player is on screen (the status bar is hidden by the player itself);
 * portrait and the system bars come back however it closes. A TV is left
 * exactly as it is.
 */
export function usePlayerChrome(tv: boolean = Platform.isTV): void {
  useEffect(() => {
    if (tv) return
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(ignore)
    NavigationBar.setVisibilityAsync('hidden').catch(ignore)
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(ignore)
      NavigationBar.setVisibilityAsync('visible').catch(ignore)
    }
  }, [tv])
}

/** The phone layouts are portrait (like the mobile web); only the player turns. */
export function usePortraitOnPhone(tv: boolean = Platform.isTV): void {
  useEffect(() => {
    if (!tv) ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(ignore)
  }, [tv])
}
```

`PlayerView.tsx`: `import { usePlayerChrome } from '../platform/playerChrome'` and call `usePlayerChrome()` as the first line of the component body.

`PlayerView.test.tsx`: add next to the other mocks

```tsx
jest.mock('../platform/playerChrome', () => ({ usePlayerChrome: jest.fn() }))
```

`_layout.tsx`: `import { usePortraitOnPhone } from '../platform/playerChrome'` and call `usePortraitOnPhone()` right after `useFonts(...)` (before the early return, so the hook order never changes).

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -w @go10/mobile && npm run typecheck -w @go10/mobile`
Expected: all pass; typecheck exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/package.json package-lock.json apps/mobile/src
git commit -m "feat(mobile): the phone player goes landscape and immersive; the rest stays portrait"
```

---

### Task 3: Release signing as a config plugin

**Files:**
- Create: `apps/mobile/plugins/withReleaseSigning.js`, `apps/mobile/plugins/withReleaseSigning.test.js`
- Modify: `apps/mobile/app.config.ts` (register the plugin)
- Modify: `apps/mobile/package.json` (a `build:release` script)

**Interfaces:**
- Produces: `addReleaseSigning(gradle: string): string` (pure, exported for tests) and the default-exported plugin `withReleaseSigning(config)`. Gradle properties read: `GO10_RELEASE_STORE_FILE`, `GO10_RELEASE_STORE_PASSWORD`, `GO10_RELEASE_KEY_ALIAS`, `GO10_RELEASE_KEY_PASSWORD`.

- [ ] **Step 1: Write the failing test**

`apps/mobile/plugins/withReleaseSigning.test.js`:

```js
const { addReleaseSigning } = require('./withReleaseSigning')

// The shape of the template's android/app/build.gradle around signing.
const TEMPLATE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}
`

describe('addReleaseSigning', () => {
  it('adds a release signing config fed by Gradle properties', () => {
    const out = addReleaseSigning(TEMPLATE)
    expect(out).toContain("if (project.hasProperty('GO10_RELEASE_STORE_FILE')) {")
    expect(out).toContain('storeFile file(GO10_RELEASE_STORE_FILE)')
    expect(out).toContain('storePassword GO10_RELEASE_STORE_PASSWORD')
    expect(out).toContain('keyAlias GO10_RELEASE_KEY_ALIAS')
    expect(out).toContain('keyPassword GO10_RELEASE_KEY_PASSWORD')
  })

  it('signs release builds with the release config only', () => {
    const out = addReleaseSigning(TEMPLATE)
    const release = out.slice(out.indexOf('        release {\n            // Caution'))
    expect(release).toContain('signingConfig signingConfigs.release')
    expect(release).not.toContain('signingConfig signingConfigs.debug')
    // Debug builds keep the debug key.
    expect(out).toContain('        debug {\n            signingConfig signingConfigs.debug')
  })

  it('is idempotent', () => {
    const once = addReleaseSigning(TEMPLATE)
    expect(addReleaseSigning(once)).toBe(once)
  })

  it('refuses a build.gradle it does not recognise', () => {
    expect(() => addReleaseSigning('android {}')).toThrow(/signingConfigs/)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w @go10/mobile -- plugins/withReleaseSigning.test.js`
Expected: FAIL — cannot find module `./withReleaseSigning`.

- [ ] **Step 3: Implement**

`apps/mobile/plugins/withReleaseSigning.js`:

```js
// CommonJS: Expo loads config plugins without transpiling them.
const { withAppBuildGradle } = require('expo/config-plugins')

const MARKER = '// go10: release signing'

const RELEASE_CONFIG = `        release {
            ${MARKER} — from ~/.gradle/gradle.properties, never from the repo.
            if (project.hasProperty('GO10_RELEASE_STORE_FILE')) {
                storeFile file(GO10_RELEASE_STORE_FILE)
                storePassword GO10_RELEASE_STORE_PASSWORD
                keyAlias GO10_RELEASE_KEY_ALIAS
                keyPassword GO10_RELEASE_KEY_PASSWORD
            }
        }
`

/**
 * The template signs release builds with the debug key. This adds a
 * `release` signing config read from Gradle properties and points the
 * release build type at it — so a release build without the properties
 * fails instead of shipping debug-signed.
 * @param {string} gradle android/app/build.gradle
 * @returns {string}
 */
function addReleaseSigning(gradle) {
  if (gradle.includes(MARKER)) return gradle
  const debugConfig = /( {8}debug \{\n {12}storeFile file\('debug\.keystore'\)[\s\S]*?\n {8}\}\n)/
  if (!debugConfig.test(gradle)) throw new Error('withReleaseSigning: no debug entry in signingConfigs to add release after')
  const releaseType = /( {8}release \{\n(?: {12}\/\/[^\n]*\n)*) {12}signingConfig signingConfigs\.debug\n/
  if (!releaseType.test(gradle)) throw new Error('withReleaseSigning: release buildType does not use signingConfigs.debug')
  return gradle
    .replace(debugConfig, `$1${RELEASE_CONFIG}`)
    .replace(releaseType, '$1            signingConfig signingConfigs.release\n')
}

/** @param {import('expo/config').ExpoConfig} config */
function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    mod.modResults.contents = addReleaseSigning(mod.modResults.contents)
    return mod
  })
}

module.exports = withReleaseSigning
module.exports.addReleaseSigning = addReleaseSigning
```

`app.config.ts` — append to `plugins`: `'./plugins/withReleaseSigning',`.

`apps/mobile/package.json` — add to `scripts`:

```json
    "build:release": "npm run prebuild && cd android && JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 ./gradlew app:assembleRelease",
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w @go10/mobile && npm run typecheck -w @go10/mobile`
Expected: all pass (the plugin's 4 tests included); typecheck exit 0.

- [ ] **Step 5: Check the plugin against the real template**

Run: `cd apps/mobile && npm run prebuild > /dev/null && grep -n "go10: release signing\|signingConfig signingConfigs" android/app/build.gradle; cd ../..`
Expected: the marker once; `signingConfigs.debug` under `debug`, `signingConfigs.release` under `release`.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/plugins apps/mobile/app.config.ts apps/mobile/package.json
git commit -m "feat(mobile): release builds signed from a local keystore via a config plugin"
```

---

### Task 4: Keystore, release APK, phone build, docs

**Files:**
- Outside the repo (one-time): `~/.config/go10-tv/go10-release.jks`, entries appended to `~/.gradle/gradle.properties`
- Modify: `README.md` (a "Release APK" section; test counts), `docs/superpowers/tv-checklist.md`

- [ ] **Step 1: Create the keystore once (skip if `~/.config/go10-tv/go10-release.jks` exists)**

Run (the password is generated, written only to the properties file, and never echoed):

```bash
mkdir -p ~/.config/go10-tv && chmod 700 ~/.config/go10-tv
PASS=$(openssl rand -base64 24 | tr -d '/+=')
/usr/lib/jvm/java-17-openjdk-amd64/bin/keytool -genkeypair -v -storetype PKCS12 \
  -keystore ~/.config/go10-tv/go10-release.jks -alias go10 -keyalg RSA -keysize 4096 -validity 36500 \
  -storepass "$PASS" -keypass "$PASS" -dname "CN=GO10 TV, O=GO10" > /dev/null 2>&1
chmod 600 ~/.config/go10-tv/go10-release.jks
touch ~/.gradle/gradle.properties && chmod 600 ~/.gradle/gradle.properties
{
  echo "GO10_RELEASE_STORE_FILE=$HOME/.config/go10-tv/go10-release.jks"
  echo "GO10_RELEASE_STORE_PASSWORD=$PASS"
  echo "GO10_RELEASE_KEY_ALIAS=go10"
  echo "GO10_RELEASE_KEY_PASSWORD=$PASS"
} >> ~/.gradle/gradle.properties
unset PASS
ls -l ~/.config/go10-tv/go10-release.jks
```

Expected: the keystore file listed; nothing secret printed.

- [ ] **Step 2: Build the universal release APK**

Run: `npm run build:release -w @go10/mobile > <workspace>/release.log 2>&1; tail -3 <workspace>/release.log`
Expected: `BUILD SUCCESSFUL` (a cold 4-ABI build takes ~10+ min).

- [ ] **Step 3: Verify the APK**

Run:
```bash
APK=apps/mobile/android/app/build/outputs/apk/release/app-release.apk
ls -lh $APK
~/Android/Sdk/build-tools/36.1.0/apksigner verify --print-certs $APK | grep -E "Signer #1 certificate DN|Verified"
unzip -l $APK | grep -E "lib/(arm64-v8a|armeabi-v7a|x86|x86_64)/libreactnative.so" | wc -l
unzip -l $APK | grep -c "assets/index.android.bundle"
```
Expected: the APK exists; signer DN `CN=GO10 TV, O=GO10`; 4 ABIs; the JS bundle is embedded (1).

- [ ] **Step 4: Phone debug build** (new native modules): `npm run prebuild` then `./gradlew app:assembleDebug -PreactNativeArchitectures=arm64-v8a`, `adb -s ZY22MTK86Z install -r …/app-debug.apk`, `adb reverse`, restart Metro, launch. Expected: `Success`; the new icon in the launcher; the player turns landscape.

Do **not** install the release APK over the debug build: the signatures differ, so Android would require uninstalling first, which erases the phone's progress. That's the user's call.

- [ ] **Step 5: README and checklist**

`README.md`: add after the mobile build notes a section:

```markdown
### Release APK (Android)

One universal APK (phone + TV), signed with a local keystore that never enters the repo:

- Keystore: `~/.config/go10-tv/go10-release.jks`; its alias and passwords are in `~/.gradle/gradle.properties` (`GO10_RELEASE_*`). **Back both up** — an APK signed with a different key can't update an installed one.
- Build: `npm run build:release -w @go10/mobile` → `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`.
- Install: `adb install -r app-release.apk`. A debug build on the device must be uninstalled first (different signature), which clears its progress.
- Brand images: `python3 apps/mobile/scripts/brand_images.py` regenerates `apps/mobile/assets/images/`.
```

and update the `npm test` / pytest counts under "## Tests" to the real totals.

`docs/superpowers/tv-checklist.md` — append:

```markdown
## From Phase 7 (Polish)
- [ ] Install `app-release.apk` on the TV: GO10 TV appears in the launcher's app row with its banner, and opens with the remote.
- [ ] The player stays landscape with no change on TV (the phone-only orientation lock never runs).
- [ ] Run every earlier section of this checklist on the release build.
```

- [ ] **Step 6: Whole-repo verification and commit**

Run: `npm test && npm run typecheck --workspaces --if-present && npm run build -w @go10/web && python3 -m pytest tests/ -q`
Expected: everything passes.

```bash
git add README.md docs/superpowers/tv-checklist.md
git commit -m "docs: release APK, brand images, Phase 7 TV checklist and test counts"
```

- [ ] **Step 7: Hand to the user** — check on the phone: the icon and splash; play something: landscape, no status or navigation bar; Back: portrait again. Report the release APK's path and size, and that the keystore needs backing up. The spec's Phase 7 row is marked done only after they confirm.
