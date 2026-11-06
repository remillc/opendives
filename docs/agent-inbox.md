# Agent inbox

Tasks for the coding agent, written from the design sessions with Christian on claude.ai. They are shown to the agent automatically by the hooks in `.claude/settings.json`, which run `tools/agent-inbox.mjs`.

**Rules**

- Do the open tasks in order. Each task names its references: `docs/ui-specification.md` wins over the mock-ups; the mock-ups in `docs/mockups/` are the source of the canvas boards (readable HTML, not meant to be opened standalone).
- When a task is done, change its heading from `[ ]` to `[x]` in the same commit as its work, and add one line under it: `Done in <commit subject>`.
- A task marked **Wait** must not be started until Christian says so in the chat.
- Never delete or rewrite a task; if a task is unclear or contradicts the specification, stop and ask Christian.
- Only the design side (claude.ai) adds tasks. The agent does not add tasks here.

## [x] 2026-11-06-00 Register the inbox hooks

Done in Register the agent inbox hooks

Create `.claude/settings.json` (committed) with two command hooks that run `tools/agent-inbox.mjs`: `SessionStart` with the argument `start`, and `UserPromptSubmit` with the argument `prompt`. The command is `node "$CLAUDE_PROJECT_DIR/tools/agent-inbox.mjs" start` (or `prompt`), timeout 10 seconds. Add `.claude/inbox-seen.json` and `.claude/settings.local.json` to `.gitignore`. Then check, in a new session, that the open tasks of this file appear by themselves; if the VS Code extension does not show the hook's output, say so to Christian.

## [x] 2026-11-06-01 Account entry in the side menu

Done in Add the Account screen and its entry in the side menu

Add an "Account" entry to `NavMenu.svelte`, after the separator and before Settings, with a person icon (see `docs/mockups/appbar-tiroir-ios-ouvert.dc.html` and `appbar-tiroir-android-ouvert.dc.html`). It opens the Account screen (next task). Texts through `fr.json` ("Compte") and `en.json` ("Account").

## [x] 2026-11-06-02 Account screen

Done in Add the Account screen and its entry in the side menu

Build the Account screen from `docs/mockups/compte-*.dc.html` (iOS and Android, signed in and without an account) and `docs/ui-specification.md`, section 3 (Sections row).

- **Signed in:** card with the account email and "Subsurface account verified"; Synchronisation group: "Sync automatically" switch with its explanation, last synchronisation time, number of dives in the cloud, "Sync now"; Subsurface account group: "Change password" (a link is sent by email); Leave group: "Sign out" and "Delete account" (alarm colour), each with its consequence under the label; at the bottom, a caption "Connected through the Europe server (ssrf-cloud-eu)." with the host actually in use. The server is not a setting: the core picks the first one that answers.
- **Without an account:** card "No account" with the number of dives on this device; one sentence on what an account brings; two choices with their consequences: "Create an account" and "Sign in to an existing account".
- **For now, do not wire** "Change password", "Sign out", "Delete account", "Create an account" and "Sign in": show them, and on tap show "Not available yet". Their behaviour in Subsurface must be checked first (design side), and will come as separate tasks.
- Remove the account rows from Settings if they duplicate this screen.

## [x] 2026-11-06-03 Editing and cloud sync, after test 1

Done in Add tests 2 and 3 of the editing plan, keep the sync flag (Christian said to go on, on the development account)

**Wait.** Test 1 of `docs/editing-and-sync-plan.md` is reported done (commit "Add dive editing, local save and sync to the façade, with test 1"). Do not start test 2 or anything that writes to a cloud account until Christian has read the report and says to go on.

## [x] 2026-11-06-04 Top margin above the dive detail header

Done in Add a top margin above the dive detail header

In `DiveDetail.svelte`, add a 16 px top margin between the top bar and the header line (number and date), on iOS and Android, as in the refreshed `docs/mockups/detail3-*.dc.html`.

## [x] 2026-11-06-05 "Sync now" as a centred button

Done in Make "Sync now" a centred button on the Account screen

On the Account screen, "Sync now" is a real button, centred in its row: tonal button on Android (40 dp high, 24 dp side padding, fully rounded, `--od-tint` background), and on iOS a 44 pt bordered button with 12 pt corners. See `docs/mockups/compte-*-connecte.dc.html`.

## [x] 2026-11-06-06 Manual synchronisation mode

Done in Add the manual synchronisation mode

When "Sync automatically" is off (Account screen), follow `docs/ui-specification.md`, section 4, "Manual synchronisation": save locally only, no fetch or send until "Sync now"; the setting is per device. Show "Manual sync: N changes not sent" in `--od-pending` in `<SyncStatus>` (top of the Logbook and bottom of the side menu), add the "Sync now" button at the bottom of the side menu in this mode, add the "Changes not sent" row and the "Off: ..." explanation on the Account screen. Mock-ups: `docs/mockups/compte-android-connecte-manuel.dc.html`, `appbar-tiroir-android-ouvert-manuel.dc.html`.

## [x] 2026-11-06-07 Dark-mode alarm and pending colours

Done in Set the dark-mode alarm and pending colours

Set the dark values of `--od-alarm` to #FF8A80 and `--od-pending` to #F2B84B (`docs/ui-specification.md`, section 1). Light values are unchanged. Reference: `docs/mockups/alarme-sombre-1.dc.html`.

## [x] 2026-11-06-08 Sign out

Done in Add sign-out and a first-launch screen

Wire "Sign out" on the Account screen as in `docs/ui-specification.md`, section 4, "Sign out", and `docs/mockups/compte-android-deconnexion.dc.html`: confirmation dialog (MD3 on Android); with pending changes, "Sync, then sign out", "Sign out anyway", "Cancel"; "Also delete the copy on this device" checkbox, off by default, disabled while changes are pending. Signing out forgets the credentials (keychain), closes the logbook and shows first launch; keep the local copy unless the box is checked. Never delete a copy that has unsent commits. Also update the text under "Sign out" (see `compte-android-connecte.dc.html`).

## [x] 2026-11-06-09 Delete the account

Done in Add the delete-account screen and request (never sent: Christian decided on 6 November 2026 not to test it for now, and not on the development account; the server replies are still to be recorded)

Build the delete-account screen from `docs/mockups/compte-android-suppression.dc.html` and `docs/ui-specification.md`, section 4, "Delete the account". Port the request from Subsurface (`core/cloudstorage.cpp`, `deleteAccount()`: POST "email password" as text/plain to `<cloud>/delete-account`) into the facade without Qt. Unlike Subsurface, read the reply and treat the account as deleted only when the server confirms; record the exact replies seen on the test account in the report. Sync unsent changes first; keep the dives in a no-cloud local logbook when the box is checked; require the password again. **Wait** before running it against any account other than `OPENDIVES_CLOUD_TEST_EMAIL`; never call the endpoint in automated tests.

## [x] 2026-11-06-10 Sign out and delete as buttons

Done in Show sign out and delete as buttons on the Account screen

On the Account screen, replace the "Sign out" and "Delete the account" rows with centred outlined buttons, each with its explanation under it (`docs/ui-specification.md`, section 4, "Leaving the account, buttons"). "Delete the account" uses `--od-alarm` for its text and border. Mock-ups: `docs/mockups/compte-*-connecte*.dc.html`.

## [x] 2026-11-06-11 Full dive detail

Done in Bring the dive detail to the full detail3 mock-ups

Bring the dive detail to `docs/mockups/detail3-android.dc.html` (light) and `detail3-android-sombre.dc.html` (dark), following `docs/ui-specification.md`, section 4, "Full dive detail" and "Conditions": gas and equipment block, SAC only when computed, weights per location, notes in full, collapsed Conditions block. Rating and conditions are 1 to 5 stars; hide any condition at 0. Ask Christian before computing anything the core does not provide.

## [x] 2026-11-06-12 Full editing and settings, conditions switch

Done in Add the dive edit screen and the conditions switch (the settings part is task 2026-11-06-16)

Bring the edit screen and Settings to `docs/mockups/android-edition.dc.html` and `android-reglages.dc.html` (section 4, "Full editing and settings" and "Conditions"). Editing shows rating, visibility and current as stars; the Settings switch "Houle, ressac et froid" ("Wave size, surge and chill"), off by default, adds the three others. Store the switch as a device setting. The detail still shows filled-in conditions whatever the switch.

## [x] 2026-11-06-13 Trip screen

Done in Add the trip screen and undoable trip changes

Build the trip screen from `docs/mockups/voyage-android.dc.html` and section 4, "Trip". Automatic trips have no stable identifier: never store one.

## [x] 2026-11-06-14 Sites screens

Done in Add the Sites screens and undoable site changes

Build the four Sites screens from `docs/mockups/sites-fiche-android.dc.html`, `sites-edition-android.dc.html`, `sites-sans-site-android.dc.html` and `sites-nettoyer-android.dc.html`, following section 4, "Sites", and add the duplicates row and links to `android-sites.dc.html`. Use the core functions named there; country and region lookup goes through GeoNames like Subsurface. Merging and deleting sites change the logbook: confirm before each, and test on the test account only.

## [ ] 2026-11-06-15 Implement every screen of the mock-ups

Christian asks for every interface designed so far to be built. After tasks 11 to 14, go through `docs/mockups/README.md` and build each screen not built yet, in this order, one commit per screen (or per small group), ticking nothing here until all are done:

1. Logbook additions: "+" menu (download, import a file, log by hand), free filter (`ios-filtre`), and the states: empty logbook, download failed, offline with pending changes, sync conflict (`*-etat-*`).
2. Dive detail top menu with "Plan from this dive" (`detail2-*-menu`), then the planner (`*-planificateur`, real result from the core).
3. Tools and gas calculator (`*-outils`).
4. Statistics, precompiled table and row detail (`*-stats*`).
5. Sites map and list (`*-sites`), with the Sites screens of task 14.
6. Quick entry on the boat (`ios-saisie`) and download from the dive computer (`ios-telechargement`).
7. First launch and new account taking over a divelogs.de logbook (`*-accueil`, `*-compte-import`). Never store divelogs.de credentials.
8. Tablet layouts (`tablette-*`, `android-tablette-*`): list and detail side by side, rail.

Rules for this task:
- `docs/ui-specification.md` wins. Older boards predate later decisions (side menu instead of the bottom bar, full detail `detail3-*`, conditions as stars, account buttons): apply the specification to them. The Android boards are the most recent; build iOS from the same structure with the iOS look of the iOS boards.
- Stop and ask Christian before adding a native dependency (Bluetooth for dive computers, offline map tiles, file pickers), before exposing a new core function that is not read-only, or when a mock-up and the specification disagree.
- Anything that writes to a cloud account runs on `OPENDIVES_CLOUD_TEST_EMAIL` only.
- Report, at the end, which screens are built, which are partial and why.

## [ ] 2026-11-06-16 Settings modelled on Subsurface

Rebuild Settings from `docs/mockups/android-reglages.dc.html` and `docs/ui-specification.md`, section 4, "Settings, modelled on Subsurface" (it supersedes the settings part of task 12 and the old settings boards). Read and write each value through the core's preferences (`core/pref.h`), with Subsurface's defaults; keep them per device, except trip grouping, which is the logbook's `autogroup`. Do not move planner settings here: they belong to the planner screen. Rename the conditions to Subsurface's French labels ("Vagues de surface", "Flux-reflux", "Froid") in `fr.json`. Do this task before task 15.

## [ ] 2026-11-06-17 Settings: behaviour of every row

Part of task 16. Wire every Settings row as in `docs/ui-specification.md`, section 4, "Settings: what each row does": the four row kinds (switch, single-choice dialog, number dialog, chevron), the two action buttons with their confirmation dialogs, the ⋮ menu of a remembered dive computer, and the cylinder types sub-screen. Mock-ups: `docs/mockups/android-reglages.dc.html`, `reglages-choix-android.dc.html`, `reglages-nombre-android.dc.html`, `reglages-menu-android.dc.html`, `reglages-bouteilles-android.dc.html`. Check each preference name in `core/pref.h` before using it; if one in the table does not exist or behaves differently, stop and ask Christian. The offline maps sub-screen is not designed yet: leave the row disabled.

## [ ] 2026-11-06-18 Settings: dialogs and layout, updated

Follow the updated paragraph "Settings: what each row does" in `docs/ui-specification.md`, section 4 (it replaces the earlier version used by task 17): chevrons on value rows, date choices shown as dates with the device's format first, wheel pickers instead of number fields, the speeds / duration / coordinates dialogs, the split Units group, and the layout rules. Mock-ups: `docs/mockups/android-reglages.dc.html` and `docs/mockups/reglages-*-android.dc.html`.

## [ ] 2026-11-06-19 App icon: Hublot

Replace the app icon with the "Hublot" logo (`docs/ui-specification.md`, "Logo"). Android: an adaptive icon built from `docs/brand/opendives-icon-light-fullbleed.svg` (background #F4F4F2, the rest as foreground, as a vector drawable), plus a monochrome layer (ring, waterline and bubbles in one colour) for themed icons; check it in the round and squircle masks. iOS: a 1024 × 1024 icon from the same drawing, light and dark variants. Also the splash screen and the web favicon. Do not change the drawing; if something does not convert well, stop and ask Christian.

## [ ] 2026-11-06-20 Text fields, choice dialogs, coordinates

Apply three updates of `docs/ui-specification.md`, section 4, everywhere they occur:
1. "Text fields": Framework7 MD outline inputs with floating labels (label inside the empty field, moving onto the outline on focus or when filled, no placeholder), plain trailing icon buttons, a text "Enregistrer" button in the top bar of full-screen forms. Check every form already built (Account, delete account, dive editing, sites) and the new site screen `docs/mockups/sites-edition-android.dc.html`, which also gained a "site already within 100 m" note with a "Utiliser ce site" button.
2. Choice dialogs as plain MD3 single-choice dialogs (no tinted or bold selected row): `docs/mockups/reglages-*-android.dc.html`.
3. GPS coordinates: three formats, decimal by default, formatted by OpenDives itself (the core only knows seconds and decimal). Update the Settings row and the site screens.

## [ ] 2026-11-06-21 Material 3 audit fixes (Android)

Christian asked for every Android screen to be MD3-compliant. Read "Android follows Material 3" in `docs/ui-specification.md`, section 4, then fix these points found in the audit of the mock-ups, in the app where the screens exist (and keep them in mind for screens still to build):
1. Sites map (`android-sites.dc.html`): the ☰ button overlapped the search bar. The menu icon now sits inside the search bar at its start, the search icon at its end. The two links of the bottom sheet ("6 plongées sans site", "2 doublons possibles") become 56 dp list items with a trailing chevron.
2. Dive editing (`android-edition.dc.html`) and every full-screen form: "Enregistrer" is a text button at the right of the top bar, not a filled pill.
3. Sign-out dialog (`compte-android-deconnexion.dc.html`): the "Also delete the copy" checkbox must render as an 18 dp box (it was squashed into a thin bar). Check that no radio button or checkbox can be shrunk by a flex layout (`flex: none`).
4. Delete account (`compte-android-suppression.dc.html`): buttons 40 dp high, fully rounded (they were 48 dp).
5. Take over a logbook (`android-compte-import.dc.html`): all radio buttons 20 dp (two were shrunk).
6. Clean up sites (`sites-nettoyer-android.dc.html`): button labels on one line ("Pas des doublons").
7. Site sheet (`sites-fiche-android.dc.html`): "Ouvrir dans Cartes" as an MD3 text button with the "open in new" icon (task 20 and the spec).
Then go through every Android screen already built with the reference values of the spec, fix what does not match, and list what you changed in your report.

## [ ] 2026-11-06-22 Statistics section

Build the Statistics section from `docs/ui-specification.md`, section 4, "Statistics", and the mock-ups `docs/mockups/android-stats.dc.html`, `stats-annee-android.dc.html`, `stats-filtre-android.dc.html`, `stats-nouvelle-android.dc.html` (MD3). This supersedes the older statistics boards (`ios-stats*`, `android-stats` before today, tablets): remove the totals by dive computer, add the three ready-made charts, *My statistics* with "New statistic", *By year* and the year screen. No chart builder. Compute every figure with the core (`stats`, yearly statistics); if the core does not expose something the screens need, stop and ask Christian before adding it to the facade.
