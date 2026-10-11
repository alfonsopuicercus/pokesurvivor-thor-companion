# PokéSurvivor Thor Online Companion — 0.3.0 Preview

The official game runs at **https://pokesurvivor.com/en/** in Firefox on the top
screen. The companion APK puts move buttons, pause/resume, menu controls and a
small run summary on the lower screen. Your Google sign-in and cloud progress
belong to the original website. The APK contains the panel and controller relay;
it contains no copy of the game or its artwork.

This preview requires **Firefox + Violentmonkey + both supplied scripts** as well
as the APK. It is not a single self-contained game installation. Android 8+.
No Mac, USB connection or USB debugging is needed to play after setup.

## First setup on Thor

1. Copy `PokeSurvivor Thor Companion 0.3.0.apk` and
   `PokeSurvivor Thor Companion Scripts.zip` to the Thor.
2. Open the APK in Files and install it. Allow Files to install unknown apps if
   Android requests it. Launch **PokéSurvivor Thor Companion** and allow its
   connection notification. It attempts to open on the secondary screen; use the
   panel's display selector or Thor's app screen selector if necessary.
3. Install [Firefox for Android](https://www.mozilla.org/firefox/browsers/mobile/android/)
   and [Violentmonkey](https://addons.mozilla.org/android/addon/violentmonkey/).
4. In Firefox, open the Violentmonkey dashboard. Choose **Settings / Backup →
   Import from zip**, then select the scripts ZIP. Both **PokéSurvivor Thor
   Controller** and **PokéSurvivor Thor Companion** should appear, enabled, at 0.3.0.
5. In the APK, choose **Copy pairing key**, then **Open game**. The official website
   opens in Firefox on the main screen. With that game tab open, open Firefox's
   Extensions menu → Violentmonkey → the Companion script commands → **Connect
   Thor panel**. Paste the copied key into its prompt. Exact extension menu labels
   may differ between versions. Keep the pairing key private.
6. Use the original website's **Sign in with Google** with your existing account.
   Verify your expected Pokémon/progress before playing a long run. Firefox has a
   separate browser profile from Chrome; sign-in is needed to restore cloud
   progress. Chrome-only unsynced guest progress does not migrate automatically.
7. Set Thor controls to normal gamepad output. Initially release sticks/triggers,
   then press a button. The panel should say **Connected · official online game**.

## Play

| Control | Playing | Menus |
| --- | --- | --- |
| Left stick / D-pad | Move | Navigate / scroll |
| Bottom face button | Move 1 | Confirm |
| Right face button | Move 2 | Back |
| Left / top face buttons | Moves 3 / 4 | — |
| Left shoulder / trigger | Previous move | — |
| Right shoulder / trigger | Next move | — |
| Start | Pause | Back / close |

Move selection is separate from firing: attacks fire automatically. The lower
screen offers four move buttons, Previous/Next, Pause/Resume, directions, Confirm
and Back. Settings → Controls → Controller in the game supports remapping.
Physical labels differ by layout; bindings follow standard numbered inputs.
Google credentials and text are entered on the top screen. The lower screen does
not display account names, passwords, friends, ranking data or saved profiles.

When the browser is focused, its Gamepad API reads the controls. When the panel is
focused, the APK relays native controls to the visible game. Changing focus,
backgrounding, or losing the link can pause a solo run. Release controls, return
to the game and resume explicitly. Android may restrict focus across displays;
Thor hardware acceptance is still pending.

The notification's **Stop**, or the panel's **Stop companion**, ends the local
connection. Reopen the panel to restart. **Disconnect Thor panel** in Violentmonkey
stops the add-on connection and removes its saved pairing key. Only one game tab
can own the panel at a time; close duplicate game tabs if pairing appears busy.

## If the panel stays disconnected

Confirm both scripts are enabled on the exact official HTTPS website, the APK is
running, and the pasted key is complete. Reload the game after importing/updating
scripts, then pair again. Both parts run on the Thor; a panel on another device
cannot connect. If Android sleeps the companion, reopen it. Android 15 imposes a
foreground data-service time limit; a long session may need the panel reopened.

Chrome's controller-only bookmark remains available via [ONLINE.md](ONLINE.md),
but it does not provide the privileged network bridge required by this panel.
The older 0.1 offline APK uses separate local saves and is historical.

## What has been checked

- 48 Node tests passed; native panel state/socket tests (4) and mapper tests (5)
  passed. Signed release built; Android lint has zero errors and five warnings.
- Published-site controller regression passed, including menus, choices, remapping
  and reload. The original Google popup opened at accounts.google.com; login,
  database/config and save callback identities stayed unchanged. No credentials,
  account creation, real sign-in or cloud writes were used.
- Android 15 emulator: actual APK listener paired with the live site's isolated
  guest fixture. Native Android joystick, all move buttons, shoulders/trigger,
  pause/resume, native Pause touch and disconnect behavior passed with no page
  errors. A browser GM API test adapter supplied networking; this does not certify
  the real Firefox Android extension environment.
- The panel launched on an emulator secondary display. Notification Stop closed
  the listener while the panel was still bound. APK v2 signature verified; no game
  assets, WebView or offline activity in the companion package.
- Desktop Violentmonkey 2.49 imported both scripts, but failed inside its own
  injection runtime before our scripts ran in disposable Chromium. End-to-end
  Firefox Android installation/injection/pairing, real Thor display/focus/input,
  actual Google cloud restoration/sync, speaker output and sleep/resume remain
  unverified. This is a device-test preview, not a certified Thor release.

The website continues loading its own updates. Changes to its internal interfaces
may require a new controller/companion script. This is an unofficial companion;
the original game is by JPTER78. The included code retains upstream MIT notices.
Nothing has been published or sent to the game's maintainers.
