# Checksmith on iPhone

Two ways onto an iPhone, depending on whether you have a Mac.

## 1. No Mac: add it to the Home Screen

`index.html` is a complete offline app, and iOS will install it from Safari:

1. Put `index.html` anywhere Safari can reach it — AirDrop it to the phone, or
   host it (GitHub Pages, iCloud Drive, any static host).
2. Open it in **Safari** (not Chrome — only Safari can install to the Home
   Screen).
3. **Share → Add to Home Screen.**

You get the hammer icon on the Home Screen and the game runs full screen with
no browser chrome, no address bar and no network. The page carries the
`apple-mobile-web-app-*` tags and an embedded 180px `apple-touch-icon` for
exactly this, and pads for the notch and the home indicator through
`env(safe-area-inset-*)`.

Scores, gold and audio settings are kept in `localStorage`, which survives
between launches. iOS can evict that if the app goes unused for weeks — that is
Apple's storage policy for web apps, not a bug in the game. The Xcode build
below does not have that limitation.

## 2. With a Mac: build the real app

```sh
open ios/Checksmith.xcodeproj
```

Pick your device, set **Signing & Capabilities → Team** to your Apple ID, and
press Run. A free Apple ID installs to your own device for 7 days at a time; a
paid Developer account ($99/year) is needed for TestFlight or the App Store.

The app is a shell, exactly like the Android one: a `WKWebView` filling the
screen, loading the bundled page, with zoom, rubber-banding, link previews and
long-press callouts all off, and the idle timer disabled so the screen does not
sleep mid-puzzle. It requests no permissions and makes no network calls.

**`index.html` is copied into the bundle by a build phase on every build**, so
the app can never ship a stale page and the repository never holds a second
copy of the game.

### Regenerating things

```sh
python3 ios/tools/make-icons.py      # app icons from android/icon-source.png
python3 ios/tools/make-project.py    # rewrite project.pbxproj
python3 ios/tools/verify-project.py  # structural checks on the result
```

`project.pbxproj` is generated rather than hand-edited so every object id is
allocated once and every reference resolves. Add a source file to the `SOURCES`
list in `make-project.py` and re-run it. If you would rather let Xcode own the
project file, `ios/project.yml` is an [XcodeGen](https://github.com/yonaskolb/XcodeGen)
spec for the same target: `brew install xcodegen && cd ios && xcodegen`.

### What has and has not been verified

Everything in this folder was written and checked on Linux, so:

- **Verified**: the project file is structurally sound — balanced, every
  referenced object id defined, every file reference present on disk, both
  build configurations wired up, the scheme pointing at the real target, and
  every icon the asset catalog lists actually generated. `verify-project.py`
  runs all 30 of those checks.
- **Verified**: the game itself, including the iOS safe-area padding, against a
  393×852 viewport with iPhone insets forced in.
- **Not verified**: it has never been compiled or run. Building an iOS app
  requires macOS and Xcode, which are not available here. Expect to press Run
  once and fix whatever Xcode grumbles about — most likely the signing team,
  which cannot be set without an Apple ID.

## Bundle identifier

`com.bluespindash.checksmith`, matching the Android package. Change it in
`make-project.py` (and re-run it) if you need a different one.
