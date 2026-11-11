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

## [x] 2026-11-06-16 Settings modelled on Subsurface

Done in Rebuild Settings modelled on Subsurface

Rebuild Settings from `docs/mockups/android-reglages.dc.html` and `docs/ui-specification.md`, section 4, "Settings, modelled on Subsurface" (it supersedes the settings part of task 12 and the old settings boards). Read and write each value through the core's preferences (`core/pref.h`), with Subsurface's defaults; keep them per device, except trip grouping, which is the logbook's `autogroup`. Do not move planner settings here: they belong to the planner screen. Rename the conditions to Subsurface's French labels ("Vagues de surface", "Flux-reflux", "Froid") in `fr.json`. Do this task before task 15.

## [x] 2026-11-06-17 Settings: behaviour of every row

Done in Rebuild Settings modelled on Subsurface

Part of task 16. Wire every Settings row as in `docs/ui-specification.md`, section 4, "Settings: what each row does": the four row kinds (switch, single-choice dialog, number dialog, chevron), the two action buttons with their confirmation dialogs, the ⋮ menu of a remembered dive computer, and the cylinder types sub-screen. Mock-ups: `docs/mockups/android-reglages.dc.html`, `reglages-choix-android.dc.html`, `reglages-nombre-android.dc.html`, `reglages-menu-android.dc.html`, `reglages-bouteilles-android.dc.html`. Check each preference name in `core/pref.h` before using it; if one in the table does not exist or behaves differently, stop and ask Christian. The offline maps sub-screen is not designed yet: leave the row disabled.

## [x] 2026-11-06-18 Settings: dialogs and layout, updated

Done in Rebuild Settings modelled on Subsurface

Follow the updated paragraph "Settings: what each row does" in `docs/ui-specification.md`, section 4 (it replaces the earlier version used by task 17): chevrons on value rows, date choices shown as dates with the device's format first, wheel pickers instead of number fields, the speeds / duration / coordinates dialogs, the split Units group, and the layout rules. Mock-ups: `docs/mockups/android-reglages.dc.html` and `docs/mockups/reglages-*-android.dc.html`.

## [x] 2026-11-06-19 App icon: Hublot

Done in Replace the app icon with the Hublot logo

Replace the app icon with the "Hublot" logo (`docs/ui-specification.md`, "Logo"). Android: an adaptive icon built from `docs/brand/opendives-icon-light-fullbleed.svg` (background #F4F4F2, the rest as foreground, as a vector drawable), plus a monochrome layer (ring, waterline and bubbles in one colour) for themed icons; check it in the round and squircle masks. iOS: a 1024 × 1024 icon from the same drawing, light and dark variants. Also the splash screen and the web favicon. Do not change the drawing; if something does not convert well, stop and ask Christian.

## [x] 2026-11-06-20 Text fields, choice dialogs, coordinates

Done in Use floating-label outline fields and MD3 buttons on the built screens, then Rebuild Settings modelled on Subsurface (choice dialogs, coordinates row); the fields became filled ones with task 27

Apply three updates of `docs/ui-specification.md`, section 4, everywhere they occur:
1. "Text fields": Framework7 MD outline inputs with floating labels (label inside the empty field, moving onto the outline on focus or when filled, no placeholder), plain trailing icon buttons, a text "Enregistrer" button in the top bar of full-screen forms. Check every form already built (Account, delete account, dive editing, sites) and the new site screen `docs/mockups/sites-edition-android.dc.html`, which also gained a "site already within 100 m" note with a "Utiliser ce site" button.
2. Choice dialogs as plain MD3 single-choice dialogs (no tinted or bold selected row): `docs/mockups/reglages-*-android.dc.html`.
3. GPS coordinates: three formats, decimal by default, formatted by OpenDives itself (the core only knows seconds and decimal). Update the Settings row and the site screens.

## [x] 2026-11-06-21 Material 3 audit fixes (Android)

Done in Apply the MD3 audit to every Android screen

Christian asked for every Android screen to be MD3-compliant. Read "Android follows Material 3" in `docs/ui-specification.md`, section 4, then fix these points found in the audit of the mock-ups, in the app where the screens exist (and keep them in mind for screens still to build):
1. Sites map (`android-sites.dc.html`): the ☰ button overlapped the search bar. The menu icon now sits inside the search bar at its start, the search icon at its end. The two links of the bottom sheet ("6 plongées sans site", "2 doublons possibles") become 56 dp list items with a trailing chevron.
2. Dive editing (`android-edition.dc.html`) and every full-screen form: "Enregistrer" is a text button at the right of the top bar, not a filled pill.
3. Sign-out dialog (`compte-android-deconnexion.dc.html`): the "Also delete the copy" checkbox must render as an 18 dp box (it was squashed into a thin bar). Check that no radio button or checkbox can be shrunk by a flex layout (`flex: none`).
4. Delete account (`compte-android-suppression.dc.html`): buttons 40 dp high, fully rounded (they were 48 dp).
5. Take over a logbook (`android-compte-import.dc.html`): all radio buttons 20 dp (two were shrunk).
6. Clean up sites (`sites-nettoyer-android.dc.html`): button labels on one line ("Pas des doublons").
7. Site sheet (`sites-fiche-android.dc.html`): "Ouvrir dans Cartes" as an MD3 text button with the "open in new" icon (task 20 and the spec).
Then go through every Android screen already built with the reference values of the spec, fix what does not match, and list what you changed in your report.

## [x] 2026-11-06-22 Statistics section

Done in Compute the statistics with the core, two charts on the main screen

Build the Statistics section from `docs/ui-specification.md`, section 4, "Statistics", and the mock-ups `docs/mockups/android-stats.dc.html`, `stats-annee-android.dc.html`, `stats-filtre-android.dc.html`, `stats-nouvelle-android.dc.html` (MD3). This supersedes the older statistics boards (`ios-stats*`, `android-stats` before today, tablets): remove the totals by dive computer, add the three ready-made charts, *My statistics* with "New statistic", *By year* and the year screen. No chart builder. Compute every figure with the core (`stats`, yearly statistics); if the core does not expose something the screens need, stop and ask Christian before adding it to the facade.

## [x] 2026-11-06-23 Statistics section on iPhone

Done in Compute the statistics with the core, two charts on the main screen

The iPhone screens of the Statistics section are updated to match task 22: `docs/mockups/ios-stats-tableau.dc.html` (main screen), `ios-stats-annee.dc.html` (year), `ios-stats.dc.html` (filtered result, replaces the old "detail of a statistics row"), `ios-stats-nouvelle.dc.html` (new statistic, as a sheet with Annuler / Enregistrer). Same content and rules as on Android (`docs/ui-specification.md`, "Statistics"), with the iOS look: large title, inset grouped lists, chevrons in tertiary grey, actions as rows ("Nouvelle statistique…", "Ajouter un critère…"), a check mark for the selected values.

## [x] 2026-11-06-24 Tools: desaturation and gas calculator

Done in Add the Tools section, gas calculator and Desaturation screen (the remaining desaturation time is not shown: no criterion in the core, Christian agreed)

Follow "Tools" in `docs/ui-specification.md`, section 4. Build the Desaturation screen (`docs/mockups/outils-desaturation-android.dc.html`) with the core's tissue model (no new formula: if the core does not expose tissue loads after the last dives, stop and ask Christian), and add the cylinder type, EAD at the MOD and END at the MOD to the gas calculator (`android-outils.dc.html`), computed by the core's gas functions. The wait-before-flying rule is OpenDives' own: 12 h after one dive, 18 h after several dives in a day; show it as a recommendation, never as a guarantee.

## [x] 2026-11-06-25 Settings: Décompression group

Done in Rebuild Settings modelled on Subsurface

Add the "Décompression" group to Settings, after "Profil de plongée" (`docs/mockups/android-reglages.dc.html`, rows in the settings table of `docs/ui-specification.md`): model, gradient factors, VPM-B conservatism, oxygen narcotic, best-mix END. They are shared by the profile's calculated ceiling, the planner, the desaturation tool and the gas calculator: read them from the same preferences everywhere, and remove any copy of them from the planner's own settings. One model setting drives both `display_deco_mode` and `planner_deco_mode`.

## [x] 2026-11-06-26 Edit a site

Done in Delete a site from its edit screen, filled fields everywhere

Add the edit mode of the site form from `docs/mockups/sites-modifier-android.dc.html` and "Edit a site" in `docs/ui-specification.md` (section 4, Sites): title, prefilled fields, no duplicate note, "Supprimer le site" with a confirmation; deleting keeps the dives and removes their site. Test deletion on the test account only.

## [x] 2026-11-06-27 Filled text fields everywhere

Done in Delete a site from its edit screen, filled fields everywhere

Every text field of the app now uses the MD3 filled variant (`docs/ui-specification.md`, "Text fields", which replaces the outlined rule of task 20). Change every form already built: dive editing, account deletion, divelogs.de takeover, gas calculator, new statistic, site forms. Mock-ups updated: `android-edition`, `compte-android-suppression`, `android-compte-import`, `android-outils`, `stats-nouvelle-android`, `sites-edition-android`, `sites-modifier-android`.

## [x] 2026-11-06-28 Sites: "New site" FAB

Done in Sites: new site FAB, smaller centre-on-me button

The Sites screen gets back its FAB "+" (56 dp, aria-label "Nouveau site") at the bottom right over the list panel, opening the new site form. The "Centrer sur ma position" button becomes a small 40 dp button at the bottom right of the visible map. The panel keeps 88 dp of bottom padding. See `docs/ui-specification.md` (Sites) and `docs/mockups/android-sites.dc.html`.

## [x] 2026-11-06-29 Statistics: remove the maximum depth chart

Done in Compute the statistics with the core, two charts on the main screen

The Statistics screen keeps two ready-made charts: dives per year and dive durations. Remove the maximum depth chart from the main screen (Android and iOS). Maximum depth per dive stays on the year and filtered result screens. See `docs/ui-specification.md` (Statistics) and `docs/mockups/android-stats.dc.html`, `docs/mockups/ios-stats-tableau.dc.html`.

## [x] 2026-11-06-30 Aligner Se connecter, Nouveau compte étape 1 et le code de confirmation sur les nouvelles maquettes

Done in Build the sign-in, new account and import screens

Align Sign in, New account step 1 and the confirmation code with the new mock-ups. The confirmation code is a new screen between step 1 and step 2 ("Reprendre votre carnet ?"), using `cloud_verify_pin`, with "Renvoyer le code". Show the states: request in progress (fields and button disabled, spinner, linear indicator on Android), wrong credentials, invalid email, wrong code. First launch and Account without an account now open these screens. See `docs/ui-specification.md` (section 4, "Sign in and new account").

Mock-ups, Android then iPhone:
- `docs/mockups/compte-connexion-android.dc.html`, `compte-connexion-encours-android.dc.html`, `compte-connexion-erreur-android.dc.html`
- `docs/mockups/compte-creation-android.dc.html`
- `docs/mockups/compte-code-android.dc.html`, `compte-code-erreur-android.dc.html`
- `docs/mockups/compte-connexion-ios.dc.html`, `compte-connexion-encours-ios.dc.html`, `compte-connexion-erreur-ios.dc.html`
- `docs/mockups/compte-creation-ios.dc.html`
- `docs/mockups/compte-code-ios.dc.html`, `compte-code-erreur-ios.dc.html`
- Links updated in `android-accueil`, `ios-accueil`, `compte-android-sans-compte`, `compte-ios-sans-compte`.

## [x] 2026-11-06-31 New account step 2: "Continuer" button

Done in Build the sign-in, new account and import screens

On "Reprendre votre carnet ?", the main button at the bottom applies to the selected choice, so its label is now "Continuer" instead of "Télécharger mes plongées": divelogs.de starts the download, file opens the file picker, empty logbook opens the logbook. Mock-ups: `docs/mockups/android-compte-import.dc.html`, `docs/mockups/ios-compte-import.dc.html`.

## [x] 2026-11-06-32 New account: import progress and failure

Done in Build the sign-in, new account and import screens

After "Continuer" on step 2, show the import progress screen, then the Logbook, or the failure screen. See `docs/ui-specification.md` (section 4, "Sign in and new account"). Mock-ups: `docs/mockups/compte-import-encours-android.dc.html`, `compte-import-echec-android.dc.html`, `compte-import-encours-ios.dc.html`, `compte-import-echec-ios.dc.html`.

## [x] 2026-11-06-33 New account: check divelogs.de credentials first, "Précédent", "Renvoyer le code" under the field

Done in Check divelogs.de credentials before the import, add Précédent and import from a file

On step 2, "Continuer" with divelogs.de checks the credentials before the import starts. If divelogs.de refuses them, stay on step 2 with the error under the password field. The import failure screen now only covers failures during the import, with "Réessayer". Step 2 also gets a "Précédent" button back to step 1 (the account already exists: do not create a second one). On the confirmation code screen, "Renvoyer le code" is a button with a refresh icon right under the field (outlined on Android, tinted grey on iOS). See `docs/ui-specification.md` (section 4, "Sign in and new account"). Mock-ups: `android-compte-import`, `ios-compte-import`, `compte-import-identifiants-android`, `compte-import-identifiants-ios`, `compte-import-echec-android`, `compte-import-echec-ios`, `compte-code-android`, `compte-code-erreur-android`, `compte-code-ios`, `compte-code-erreur-ios`.

## [x] 2026-11-06-34 New account step 2: empty logbook first

Done in New account step 2: empty logbook first

On "Reprendre votre carnet ?", the choices are now in this order: "Commencer avec un carnet vide", "Depuis divelogs.de", "Depuis un fichier". Mock-ups: `android-compte-import`, `ios-compte-import`, `compte-import-identifiants-android`, `compte-import-identifiants-ios`.

## [x] 2026-11-07-01 Android menus: rounder corners and MD3 details

Every ⋮ menu on Android: 16 dp corners, items 48 dp high with 12 dp side padding, 24 dp leading icon, labels 14 sp medium, elevation level 2, width 112 to 280 dp. See `docs/ui-specification.md` (Android follows Material 3). Mock-ups: `docs/mockups/detail2-android-menu.dc.html`, `docs/mockups/reglages-menu-android.dc.html`.

Done in "Android menus: 16 dp corners, surface-container, MD3 item spacing".

## [x] 2026-11-07-02 Body font: Source Sans 3

Bundle Source Sans 3 (OFL, weights 400 to 700, Latin and Latin Extended: take the full files from the upstream release, the ones in `docs/brand/fonts/` are the Latin subset used for the mock-up) and use it for all body text on Android and iOS. Titles and the large key figures keep the system font (Roboto, SF Pro). It must scale with the phone's text size. Keep `tabular-nums` on dive values. See `docs/ui-specification.md` ("Fonts") and `docs/mockups/police-source-android.dc.html`.

Done in "Source Sans 3 for body text, system font for titles and key figures".

## [x] 2026-11-07-03 Sites: compact maintenance rows

The three rows under the Sites count ("N plongées sans site", "N sites sans coordonnées", "N doublons possibles") are now compact one-line list items: 48 dp high, no vertical padding, 14 sp text, chevron kept. The site rows below are unchanged. Mock-up: `docs/mockups/android-sites.dc.html`.

Done in "Sites: compact one-line maintenance rows".

## [x] 2026-11-07-04 New app icon: Hublot mi-fin

The logo was redrawn: no ring in light mode (a white disc on the paper background), a thin light ring in dark mode, and less water in the circle. Regenerate the app icons (Android adaptive icon, iOS) and any in-app logo from the updated `docs/brand/opendives-icon-*.svg`. See `docs/ui-specification.md` ("Logo") and `docs/mockups/logo-hublot-moyen.dc.html`.

Done in "App icon: thinner Hublot logo on Android, iOS and the web".

## [x] 2026-11-07-05 App icon: no ring in light mode

Follow-up to 2026-11-07-04, changed after it was done. In light mode the logo has no ring any more: the porthole is a white disc (#FFFFFF, circle r 30) on the paper background, with the water (now clipped to r 30) and the two ink bubbles. Dark mode keeps the thin paper ring. Update the Android adaptive icon foreground (remove the ring stroke, add the white disc), the monochrome icon if it uses the ring, the splash mark, iOS and web icons, from the updated `docs/brand/opendives-icon-light-*.svg`. See `docs/ui-specification.md` ("Logo") and `docs/mockups/logo-hublot-moyen.dc.html`.

Done in "App icon: white porthole without a ring in light mode".

## [x] 2026-11-07-06 App icon: final logo, ring under the water

New and final version of the logo, replacing tasks 04 and 05. A white disc (dark mode #1E2023) with the water at about 40 %, and the ring only under the water: an ink arc (paper in dark mode), 3 units thick with rounded ends, from one end of the waterline to the other through the bottom. Two filled bubbles, slightly larger (radius 3 and 2.1). Regenerate every icon from the updated `docs/brand/opendives-icon-*.svg`: Android adaptive icon (foreground, monochrome), splash mark (light and night), iOS, web. See `docs/ui-specification.md` ("Logo") and `docs/mockups/logo-anneau-sous-eau.dc.html`.

Done in "App icon: final Hublot logo, the ring only under the water".

## [x] 2026-11-07-07 Tools: list page and three gas tools

The Tools page becomes a list of links in two groups (Plongée: planner, desaturation; Gaz: EAD et MOD, Meilleur mélange, Mélangeur de gaz). The inline gas calculator is removed and split into "EAD et MOD" and "Meilleur mélange" screens. Add a new "Mélangeur de gaz" screen for partial pressure blending of nitrox and trimix (helium, then oxygen, then top-up gas, with real-gas compressibility), with its warnings. See `docs/ui-specification.md` ("Tools page and gas tools"). Mock-ups: `docs/mockups/android-outils.dc.html`, `outils-ead-mod-android.dc.html`, `outils-meilleur-melange-android.dc.html`, `outils-melangeur-android.dc.html`.

Done in "Tools: list page, gas tools, water type and gas blender".

## [x] 2026-11-07-08 Gas tools: ppO₂ wheel

In "EAD et MOD" and "Meilleur mélange", the maximum ppO₂ is chosen with an inline wheel (1,0 to 1,6 bar by 0,1, default 1,4), not a segmented control. The wheel sits on a white surface with the label "ppO₂ maximale" on the left and "bar" on the right. Mock-ups: `docs/mockups/outils-ead-mod-android.dc.html`, `outils-meilleur-melange-android.dc.html`.

Done in "Tools: list page, gas tools, water type and gas blender".

## [x] 2026-11-07-09 Water type in depth calculations

Add a "Type d’eau" choice (Eau douce, Eau saumâtre, EN 13319, Eau de mer, default Eau de mer, Subsurface's salinity values) to "EAD et MOD", "Meilleur mélange" and the planner (row "Type d’eau" before the gradient factors, taken from the starting dive when it has a salinity). Use it for every depth to pressure conversion in these tools. See `docs/ui-specification.md` ("Tools page and gas tools", Water type). Mock-ups: `outils-ead-mod-android`, `outils-meilleur-melange-android`, `android-planificateur`.

Done in "Tools: list page, gas tools, water type and gas blender".

## [x] 2026-11-07-10 Best mix: "Nitrox" label

In "Meilleur mélange", the second result row is labelled "Nitrox" (not "Nitrox seul"). Mock-up: `docs/mockups/outils-meilleur-melange-android.dc.html`.

Done in "Tools: list page, gas tools, water type and gas blender".

## [x] 2026-11-07-11 Best mix: nitrox first

In "Meilleur mélange", the "Nitrox" row comes first, then "Trimix". Mock-up: `docs/mockups/outils-meilleur-melange-android.dc.html`.

Done in "Tools: list page, gas tools, water type and gas blender".

## [x] 2026-11-07-12 Gas blender: Nitrox and Trimix modes

The gas blender stays one tool, with a segmented control "Nitrox | Trimix" at the top, remembered on the device. Nitrox mode hides the helium fields and the helium step (oxygen, then top-up gas). Trimix mode is the current screen. See `docs/ui-specification.md` ("Mélangeur de gaz"). Mock-ups: `docs/mockups/outils-melangeur-nitrox-android.dc.html`, `outils-melangeur-android.dc.html`.

Done in "Tools: list page, gas tools, water type and gas blender".

## [x] 2026-11-07-13 Gas blender: residual oxygen and helium

In Trimix mode, what is already in the cylinder is entered as pressure, then oxygen % and helium % in two separate dropdowns (any combination), instead of one mix dropdown. Mock-up: `docs/mockups/outils-melangeur-android.dc.html`.

Done in "Tools: list page, gas tools, water type and gas blender".

## [x] 2026-11-07-14 Gas blender: helium or oxygen first

In Trimix mode, add a segmented control "Hélium d’abord | Oxygène d’abord" above the fill steps (default helium first, remembered on the device). The steps and their target pressures follow the chosen order; the top-up gas stays last. Mock-up: `docs/mockups/outils-melangeur-android.dc.html`.

Done in "Tools: list page, gas tools, water type and gas blender".

## [x] 2026-11-07-15 About page

Add an "À propos" entry in the side menu after Réglages, opening a new About screen: logo, name, version and build, one sentence, then Projet (release notes, source code, report a problem), Licences (GPL v2 text, open source components, OpenStreetMap, GeoNames), Confidentialité (privacy policy), and the credit to Subsurface at the bottom. External links get the external-link icon. The source code, issue tracker and privacy policy URLs are placeholders until Christian gives the real ones. See `docs/ui-specification.md` ("About"). Mock-ups: `docs/mockups/apropos-android.dc.html`, `appbar-tiroir-android-ouvert.dc.html`.

Done in "About screen, version from package.json".

## [x] 2026-11-07-16 Versions: Semantic Versioning, version only in About

The About screen shows only "Version X.Y.Z", without the build number. Use Semantic Versioning 2.0.0 for the app version (MAJOR.MINOR.PATCH, optional pre-release like 0.2.0-beta.1), with one source of truth for Android `versionName`, iOS `CFBundleShortVersionString` and the web build; keep the build number (`versionCode`, `CFBundleVersion`) internal and increasing. See `docs/ui-specification.md` ("About"). Mock-up: `docs/mockups/apropos-android.dc.html`.

Done in "About screen, version from package.json".

## [x] 2026-11-07-17 About: author

On the About screen, add "Par Christian Rémillard" under the description, and start the bottom line with "© 2026 Christian Rémillard." before the Subsurface credit. Mock-up: `docs/mockups/apropos-android.dc.html`.

Done in "About screen, version from package.json".

## [x] 2026-11-07-18 About: report a problem by email, source code link

"Signaler un problème" opens a prefilled email (`mailto:`) to `SUPPORT_EMAIL`, a build-time setting. Subject "OpenDives X.Y.Z : problème", body with an empty line for the description, then a technical block (app version, platform and OS, device model, language, units, cloud account or not without the email, number of dives, last sync date and result, last error code). Never credentials, dive data or location. Mail icon on the row. "Code source" points to https://github.com/remillc/opendives. Leave `SUPPORT_EMAIL` empty for now and hide the row while it is empty. See `docs/ui-specification.md` ("Reporting a problem"). Mock-up: `docs/mockups/apropos-android.dc.html`.

Done in "About: report a problem by email, source code on GitHub".

## [x] 2026-11-07-19 Support address: support@opendives.app

The support address now works. Set `SUPPORT_EMAIL` to `support@opendives.app` and show the "Signaler un problème" row on the About screen (task 2026-11-07-18). See `docs/ui-specification.md` ("Reporting a problem").

Done in "About: show Report a problem with support@opendives.app" (`app/.env`, `VITE_SUPPORT_EMAIL`).

## [x] 2026-11-07-20 About: "Question / signaler un problème"

Rename the About row "Signaler un problème" to "Question / signaler un problème", and the email subject to "OpenDives X.Y.Z : question ou problème". Mock-up: `docs/mockups/apropos-android.dc.html`.

Done in "About: Question / report a problem".

## [x] 2026-11-07-21 Logo: grey arc on small sizes only

The logo now has two forms. At 64 px and below (launcher icons on Android, iOS and web, splash and notification marks, the logo beside the name in headers) the top of the circle is completed by a grey arc: regenerate those from the updated `docs/brand/opendives-icon-*.svg`. Above 64 px, when the logo stands alone (About screen, first launch), use the new `docs/brand/opendives-logo-{light,dark}.svg`, without the grey arc. See `docs/ui-specification.md` ("Logo", size rule) and `docs/mockups/logo-anneau-adaptatif.dc.html`.

Done in "Logo: grey arc on small sizes, large logo without it". First launch shows no logo today, so only About uses the large one.

## [x] 2026-11-07-22 Splash screen: no grey arc

My mistake in task 21: the splash screen shows the logo large, so it must not have the grey arc. Remove the grey arc from `ic_splash_mark.xml` (light and night) and from any iOS or web launch screen. Only the launcher icons, the favicon, notification marks and the small logo beside the name keep it. See `docs/ui-specification.md` ("Logo", size rule).

Done in "Splash screen: logo without the grey arc". The app has no iOS project or web launch screen yet.

## [x] 2026-11-07-23 Visual audit: match the mock-ups (Sites first)

Christian finds that several screens, the whole Sites section first, do not look like the mock-ups. I rendered the app (Vite, Android user agent, 390 × 844, the core mocked with sample data, map tiles offline) next to each mock-up: `docs/audit/2026-11-07/*.png`, mock-up on the left of each pair, app on the right. Ignore what comes from the sample data (empty Statistics and Desaturation, NaN in the gas tools, missing map tiles) and the 40 dp status bar offset of the mock-ups. Fix the points below, then check each screen yourself against its mock-up at 390 × 844 the same way, and list in this task anything you could not match and why.

**1. Global type scale (most of the "not the same look" comes from here).** Sizes below are those of the specification, unchanged with Source Sans 3 (see task 2026-11-07-26). Apply everywhere, through shared CSS (`theme.css`), not screen by screen:
- List item headline: 16/24, ink `#1F2124`. Supporting text: 14/20, `#4A4D52`. Field labels and helper text stay 12/16 (MD3).
- Trailing values in lists: in Settings 14/20 `#4A4D52`; elsewhere (site depth, results) as in each mock-up (16 to 22, weight 500 to 700, tabular figures).
- Section titles on the page background (Settings, Tools, About, gas tool results): 18/24, weight 700, 20 dp side margin. The About screen still uses 14 medium: change it.
- Intro paragraph at the top of a screen (Account, Dives without a site, Clean up the sites): 16/24.
- Chevrons: 24 dp, `#4A4D52`, the same icon as in Settings. Framework7's default small light chevron must not appear anywhere (Sites, About, site sheet, statistics rows).

**2. Sites list** (`android-sites`, `sites-1-liste-fiche.png`, left pair):
- Map height: from under the top app bar to 400 dp from the top of an 844 dp screen, about 36 % of the height (the app uses 45vh, too tall). OSM attribution at the bottom right of the map.
- "Centrer sur ma position": 40 dp, white surface, 12 dp corners, 16 dp from the right and bottom edges of the map, elevation level 1.
- Maintenance rows: 48 dp, 14/20 ink text, 24 dp chevron in `#1F2124`.
- Site rows: 72 dp two-line items. Name 16/24 ink, supporting 14/20 `#4A4D52` ("1 plongée, le 24 avril 2022"), trailing maximum depth 16/24 weight 500 ink with tabular figures. **No chevron** on site rows.

**3. Site sheet** (`sites-fiche-android`, right pair of `sites-1-liste-fiche.png`):
- Map: inside the page margins (16 dp), 16 dp corners, **4:5 portrait ratio** (358 × 448 dp on a 390 dp phone), attribution bottom right. Not full-bleed, not 200 dp high.
- "À propos du site" rows: headline 16, supporting 14.
- "Plongées à ce site": each row has the 48 dp profile thumbnail on the left (same as the Logbook rows), the long date in 16/24 weight 600 ("24 avril 2022, 10:30"), then "104 min · Buddy Diver · recycleur" in 14/20; no "1:44" duration format here, minutes as in the mock-up.

**4. New site / Edit site** (`sites-2-nouveau-modifier.png`): close to the mock-ups. The map card hint reads "Déplacez l’épingle pour corriger" in the mock-up; keep the map card 190 dp high with the attribution. On creation, the "Un site existe déjà à moins de 100 m" note sits under the map (spec).

**5. Dives without a site** (`sites-3-sans-site-nettoyer.png`, left pair):
- All dives in **one** white surface (20 dp corners) with dividers, not one card per dive.
- Row: date and time 16/24 weight 500 ("7 févr. 2026, 09:09", no "N° 8 ·"), then "55 min, recycleur" 14/20, then the actions.
- Actions are small outlined buttons, 32 dp high, 8 dp corners (as drawn), "Choisir un site" and "Nouveau site"; when a site is suggested, a filled tonal chip with the site name comes first and a line "Suggestion : Même voyage que 3 plongées à Hälvälä" under the buttons.
- After the list, "et 3 autres plongées" when the list is cut.

**6. Clean up the sites** (`sites-3-sans-site-nettoyer.png`, right pair):
- One surface per duplicate group: header with the site name 16/24 weight 600 and the reason 14/20 ("Même nom à la casse près, à 40 m l’un de l’autre").
- The candidates are radio rows (MD3 radio, 48 dp), the first selected: the kept site.
- Actions right-aligned at the bottom of the group: text button "Pas des doublons", filled button "Fusionner" (ink background).
- Then the section "Sites sans plongée": title on the page background, an explanation, a "Tout sélectionner" checkbox row, one checkbox row per unused site, and the delete button (see the mock-up).

**7. Other screens seen in the audit:**
- About (`apropos-detail.png`, left pair): no leading icons on the rows (the mock-up has none); logo 112 dp; group titles 18/700 as in point 1.
- Tools list (`stats-outils.png`, right pair): row descriptions on one line, as in the mock-up ("Nouvelle ou depuis le carnet", "Profondeurs d’un mélange", "Pour une profondeur donnée", "Gonfler un nitrox ou un trimix"); icons as drawn.
- EAD et MOD: the MOD row says "EAN32 à 1,4 bar" (the core's mix name), not "Nx 32".
- Gas blender (`melangeur-desaturation.png`, left pair): section labels "Mélange voulu" and "Dans la bouteille" are 14/20 weight 500 above the fields, not 18 bold titles; the residual oxygen and helium dropdowns are always shown in Trimix mode (oxygen alone in Nitrox mode), not only after a pressure is typed; the bottle size dropdown shows its value ("12 L").
- Account (`compte-reglages.png`, left pair): the top app bar is the small one with "Compte" as its title (64 dp), not a large collapsing title; intro paragraph 16/24.

Done in "Visual audit: Sites screens, shared chevron and section titles" and "Visual audit: About, Tools, gas tools, Account", with the Sites corrections of task 24. Checked on a Pixel 10 Pro XL (443 × 986 dp) with the real logbook, not at 390 × 844 with sample data. What does not match, and why:
- Point 1, type scale: the sizes were already those of the mock-ups (16/24 headline, 14/20 supporting). The difference seen comes from the font: the mock-ups use Roboto, the app Source Sans 3 (task 2026-11-07-02), whose x-height is about 10 % smaller. Christian chose to have the mock-ups redrawn in Source Sans 3 first (prompt sent to the design session); the app sizes are unchanged until then.
- Settings keeps its 18 and 20 dp chevrons (the reference screen); the other lists now use the same icon at 24 dp in `--od-text-2`, Framework7's chevron no longer appears on Android.
- Sites list: "Centrer sur ma position" is 32 dp above the bottom of the map, as drawn, not 16, so that it does not cover the credits line. The credits read "© OpenFreeMap, OpenMapTiles, contributeurs OpenStreetMap": the tile provider asks for its name too.
- Site sheet: section titles stay 14 medium `#4A4D52`, as in its mock-up (point 1 lists them only for Settings, Tools, About and the gas results).
- Dives without a site: "et 3 autres plongées" never shows, because the app does not cut the list. The date is 16/24 weight 500 as written here (the mock-up draws 600).
- Gas blender: the bottle shows the core's cylinder name and size ("AL80, 80,0 pi³"); "12 L" was the mock-up's sample.

## [x] 2026-11-07-24 Corrections to the visual audit (task 23): Sites maps, Sites panel on surfaces, Statistics charts

Christian changed some points of task 23. Where this task and task 23 disagree, this task wins.

**Site sheet map (replaces task 23, point 3, first bullet):** no 4:5 map. Keep the map inside the page margins (16 dp), 16 dp corners, 170 dp high, attribution at the bottom right, as in `docs/mockups/sites-fiche-android.dc.html`.

**Sites list map (replaces task 23, point 2, first bullet):** the visible map is in **5:4 landscape ratio**: full width, height = width × 4 / 5 (312 dp on a 390 dp phone), from under the top app bar. The list panel starts right under it. "Centrer sur ma position" stays 16 dp from the right and bottom edges of the visible map.

**Sites list panel on surfaces (new):** the panel has the page background. Under the count line ("3 sites, 9 plongées", 14/20 `#4A4D52`, on the page background), two white surfaces with 20 dp corners, 16 dp side margins, 12 dp apart, 1 dp dividers `#ECECEA` between rows, no divider line between the two surfaces:
- first surface: the maintenance rows (48 dp, 14/20 ink, 24 dp chevron), only those that apply; no surface at all when none applies;
- second surface: the site rows (72 dp, name 16/24, supporting 14/20, trailing depth 16/24 weight 500, no chevron).
Mock-up: `docs/mockups/android-sites.dc.html`.

**Statistics main screen (`/statistics/`):** keep the ready-made charts exactly as they are in the app now. Task 23 does not apply to them.

**Filtered result screen ("Mode : circuit ouvert", `/statistics/result/`):** replace the app's chart with the mock-up's (`docs/mockups/stats-filtre-android.dc.html`): title "Profondeur maximale par plongée", one bar per dive in date order, 120 dp high in the card, bars with 3 dp corners and about 6 dp gaps, each bar coloured with the water gradient by its depth (same scale as the water column: `--od-water-top` to `--od-water-bottom` at 60 m and deeper), the year under each bar in 12 sp `#4A4D52`, no axis lines, an accessible label "Profondeur maximale des N plongées en circuit ouvert".

Done in "Visual audit: Sites screens, shared chevron and section titles" (Sites) and "Statistics: filtered result chart and coloured ready-made charts" (Statistics). Notes:
- "Centrer sur ma position" is 32 dp above the bottom of the map, not 16, so as not to cover the credits line (see task 23).
- Result chart: the years under the bars show only up to 8 bars, as before; with more dives the bars become a silhouette. The accessible label ends with the screen's title ("…, Mode : circuit ouvert"), since the criteria vary.
- The Statistics main screen keeps its section titles 14 medium; a shared rule of task 23 that made them 18 bold was taken back.

## [x] 2026-11-07-25 Statistics main screen: coloured ready-made charts

Christian wants the two ready-made charts of `/statistics/` ("Plongées par année", "Durée des plongées") in colour. This changes only their colours. Task 24 still applies for everything else (keep the charts as they are in the app now).

- Each bar is coloured with the water gradient by its value within its own chart: t = 0.7 + 0.3 × value / max value, colour = mix of `--od-water-top` (#FBE3B2) and `--od-water-bottom` (#B4530F) at t. The tallest bar is #B4530F, the shortest is never lighter than #C97E40 (3:1 on white).
- In dark mode, use the dark water tokens (#E5B961 to #EF7625) with the same formula.
- Labels, sizes, corners and gaps do not change.

Mock-ups: `docs/mockups/android-stats.dc.html`, `docs/mockups/ios-stats-tableau.dc.html`. Spec: section 4, "Statistics", main screen.

Done in "Statistics: filtered result chart and coloured ready-made charts". The colour is a CSS mix of the two water tokens, so dark mode follows by itself.

## [x] 2026-11-07-26 Source Sans 3: same perceived size as the system font

The visual audit (task 23) compared the app with mock-ups drawn in Roboto. Source Sans 3 looks about 8 % smaller at the same size, so part of the "text too small" finding came from the font, not from the sizes. The mock-ups now use Source Sans 3 too, and the sizes stay as they are in the specification.

1. Register Source Sans 3 with the same metrics adjustment as the mock-ups, in each `@font-face` rule of the body font:
   `size-adjust: 108%; ascent-override: 85.9%; descent-override: 22.6%; line-gap-override: 0%;`
   With it, 14 px Source Sans 3 has the x-height and line box of 14 px Roboto.
2. Keep the sizes of the specification and of task 23 point 1: supporting text 14/20, headline 16/24, labels and helper text 12/16, section titles 18/24, intro 16/24. If the app raised a size only because the text looked small next to the mock-ups, set it back to these values.
3. Bundle weights 400 to 900 (800 and 900 are new in `docs/brand/fonts/`, used for bold figures in rows), Latin and Latin Extended.
4. Titles keep the system font (Roboto on Android, SF Pro on iOS): screen titles, top bar and section titles, dialog titles, large key figures. Tabular figures stay on for dive values.

Spec: section 1, "Fonts". Mock-ups: every file in `docs/mockups/` (each has the `@font-face` rules in its `<helmet>`).

Done in "Source Sans 3: metrics of the mock-ups, weights 400 to 900". Upstream (release 3.052R) has no static 800, so the app bundles the upstream variable font (one 170 KB file, weights 400 to 900, Latin Extended) instead of the four static files. Measured in the WebView: 14 px Source Sans 3 now has the x-height and ascent of 14 px Roboto. No size had been raised in the app, so none was set back.

## [x] 2026-11-07-27 Dive detail: weights as a total plus one line per location

In "Gaz et équipement" on the dive detail, when the dive has several weight entries:
- first line: "Lest" 16/24 ink on the left, the total on the right, 16/24 weight 600, tabular figures (sum of all entries, in the weight unit of the settings);
- then one line per entry, in the order stored by the core: location on the left ("Intégré au gilet", "Ceinture"…, or the type stored in the logbook), weight on the right, both 14/20 `#4A4D52` (dark: `#B5B8BC`), tabular figures, 4 dp between lines, no dividers between them;
- block padding 16 dp top, 14 dp bottom, 16 dp sides, divider above as for the other rows.
With a single entry, keep the current row (location as supporting text, weight on the right). An entry without a location shows "Lest" as its label.

Mock-ups: `docs/mockups/detail3-android.dc.html`, `detail3-android-sombre.dc.html` (iOS: `detail3-ios.dc.html`). Spec: section 4, "Full dive detail".

Done in "Dive detail: weights as a total plus one line per location". Checked on a dive of the logbook with two entries (10 lb and 2 lb, total 12 lb). The secondary lines use `--od-text-2`, which is the dark value of the specification in dark mode.

## [x] 2026-11-07-28 Dive detail menu: "Supprimer la plongée"

Add a second item to the ⋮ menu of the dive detail (Android MD3 menu, iOS pull-down menu), after a 1 dp divider (`#C9C9C5`, 8 dp above and below): trash icon 24 dp, label "Supprimer la plongée", 14 sp medium, ink. Not in `--od-alarm`: that colour is for errors only.
- No confirmation dialog. Delete the dive through the core's undoable delete (as Subsurface does), go back to the logbook, and show a snackbar "Plongée supprimée" with the action "Annuler" for 10 seconds. "Annuler" restores the dive and its place in the list.
- The deletion is saved and synced with the cloud like any other change.
- On a tablet (master-detail), the detail pane shows the next dive in the list, or the empty pane when none is left.

Mock-up: `docs/mockups/detail2-android-menu.dc.html`. Spec: section 4, "Dive detail" row of the screens table.

Done in "Dive detail menu: delete without confirmation, Annuler for 10 seconds". Checked on the phone with the test account (roger.bourdieu): the dive leaves the list (1 352 dives), "Plongée supprimée" offers "Annuler", and "Annuler" puts it back at its place. The tablet case (next dive beside the list) is written but not checked on a tablet. The item is in ink on iOS too, as this task asks, although the HIG would draw a destructive item in red.

## [x] 2026-11-07-29 New file docs/TODOS.md: who does what

Christian created `docs/TODOS.md`, a short numbered list of his to-dos (#1, #2…). Done items are deleted so that a person can read the file at a glance. Read the rules at the top of the file. In short:
- When Christian writes "todo: …" to you, add the item at the end with the next number, in his words, update "Next number", and commit. Do not add items on your own initiative.
- When you finish an item that is yours (anything that is not mock-ups or the specification), delete it in the same commit as the work. Never renumber.
- Items about the mock-ups or the specification are for the design agent, which turns them into inbox tasks for you and deletes them.
- If you think an item is already done or obsolete, ask Christian before deleting it.

Nothing to change in the app for this task: check it once you have read the file.

Done in "Inbox: TODOS.md read". Rules read and followed from now on. The list is empty; the only "todo" Christian gave the code agent this session (keep the Logbook search when coming back from a dive) was already fixed in "Back key: close only the search of the screen shown", so it was not added.

## [x] 2026-11-07-30 docs/TODOS.md: tag every item [design] or [code]

New rule in `docs/TODOS.md` (read it at the top of the file): every item starts with `[design]` or `[code]` right after its number, for example `#4 [code] …`. The agent that adds the item sets the tag: `[design]` for mock-ups, visuals, screen texts and the specification, `[code]` for everything else. When you are not sure, ask Christian. I tagged #1 and #2 as `[code]`.

Nothing to change in the app: check this task once you have read the rule.

Done in "Inbox: TODOS.md tags read". Rule read: every item the code agent adds now starts with [design] or [code].

## [x] 2026-11-08-01 Planner: settings on their own screen

The planner settings move out of the planner screen (to-do #4). See section 4 of the spec, "Planner settings, a screen of their own".
- Planner screen (`docs/mockups/android-planificateur.dc.html`): keep only the plan data (starting dive, depth, bottom time, gas, SAC, water type) and the computed plan. Remove the "Facteurs de gradient" row (it is in Settings, "Décompression"). Add a 48 dp icon button with a 24 dp "tune" icon, `aria-label` "Réglages du planificateur", in the top bar before "Enregistrer".
- New screen "Réglages du planificateur" (`docs/mockups/reglages-planificateur-android.dc.html`): back arrow, intro "S’appliquent à chaque plan.", groups Vitesses, Paliers, Gaz, Réserve, with the rows, values, switches and Subsurface defaults of the mock-up. Value rows open the existing number and choice screens; switches change in place. Store the values in the core's planner preferences, as Subsurface-mobile's "Dive planner setup" does.
- Route: the one you settle under to-do #3 (U3: `/settings/planner`).
- iOS: same content, in an inset grouped list.

Done in "Planner: settings on their own screen, plan data edited in place". The screen is at /settings/planner (to-do #3, U3), opened from a "tune" button in the planner's top bar; the old /plan/setup screen is gone. "Descente instantanée" needed one more planner preference in the facade (dropStone, Subsurface's drop_stone_mode, set through the existing preferences call; Subsurface itself unchanged); it was checked in the emulator: 130 ft, 20 min, the plan goes from 50 to 54 min. Not like the old screen: the safety stop switch is no longer shown (not in the mock-up), and deco gases can no longer be edited (the planner keeps those brought by a starting dive). There is no "Enregistrer" button in the app yet, so the tune button is alone at the end of the bar. iOS: same content, surfaces with 10 pt corners; not checked on an iPhone.

## [x] 2026-11-08-02 Mock-ups now show imperial example values

The mock-ups now show depths in ft, cylinder pressures in psi and weights in lb, with °C and litres (Settings, Unités: "Personnalisé", Profondeur "Pieds", Pression "psi", Poids "Livres"). Partial pressures stay in bar. Nothing changes in the app: it keeps following the user's unit settings. When you compare a screen with its mock-up, compare layout and wording, not the units. Check that every value with a unit converts correctly when the settings are in ft, psi and lb (for example "2 683 → 1 885 psi", "Dernier palier à 20 ft", "30 ft/min").

Done in "Imperial units: SAC in cubic feet with two decimals". Checked in the emulator with ft, psi and lb: cylinder pressures "3,400 → 1,600 psi", "Last stop 10 ft" / "20 ft", "30 ft/min" and "59 ft/min", weights "12 lb" with one line per location, ppO₂ in bar. Nothing needed changing for these. The imperial symbols stay translated in the language of use ("pi", "pi³" in French), as Christian decided on 8 November 2026, although the specification's units table and the French mock-ups write "ft" and "cuft".

## [x] 2026-11-08-03 Planner settings: a single ascent rate

Christian wants one ascent rate only. In "Réglages du planificateur", group "Vitesses", replace the four ascent rows with one row "Remontée" (default 9 m/min, shown in the depth unit per minute, 30 ft/min in the mock-up), then "Descente". Subsurface's planner reads four rates (`ascrate75`, `ascrate50`, `ascratestops`, `ascratelast6m` in `core/pref.h`): when the user sets "Remontée", write the same value to all four. Do not change the core. Mock-up: `docs/mockups/reglages-planificateur-android.dc.html`. Spec: section 4, "Planner settings, a screen of their own".

Done in "Planner: settings on their own screen, plan data edited in place". "Remontée" writes the same value to the four ascent rates (checked: 30 ft/min gives 9120 mm/min in all four, the core keeping mm/s). "Reset" puts 9 m/min in all four.

## [x] 2026-11-08-04 Planner settings: "Dernier palier" is a choice, not a switch

In "Réglages du planificateur", group "Paliers", the first row is no longer a switch. It is a value row "Dernier palier" showing the depth of the last stop (3 m or 6 m, in the depth unit: 10 ft or 20 ft), with a chevron, opening the existing choice screen with the two depths. 3 m by default. It maps to Subsurface's `last_stop` preference (6 m when true). Mock-up: `docs/mockups/reglages-planificateur-android.dc.html`.

Done in "Planner: settings on their own screen, plan data edited in place". A choice of 3 m or 6 m (10 ft or 20 ft) mapped to lastStop6m (Subsurface's last_stop); checked in the emulator.

## [x] 2026-11-08-05 Mock-ups: volumes in cubic feet too

Follow-up to task 2026-11-08-02: the mock-ups now also show volumes in cubic feet (Settings, Unités: Volume "Pieds cubes"). Cylinder sizes appear as gas capacity at the working pressure, as Subsurface does in imperial (AL80 = 80 cuft, 12 L at 232 bar = 97 cuft), gas used in cuft ("40 cuft consommés"), SAC in cuft/min with two decimals ("0,36 cuft/min"). Partial pressures (ppO₂, pN₂, pHe, setpoints) stay in bar, as in Subsurface. Nothing to change in the app beyond checking that these conversions come out right when Volume is set to cubic feet.

Done in "Imperial units: SAC in cubic feet with two decimals". Cylinder sizes are the gas capacity at the working pressure (12 L at 200 bar = 83.6 cu ft, LP85 = 85.0 cu ft), gas used in cubic feet ("73 cu ft used"), partial pressures in bar. The SAC had one decimal in cubic feet: it now has two ("0.90 cu ft/min" for 25.5 L/min), litres keep one.

## [x] 2026-11-08-06 Planner: the plan data are fields edited in place

On the planner screen, the plan data are no longer list rows. Under the starting dive card, a form of MD3 filled text fields (the same as in the gas tools), 16 dp apart, two per line:
- Profondeur (number, unit suffix) | Temps de fond (number, "min")
- Gaz (exposed dropdown: the logbook gases and the usual mixes) | Bouteille (exposed dropdown: the cylinder types)
- Pression de départ (number, pressure unit) | Consommation (SAC) (number, volume unit per minute)
- Type d’eau (exposed dropdown, full width)
The computed plan below updates as soon as a field changes (no "Calculer" button). "Changer" on the starting dive card replaces the dive; the values it brought stay editable. Mock-up: `docs/mockups/android-planificateur.dc.html`. Spec: section 4, "Planner settings, a screen of their own".

Done in "Planner: settings on their own screen, plan data edited in place". The plan is computed again at each keystroke of a valid value (checked: 130 ft gives five stops at once). The Gaz list offers the usual mixes (air, EAN28 to EAN40, trimix 21/35 to 12/65) and the plan's own gas; the gases used in the logbook are not listed yet, as the app has no list of them without reading every dive. Bouteille lists the cylinder types of Settings, plus the plan's own size when none matches.

## [x] 2026-11-08-07 Planner: show the decompression ceiling on the planned profile

On the planner's profile chart, draw the decompression ceiling of the plan over the depth profile as a red filled area, from the surface down to the ceiling: fill `--od-alarm` at 35 % opacity, edge line 1.5 dp `--od-alarm`, on the same time and depth scales. Take the ceiling from the core for the planned dive (the same calculation as the detail's "Plafond" layer, with the planner's gradient factors), not a separate computation. Under the chart, a legend line 12/16 `#4A4D52` with a 16×12 dp swatch in the same red: "Plafond de décompression : remonter au-dessus est interdit". When the plan has no stop, do not draw the line or the legend. Add the ceiling to the chart's accessible label. Mock-up: `docs/mockups/android-planificateur.dc.html` (its ceiling values are illustrative).

Done in "Planner: the decompression ceiling on the planned profile". The core's plan result now has the ceiling, computed by profile.cpp on the planned dive as for the detail's "Plafond" layer (facade only, Subsurface unchanged; round-trip tests: 97 passed, 1 known failure). Checked in the emulator: 130 ft, 20 min on air, the red area stays above the profile at every stop; the accessible label ends with "decompression ceiling down to 55 ft".

## [x] 2026-11-08-08 Planner: shorter ceiling legend

Change to task 2026-11-08-07: the legend under the planner's chart reads only "Plafond de décompression" (no "remonter au-dessus est interdit"). Mock-up: `docs/mockups/android-planificateur.dc.html`.

Done in "Planner: the decompression ceiling on the planned profile": the legend reads "Plafond de décompression" only.

## [x] 2026-11-08-09 Planner: SAC on a wheel

Change to task 2026-11-08-06: "Consommation (SAC)" is no longer a text field. Under the fields, it is a wheel on a white surface (20 dp corners, 16 dp margins), built like the ppO₂ wheel of "EAD et MOD": label "Consommation (SAC)", helper "Glisser pour changer", three visible values with the selected one in the middle between two ink lines, unit after the wheel. Steps: 0.01 cuft/min in imperial, 0.1 L/min in metric. The third line of fields is now "Pression de départ" | "Type d’eau". Mock-up: `docs/mockups/android-planificateur.dc.html`.

Cancelled by task 2026-11-08-10 before it was built: no wheel was made.

## [x] 2026-11-08-10 Planner: SAC in a dropdown menu, not a wheel

Cancels task 2026-11-08-09 (if you already built the wheel, remove it). "Consommation (SAC)" is an MD3 exposed dropdown menu in the field grid, beside "Pression de départ"; "Type d’eau" goes back to its own full-width line. The menu lists values around the current one, in steps of 0.01 cuft/min in imperial or 0.5 L/min in metric, the current value selected. Mock-up: `docs/mockups/android-planificateur.dc.html`.

Done in "Planner: SAC in a dropdown menu". "Consommation (SAC)" is a dropdown (the app's SelectField, the system's choice list) beside "Pression de départ", with 20 values on each side of the current one in steps of 0.01 cuft/min or 0.5 L/min, within the planner's former limits (0.04 to 3.5 cuft/min, 1 to 99 L/min). A SAC off the steps (measured on a dive, e.g. 17.3 L/min) is listed as its own entry and selected. "Type d’eau" was already on its own line.

## [x] 2026-11-08-11 Dive editor: every field Subsurface desktop edits, friendlier layout

Christian wants the dive editor to edit the same data as Subsurface's desktop app, laid out more comfortably. The mock-up now shows every card open; follow section 4, "Dive editor, same fields as Subsurface desktop". Main changes from the current editor:
- "La plongée": N°, Date and Heure on one line; Durée and Profondeur max. side by side (read-only unless the dive was entered by hand); the dive rating ("Note", five stars) moves here from Conditions.
- "Équipement" comes before "Conditions" and now has every cylinder field Subsurface edits (type, use, size, working pressure, start and end pressures, O₂, He, gas switch depth with the MOD as helper), "Ajouter une bouteille", and the weights (location and weight per entry, "Ajouter un lest").
- "Conditions" now includes the atmospheric pressure (moved from "Avancé"), beside the water type.
- "Avancé" keeps only the "Plongée invalide" switch.
- Open cards show no summary under their title.
- Shorter helpers for people and tags.
Map each field to the core as Subsurface does (`TabDiveNotes`, `TabDiveInformation`, `TabDiveEquipment` and their models). Mock-up: `docs/mockups/android-edition.dc.html`. The iOS and tablet editors will follow in a later task.

Done in "Core: edit every dive field Subsurface desktop edits, weights and cylinders included" and "Dive editor: every field Subsurface desktop edits, in cards". Android phone layout; each field maps to the core as Subsurface does (EditDive's whole-dive exchange, with the table re-sorted when the time changes; EditDuration and EditDepth only for a dive entered by hand; EditMode on the first dive computer; EditAirTemp, EditWaterTemp, EditWaterTypeUser, EditAtmPress, EditInvalid; AddWeight, RemoveWeight, EditWeight; AddCylinder at first_hidden_cylinder(), RemoveCylinder with cylinder_renumber(), refused for a cylinder the profile uses, EditCylinder with the cylinder types table). Only the fields whose text changed are sent, so unchanged values are never rounded. At Christian's request (8 November 2026), choosing a weight location fills in the weight last used for it, from Subsurface's own ws_info table (WSInfoDelegate). Choices made: "Voyage" stays read-only (Subsurface edits a trip's location from the trip, not from a dive); the site is chosen in a list dialog of the logbook's sites; the MOD helper uses ppO₂ 1.6 bar and the dive's water. The edit round-trip test covers the new fields (edit, save, reload; undo gives the original tree). Checked in the emulator on the test account: a weight location changed, the air temperature set, saved, then undone.

## [x] 2026-11-08-12 Dive profile: axes with graduations and a temperature curve

On the dive detail's profile chart (see section 4, the profile items "Axes" and "Temperature curve"):
- Depth axis on the left: major graduations every 40 ft (10 m) with labels and a light grid line (`#E8E8E5`, dark `#3A3C40`), the first label with the unit ("0 ft"); minor ticks every 10 ft (2 m), 5 dp long, no label. Leave a 30 dp left margin for the labels.
- Time axis at the bottom: an axis line, major ticks every 20 minutes with labels, the last one with the unit ("80 min"), minor ticks every 10 minutes.
- Under the chart, a row of MD3 filter chips that scrolls sideways: "Température" (new), then the existing technical layers (ppO₂, Plafond, Tissus) when the dive has the data. "Température" draws the water temperature samples as a 2 dp line in `#2F6DB5` (dark `#8AB4F8`) with its own scale labelled on the right in the same colour ("10°C", "7°", "4°"); on by default when the dive has temperature samples.
Mock-ups: `docs/mockups/detail3-android.dc.html`, `detail3-android-sombre.dc.html` (the temperature values there are illustrative).

Done in "Dive profile: graduated axes and a water temperature curve". The core now sends the profile's water temperature (plot_info's temperature, filled between samples as Subsurface draws it) with the dive. Depth axis: grid line and label every 40 ft (10 m), "0 ft" first, 5 dp ticks every 10 ft (2 m), 30 dp left margin; time axis: axis line, labelled ticks every 20 min (10 or 5 for dives under 40 or 15 min), minor ticks between, the last label with the unit. "Température" filter chip, on by default when the dive has temperature samples: 2 dp line on its own scale labelled on the right (top with the unit). New tokens --od-chart-grid and --od-temperature, light and dark as specified. Checked in the emulator, light and dark, on a Petrel dive. Partial: the chip row has "Température" and the existing "Gaz" only; the ppO₂, Plafond and Tissus layers do not exist in the app yet (the old profile spec left them for later), so they have no chip.

## [x] 2026-11-08-13 Dive detail menu: "Renuméroter la plongée" and "Partager"

Add two items to the ⋮ menu of the dive detail, after "Planifier depuis cette plongée" and before the divider and "Supprimer la plongée" (Android MD3 menu, iOS pull-down menu):
- "Renuméroter la plongée" (24 dp "#" icon): opens an MD3 dialog titled "Renuméroter la plongée" with a number field prefilled with the current number, buttons "Annuler" and "Renuméroter". A number used by another dive is refused with a message under the field ("Ce numéro est déjà pris par la plongée du …"). Change the number through the core, as Subsurface's "Renumber" does for one dive, so it syncs like any other edit.
- "Partager" (24 dp share icon): opens the system share sheet (Capacitor Share) with a short French text (site, date, maximum depth, duration, gas, in the user's units) and a PNG image of the profile chart.
Mock-up: `docs/mockups/detail2-android-menu.dc.html`. Spec: section 4, the "Dive detail" row of the screens table.

Done: the renumbering part in task 14's commit, Partager in "Dive detail: Share, as a PDF sheet or a summary with the profile image" (as changed by task 16). Android; the iOS pull-down menu uses the same items.

## [x] 2026-11-08-14 Renumbering a dive shifts the dives it affects

Changes the renumbering part of task 2026-11-08-13: a number already taken is no longer refused. The other dives move so that numbers stay unique and without gaps.
- Moving dive n to a smaller number m: dives m to n−1 each go up by one. Moving it to a larger number m: dives n+1 to m each go down by one. A number beyond the last dive becomes the last number.
- When other dives are affected, the dialog says so under the field, live as the number is typed: "Les plongées n° 8 à 11 seront décalées de 1". The main button then reads "Renuméroter et décaler"; it is the confirmation (no second dialog). When no other dive is affected, the button stays "Renuméroter".
- Apply the whole change as one undoable edit through the core (as Subsurface's "Renumber" command does for several dives), synced like any other edit.
- iOS: same rules; the menu now has "Renuméroter la plongée", "Partager" and, after a wide separator, "Supprimer la plongée" (`docs/mockups/detail2-ios-menu.dc.html`).
Spec: section 4, the "Dive detail" row of the screens table.

Done in "Dive detail: Renumber the dive, shifting the dives it affects" (the renumbering part of task 2026-11-08-13 with it; Partager follows in tasks 13 and 16). The menu item uses the existing renumber icon; the dialog computes the shift live (dives m to n-1 up by one, or n+1 to m down by one, a number beyond the last becomes the last, an unnumbered dive is inserted), says it under the field and switches the button to Renumeroter et decaler. Applied through the core as one step of Subsurface's RenumberDives with the (dive, number) pairs (renumber_dives now takes them), saved and synced like any edit. Checked in the emulator on the test account: dive 1385 to 1383 moved 1383 and 1384 up by one; Undo put them back.

## [x] 2026-11-08-15 Dive editor: no number field

Changes task 2026-11-08-11: remove the "N°" field from the editor. Changing a number shifts other dives, so it is done only through "Renuméroter la plongée" in the detail menu (tasks 13 and 14). The editor keeps showing the number in the line under its title ("N° 5 · Lake Coleridge · 2 avril 2014"). The first line of "La plongée" is now Date | Heure. Mock-up: `docs/mockups/android-edition.dc.html`.

Done in "Dive editor: no number field; duration and maximum depth read-only". The N field is gone; the number stays in the line under the title; the first line of La plongee is Date | Heure. The core keeps accepting a number (used by Renumber, tasks 13 and 14).

## [x] 2026-11-08-16 Share a dive as a PDF sheet

Changes the "Partager" part of task 2026-11-08-13. "Partager" in the detail menu now opens an MD3 modal bottom sheet titled "Partager" (`docs/mockups/partage-android.dc.html`) with two rows (72 dp, icon, title, one-line description):
- "Fiche PDF", "Une page : profil, gaz, équipement, personnes et notes": builds a one-page PDF of the dive and opens the system share sheet with it (file name like `OpenDives-plongee-5-2014-04-02.pdf`).
- "Résumé et image", "Un court texte et l’image du profil": the share described in task 13.
The PDF follows `docs/mockups/partage-pdf-fiche.dc.html` (US Letter; use A4 outside the US and Canada): header with "Plongée n° 5", date and time, site as the title, location and trip, the three key figures on the right; "Profil" with the depth and time axes and the temperature curve, with a one-line legend; the secondary facts in five columns; "Gaz et équipement" as a table (Bouteille, Taille, Utilisation, Gaz, Début, Fin), then suit, weights and dive computer; "Personnes" and "Conditions" side by side; "Notes" in full (continue on a second page when long); footer "Fiche créée avec OpenDives le …" and "Page 1 sur 1". Rows without a value are left out, as on screen. Build the page as HTML with the app's styles and render it to PDF on the device (Android `PrintDocumentAdapter` or a WebView PDF export, iOS `UIPrintPageRenderer`); no network. Spec: section 4, the "Dive detail" row.

Done in "Dive detail: Share, as a PDF sheet or a summary with the profile image" (Android). The sheet is HTML built on the device (lib/share.js) and rendered to PDF by the system's print engine (a WebView's print adapter written to a file, no dialog, no network), US Letter in the US and Canada, A4 elsewhere, then the system share sheet. File name OpenDives-plongee-5-2014-04-02.pdf (OpenDives-dive-... in English). Resumes et image: the text (number, site, date, depth, duration, gases in the user's units) and a PNG of the profile chart drawn on a canvas. Checked in the emulator: a 1-page PDF of a Petrel dive and the PNG, both offered to the share sheet. New dependency @capacitor/share 7 (about 15 KB in the APK; agreed by Christian). Partial: no Page 1 sur 1 in the footer (the print engine gives no page counter to the HTML); the sheet uses the system sans-serif font, not Source Sans 3; iOS rendering (UIPrintPageRenderer) not done yet.

## [x] 2026-11-08-17 Dive editor: no duration or maximum depth

Changes task 2026-11-08-11: remove "Durée" and "Profondeur max." from the editor, with their helper. They come from the dive computer and are not edited in this screen. A dive entered by hand gets them on the "Nouvelle plongée" screen. "La plongée" now holds Date | Heure, Site, Voyage, Note. Mock-up: `docs/mockups/android-edition.dc.html`.

Done in "Dive editor: no number field; duration and maximum depth read-only", as changed by task 2026-11-08-18: duration and maximum depth are no longer fields.

## [x] 2026-11-08-18 Dive editor: duration and maximum depth visible, read-only

Changes task 2026-11-08-17: keep "Durée" and "Profondeur max." visible in "La plongée", under Date | Heure, but not editable. Show them as plain text side by side (label 12/16 `#4A4D52`, value 16/24 ink, tabular figures, 16 dp side padding, no field background, not focusable as inputs), with the helper "Mesurées par l’ordinateur de plongée" under them. Mock-up: `docs/mockups/android-edition.dc.html`.

Done in "Dive editor: no number field; duration and maximum depth read-only". Duration and maximum depth are plain text side by side under Date | Heure (label 12/16 text-2, value 16/24 ink, tabular figures, 16 dp padding), with the helper Mesurees par l'ordinateur de plongee. Checked in the emulator.

## [x] 2026-11-08-19 Share sheet: icons in coloured circles

In the "Partager" bottom sheet (task 2026-11-08-16), each row's icon sits in a 40 dp circle filled with `--od-water-top` (#FBE3B2), the icon 22 dp in #8A3E09 (dark mode: circle #4A3410, icon #E5B961). The sheet still opens over the dive detail with the usual scrim. Mock-up: `docs/mockups/partage-android.dc.html`.

Done in "Dive detail: Share, as a PDF sheet or a summary with the profile image": 40 dp circles in --od-share-circle (water top, dark #4A3410) with 22 dp icons in --od-share-icon (#8A3E09, dark #E5B961); the sheet opens over the detail with the scrim.

## [x] 2026-11-08-20 Dive profile: ppO₂, Plafond and Tissus layers

Christian asks for the remaining technical layers on the dive profile, as filter chips after "Température" and "Gaz" (spec section 4, "Technical layers"), each offered only when the dive has the data:
- "ppO₂": the oxygen partial pressure from the core's samples (`pressures.o2`), a line in `--od-oxygen` on its own scale on the right (0 to 1.6 bar, with the 1.4 and 1.6 limits as light dashed lines).
- "Plafond": the decompression ceiling computed by the core (the same calculation as Subsurface's calculated ceiling, with the planner's gradient factors), drawn as on the planner: a red area from the surface down to the ceiling, `--od-alarm` at 35 % opacity, with a 1.5 dp edge line.
- "Tissus": the 16 compartments' saturation at the cursor (or at the end of the dive when no cursor), as in the Désaturation tool: small bars from fast to slow under the chart, coloured with the water gradient by load and `--od-alarm` from 90 %.
Several layers can be on at once. When two layers need a right-hand scale (Température and ppO₂), show the scale of the last one turned on. The finger cursor keeps its readout; add the value of each layer that is on ("Eau 4,3 °C", "ppO₂ 1,28 bar"). Mock-ups: `docs/mockups/detail3-android.dc.html` (chips), `detail3-android-curseur.dc.html` (cursor).

Done in "Dive profile: ppO2, ceiling and tissue layers". Three chips after Gaz, each offered only when the dive has the data. ppO2: line in --od-oxygen on a 0 to 1.6 bar scale with dashed 1.4 and 1.6 limits; only the last right-hand scale turned on (Temperature or ppO2) is labelled. Plafond: the core's calculated ceiling (plot_info, always computed with the current gradient factors, no preference touched), red area at 35 % with a 1.5 dp edge. Tissus: 16 bars under the chart at the cursor (end of the dive otherwise), same colours as the Desaturation tool (shared lib/tissues.js). The cursor readout adds Eau, ppO2 and Plafond when those layers are on. get_dive gives samples.tissues as one flat array (16 percentages per sample, about 35 KB for 2 hours at 10 s). Not checked in the emulator.

## [x] 2026-11-08-21 Dive profile: shorter hint

Christian prefers a shorter hint above the profile. Replace `profile.hint` "Posez le doigt sur le profil pour lire temps et profondeur." with "Touchez le profil pour lire les valeurs" (no final period), and in English "Touch the profile to read the values". Keep its size and the readout line as they are. Mock-ups: `docs/mockups/detail3-android.dc.html`, `detail3-android-sombre.dc.html`.

Done in "Dive profile: shorter hint". profile.hint is now the shorter text in French and English; size and readout line unchanged.

## [x] 2026-11-08-22 Logbook selection: "Exporter au format…"

Add "Exporter au format…" (24 dp download icon) to the ⋮ menu of the logbook's selection mode, after the "Ajouter les plongées au voyage…" items and before the divider and "Supprimer". It opens an MD3 modal bottom sheet (`docs/mockups/carnet-export-android.dc.html`):
- title "Exporter N plongées" (plural rules as elsewhere), line "Choisissez un format. Le fichier s’ouvre ensuite dans le partage du téléphone.";
- a radio list, 64 dp rows with a description: "Carnet complet (.ssrf)" (the core's XML export of the checked dives), "UDDF (.uddf)", "CSV, liste des plongées", "CSV, profils", "Fiches PDF" (one page per dive, same layout as task 16);
- an "Anonymiser" switch, off by default (people's names, notes and GPS positions removed, as Subsurface's anonymize option); it applies to every format;
- "Annuler" (text button) and "Exporter" (filled button).
Use the core's export functions (`save_dives_logic` with the selection for .ssrf, `export_dives_xslt` with the UDDF and CSV stylesheets, as Subsurface's export dialog does). Remember the last format on the device. "Exporter" closes the sheet, writes the file in the app's cache and opens the system share sheet (file names like `OpenDives-3-plongees-2026-11-08.ssrf`). Errors: a snackbar "L’export n’a pas pu être fait." Keep the selection after an export. Spec: section 4, "Logbook selection and export".

Done in "Logbook selection: Export as..." (Android). Exporter au format... sits after the trip items, then the divider and Supprimer. The sheet follows the mock-up (radio list with descriptions, Anonymiser off by default, Annuler / Exporter) and remembers the last format on the device. The core exports the checked dives as Subsurface does: save_dives_logic for .ssrf, export_dives_xslt with uddf-export.xslt, xml2summarycsv.xslt and xml2detailscsv.xslt (metric, or imperial when depths are in feet), with Subsurface's anonymize option; the app now ships Subsurface's xslt/ stylesheets (copied to its files at start), and the compat stylesheet loader no longer breaks xsl:include. Fiches PDF: one page per dive with a profile drawn from the samples; anonymized, the people and notes are left out. Files go to the cache and the system share sheet (OpenDives-2-plongees-2026-11-08.uddf); the selection is kept. Checked: the four Subsurface formats exported from the sample log on Linux (anonymized names become Xxxxx), and UDDF and a 2-page PDF from the emulator.

## [x] 2026-11-09-01 Planner settings: no intro line

Remove the line "S’appliquent à chaque plan." under the title of "Réglages du planificateur". The first group title follows the top bar directly. Mock-up: `docs/mockups/reglages-planificateur-android.dc.html`.

Done in "Planner settings: no intro line". The line and its i18n key are gone; the first group title (Vitesses) follows the top bar directly. Checked in the emulator.

## [x] 2026-11-09-02 Decompression settings on their own page, linked from the planner settings

Christian wants the decompression settings on a page of their own, `/settings/decompression` (to-do #5).
- New page "Décompression" (`docs/mockups/reglages-decompression-android.dc.html`): back arrow, title "Décompression", the warning note in `--od-alarm`, then the rows now in the Settings group: Modèle, Facteurs de gradient, Conservatisme VPM-B, Oxygène narcotique, END maximale du meilleur mélange, and the footnote "Utilisés par le plafond calculé du profil, le planificateur, la désaturation et le calculateur de gaz." Same rows, values and behaviour as today.
- Settings (`android-reglages.dc.html`): the "Décompression" group keeps its title and holds a single 72 dp row "Modèle, facteurs de gradient, END", with the current model and GF as supporting text ("Bühlmann ZH-L16, GF 30/75") and a chevron, opening the new page.
- Planner settings (`reglages-planificateur-android.dc.html`): a first white surface before "Vitesses" with one 72 dp row "Modèle de décompression", the same supporting text, chevron, opening the same page. Back from it returns to the planner settings.
Spec: "Settings, modelled on Subsurface" (the sentence on the decompression settings).

Done in "Settings: decompression on its own page, linked from Settings and the planner settings". /settings/decompression is the Settings page with section decompression: the warning, the same five rows (same values and behaviour) and the footnote. Settings keeps the group title with one 72 dp row "Modele, facteurs de gradient, END" and the model and GF as supporting text (Buhlmann ZH-L16, GF 30/75; VPM-B, +3 with VPM-B); the planner settings start with one 72 dp row "Modele de decompression" opening the same page, Back returning to them. Checked in the emulator.

## [x] 2026-11-09-03 Settings: decompression back in Settings, conditions by default

Done in the branch `fix/settings-decompression-conditions`. The water type also starts the two gas calculator tools (to-do #13).

Christian undoes task 2026-11-09-02. Spec: "Settings, modelled on Subsurface".
- Remove the page `/settings/decompression` and the planner settings row "Modèle de décompression". Put the five decompression rows back in the Settings group "Décompression", with the warning note and the footnote, as before 2026-11-09-02 (`docs/mockups/android-reglages.dc.html`).
- Add a group "Conditions par défaut" after "Unités": "Type d’eau" (choice: Eau douce, Eau de mer, EN 13319; Eau de mer by default) and "Altitude" (number, in the depth unit; 0 by default), then the note "Le planificateur part de ces valeurs. On peut les changer pour chaque plan." Device settings, like the others. This also covers to-do #13.

## [x] 2026-11-09-04 Planner: planned dives list, two planner screens, several gases

Done in the branch `feature/planner-redesign`. Christian approved the facade extension and the write function (`save_plan`), and added the optional "Volume transporté" per gas, which keeps the alarm of an insufficient reserve. The request of a saved plan is kept as the extra data "OpenDives plan" of its dive computer, so that it reopens as typed. Android only for now; iOS comes with its project.

Christian approved the planner redesign. Spec: "Planner, redesigned" (it lists the mock-ups). Do it after 2026-11-09-03.
- Plongées planifiées (`/plans/`): the list, the per-plan menu (Dupliquer, Partager, Supprimer), the empty state, the "Nouveau plan" FAB. Outils › Planificateur opens it. Planned dives are stored in the logbook as Subsurface does (planned dive computer) and are hidden from the logbook, statistics, desaturation and numbering.
- Planner top bar: "Enregistrer", then ⋮ with "Partager le plan" and "Réglages du planificateur". Saving adds the planned dive or replaces the reopened one, then returns to the list.
- Two screens with the same order: starting card, profile chart, (new dive: Date, Niveaux), Gaz, Conditions, Décompression accordion, Résultat. From a dive, times and depths come from the dive and are not editable.
- Several gases (Oxygène % and Hélium %), switch depths from the deco ppO₂, no cylinder or start pressure, volumes per gas with the reserve.
- The decompression accordion holds the plan's own model and gradient factors, initialised from Settings, never written back.
- Exposition à l’oxygène: one value "CNS N %, M OTU".
- Partager le plan: share sheet with a PDF sheet of the plan or a text summary.
If the core does not offer something needed here (for example multi-level plans or altitude in the planner wrapper), stop and tell Christian before working around it.

## [x] 2026-11-09-05 Editor, share sheet and export: changes approved on the canvas

Done in the branch `fix/editor-share-export`.

Christian approved these by resolving their comment threads. Do them after 2026-11-09-04 or before it, as you prefer (they are independent).
- Dive editor (`docs/mockups/android-edition.dc.html`, spec "Dive editor, same fields as Subsurface desktop"): remove the helper "Mesurées par l’ordinateur de plongée" under Durée and Profondeur max. Every cylinder block is open with all its fields (Type, Utilisation, Taille, Service, Début, Fin, O₂, He, Changement de gaz à with the MOD helper), no more one-line rows for the second and later cylinders.
- Share sheet (`docs/mockups/partage-android.dc.html`): the "Fiche PDF" choice uses the Material Symbols `picture_as_pdf` icon in its coloured circle.
- Export sheet of the logbook selection (`docs/mockups/carnet-export-android.dc.html`): the first format reads "Fichier de carnet (.ssrf)" with the description "Format Subsurface, lisible aussi par OpenDives" (it exports the checked dives only, as before).

## [x] 2026-11-09-06 About › Bibliothèques libres: each library opens its website

Done in the branch `fix/about-library-links`.

Christian wants the "Bibliothèques libres" screen (`app/src/pages/AboutLibraries.svelte`) as drawn in `docs/mockups/apropos-bibliotheques-android.dc.html`. Spec: "About".
- Under the top bar, the line "Toucher une bibliothèque ouvre son site dans le navigateur."
- Same two groups and rows as now, but each row is a link: the external-link icon on the right (as "Code source" on the About screen), the whole row tappable, opening the library's website in the system browser; screen-reader label "<name>, <licence> (s’ouvre dans le navigateur)".
- Websites: Subsurface https://subsurface-divelog.org, libdivecomputer https://www.libdivecomputer.org, libgit2 https://libgit2.org, libxml2 https://gitlab.gnome.org/GNOME/libxml2, libxslt https://gitlab.gnome.org/GNOME/libxslt, libzip https://libzip.org, OpenSSL https://www.openssl.org, SQLite https://sqlite.org, Capacitor https://capacitorjs.com, Framework7 https://framework7.io, Svelte https://svelte.dev, MapLibre GL JS https://maplibre.org, Source Sans 3 https://github.com/adobe-fonts/source-sans.

## [x] 2026-11-09-07 Settings: equipment defaults for open circuit and rebreather, cylinder types, profile rows

Done in the branch `feature/settings-equipment-defaults`. The dive editor adds the rebreather cylinders when the mode is changed to CCR or pSCR; a dive downloaded in that mode keeps the cylinders of its computer.

Christian asked to send these Settings changes. Mock-ups: `android-reglages.dc.html` (and its six variants), `reglages-bouteille-choix-android.dc.html`, `reglages-secours-android.dc.html`, `reglages-bouteilles-android.dc.html`, `reglages-bouteille-type-android.dc.html`, `reglages-bouteille-modifier-android.dc.html`. Spec: the Settings table and "Cylinder types sub-screen".
- Carnet: "Regrouper les plongées en voyages" loses its helper line. The water-type switch reads "Choisir le type d’eau dans l’éditeur", helper "Ajoute le champ dans Modifier une plongée. Sinon, l’app garde celui de l’ordinateur de plongée", on by default.
- Équipement: "Bouteille par défaut" becomes four rows: "Bouteille, circuit ouvert" (`default_cylinder`, helper "Ajoutée aux plongées saisies à la main"), "Diluant, recycleur", "Oxygène, recycleur" (OpenDives device settings), "Secours (bailout), recycleur" (one or more types, own sub-screen). The first three open the same MD3 choice dialog with their own title: Aucune ("À choisir dans chaque plongée"), then the cylinder types with volume and working pressure, a note "La liste suit Réglages › Types de bouteilles.". When a dive's mode is CCR or pSCR, the app adds the diluent (use diluant), oxygen (use oxygène) and bailout cylinders (open-circuit use) from these settings. Saved dives stay plain Subsurface cylinders.
- Profil de plongée: remove "Grille de profondeur" (keep the core default 1, 2, 5, 10). Order and helpers: "Plafond donné par l’ordinateur" ("Affiche le plafond donné par l’ordinateur de plongée"), "Plafond en rouge" right after it ("Le plafond de l’ordinateur en rouge plutôt qu’en découpe", dimmed and inactive when the computer ceiling is off), "Plafond calculé" ("Affiche le plafond calculé selon le modèle de décompression ci-dessous").
- Types de bouteilles: in "Vos types", supporting text with the number of dives using the type, and an outlined "Inutilisé" label for a type no dive uses. Tapping a type opens "Modifier le type" (full-screen form, Nom, Volume, Pression de service, notes, "Retirer ce type"). "Ajouter un type" opens the same form empty, titled "Nouveau type".

## [x] 2026-11-09-08 Side menu and section headers: identity band, account at the top, Carnet search bar and menu

Done in the branch `feature/side-menu-headers`.

Christian asked to send these changes. Spec: "Side menu" and "Side menu and section headers, identity" (both list the mock-ups).
- Side menu: header band (gradient, faint profile, wave), logo and "OpenDives" in Title Large, the account card (icon, address, "Cloud · N plongées", chevron to Compte), "Compte" removed from the list; active row in #FBE3B2 with a filled icon; at the bottom, a white card with "Synchroniser maintenant" centred and the sync state centred under it (manual mode: "N modifications non envoyées"). This covers to-do #14, removed from the list.
- Carnet, Sites, Statistiques, Outils: the same band as header, MD3 Small top app bar (title on the ☰ line, weight 500) and a summary line. Carnet's summary ends with the relative time since the last dive. Sites: rounded bottom corners and a shadow over the map.
- Carnet: search icon replaced by a search bar under the summary; a ⋮ menu with "Filtrer" (opens the existing filter) and "Renuméroter les plongées". The empty, offline and conflict states of the Carnet get the same header.
- Réglages and À propos: ☰ instead of the back arrow (they are in the menu). Their sub-screens keep the back arrow.

## [x] 2026-11-09-09 Reminder: logbook rows exactly as the mock-up, expanded trip

Done in the branch `fix/logbook-rows-mockup`.

Christian notices that the logbook rows in the app do not match `docs/mockups/android-carnet.dc.html` exactly. Please compare side by side and align, using the mock-up's values:
- Dive row: 72 dp minimum, padding 8 dp, 24 dp right, 16 dp left, 16 dp gap. Profile thumbnail 56 × 40 dp, 8 dp corners, `#E8E8E5` background, water gradient from #FBE3B2 to the depth colour, profile line 1.25 dp `#1F2124`. Left column: site 16/24 (in `#4A4D52` when the site is missing, "Site à préciser"), date and time 14/20 `#4A4D52`. Right column, right-aligned, tabular figures: maximum depth 16/24 weight 500, duration 14/20 `#4A4D52`. No dividers between rows.
- Trip row: the same 72 dp, four thumbnails 27 × 19 dp in a 2 × 2 grid inside 56 × 40, title 16/24, summary 14/20 ("4 plongées, de 69 à 94 ft"), expand arrow on the right.
- Expanded trip (`docs/mockups/android-carnet.dc.html` now shows the trip of 2 February 2013 open): the arrow turns up, and the trip's dives follow in a white surface (12 dp side margins, 16 dp corners, 4 dp vertical padding), each a dive row as above with 64 dp height and 12 dp side padding, most recent first. Collapsing hides them again.
Also check the other changes of today on the same screens (task 2026-11-09-08), and the Compte header (same band as the sections, summary "Votre carnet dans le cloud", or "Aucun compte connecté" without an account; the text under "Se déconnecter" reads "Déconnecter votre app du cloud. Vos plongées restent dans le cloud et sur cet appareil."). In every banded header, the faint profile is 34 dp high near the bottom and never touches text.

## [x] 2026-11-09-10 Logbook: dive numbers, trip open in place, trip dives in selection

Done in the branch `fix/logbook-numbers-trip-selection`.

Christian approved these on the canvas. Mock-ups: `android-carnet.dc.html`, `carnet-selection-android.dc.html`, `carnet-selection-menu-android.dc.html`.
- Each dive row starts its second line with the dive number: "N° 9 · 7 févr. 2026, 09:09".
- An open trip shows its dives most recent first, like the rest of the logbook, so numbers run on without a break (… 5, then 4, 3, 2, 1 inside the trip). The white surface of the trip's dives is indented by 20 dp: left margin 32 dp, right 12 dp.
- In selection mode, an open trip shows its dives with their own checkboxes, in the same indented surface, selectable like the other rows.
- The side-menu mock-ups now show the current logbook behind the drawer (no change to the drawer itself).

## [x] 2026-11-09-11 Own git repository instead of the cloud (to-do #11)

Christian wants it done now (no longer waiting for v1). Spec: "Own git repository instead of the cloud" (mock-ups listed there). First-launch link, "Dépôt git" form with the address check through `ls-remote`, branches read from the repository, the Compte screen in git mode, and the token storage rules (Keystore / Keychain, no backup, no logs). Remove to-do #11 from `docs/TODOS.md` when it is done. If libgit2 in the core cannot list remote references or push over HTTPS with a token on Android or iOS, stop and tell Christian.


Done in the branch `feature/own-git-repository` (Android only; there is no iOS project yet). Still to check by Christian with a real token: the authenticated check, the first push to the empty private repository and a sync (see the branch report).

## [x] 2026-11-09-12 Dive detail: the whole screen exactly as the mock-up, water gradient missing

Done in Dive detail: match the mock-up, dark mode values from the specification

Christian, on the canvas (mock-up `docs/mockups/detail3-android.dc.html`): in the app, the area under the profile is a single grey, and the app's view is different from the mock-up. Rework it so the profile card matches the mock-up.
- The water column is a vertical gradient: `--od-water-top` (#FBE3B2) at 0 m, down to a mix of `--od-water-top` and `--od-water-bottom` (#B4530F) in the ratio max depth / 60 m. The mock-up's 39 m dive ends at about 65 % of the way to #B4530F. The trace stays #1F2124 on top.
- `DiveProfile.svelte` and `ProfileThumbnail.svelte` already declare this gradient, so find why it renders grey on the device. A likely cause: `waterBottomColor()` returns `color-mix(...)` with `var()` inside an SVG `stop-color`, which older Android WebViews do not support (the stop then falls back to a default colour). If so, compute the colour in JavaScript from the theme values (light and dark) and pass a plain `rgb()`. Check the result on the device, in light and dark mode, and in the thumbnails (logbook, sites, plans, download).
- Then compare the whole profile card with the mock-up (hint line, axes and labels, temperature curve and scale, cursor, sizes and margins) and fix every difference.
- Update (Christian, 10:28): the task covers the whole `/dives/:id` screen, not only the profile. Go through `detail3-android.dc.html` from top to bottom (top bar and its menu, header with number, date, site, country, trip link and rating, the three big figures, profile card and its chips, every section and field below, down to the end of the page) and make the app identical: texts, order, sizes, weights, colours, spacing, corners. Check dark mode against `detail3-android-sombre.dc.html` and the cursor against `detail3-android-curseur.dc.html`. The aerial map behind the header is now approved: see task 2026-11-09-13. List in your report every difference you found and fixed.

## [x] 2026-11-09-13 Dive detail: aerial map of the site behind the header

Done in Dive detail: site maps prepared ahead on Wi-Fi

Christian approved this on the canvas. Spec: "Dive detail, site map behind the header". Mock-ups: `docs/mockups/detail3-android.dc.html`, `detail3-android-sombre.dc.html`, `detail3-android-curseur.dc.html` (the aerial picture in them is a generated example).
- When the site has GPS coordinates, show an aerial view centred on them behind the top bar and the header, full width, about 270 dp high, with the pin in the middle of the top bar and a fade into the page background before the three big figures. Dark mode: image darkened, fade into the dark background.
- Decorative only: not interactive, hidden from screen readers. No coordinates, or no image available offline: plain header as today.
- Choose a satellite imagery provider whose terms allow this use in a free, open-source app, show its attribution as required, and cache the image per site. Before adding a paid service or an API key, stop and propose the options to Christian.
- Do this together with task 2026-11-09-12 (whole screen as the mock-up), which left the map out until now.

## [x] 2026-11-09-14 Dive detail menu: "Retirer du voyage" (to-do #22)

Done in Dive detail: Remove from trip in the menu

Christian approved this. Spec: "Dive detail menu, Retirer du voyage". Mock-up: `docs/mockups/detail2-android-menu.dc.html`.
- Show "Retirer du voyage" in the ⋮ menu of `/dives/:id` only when the dive belongs to a trip, right after "Renuméroter la plongée", with the suitcase-minus icon of the mock-up.
- No confirmation: remove the dive from its trip through the core (the same operation as Subsurface's "Remove dive(s) from trip"), so the change syncs like any other edit.
- Snackbar "Plongée retirée du voyage" with "Annuler". If the trip is now empty, it is deleted as in Subsurface, and the snackbar reads "Plongée retirée. Le voyage, maintenant vide, a été supprimé." "Annuler" restores the dive in its trip, and the trip itself when it was deleted.
- English strings: "Remove from trip", "Dive removed from trip", "Dive removed. The trip, now empty, was deleted.", "Undo".

## [x] 2026-11-09-15 Dive detail: no "note globale" label next to the stars

Done in Dive detail: no label next to the rating stars

Christian approved this on the canvas. Mock-ups: `docs/mockups/detail3-android.dc.html`, `detail3-android-sombre.dc.html`, `detail3-android-curseur.dc.html`.
- Remove the text "note globale" after the rating stars in the header of `/dives/:id`. The stars stay alone. Keep the accessible label of the rating ("Note : 4 sur 5").
- Remove the string from the translations if nothing else uses it. Include this in task 2026-11-09-12 if it is still open.

## [x] 2026-11-09-16 Dive detail: site map from OpenStreetMap instead of an aerial view, stronger veil

Done in Site map: keep OpenFreeMap and the credit in About (task 16)

Christian approved this on the canvas at 11:24. It replaces the aerial view of task 2026-11-09-13. Spec: "Dive detail, site map behind the header" (rewritten). Mock-ups: `docs/mockups/detail3-android.dc.html`, `detail3-android-sombre.dc.html`, `detail3-android-curseur.dc.html`.
- Use an OpenStreetMap map (standard style, zoom about 12) centred on the site's coordinates instead of the satellite image. Same size and place as now, pin in the middle of the top bar.
- Stronger veil of the page background over the map: about 45 % at the top, 70 % at 60 % of the height, 100 % at the bottom, before the three big figures. Draw the pin above the veil, at full strength. Dark mode: map at about 60 % brightness, dark veil.
- Show "© OpenStreetMap" at the right, 10 sp, above the rating line (required by the licence). The map stays decorative: not interactive, hidden from screen readers.
- Tiles: follow the OpenStreetMap tile usage policy (a real User-Agent for the app, no bulk download, cache the rendered image per site). If the policy does not fit an app, propose another OSM-based tile provider to Christian before adding an API key or a paid service. Remove the satellite provider added for task 13 if nothing else uses it.

## [x] 2026-11-09-17 Edit dive form: sections always open, Voyage dropdown with a clear button

Done in Edit dive: choose the main dive computer

Christian approved these on the canvas. Spec: "Edit dive form, sections and trip field". Mock-up: `docs/mockups/android-edition.dc.html`.
- Remove the expand/collapse chevrons of all the sections of `/dives/:id/edit` and make every section always open. Section titles become plain headings, not buttons.
- Ordinateurs, previously collapsed, now shows each computer of the dive with a radio button for the main one ("Principal : son profil est celui de la plongée") and the helper "Avec plusieurs ordinateurs, choisissez le principal.". Use the core's notion of the dive's first (main) computer.
- Voyage is a dropdown menu (Aucun, the existing trips, Nouveau voyage) with the filled down arrow used by the other dropdowns, not a right chevron.
- When the dive is in a trip, show a clear button ✕ before the arrow (accessible label "Retirer du voyage", 48 dp touch target, 20 dp icon). It sets the field to "Aucun". The dive leaves the trip on Enregistrer, and an empty trip is deleted as with the ⋮ menu action of task 2026-11-09-14.
- Check the other Android screens: a filled down arrow only on dropdown menus, a right chevron only on fields or rows that open another page or a dialog.

## [x] 2026-11-09-18 Settings: logbook dive computers, rename, remove, merge duplicates

Done in Settings: logbook dive computers, rename, remove, merge duplicates by profile. Christian chose not to open the logbook in desktop Subsurface: the merged test logbook was read back with Subsurface's core instead.

Christian approved this. Spec: "Settings, logbook dive computers (rename, remove, merge duplicates)". Mock-ups: `docs/mockups/reglages-ordinateurs-android.dc.html`, `reglages-ordinateur-modifier-android.dc.html`, `reglages-ordinateur-fusion-android.dc.html`, and the new first row of the "Ordinateurs de plongée" group in `android-reglages.dc.html` (the ⋮ menu in `reglages-menu-android.dc.html` moved down with it).
- New row "Ordinateurs du carnet" → page listing every computer the dives come from (device list of the core, plus model and device id found in the dives), with name, model, serial, dive count, and the "Doublon possible" chip (same model as another entry, no serial).
- "Modifier l'ordinateur": the Nom field edits the nickname (saved in the logbook like Subsurface desktop's "Edit dive computer nicknames"). Model, serial, firmware and dive count are read only.
- "Retirer de la liste": removes the device entry only. Dives keep their data.
- "Fusionner avec <name>": confirmation dialog, then for every dive of the duplicate, set the dive computer's model, device id and serial to those of the chosen computer, move the download fingerprint, remove the duplicate's device entry, mark the dives changed so they sync, and show the snackbar "Fusionné avec <name>" with "Annuler" (undo restores everything). Several candidates of the same model: "Fusionner avec…" opens a choice. The result must stay readable by Subsurface desktop: check it by opening the logbook there.
- If the core cannot do the merge cleanly (for instance a dive that has both computers), stop and tell Christian before improvising.

## [x] 2026-11-09-19 Carnet menu: shortcut to "Ordinateurs du carnet"

Done in Logbook menu: shortcut to the logbook dive computers

Christian approved this. Mock-up: `docs/mockups/android-carnet-menu.dc.html`. Spec: end of "Settings, logbook dive computers".
- Add a third item "Ordinateurs du carnet" to the ⋮ menu of the Carnet, after "Renuméroter les plongées", with the dive computer icon of the mock-up. It opens the same page as the row in Réglages (task 2026-11-09-18). Back returns to the Carnet.

## [x] 2026-11-09-20 New logo "Trois vagues": regenerate every icon

Done in Android icons and launch screen: the Trois vagues logo. No iOS project yet: its icons remain to be made with it.

Christian chose a new logo. Spec: "Logo (decided on 9 November 2026)". Reference: `docs/mockups/logo-variante-trois.dc.html`. Christian already updated the drawings in `docs/brand/opendives-icon-*.svg`, `docs/brand/opendives-logo-*.svg`, `app/public/favicon.svg` and `app/public/logo-{light,dark}.svg`, and the side menu and About mock-ups.
- Regenerate from them: the Android adaptive icon (`ic_launcher_foreground.xml`, background #F4F4F2, the PNG fallbacks in every mipmap density, round included), the monochrome layer for themed icons (ring, three waterlines and bubbles in one colour, check that the three wave edges stay readable), the splash mark (light and night), iOS icons when the project exists, and any in-app logo (side menu header, About, first launch).
- Keep the size rule: grey top arc at 64 px and below, none above. Check the icon in the round and squircle masks.
- Do not change the drawing. If the three gradients do not convert well to a vector drawable, stop and ask Christian.

## [x] 2026-11-09-21 Sync conflict dialog: name what conflicts, readable differences, one action

Done in Sync conflict dialog: readable differences, cards, undo

Christian approved this on the canvas. Spec: "Sync conflict dialog, redesigned". Mock-ups: `docs/mockups/android-etat-conflit.dc.html`, `android-etat-conflit-ordinateurs.dc.html`. Rework `ConflictSheet.svelte` (Android dialog and iOS sheet):
- Identity card of what is in conflict (dive: thumbnail, site, number, date and time; dive computer names: icon and "Ordinateurs du carnet").
- No more "fiche de la plongée": give every git-log line a readable name, and translate the dive computer lines (`deviceid=… serial=… nickname=…`) into the readable summary of the spec (name that differs, computers only on one side and what is lost, unchanged ones).
- Two selectable cards instead of radios, the differences always shown inside each card, no Comparer toggle, a single tonal "Continuer". Keep the "apply to all" checkbox when several dives conflict.
- Put the selection colours in tokens (`--od-selected`, `--od-selected-container`, `--od-tonal`): the palette rule is being revised, the values may change.
- Added at 14:24, Christian wants it in this task: a secondary text button "Plus tard" left of "Continuer" (the dialog may now be closed: sync stays paused, the Carnet status row "Synchronisation arrêtée" reopens it). After "Continuer", apply the choice locally, show a snackbar with "Annuler" for about 8 seconds, and only then push; "Annuler" restores the conflict and reopens the dialog. See the spec paragraph.
- Added at 14:40: the iOS sheet is redesigned the same way, see `docs/mockups/ios-etat-conflit.dc.html` and the spec (full-width "Continuer", "Plus tard" under it).
- Added at 14:37, Christian: "Plus tard" closes the dialog and returns to where the diver was, or to the Carnet when the conflict appeared while opening the app. The status row of the Carnet and the sync card of the side menu reopen it, and it comes back at the next sync attempt. See the spec.
- Added at 14:38: several dives in conflict, a full-screen dialog with a "Même choix pour toutes" switch and one card per dive with two small selectable cards. Mock-up `docs/mockups/android-etat-conflit-plusieurs.dc.html`, spec paragraph updated.

## [x] 2026-11-09-22 Palette rule: colour no longer reserved for data

Done in Palette rule: colour allowed sparingly, within WCAG AA

Christian removed the rule "colour reserved for data" from the spec (section 1, first paragraph). The theme stays black and white with ink actions; the sand-to-rust water column stays in the dive data, and colour may now appear elsewhere when a mock-up uses it (headers, side menu, selection in the conflict dialog). Update the palette comment at the top of `app/src/theme.css` ("neutral light UI, colour only in the data") to match the new wording, and any other comment or doc that repeats the old rule. No colour change in the code for now.
- Added at 14:17: colour is allowed sparingly, within WCAG 2.2 AA contrast (4.5:1 text, 3:1 large text and meaningful graphics), and never as the only carrier of meaning. Mention this in the `theme.css` comment, and check the contrast of every new colour token you add.

## [x] 2026-11-09-23 Palette: secondary, tertiary and error roles

Done in Palette: secondary, tertiary and error roles

Christian approved a palette with MD3 colour roles. Spec: "Colour roles (decided on 9 November 2026)", section 1. Reference: `docs/mockups/palette-roles.dc.html`.
- Add the tokens in `app/src/theme.css`, light and dark: `--od-secondary`, `--od-on-secondary`, `--od-secondary-container`, `--od-on-secondary-container`, the same four for `--od-tertiary` and `--od-error` (error reuses `--od-alarm`), and `--od-primary-container` / `--od-on-primary-container` for the former grey secondary container. Map them to the Framework7 MD3 variables (`--f7-md-secondary`, `--f7-md-secondary-container`, `--f7-md-tertiary`…), and check on screen that Framework7 does not override them.
- Point the selection tokens of task 2026-11-09-21 (`--od-selected`, `--od-selected-container`, `--od-tonal`) to the secondary role, and the temperature curve (`--od-temperature`) to the tertiary.
- Do not recolour other screens yet: use the new roles only where a mock-up asks for them. To-do #24 (blue in the logbook charts) will follow.

## [x] 2026-11-09-24 Sync failures: status row and bottom sheet

Done in Sync failures: cause in the status row and bottom sheet

Christian approved this. Spec: "Sync failures (decided on 9 November 2026)". Mock-ups: `docs/mockups/android-etat-synchro-motdepasse.dc.html`, `android-etat-synchro-serveur.dc.html`, `android-etat-synchro-depot.dc.html`.
- Tell apart the three causes from the core's sync errors: authentication refused by the cloud, cloud unreachable while the network works, own git repository refusing access. No network at all stays the offline state.
- Show the cause in the Carnet status row and the side menu sync card (pending colour, warning icon, chevron). Touching it opens the bottom sheet of the mock-up, with its actions: open the sign-in with the address filled, retry now, or open the git repository form.
- Automatic retries for the unreachable server (every 5 minutes, then less often). Never a blocking dialog.
- iOS: same content in a sheet, when the iOS project exists.

## [x] 2026-11-09-25 Carnet: sync status pill, offline rows, updated state mock-ups

Done in Logbook: sync status pill in the header band

Christian approved this. Spec: "Carnet sync status pill". It completes tasks 2026-11-09-21 (conflict) and 2026-11-09-24 (sync failures), whose mock-ups were brought up to date: current Carnet header (☰, ⋮, summary, search bar).
- Show the sync state (offline with waiting changes, failure, conflict) in a translucent white pill under the summary line, text and icon in `--od-pending`, with a chevron when it opens the failure sheet or the conflict dialog. Never as plain text on the band (contrast too low).
- Dive rows keep "N° X · date"; a waiting change adds a third line in `--od-pending`.
Mock-ups: `docs/mockups/android-etat-horsligne.dc.html`, `android-etat-synchro-motdepasse.dc.html`, `android-etat-synchro-serveur.dc.html`, `android-etat-synchro-depot.dc.html`, `android-etat-conflit.dc.html`, `android-etat-conflit-ordinateurs.dc.html`.

## [x] 2026-11-09-26 Sites header: same wave and profile as the other sections

Done in Sites header: same wave and profile as the other sections

Christian approved this on the canvas. Mock-up: `docs/mockups/android-sites.dc.html`. Spec: section headers paragraph.
- Remove the 24 dp bottom corners and the shadow of the Sites header band. Give it the same 52 dp bottom padding, the same faint profile (10 dp from the bottom) and the same wave as Carnet, Statistiques and Outils.
- The map runs under the band, so the wave must cut the band (CSS mask or clip-path on its bottom edge, 18 dp high) rather than be painted in the page colour: the map shows under the curve.
- Make sure the first map pins and their labels are not hidden under the taller band (initial map view, or padding of the map camera).

## [x] 2026-11-09-27 Edit dive form: rebreather cylinders (gas switch depth, O₂ defaults)

Done in Edit dive: rebreather cylinders without switch depth, O2 defaults

Christian approved these on the canvas this morning; they were sent late. Spec: "Edit dive form, rebreather cylinders". Mock-up: `docs/mockups/android-edition.dc.html` (it also carries the changes of tasks 2026-11-09-17).
- CCR dive: remove "Changement de gaz à" and its MOD helper from the cylinders whose use is Diluant or Oxygène. Keep them for open circuit and bailout cylinders.
- When the use becomes Oxygène, set O₂ to 100 % and He to 0. When it becomes Diluant, set O₂ to 21 % and He to 0. The values stay editable; do not overwrite a value the diver typed after choosing the use.

## [x] 2026-11-09-28 Statistics: charts that do not measure depth in blue (to-do #24)

Done in Statistics: count and time charts in blue

Christian chose the blue version. Spec: "Statistics charts in blue". Mock-up: `docs/mockups/android-stats.dc.html`. Depends on the tertiary tokens of task 2026-11-09-23.
- In `BarChart.svelte` and the Statistics charts, colour the bars of count and time charts (dives per year, durations…) with a ramp from #5B8BCB (smallest) to #24589A (largest) through tokens (`--od-chart-low`, `--od-chart-high`, light and dark). Depth charts keep `waterBottomColor()`.
- No blue in the Carnet.


## [x] 2026-11-09-29 Planner: gas volume and CNS bars in blue

Done in Planner: gas volume and CNS bars in blue

Christian approved the blue bars and kept the profile in water colours. Spec: "Planner result bars in blue". Mock-ups: `docs/mockups/android-planificateur.dc.html`, `android-planificateur-nouveau.dc.html`. Depends on the tertiary tokens of task 2026-11-09-23.
- Under each "Volume nécessaire par gaz" row, add an 8 dp rounded bar: consumed part in tertiary, 2 dp gap, reserve hatched on the tertiary container. Width = consumed / (consumed + reserve) for that gas. Give it `role="img"` and an aria-label with both volumes.
- Under "Exposition à l'oxygène", add an 8 dp track with CNS filled in tertiary (capped at 100 %) and the caption "Limite CNS 100 %".
- Use tokens, light and dark. The profile chart keeps `waterBottomColor()`.

## [x] 2026-11-09-30 Dive detail: cylinder pressure bars on the working-pressure scale

Done in Dive detail: cylinder pressure bars on the working-pressure scale

Christian chose corrected bars over dial gauges. Spec: "Dive detail, cylinder pressure bars". Mock-ups: `docs/mockups/detail3-android.dc.html`, `detail3-android-sombre.dc.html`. Depends on the tertiary tokens of task 2026-11-09-23.
- The current bar fills end/start, which is misleading. Scale it from 0 to the working pressure: remaining (end) in tertiary, 2 dp gap in the card colour, used (start − end) in the lighter tertiary, then the track. Bar height 8 dp, radius 4 dp.
- Supporting text: "Service {wp} · {used} utilisés", plus "· changement à {depth}" when set. Units follow the pressure setting.
- `role="img"` with an aria-label giving remaining, working and used pressures.
- When a pressure is missing (no start, no end or no working pressure), hide the bar and keep the text.

## [x] 2026-11-09-31 Mark dives invalid from the Carnet selection menu and the detail menu (to-do #26)

**Cancelled by Christian on 9 November 2026, before it was built: do not add these menu items.** To-do #27 will instead remove the invalid-dive workflow; a separate task will follow.

Christian approved. Spec: "Marking dives invalid". Mock-ups: `docs/mockups/carnet-selection-menu-android.dc.html`, `docs/mockups/detail2-android-menu.dc.html`.
- Carnet selection ⋮ menu: "Marquer comme invalides" after "Exporter au format…". Detail ⋮ menu: "Marquer comme invalide" after "Partager". Circle-slash icon, above the separator.
- Use the core's invalid flag through an undoable command (Subsurface "Mark dive invalid"). No confirmation dialog. Snackbar with "Annuler": "Plongée marquée invalide" or "N plongées marquées invalides".
- With "Afficher les plongées invalides" off (default), invalid dives leave the Carnet and the statistics; from the detail, go back to the Carnet. With it on, show them dimmed with an outlined "Invalide" label, and offer "Marquer comme valide(s)" instead. A mixed selection gets "Marquer comme invalides".

## [x] 2026-11-09-32 fr-CA language: wire the catalog (to-do #19)

Done in Add the fr-CA language

Christian asked for a fr-CA catalog that holds only what differs from fr. The file is written: `app/src/i18n/fr-CA.json` (39 texts: "cloud" → "nuage", "e-mail" → "courriel"). Same nested keys as `fr.json`, only the changed leaves.
- In `app/src/lib/i18n.js`, add fr-CA: look up a key in fr-CA, then fr, then en. Plural objects (`one`/`other`) count as one leaf.
- Device language: a tag `fr-CA` picks fr-CA, any other `fr-*` picks fr. Settings "Langue de l'app" offers "Français (Canada)" after "Français". Plural rules and number format stay French.
- When fr.json changes, fr-CA keeps only its overrides: a key removed from fr is removed from fr-CA too.
- Delete to-do #19 when done.

## [x] 2026-11-09-33 Offline maps: regions screen, downloads, updates, Sites map offline

Done in Offline maps: integrate downloads, screens and tile reading

Christian approved the design. Spec: "Offline maps (decided on 9 November 2026)". Mock-ups in `docs/mockups/`: `android-cartes-hors-ligne`, `-menu`, `-vide`, `-ajout`, `-pays`, `-choix-carte`, `-telechargement`, `-echec`, `-mise-a-jour`, `-donnees-mobiles`, `-espace`, `-plafond`, `-limite`, `-maj-remplacer`, `-suppression`, `-supprimee` (all `.dc.html`), `android-sites-hors-ligne.dc.html`, `appbar-tiroir-android-maj-cartes.dc.html`, `ios-cartes-hors-ligne.dc.html`, `android-tablette-cartes.dc.html`, `tablette-cartes.dc.html`, and the Settings row in `android-reglages.dc.html`.

Routes: `/settings/maps/` (list), `/settings/maps/new` (add), `/settings/maps/countries/` and `/settings/maps/countries/:code`, `/settings/maps/area` (choose on the map). Enable the Settings row "Régions téléchargées".

Data needed:
- A catalogue served by OpenDives (JSON): for each package an id, kind (`zone`, `country`), translated names (fr, en), country code, bounding box, size in bytes, version or date, SHA-256, URL. The server side (building PMTiles from OpenStreetMap, hosting) is not in this task: use a stub catalogue with two or three test packages until it exists, and say where it lives. Build one real test package (Northland, z0–14, without buildings, shops and addresses) with Planetiler or `pmtiles extract`, and report its size: the mock-up sizes are guesses.
- Logbook data for suggestions: sites with GPS (`list_sites`) and trips with their sites, to find the zones that contain them.
- Local state per region: id or drawn bounding box, name (a drawn region's name is diver data), file path, size, version, download date, status (`queued`, `waiting-wifi`, `downloading`, `paused`, `failed`, `ready`, `updating`), bytes received. Kept per device, not in the logbook.
- App settings: "Télécharger sur données mobiles" (off by default) and "Espace maximum pour les cartes" (500 Mo, 1, 2 or 5 Go, 1 Go by default).

Behaviour (details in the spec): Wi-Fi by default, mobile data dialog otherwise; resumable background downloads (HTTP range requests); checksum before use; storage guards (free-space floor of 1 Go or 10 %, cap "Espace maximum pour les cartes" 1 Go by default, pause below the floor during a download, one download at a time, "Remplacer" when an update cannot fit two versions, partial files cleaned after 7 days, packages excluded from backups); update check at start, at most once a day, badges on "Réglages" in the side menu and on the Settings row; old package kept until the new one is checked; delete with confirmation, then snackbar with "Annuler" (6 s) before the file is removed.

Sites map and site maps: MapLibre reads local PMTiles first (`pmtiles://` protocol), then OpenFreeMap online, then a simplified world map shipped in the app (land and coasts only). "Hors ligne" pill under the Sites header when offline. Snackbar "Cette zone n’est pas téléchargée" with "Télécharger", once per area.

Native dependencies to add:
- `pmtiles` (npm, the MapLibre protocol), reading files through a Capacitor file URL or a small native range reader.
- Background, resumable downloads: Android `WorkManager` (or `DownloadManager`) with a foreground notification, iOS `URLSession` background configuration. A Capacitor plugin wrapping both (for example `@capacitor/filesystem` plus a download plugin, or a small in-house plugin).
- `@capacitor/network` for Wi-Fi or cellular and connectivity events.
- Free disk space: a small native call (`StatFs` on Android, `volumeAvailableCapacityForImportantUsage` on iOS).
- The simplified world map asset (Natural Earth, public domain) bundled with the app; add its credit to "Bibliothèques libres".

Every visible text is a translation key (fr, en, and fr-CA where "nuage" applies). Snackbars at least 4 s, 6 s with "Annuler".

## [x] 2026-11-09-34 Desaturation: shorter chart text (to-do #8)

Done in Desaturation: shorter chart text

Christian wrote the text. Mock-up: `docs/mockups/outils-desaturation-android.dc.html`.
- `desaturation.chartText` becomes, in fr: "Les 16 compartiments du modèle Bühlmann, des plus rapides aux plus lents, en pourcentage de la limite permise." In en: "The 16 compartments of the Bühlmann model, fastest to slowest, as a percentage of the allowed limit."
- `modelGf` ("Facteurs de gradient 30 / 75, ceux du planificateur.") and `modelVpmb` stay, right after it, in the same paragraph.
- Keep the note "Ce calcul ne connaît que les plongées du carnet…" and the flight recommendation unchanged.

## [x] 2026-11-09-35 Settings: default water type for downloaded dives (to-do #28)

Done in Add a default water type for downloaded dives

Christian approved. Spec: "Default water type for downloaded dives". Mock-ups: `docs/mockups/android-reglages.dc.html` (group "Carnet"), `docs/mockups/reglages-type-eau-android.dc.html` (dialog).
- New app setting, per device, default "Non précisé". Options: Non précisé, Eau douce (1000 g/l), Eau de mer (1030 g/l), EN 13319 (1020 g/l), as Subsurface's water types.
- On download from a dive computer, when the dive has no salinity, write the chosen value; "Non précisé" leaves it empty. Never touch dives already in the logbook, nor a salinity the computer gave.
- Row in Settings › Carnet after "Choisir le type d’eau dans l’éditeur", with supporting text and current value; the choice dialog has the intro sentence from the spec. fr and en keys.
- The planner's "Type d’eau" in "Conditions par défaut" is unchanged.

## [x] 2026-11-09-36 Carnet: month headers that stay on top (to-do #25), on a branch kept for review

Done in Carnet: month under the top bar, one band and one wave (kept after review; no month rows in the list, at Christian's request)

Christian wants to try this before deciding. **Work on the branch `feature/carnet-month-headers`, push it, and do not merge it into main and do not delete it, even when done: Christian will review it and decide whether to keep it.** Say in your reply which commit to test.

Spec: "Carnet, month headers that stay on top". Mock-ups: `docs/mockups/android-carnet-entetes.dc.html`, `docs/mockups/android-carnet-entetes-petit.dc.html`.
- Group the Carnet list by month (newest first). One header per month: year in bold + month, 20 sp, dive count of the month on the right; `role="heading"`.
- On scroll, the band collapses to its title row, and the current month header sits in the band under the title (gradient, wave at the bottom, count in `#1F2124`). The next header pushes it out (sticky, not overlapping).
- A trip stays one group under the month of its first dive; inside an open trip the band keeps that month.
- Keep search, selection mode and the filter working with the headers (a filtered list still shows its month headers, with filtered counts).

## [x] 2026-11-10-01 Offline maps: search field on "Choisir sur la carte" (addendum to 2026-11-09-33)

Done in Add a search field to "Choose on the map"

**Approved by Christian on 10 November 2026: go ahead.**

Christian asked for it in a canvas comment. Mock-up: `docs/mockups/android-cartes-choix-carte.dc.html`. Spec: "Offline maps", *Adding*.
- Under the top bar of `/settings/maps/area`, a search field "Rechercher un lieu ou un site" (surface card, 56 dp, rounded). Results: logbook sites first (name, region), then places from Nominatim (OpenStreetMap geocoder; follow its usage policy: debounce, at most one request per second, a generic app identifier with no personal data).
- Choosing a result centres the map on it and places the rectangle around it; for a logbook site, the region name defaults to "Autour de {site}".
- This screen needs the network; offline, the field is disabled with "Recherche indisponible sans réseau".

## [x] 2026-11-10-02 Offline maps: "Choisir sur la carte" with a fixed frame (replaces the rectangle with handles)

Done in Replace the draggable rectangle with a fixed frame on Choose on the map

Christian approved these changes from canvas comments. Mock-up: `docs/mockups/android-cartes-choix-carte.dc.html`. Spec: "Offline maps", *Adding*. Builds on 2026-11-09-33 and 2026-11-10-01.
- No draggable rectangle and no handles. A fixed square frame (300 dp, 1.5 dp outline, thick corner marks) stays centred in the visible part of the map (between the search field and the bottom sheet). The diver pans and zooms the map under it; the downloaded area is what the frame covers.
- Outside the frame, a 40 % dark veil over the map.
- Top bar on a plain surface with a 1 dp bottom divider: ✕ and "Choisir sur la carte". No gradient, no instruction line (keep the instruction in the map's accessible label).
- The search field from 2026-11-10-01 floats on the map just under the top bar (surface card, light shadow).
- Bottom sheet: the area size ("Environ 180 × 165 km") and estimated download size update as the zoom changes. Set a minimum and maximum zoom so the area stays between about 20 km and the size of the largest catalogue zone.
- *Added at 06:09 on 10 November 2026:* the "Télécharger" button of the bottom sheet takes the full width of the sheet, 48 dp high (approved by Christian).
- *Added at 06:21 on 10 November 2026:* the bottom panel is fixed: square corners, no drag handle, no shadow, a 1 dp divider on top. It is not a bottom sheet (approved by Christian).

## [x] 2026-11-10-03 Logo: short gradients ("dégradés courts")

Done in Regenerate logo PNGs with the short gradients

Christian chose a new colouring of the "Trois vagues" logo so the three wave layers stay apart at 64 px and below. Spec: "Logo (decided on 9 November 2026): Trois vagues" (gradients updated on 10 November). Reference: `docs/mockups/logo-petit-degrades-courts.dc.html`.
- Already updated in the repo: `docs/brand/opendives-*.svg`, `app/public/favicon.svg`, `app/public/logo-{light,dark,small-light}.svg`, and the Android vector drawables `res/drawable/ic_launcher_foreground.xml`, `res/drawable/ic_splash_mark.xml`, `res/drawable-night/ic_splash_mark.xml`. Check them in a build.
- Regenerate what is raster or generated from these sources: `res/mipmap-*/ic_launcher.png` and `ic_launcher_round.png`, the iOS app icon set when the iOS project exists, the store icon, and any other PNG export of the logo.
- New gradients, light: #FBE3B2→#F4C98C, #E5A661→#D88A45, #C76A25→#A9490C; dark: #F5E2B0→#EFD08F, #EBAD60→#E3923C, #D9702A→#C2550F.

## [x] 2026-11-10-04 Clean up sites: "Pas des doublons" does something

Done in Merge branch 'integrate/nov10-batch' (feature/sites-not-duplicates). Kept per device by Christian's decision on 10 November 2026: a dive site has no field that survives a desktop Subsurface save without being visible to the diver.

Christian approved (canvas comment). The button "Pas des doublons" had no action. Spec: "Clean up sites, \"Pas des doublons\"". Mock-ups: `docs/mockups/sites-nettoyer-android.dc.html`, `docs/mockups/sites-nettoyer-pas-doublons-android.dc.html`.
- Tapping it removes the group from the list right away and shows a snackbar (6 s): "{site A} et {site B} ne seront plus proposés comme doublons", action "Annuler" puts the group back.
- Remember the decision in the logbook so it syncs: mark each pair of sites of the group as "not duplicates" (for example a key in each dive site's extra data listing the other site's uuid; keep the core unmodified). The duplicate finder skips marked pairs.
- Drop the mark when either site changes name or position, so the pair can be proposed again.
- fr and en keys.

## [x] 2026-11-10-05 Settings: confirm "Réinitialiser tous les réglages"

Done in Confirm reset of all settings and keep the planner settings

Christian approved (canvas comment). Spec: "Settings, \"Réinitialiser tous les réglages\" asks first". Mock-up: `docs/mockups/reglages-reinitialiser-android.dc.html`.
- The button opens an alert dialog with the title, text and buttons of the spec ("Annuler", "Réinitialiser"). Nothing is reset before "Réinitialiser".
- After reset, snackbar "Réglages réinitialisés" (4 s). Downloaded offline maps, logbook data, account, planner settings and trip grouping are untouched.
- fr and en keys.

## [x] 2026-11-10-06 One snackbar style for the whole app

Done in Use one snackbar style for every message of the app

Christian asked (canvas comment): use the snackbar of `docs/mockups/sites-nettoyer-pas-doublons-android.dc.html` for every snackbar. Spec: `docs/ui-foundations.md`, section 8 "Snackbar style".
- Make one shared snackbar component with that style (inverse surface, 4 dp corners, 16 dp side margins, 24 dp from the bottom or above the FAB, 14 sp text, one action in the inverse primary colour), light and dark tokens.
- Replace every existing snackbar or toast with it. Keep the durations: 4 s minimum, 6 s with an action.

## [x] 2026-11-10-07 Clean up sites: edit a site from a duplicate group

Done in Edit a site from a duplicate group in Clean up sites

Christian approved (canvas comment). Spec: "Clean up sites, \"Pas des doublons\"" (paragraph on the pencil). Mock-ups: `docs/mockups/sites-nettoyer-android.dc.html`, `docs/mockups/sites-nettoyer-pas-doublons-android.dc.html`.
- Each site row of a duplicate group gets a pencil icon button on the right (48 dp target, aria-label "Modifier le site {nom}"), separate from the radio choice.
- It opens the existing site editor. On save, return to "Nettoyer les sites" at the same scroll position and recompute the groups; a group that no longer matches disappears with the snackbar "{nom} modifié, ce n’est plus un doublon possible" (4 s, shared snackbar style). Back without saving changes nothing.

## [x] 2026-11-10-08 Sites: search open state and its open and close animation

Done in Sites: open search state with its open and close animation

Christian approved (canvas comments). Spec: "Sites, search open and its animation". Mock-ups: `docs/mockups/android-sites.dc.html` (closed), `docs/mockups/android-sites-recherche.dc.html` (open).
- Open state as in the mock-up: ← and a rounded field with ✕ in the band, result count under it, non-matching pins at 30 %, list filtered to results with the match highlighted, "à faire" card and + hidden.
- Opening: 300 ms, emphasized decelerate; the field grows from the 🔍 button (right-anchored), title and ☰ fade out as ← fades in, card and + fade out; focus and keyboard at the end.
- Closing (←, back gesture, back on empty field): 200 ms, emphasized accelerate; keyboard first, field shrinks into 🔍, title and ☰ back, card and + back, pins back to 100 %, map back to its previous view. ✕ only clears.
- Reduced motion: 150 ms cross-fade only.

## [x] 2026-11-10-09 Statistics: nothing clickable, remove the one-year view

Christian approved (canvas comment). Spec: "Statistics, items are not clickable". Mock-up: `docs/mockups/android-stats.dc.html`.
- On `/statistics/`, the chart cards and the result rows are not links: no chevron, no ripple, no focus stop.
- Remove the one-year view and its route; remove any link to it. Keep the filter and "Nouvelle statistique".
- *Added at 09:40 on 10 November 2026:* this covers every grouped section of the page: "Par année", "Par mode", "Par combinaison", "Par compagnon" and any other "Par …" section. None has a detail view, so none of their rows is clickable (approved by Christian).
- *Added at 09:43 on 10 November 2026 (approved by Christian), match the mock-up layout:*
  - The "Par …" sections are not accordions: always open, with a plain section title (14 sp, medium, `--od-on-surface-variant`), as in `android-stats.dc.html`.
  - Rows are plain two-line list items, 72 dp min height, in a rounded white card with 1 dp dividers: title 16 sp (`od-value` for years), supporting line 14 sp `--od-on-surface-variant`. Not the Framework7 media-list style.
  - "Par année" rows: title = year, supporting line = "{n} plongées · {durée} · max {profondeur}". "Par mode", "Par combinaison", "Par compagnon": title = value, supporting line = "{n} plongées", total time on the right (14 sp, tabular figures).

Done in Statistics: plain sections and rows, no one-year view

## [x] 2026-11-10-10 Four small changes from canvas comments

Christian approved all four. Spec: "Small changes of 10 November 2026" and "Statistics, items are not clickable".
1. Site sheet (`docs/mockups/sites-fiche-android.dc.html`): each dive of "Plongées sur ce site" shows "N° {number} · {date}, {heure}".
2. Dives without a site (`docs/mockups/sites-sans-site-android.dc.html`): profile thumbnail (56 × 40, same component as the Carnet) before the date; thumbnail + text are one tappable area with a chevron, apart from the two buttons. It opens a new screen `/sites/without-site/:diveId` (`docs/mockups/sites-sans-site-profil-android.dc.html`): ← and date in the top bar with "Plongée sans site · {mode}", the three key figures, the full profile card (same component as the dive detail, curves toggles included), computer and GPS line, and a fixed bottom bar "Choisir un site" (filled) and "Nouveau site" (outlined) that do the same as the row buttons, then return to the list.
3. Statistics (`docs/mockups/android-stats.dc.html`): drop "· max {profondeur}" from every row; rows read "{n} plongées · {durée}".
4. New statistic (`docs/mockups/stats-nouvelle-android.dc.html`): move "Nom" to the top, before "Critère".

Done in Four small changes from canvas comments

## [x] 2026-11-10-11 Filter (Android): rework the page to match the mock-up

Done in "Rework the Android filter page to match the mock-up".

Christian asked to review the filter page against the new Android mock-up. Spec: "Filter, Android". Mock-up: `docs/mockups/filtre-android.dc.html`. Pages: `app/src/pages/Filter.svelte`, `FilterCriterion.svelte`.
- Full-screen dialog: ✕ (abandon), "Filtrer", text button "Tout effacer".
- Search field "Chercher un critère" (rounded, 56 dp) under the bar.
- "Mode de plongée": MD3 segmented button with three options and the check icon on the selected one.
- "Matériel": card of rows with current value and a chevron to the right (opens the criterion). An active criterion: grey row, value in semibold.
- "Autres critères": card of groups with their content line and a chevron pointing down; tapping expands the group in place to list its criteria (each opens like a Matériel row).
- Fixed bottom bar: filled full-width "Afficher les {n} plongées", text button "Enregistrer ce filtre".

Addendum (2026-11-10 10:10): saved filters. Spec: "Filter, Android" (updated). Mock-up: `docs/mockups/filtre-android.dc.html` (updated).
- Under the search field, a section "Filtres enregistrés": a card with one 56 dp row per saved filter, name only, no description line.
- Tapping a row applies the filter: its criteria fill the page (mode, Matériel, Autres critères). The applied filter has a grey row and a check icon on the left.
- Each row has an ✕ icon button on the right, `aria-label` "Supprimer le filtre {nom}": deletes at once, snackbar "Filtre {nom} supprimé" with "Annuler" for 6 s (snackbar style of ui-foundations section 8).
- Hidden while the search field has text; absent when no filter is saved.

## [x] 2026-11-10-12 Statistics: "Par …" sections become accordions again, closed by default

Done in "Make the statistics By sections accordions, closed by default".

Christian reversed the "no accordion" part of task 2026-11-10-09. Spec: "Statistics, items are not clickable" (updated). Mock-up: `docs/mockups/android-stats.dc.html` ("Par année" drawn open, the others closed). Page: `app/src/pages/Statistics.svelte`.
- Each "Par …" section ("Par année", "Par mode", "Par combinaison", "Par compagnon" and the others) has its title as a 48 dp button: title text (14 sp, medium, `--od-on-surface-variant`) and a chevron on the right, pointing down when closed, up when open. `aria-expanded` on the button, inside the `h2`.
- All sections are closed by default. Tapping the title opens or closes that section only.
- The rows inside stay plain content, as in task 09: no link, no chevron, no ripple, no maximum depth.
- The chart cards, the filter and "Nouvelle statistique" do not change.

## [x] 2026-11-10-13 Statistics: each row opens the list of its dives

Done in "Open the list of its dives from each statistics row".

Christian changed his mind on the rows of task 2026-11-10-09: they become clickable. Spec: "Statistics, a row opens its dives" (new) and "Statistics, items are not clickable" (updated). Mock-ups: `docs/mockups/android-stats.dc.html`, `docs/mockups/android-stats-plongees.dc.html` (new). Pages: `app/src/pages/Statistics.svelte`, plus a new page.
- Every row of "Mes statistiques" and of every "Par …" section becomes a link: chevron right (20 dp, `--od-on-surface-variant`), standard ripple. The chart cards stay plain. The accordions of task 12 do not change.
- New page for the dives of a row, a collection under `/statistics/` (for example `/statistics/dives/?…` carrying the section and value; choose the parameters). Top bar on the page background: ← "Retour" (back to `/statistics/`, keeping scroll position and open sections), title = the row title, supporting line "{section} · {n} plongées · {durée}".
- Content: the dives of the row, newest first, as flat Carnet rows (reuse the Carnet row component: thumbnail, site or "Site à préciser", "N° {n} · {date}", depth, duration). No trips, no month headers, no search, no + button. A row opens `/dive/:id`.
- The list uses the statistics filter in force, so its count matches the row.
- New texts in `fr.json` and `en.json`; a line in the release notes.

## [x] 2026-11-10-14 Carnet month headers: band only, 14 sp

Done in "Carnet: month line of the band in 14 sp" (on the review branch feature/carnet-month-headers, not merged).

Christian changed task 2026-11-09-36. Work on branch `feature/carnet-month-headers`; do not merge it into `main` and do not delete it: Christian still has to review it. Spec: "Carnet, month headers that stay on top" (rewritten). Mock-ups: `docs/mockups/android-carnet-entetes.dc.html`, `docs/mockups/android-carnet-entetes-petit.dc.html` (updated).
- Remove the month headers from the list: no header line between months, and no push effect.
- Keep only the month line in the collapsed band, under the title: year (bold), month, and "{n} plongées" on the right. All three in 14 sp (was 20 sp for year and month).
- The line shows the month of the first visible dive and switches when that dive is in another month. A trip counts under the month of its first dive, as before.

Addendum (2026-11-10 10:55): the month label follows the display language. Build it with `Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })` and capitalise the first letter: "Avril 2014" in French, "April 2014" in English. No bold: month and year in regular weight, 14 sp. Mock-ups updated.

## [x] 2026-11-10-15 Desaturation: last dive block, and the "flying allowed" state

Done in "Desaturation: last dive section and the flying allowed state" (no "Désaturation restante" or "Désaturation terminée": Subsurface has no criterion for it, Christian agreed).

Spec: "Tools", item "Desaturation, last dive and flying allowed" (new). Mock-ups: `docs/mockups/outils-desaturation-android.dc.html` (updated), `docs/mockups/outils-desaturation-terminee-android.dc.html` (new). Page: `app/src/pages/Desaturation.svelte`.
- New section "Dernière plongée" under the summary card: one row (date and time, "{site} · {depth} · {duration}", "Sortie de l’eau il y a {durée}"), chevron, opens `/dive/:id`. The time since surfacing uses the end of the dive and updates with the screen.
- When the wait before flying is over: the summary card shows "Vous pouvez prendre l’avion" with "Attente terminée {jour}, {heure}", and "Désaturation terminée" with "{jour}, {heure}", each with a check-circle icon, instead of the two figures. Relative days ("Aujourd’hui", "Hier").
- If desaturation is over but flying is not yet allowed, keep the two figures ("0 h 00" for desaturation).
- New texts in `fr.json` and `en.json`; a line in the release notes.

## [x] 2026-11-10-16 Dive rows: duration above, depth below

Done in "Dive rows: duration above, depth below".

Spec: "Dive rows, duration above depth" (new). Mock-ups: `docs/mockups/android-carnet.dc.html` and the other Carnet-row mock-ups (updated).
- In the shared dive row component (Carnet, trip contents, selection, export, the dives of a statistic, tablet list), swap the right column: duration on top (16 sp, weight 500), maximum depth below (14 sp, `--od-on-surface-variant`).
- Same order in the accessible label of the row.
- Includes the branch `feature/carnet-month-headers` (task 14): apply it there too, without merging that branch.
- A line in the release notes.

## [x] 2026-11-10-17 Android tablet: screenshots of every screen, portrait and landscape (no code change)

Done in "docs: Android tablet screenshots, every screen in landscape and portrait" (test account logbook at Christian's request; sync states, empty logbook and no-account screen not captured, see the README).

Christian wants the Android tablet mock-ups redrawn to match what the app shows today, in portrait and in landscape. The canvas only has 7 old tablet boards. This task changes no code: it collects screenshots and facts for the design session.
- Use an Android tablet emulator (Pixel Tablet or similar, about 1280 × 800 dp), light theme, French, with the bundled sample log (never a personal log). Take each screen in landscape and in portrait.
- **Home screen first** (Carnet with its first dive open beside it), then every other screen of the tablet layout: Carnet search, selection and trip, dive detail (and its menu), edit, download and add, filter; Sites (list, site, map); Statistics (list and a result beside it); Tools (list and each tool beside it), planner; Account (signed in, no account); Settings and each sub-page; About; the sync states (offline, failure, conflict); the empty logbook.
- Save the images as PNG in `docs/screenshots/android-tablet/`, named `<nn>-<screen>-<landscape|portrait>.png` (`01-carnet-landscape.png`), at 1 dp = 1 px if possible (otherwise say the scale).
- Add `docs/screenshots/android-tablet/README.md`: one line per screen with its route, the layout in each orientation (rail width, list pane width, what the detail pane shows, any sheet or dialog), and anything that differs from the phone screen or from `docs/ui-specification.md` and `docs/system-design.md`.
- Commit the home screen pair first, in its own commit and push, so the design work can start; then the rest.
- Mark this task done when all screens are in.

## [x] 2026-11-10-18 First launch, redesigned (Android)

Done in "First launch redesigned on Android, every choice in view on a landscape tablet".

Spec: UI specification, section 4, "First launch, redesigned" (new). Mock-up: `docs/mockups/android-accueil-c.dc.html` (new; it replaces `android-accueil.dc.html`, which is no longer on the canvas). Component: `app/src/components/Welcome.svelte`.
- New layout: logo and "OpenDives" at the top, the large title "Votre carnet de plongée.", a full-width dive profile (water gradient, decorative), then the three choices at the bottom as pill buttons of decreasing weight (filled, outlined, text), each with its one-line consequence under it, and the centred link "Utiliser mon propre dépôt git".
- New, shorter texts (French and English keys): see the spec. Remove the old long descriptions if nothing else uses them.
- Colours through `--od-*` roles (filled button = primary; dark mode follows). Class names per System design, section 2 (`od-welcome`, `od-welcome--profile`, …).
- Android only; iPhone unchanged for now. Check it on a landscape tablet: all choices visible without scrolling (to-do #31).
- A line in the release notes.

## [x] 2026-11-10-19 Token help page: tabs per host

Done in "Token help page: one tab per host".

Spec: UI specification, section 4, item "Help page \"Comment créer un jeton d'accès\"", paragraph "Tabs" (new). Mock-up: `docs/mockups/git-jeton-aide-android.dc.html` (updated). Page: `app/src/pages/TokenHelp.svelte`.
- Replace the page menu (outlined buttons) and the per-host block titles by fixed Material 3 primary tabs under the top bar: GitHub, GitLab, Codeberg, equal widths, 48 dp, indicator under the active label.
- The page then shows the introduction, the card of the selected host only (note, steps, links), and the closing sentence. GitHub is selected on opening. Swiping sideways changes tab.
- Accessibility: `role="tablist"`, `role="tab"` with `aria-selected`, the card as `role="tabpanel"` labelled by its tab.
- Remove `tokenHelp.menu` if it is no longer used. A line in the release notes.

## [x] 2026-11-10-20 Android tablet: the screens not yet captured (no code change)

Follow-up to task 2026-11-10-17, same rules: tablet emulator, light theme, French, 1 dp = 1 px, PNG in `docs/screenshots/android-tablet/`, a line per screen in its README. This task changes no code.

**1. Does the app have a screen for each of these? Answer yes or no in the README, and capture the ones that exist, in landscape and in portrait:**
- 13 Carnet, offline with changes waiting (airplane mode after an edit is enough).
- 14 Sync failure: password refused, cloud unreachable, git repository refused (each one that can be produced without touching the real account's password: a test account or a wrong saved password on the emulator only).
- 15 Sync conflict dialog, one dive and several dives.
- 16 Empty logbook.
- 55 Account without an account ("Sans compte").
- 56 Sign out confirmation, and Delete account (the dialog only, never confirm).
- 57 Account in git mode.
- 75 First launch (`/welcome`), after task 2026-11-10-18.
If a state needs a broken network or a conflicting change, describe how you produced it. Never change or delete anything on the real cloud account; a conflict may only be made on the test account.

**2. Phone screenshots for the screens that have no phone mock-up yet** (Pixel phone size, portrait only, `docs/screenshots/android-phone/`, same naming and a README): 08 download, 10 new dive by hand, 12 a filter criterion (Combinaison), 25 sites without coordinates, 71 release notes, 72 licence, 73 privacy policy. The design session will draw the phone and tablet mock-ups from them.

Mark this task done when both parts are in.

Done: `docs/screenshots/android-tablet/` (README, section "States": every screen exists; how each state was produced) and `docs/screenshots/android-phone/` (README). Four bugs found while capturing were fixed and merged; two small ones remain, listed in the tablet README.

## [x] 2026-11-10-21 Account flow in the editorial layout (Android phone and tablet)

Spec: System design, section 8, "Editorial pages (account flow)" (new). Mock-ups: the 13 phone mock-ups and 6 tablet mock-ups it lists (`docs/mockups/`, updated or new). Pages: `AccountStep.svelte` and the account pages (`SignIn`, `CreateAccount`, `ConfirmCode`, `BringLogbook`, `GitRepository`).
- One shared layout component for these pages (for example `od-editorial-page`, with `--eyebrow`, `--title`, `--intro`, `--card`, `--actions`, `--profile` parts): bar with ✕ or ← only, eyebrow, large title, introduction, content in a white card, primary action as a full-width 56 dp pill, decorative profile.
- Tablet: landscape in two columns (heading left, card right), portrait in one 520 dp column, as in the tablet mock-ups.
- Git form: the note keeps only "Le jeton reste chiffré sur cet appareil." with no background (`gitRepo.note` shortened in both languages).
- No text or field changes otherwise. Android only; iPhone follows in a later task.
- A line in the release notes.

Done in `EditorialPage.svelte` (it replaces `AccountStep.svelte`) and `DecorativeProfile.svelte` (the profile, shared with first launch). One text added: the git page had no title, it takes the mock-up's "Votre propre dépôt." (`gitRepo.heading`). The full stop after a title is added by the layout; the texts are unchanged. Checked in the browser at phone and tablet sizes; iOS keeps its previous look until task 22.

## [x] 2026-11-10-22 Account flow in the editorial layout (iPhone)

Follows task 2026-11-10-21 (Android). Spec: System design, section 8, "Editorial pages (account flow)", item "iPhone" (new). Mock-ups: the 10 iPhone mock-ups it lists (`docs/mockups/`, updated).
- Same shared layout component as task 21, in its iOS look: navigation bar with "Annuler" or "‹ Retour" only (no title, transparent), eyebrow with the bar title and step, 34 pt title, 17 pt introduction, inset grouped sections with 20 pt corners, 56 pt capsule for the primary action, decorative profile above the actions.
- No text or field changes. A line in the release notes.

Done in `EditorialPage.svelte` (its iOS look) and the inset groups of `AccountField`, `BringLogbook` and `ImportProgress` (20 pt corners; the rows of AccountField now get their rounded corners, which a class name had lost). Checked in the browser with the iOS look; no iPhone build here.

## [x] 2026-11-10-23 First launch on an Android tablet, landscape and portrait

Follows task 2026-11-10-18. Spec: UI specification, section 4, "First launch, redesigned", paragraph "Tablet" (new). Mock-ups: `docs/mockups/android-tablette-premier-lancement-paysage.dc.html`, `docs/mockups/android-tablette-premier-lancement-portrait.dc.html` (new). Component: `app/src/components/Welcome.svelte`.
- Landscape: heading (logo row, title) on the left with the profile at the bottom from the left edge; the three choices and the git link in a 440 dp column on the right, centred vertically.
- Portrait: heading in a 520 dp centred column, the profile across the width, then the choices and the git link in a 440 dp column centred vertically in the space left.
- No scrolling in either orientation, on a small tablet too (to-do #32: check it, then tell Christian so the to-do can be removed).

Done in `feature/welcome-tablet`: tablet layouts (width from 768 px) in `WelcomeStart.svelte`, the old low-window rule now limited to phones; release note added.

## [x] 2026-11-10-24 Dive profile: cursor in the curve colour, curve buttons in their curve colour

Spec: UI specification, section 4, "Dive profile, cursor and curve buttons" (new). Mock-ups: `docs/mockups/detail3-android.dc.html`, `detail3-android-curseur.dc.html`, `detail3-android-sombre.dc.html` (updated). Component: `app/src/components/DiveProfile.svelte`.
- Cursor: remove the white outline; a 2 dp line in the profile curve colour, round caps.
- Curve buttons, selected: text and check in the colour of their curve (Température: `--od-tertiary` #2F6DB5 in light, #8AB4F8 in dark). Light mode: white background and a 1 dp border in that colour, for contrast. Dark mode: usual selected background. Unselected: unchanged.
- Colours as `--od-*` variables. A line in the release notes.
Done in `feature/profile-curve-colours`: cursor without halo (round caps); selected curve buttons coloured by curve (`--od-curve-chip-bg`, `--od-curve-chip-border-width` added); release note added.

## [x] 2026-11-10-25 Long totals of time in days and hours

Spec: System design, section 6, "Long totals of time" (new). Canvas note beside "30 · Statistiques · tablette Android".
- In `app/src/lib/format.js` (or wherever totals are formatted), a total of time under water from 24 h is shown as days and hours without minutes: "80 j 16 h" in French, "80 d 16 h" in English, from translation keys. Under 24 h: unchanged ("11 h 26").
- Applies to the statistics key figures, the "Par …" and "Mes statistiques" rows, the dives of a row (task 13 supporting line) and any other sum of durations. Single dive durations stay as they are.
- Unit tests for 23 h 59, 24 h, and a large total. A line in the release notes.

Done in `feature/long-time-totals`: `formatTotalTime` in `app/src/lib/format.js` (hours rounded down), used by every sum of durations; tests in `tests/app/total-time-format.test.mjs`.

## [x] 2026-11-10-26 About: tagline without "gratuit"

Spec: UI specification, section 1, "About" (updated). Mock-up: `docs/mockups/apropos-android.dc.html` (updated).
- `about.tagline`: French "Carnet de plongée libre, compatible avec les carnets Subsurface.", English "Open-source dive logbook, compatible with Subsurface logbooks.".
- Nothing else in the app mentions where free builds are found (to-do #34 decides it, outside the app).
- A line in the release notes.

Done in `about.tagline` (fr, en) and a release-notes line.

## [x] 2026-11-10-27 Android tablet in portrait: side menu instead of the rail

Spec: System design, section 7, "Android tablet in portrait: no rail" (new). Mock-ups: `docs/mockups/android-tablette-accueil-portrait.dc.html`, `docs/mockups/android-tablette-accueil-portrait-menu.dc.html` (new). Code: `app/src/lib/layout.svelte.js`, `App.svelte`, `NavRail.svelte`, `NavMenu.svelte`.
- New breakpoint for the rail: shown from about 1000 dp wide only. Below it (tablet in portrait), use the phone's ☰ and modal side menu, and the Carnet's floating "+" button.
- The list/detail split itself stays from 768 dp, as today: only the navigation changes.
- Check a foldable and window resizing: the navigation switches without restarting.
- A line in the release notes.

Done in feature/tablet-portrait-menu: `layout.rail` (from 1000 dp on Android, 768 dp on iPad), used by App.svelte, MenuButton, About, Settings, EditDive and the Carnet's floating "+".

## [x] 2026-11-10-28 Android tablet in portrait: "+" at the bottom right of the screen

Addition to task 2026-11-10-27. Spec: System design, section 7, "Android tablet in portrait: no rail" (updated). Mock-ups: the `android-tablette-*-portrait.dc.html` of the Carnet section (updated).
- In portrait, the Carnet's floating "+" sits at the bottom right of the whole screen, 24 dp from the edges, over the detail pane; scrims of sheets and dialogs cover it.

Done in feature/tablet-portrait-menu: the Carnet's floating "+" is fixed 24 dp from the bottom right of the screen when the list and detail are split and there is no rail.


## [x] 2026-11-10-29 Android tablet: "+" out of the rail in landscape, and the Expressive FAB menu

Spec: System design, section 7, "Android tablet in landscape: '+' out of the rail" (new) and "Add" (updated); section 8, "FAB menu (Android tablet)" (new). Mock-ups: `docs/mockups/android-tablette-ajout-paysage.dc.html`, `docs/mockups/android-tablette-ajout-portrait.dc.html` (new), and the `android-tablette-*-paysage.dc.html` of the Carnet section (updated: no "+" in the rail).
- Landscape: remove the "+" from the top of the rail. On the Carnet screens, show the same floating "+" as in portrait, at the bottom right of the screen, 24 dp from the edges.
- Tablet, landscape and portrait: the "+" opens the Material 3 Expressive FAB menu instead of the bottom sheet, with the three choices, spacing, close button, scrim and motion of section 8. Check the sizes against the Material library (FloatingActionButtonMenu) and keep our wider spacing: 16 dp between items, 24 dp above the close button.
- Respect "Remove animations": no motion.
- The phone keeps its bottom sheet for now.
- A line in the release notes.

Done in branch `feature/tablet-fab-menu`: `FabMenu.svelte` (Android tablet, from 768 dp), floating "+" on every tablet width, "+" removed from the rail.

## [ ] 2026-11-10-30 Android download: computers as cards, failure header, tablet details

The download screens were drawn from the current `Download.svelte`, then changed in review. Mock-ups (new or updated in `docs/mockups/`):
- phone: `android-telechargement-autorisation`, `-refusee`, `-desactive`, `-choix`, `-encours`, and `android-etat-echec`;
- tablet: `android-tablette-telechargement-{paysage,portrait}` (choice), `android-tablette-telechargement-encours-{paysage,portrait}`, `android-tablette-telechargement-echoue-{paysage,portrait}`.

Changes:
- **Computers as cards.** Each computer, remembered or nearby, is its own card: `--od-surface` white background, 16 dp corners, 12 dp × 16 dp padding, 8 dp between cards, 16 dp side margins. During the download, the connected computer is a card too. The "Tout retélécharger" switch row stays as it is.
- **Tablet in landscape:** the computer cards sit in two columns (one column in portrait and on the phone).
- **"Reçues jusqu'ici":** duration above depth, as in every dive row (task 16). Units follow the settings.
- **Failure header** ("… introuvable"): a 56 dp circle in a pale alarm tint (#FBE9E7 light; pick the dark equivalent from the alarm colour) with a 30 dp crossed-out Bluetooth icon in `--od-alarm`, then, to its right, the title and the sentence grouped, 4 dp apart, the icon vertically centred on the group. The sentence goes from 16 to 18 sp (line height 26).
- **Tablet:** the download pane has the ✕ close button, like on the phone (it currently has none). The "+" floating button is hidden while the download pane is shown: we are already in the task it opened, and it covered "Réessayer".
- The progress bar stays the standard linear one.
- **Computer icon in tertiary** (addendum): the round Bluetooth avatar of each computer card uses `--od-tertiary-container` as background and `--od-tertiary` for the icon, in the choice and during the download.
- **Connected computer card, tablet in landscape** (addendum, 11 November): during the download, the connected computer card is one column wide, like the cards of the choice screen (two columns), not the full pane width. Full width in portrait and on the phone. Mock-up: `android-tablette-telechargement-encours-paysage.dc.html`.
- A line in the release notes.

## [ ] 2026-11-11-31 Tablets: back arrow in the detail pane only when it has history

Spec: System design, section 7, "Back arrow in the detail pane, tablets" (new), and UI specification, "Dive detail on tablets, back arrow". Mock-ups: `docs/mockups/android-tablette-accueil-{paysage,portrait}.dc.html` (first screen, no ←), `docs/mockups/android-tablette-carnet-site-{paysage,portrait}.dc.html` (dive → site, with ←, new).
- Give the detail pane its own history, separate from the list. A row of the list replaces that history with one screen.
- First screen of the pane (dive, trip, statistic, tool opened from the list): no ←; ✎ and ⋮ stay on the right. This is the current behaviour, keep it.
- A screen opened from inside the pane (dive → site, trip → dive, statistic → dive, and so on): ← at the top left, 48 dp target. It goes back one screen in the pane only. The list, its scroll position and its selected row do not change.
- Android system back: the same as ← while the pane has history. At the pane's first screen, it does what it does on the list alone (Carnet: leave the app; another section: back to Carnet), never only clearing the selection.
- Tasks (edit, new site, download, add) keep ✕.
- Same rule in landscape (rail) and portrait (☰).
- iPad, when its layout is built: the secondary column shows the system back button "‹ <previous title>" only when it has history; the edge swipe goes back in that column.
- Tests for the pane history and system back. A line in the release notes.

## [x] 2026-11-11-32 Planner: oxygen and helium as dropdown menus — superseded by 2026-11-11-36, do not implement

Mock-up: `docs/mockups/android-planificateur.dc.html` (Gaz section).
- The "Oxygène" and "Hélium" fields of each gas become filled dropdown menus (MD3 exposed dropdown, read-only field), the same 56 dp size, label on top, value with its unit ("33 %", "0 %"), downward chevron on the right. Accessible name: "Gaz 1, oxygène : 33 %".
- Menu content: the usual mixes first, then "Autre valeur…" (`planner.gas.otherValue`), which opens the numeric keyboard on the same field (validation as today: whole number 0–100, oxygen plus helium at most 100). Oxygen: 21, 28, 32, 36, 40, 50, 80, 100. Helium: 0, 10, 20, 30, 35, 45, 55. A value outside the list (for example 33, read from the dive) shows in the field and is checked in the menu above the usual values.
- Wherever the planner shows these two fields: plan from a dive, new plan, phone and tablet. iOS: the same choice with a native pop-up menu when the iPhone planner is built.
- A line in the release notes.

## [x] 2026-11-11-33 Planner: bottom SAC and deco SAC, two fields

Mock-ups: `docs/mockups/android-planificateur.dc.html` (plan from a dive), `docs/mockups/android-planificateur-nouveau.dc.html` (new plan).
- The single "Consommation (SAC)" field becomes two dropdown fields side by side, under a small "Consommation (SAC)" heading: "Au fond" and "Pendant la déco". They feed the core's bottom SAC and deco SAC (the two values the planner settings already have).
- Plan from a dive: "Au fond" is the SAC measured on the dive (as today); "Pendant la déco" comes from the planner settings. Helper: "Au fond : mesurée pendant la plongée. Pendant la déco : d’après les réglages du planificateur."
- New plan: both come from the planner settings. Helper: "D’après les réglages du planificateur."
- Values in the diver's volume unit per minute. Downward chevrons, not triangles. Accessible names give the full label and unit.
- Check that the plan uses the deco SAC for the ascent and stops (planner tests: a case where the two SACs differ).
- A line in the release notes.

Done in `Planner.svelte` (two SAC dropdowns with chevrons, accessible names with the unit in words), `planner.svelte.js` (the plan's own `decoSacMlMin`, sent with each request and kept with a saved plan) and `SelectField` (`chevron`, `ariaLabel`). The core already took `decoSacMlMin`; `tests/plan_test.cpp` now checks that a higher deco SAC keeps the runtime and breathes more gas, and `tests/app/planner.test.mjs` that the request carries both SACs.

## [x] 2026-11-11-34 Planner, new plan: empty profile thumbnail instead of "+"

Mock-ups: `docs/mockups/android-planificateur-nouveau.dc.html` and `docs/mockups/android-tablette-planificateur-{paysage,portrait}.dc.html` (these copies also carry the gas dropdowns of task 32 and the two SAC fields of task 33).
- In the "Nouvelle plongée · Sans plongée de départ" card, the "+" icon suggested adding something. Replace it with an empty thumbnail: in the same 56 × 36 dp slot as a starting dive's profile thumbnail, the outline of a dive profile in a dashed grey line (`--od-outline`, 1.5 dp, dashes of 3 dp). Decorative, hidden from screen readers. "Changer" stays.
- **No second line** (addendum, 11 November): the card shows only "Nouvelle plongée"; remove "Sans plongée de départ", which repeated the title.
- A line in the release notes.

Done in `Planner.svelte` (`od-planner--empty-thumbnail`, 56 × 36 dp, dashed `--od-outline` outline, aria-hidden) and `theme.css` (`--od-outline`, also in System design section 3).

## [x] 2026-11-11-35 Planner: altitude as a dropdown menu — superseded by 2026-11-11-36, do not implement

Mock-ups: `docs/mockups/android-planificateur{,-nouveau,-menu}.dc.html`, `docs/mockups/android-tablette-planificateur-{paysage,portrait}.dc.html` (Conditions section).
- The "Altitude" field becomes a filled dropdown menu like the gas fields of task 32: same 56 dp size, value with its unit ("0 ft"), downward chevron. Accessible name: "Altitude : 0 ft".
- Menu content, in the diver's depth unit: feet 0, 1 000, 2 000, 3 000, 5 000, 7 000, 10 000; metres 0, 300, 600, 1 000, 1 500, 2 000, 3 000; then "Autre valeur…" (same key as task 32), which opens the numeric keyboard on the field. A value outside the list (for example read from a dive) shows in the field and is checked in the menu above the usual values.
- Every planner screen, phone and tablet.
- A line in the release notes.

## [x] 2026-11-11-36 Planner: gases, SAC and altitude as wheels

Replaces tasks 32 and 35 (dropdowns, not to be built) and the dropdown form of task 33 (its two SAC values and their sources stay). Mock-up: `docs/mockups/android-planificateur-roulettes.dc.html` (plan from a dive). Apply the same fields to every planner screen: new plan, phone and tablet.
- **Wheel field** (new shared component, `od-wheel-field`): a filled field 56 dp high, the label on the left (12 sp, `--od-on-surface-variant`, may wrap to two lines), then a narrow vertical wheel: the current value in the middle (20 sp, weight 600, tabular figures) between two thin lines, the previous and next values above and below (13 sp, variant colour), fading out at the top and bottom edges; then the unit, when it is not in the heading.
- **Behaviour:** a vertical drag or fling turns the wheel and snaps to a value, with a light haptic tick per step. A tap on the current value opens the numeric keyboard to type a value directly (same validation as today). Accessibility: role spinbutton with min, max and value text including the unit; TalkBack swipe up/down and volume keys step the value; the label is the accessible name.
- **Fields and steps:**
  - Oxygène and Hélium, side by side, unit %: oxygen step 1 (5 to 100), helium step 5 (0 to 95); oxygen plus helium at most 100.
  - "Consommation (SAC), en cuft/min" heading (or the diver's volume unit per minute), then "Au fond" and "Pendant la déco" side by side, step 0.01 cuft/min (or 0.5 l/min). Helper text unchanged.
  - Altitude, next to the water type, unit ft or m: step 500 ft (or 100 m), 0 to the core's maximum.
- Values read from a dive that fall between steps (for example 33 % oxygen with a 1 % step is fine; 0,355 SAC) show as they are, and the next turn snaps to the nearest step.
- Add `od-wheel-field` to System design, section 8 (shared components), in the same commit.
- A line in the release notes.

Done in `WheelField.svelte` (`od-wheel-field`), `wheel-rules.js` (steps, snapping, clamping, fling), `Planner.svelte` (gases, the two SACs and altitude as wheels; the planner's vertical rhythm set to the mock-up's) and System design sections 3 and 8. The haptic tick uses `navigator.vibrate` where it exists (Capacitor Haptics is not a dependency).

## [ ] 2026-11-11-37 Planner: a title when saving a new plan, then back to the list

Mock-ups: `docs/mockups/android-planificateur-titre.dc.html` (dialog), `docs/mockups/android-plans-enregistre.dc.html` (list after saving).
- **Title dialog.** On a new plan, "Enregistrer" opens an MD3 basic dialog "Enregistrer le plan" with one filled text field "Titre", focused with the keyboard open, and the buttons "Annuler" (closes, nothing saved) and "Enregistrer". No helper text. A reopened plan saves without the dialog, as today (it keeps its title).
- **Default value:** a plan started from a logbook dive pre-fills the title with that dive's site name (editable). A plan without a starting dive starts empty.
- **Empty title:** allowed. The list then shows "Plan du <date>" (for example "Plan du 9 nov. 2026"), in the variant text colour.
- **After saving:** back to "Plongées planifiées". The new plan's row is highlighted with `--od-surface-container-high` for about 2 s, then fades; the list scrolls to it if needed. Snackbar "Plan enregistré" (no action); the "Nouveau plan" FAB moves up above the snackbar while it shows.
- **List rows** show the title in place of the site ("Sans plongée de départ" is no longer shown).
- **Storage: Wait.** The core has no title field on a dive. Before writing anything, check what Subsurface desktop shows and keeps for a planned dive, and report the options to Christian in the chat with what each one does in Subsurface: (a) the dive's location / site (creates a site), (b) the first line of the notes (Subsurface's planner already writes its plan into the notes), (c) a tag, (d) anything better you find. The design session leans towards the notes, without certainty. Never break a log read by Subsurface.
- Release notes line once built.
