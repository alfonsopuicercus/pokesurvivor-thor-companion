# PokéSurvivor Thor Companion

An unofficial online companion preview for the AYN Thor: the original game runs in Firefox on the top screen, with a native controller/menu panel below. The APK contains no game or Pokémon artwork. Google sign-in and cloud saves stay on [pokesurvivor.com](https://pokesurvivor.com/en/).

## Download on your Thor

**[Open the download release →](https://github.com/alfonsopuicercus/pokesurvivor-thor-companion/releases/tag/v0.3.0-preview)**

Open that link in **Chrome**, expand **Assets**, and download:

1. `PokeSurvivor-Thor-Companion-0.3.0.apk` — install it from Files.
2. `PokeSurvivor-Thor-Companion-Scripts-0.3.0.zip` — import in Firefox/Violentmonkey.
3. Follow the **[installation guide](docs/COMPANION.md)** to pair them.

Playing with the dual-screen panel requires **Firefox + Violentmonkey + both scripts**, alongside the APK. No Mac, Git commands or USB debugging needed after setup. Android 8+. The website loads its own updates; interface changes may require new scripts.

## Preview status

The development project passed 48 JavaScript tests and 9 Java tests. Native emulator joystick/buttons, panel Pause touch, secondary-display placement and Stop/disconnect checks passed. The original Google popup opened and login/save callbacks stayed unchanged; no real sign-in was performed.

**Real Thor hardware, Firefox Android extension injection/network pairing, authenticated Google cloud restore/sync, sound and sleep/resume remain unverified.** The native/browser integration used a GM networking test adapter. Desktop Violentmonkey imported both scripts but failed within its own injection runtime before our scripts ran. This is a device-test preview.

## Source and builds

Companion-only source export from development commit `d46ad69b28e13d364c16a24db6f1039ccf77e0dc`. Excludes game assets, offline game prototype, private signing keys and caches. The public Android settings include only the companion module; signing is optional, debug uses a local debug key and releases without your private signing files are unsigned.

- Bridge tests: `node --test tests/*.test.cjs` (11 tests in this export).
- Scripts: `node tools/build_online.js`, then `node tools/build_companion.js` (Node/npx and Python 3).
- Native build: JDK17, Android SDK35, `android/local.properties` with SDK path; `cd android && ./gradlew :companion:testDebugUnitTest :companion:assembleDebug`.

A build signed with a different key cannot update the distributed APK without uninstalling it.

## Credits

Original PokéSurvivor by [JPTER78](https://github.com/JPTER78/pokesurvivor). Controller/companion additions by Alfonso Puicercus. Upstream MIT notices retained in [LICENSE](LICENSE). Original Pokémon artwork is not distributed here. Unofficial fan companion, not an endorsed game release.
