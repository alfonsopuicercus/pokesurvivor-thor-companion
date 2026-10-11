# Controller support on the official website

For the user-approved online dual-screen APK preview, use [COMPANION.md](COMPANION.md).

Play **https://pokesurvivor.com** with Thor's joystick and buttons, including menus.
This unofficial attachment supplies controller input and menu focus. The website
continues to supply the game, Google sign-in, cloud saves and game updates. It uses
the site's original login/save handlers and backend; it contains no game bundle,
sprites, replacement account system or cloud configuration.

## Firefox on Thor: automatic controls

1. Install Firefox for Android and [Violentmonkey](https://addons.mozilla.org/en-US/firefox/addon/violentmonkey/).
2. Save `PokeSurvivor Online Controller.zip` from `online/dist/` to the Thor.
3. Open Violentmonkey's dashboard, then **Settings → Import from zip**. Choose that ZIP.
4. Open [the official game](https://pokesurvivor.com/en/). A toast says **Controller support enabled**.
5. Use the website's Google button to sign into your existing account. Check that
   your expected Pokémon/progress load before playing.

The script runs automatically on the official domain after each page load. Firefox
uses its own browser profile: sign in once to restore the website's cloud progress.
Unsynced Chrome guest progress stays in Chrome and does not transfer automatically.
Keep the official site's browser data.

## Chrome on Thor: manual controller shortcut

This keeps the existing Chrome browser profile and official website origin.

1. Open `Online Controller Setup.html` and copy the controller shortcut. If the
   copy button is unavailable, select/copy the text box or use `Chrome Controller Shortcut.txt`.
2. Bookmark a page, name it **Thor controls**, and edit the bookmark's URL. Replace
   it with the copied shortcut, keeping the `javascript:` prefix.
3. Open [the official game](https://pokesurvivor.com/en/). Type **Thor controls** in
   Chrome's address bar and tap the saved **bookmark suggestion**.
4. Check for **Controller support enabled**. Repeat step 3 after each page reload.

The bookmark must be activated while on the game. It does nothing on Google login
pages or other websites. Chrome's Android bookmark editing/activation workflow
still needs a check on the Thor.

## Play and remap

Set Thor to normal gamepad output. Press a physical button so the browser exposes
the controller, keeping sticks/triggers released initially.

| Control | In game | In menus |
| --- | --- | --- |
| Left stick / D-pad | Move | Navigate / scroll |
| Bottom face button | Move 1 | Confirm |
| Right face button | Move 2 | Back |
| Left / top face buttons | Moves 3 / 4 | — |
| Left shoulder / trigger | Previous move | — |
| Right shoulder / trigger | Next move | — |
| Start | Pause | Back |

Attacks fire automatically; buttons select the active move. **Settings → Controls**
shows the controller bindings. Select a binding and press a button, trigger or
stick direction to change it. Bindings persist per controller in that browser.
Text fields have a controller keyboard, and visible menus stop gameplay input.

Google's account chooser, sound activation or fullscreen may need an initial tap
or real keyboard confirmation because browsers require a trusted user gesture.
The add-on leaves Google's sign-in flow unchanged.

## Verification and remaining device check

Version **0.2.0** passed 37 Node tests and a Chromium gameplay/menu regression on
the currently published website. Gamepad input was simulated; cloud reads were
isolated for that gameplay test. It covered movement, four move slots, shoulders,
triggers, pause, remapping, choices, text input and the main menu screens.

A separate empty-profile live cloud check kept the exact database, configuration,
Google login, save and Google-button callback references unchanged, and opened
the original `accounts.google.com` popup. No account was signed into. A separate
Chrome check executed the actual `javascript:` URL, preserving the live origin
and login/save callbacks, with no duplicate wrappers on repeated activation.

Real Google authentication/cloud restoration, Firefox Android installation,
physical Thor mappings, speaker output and sleep/resume remain unverified.
When home, verify the existing account's progress, movement/menu controls, all
move buttons, saved remapping and sleep/resume before a longer session.

Official website updates continue normally. The attachment depends on the game's
current input/UI interfaces; a future game update may require an add-on update.
It is a personal community add-on, not an official release. Existing credits and
the upstream MIT license are retained.

## Build and reproduce

Node.js, Python 3 and `npx` are needed to build; Terser 5 minifies the Chrome shortcut.
The build packages only controller code, its CSS, adapter and license:

```sh
node tools/build_online.js
node --test tests/*.test.cjs
```

With Playwright and Chromium installed:

```sh
PS_GAME_URL=https://pokesurvivor.com/en/ PS_ONLINE_SCRIPT=online/dist/pokesurvivor-controller.user.js node tests/browser-controller.cjs
node tests/online-account-integrity.cjs
node tests/online-chrome-shortcut.cjs
```

The live checks use disposable browser profiles and supply no account credentials.
The ZIP imports the `.user.js` file into Violentmonkey; it is not a browser extension
ZIP loaded via developer mode. No ADB, USB debugging or Mac connection is needed
after installation.

References: [Firefox Android extensions](https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/),
[Violentmonkey metadata](https://violentmonkey.github.io/api/metadata-block/),
[Google sign-in best practices](https://developers.google.com/identity/siwg/best-practices).
