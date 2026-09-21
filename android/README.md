# Checksmith for Android

A thin native shell around the game. `index.html` at the repository root is
still the whole game; this module bundles that one file into an APK so it
installs, gets a launcher icon, and runs offline.

- **Package:** `com.bluespindash.checksmith`
- **Min SDK:** 24 (Android 7.0) · **Target SDK:** 35 (Android 15)
- **Permissions:** none. The app never touches the network.
- **Size:** ~1.2 MB

## Installing the APK on a phone

1. Copy `app-release.apk` to the device (USB, Drive, email to yourself).
2. Open it with the device's file manager. Android will ask to allow installs
   from that app — allow it, then tap Install.
3. Or, with USB debugging on and `adb` available:
   `adb install -r app-release.apk`

If Play Protect warns that the app is from an unknown developer, that is
expected for any sideloaded build that was not signed with a Play upload key.

## Building

```sh
cd android
./gradlew assembleRelease     # app/build/outputs/apk/release/app-release.apk
./gradlew assembleDebug       # app/build/outputs/apk/debug/app-debug.apk
```

Requires a JDK 17+ and the Android SDK (platform 35, build-tools 35.0.0). Point
Gradle at the SDK with `ANDROID_HOME`, or create `android/local.properties`:

```properties
sdk.dir=/path/to/Android/sdk
```

The build copies `../index.html` into the APK's assets every time, so there is
one source of truth: **edit the game at the repository root, rebuild, done.**
Never edit a copy inside `android/`.

## Signing

Release builds fall back to the local debug key when no keystore is configured.
That is fine for sideloading, but it is not a publishable key, and a build made
on another machine will use a *different* debug key — Android then refuses to
install it over the existing app, so uninstall first.

For anything real, create your own key and keep it safe forever (losing it means
you can never update the app on Play):

```sh
keytool -genkeypair -v -keystore checksmith.jks -alias forge \
        -keyalg RSA -keysize 4096 -validity 10000
```

Then create `android/keystore.properties` — already gitignored:

```properties
storeFile=/absolute/path/to/checksmith.jks
storePassword=...
keyAlias=forge
keyPassword=...
```

`assembleRelease` picks it up automatically. For Play, build `bundleRelease`
(an `.aab`) instead and upload that.

## The launcher icon

`icon-source.png` is the source artwork. Regenerate every density from it with:

```sh
python3 android/tools/make-icons.py        # needs Pillow
```

That writes legacy square icons, round icons and adaptive-icon foregrounds for
all five density buckets, samples the artwork's dark edge for the adaptive
background colour, and exports `play-store-icon-512.png` for the store listing.
The adaptive foreground is full bleed: launchers mask it to their own shape and
the rook sits inside the guaranteed-visible centre, so it survives circular,
squircle and rounded-square masks. A `monochrome` layer is declared so Android
13+ themed icons work.

## What the shell does

`MainActivity` is deliberately small:

- loads `file:///android_asset/index.html` into a WebView
- enables JavaScript and DOM storage (best scores and audio settings persist)
- pins text zoom to 100% so the system font-size setting cannot break the fixed
  board layout
- keeps the screen on — the puzzle has no timer and invites long pauses
- locks to portrait and blocks long-press text selection and overscroll glow
- hands the back gesture to the page: it closes the results, how-to-play or
  discard dialog first, and only exits once nothing is open
- refuses to navigate anywhere except the bundled page
- pauses WebView timers when backgrounded

## Verified, and not

Checked here: the APK builds, is signed (v2) and parses; manifest declares
min SDK 24 / target SDK 35 and **zero permissions**; the adaptive icon XML
resolves to background, foreground and monochrome layers with all 15 icon PNGs
packaged; the bundled `assets/index.html` is byte-identical to the repository
root copy; AGP's `lintVitalRelease` passes. The back-gesture snippet is
exercised against the real page in `tools/verify-ui.mjs`.

**Not checked: the app has never been run.** This build environment has no KVM,
so no emulator could be started and no physical device was attached. Launch,
WebView rendering, audio through the Android audio stack, and `localStorage`
persistence on the `file://` origin are all unverified on-device. Treat the
first install as a smoke test.

One known sensitivity: the board's tile sizing prefers CSS container queries
(Chrome 105+, 2022). A vw-based fallback keeps glyphs sensible on older
WebViews, but a device with a very old, never-updated Android System WebView
will not look as intended.
