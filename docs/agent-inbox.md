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

## [ ] 2026-11-06-12 Full editing and settings, conditions switch

Bring the edit screen and Settings to `docs/mockups/android-edition.dc.html` and `android-reglages.dc.html` (section 4, "Full editing and settings" and "Conditions"). Editing shows rating, visibility and current as stars; the Settings switch "Houle, ressac et froid" ("Wave size, surge and chill"), off by default, adds the three others. Store the switch as a device setting. The detail still shows filled-in conditions whatever the switch.

## [ ] 2026-11-06-13 Trip screen

Build the trip screen from `docs/mockups/voyage-android.dc.html` and section 4, "Trip". Automatic trips have no stable identifier: never store one.

## [ ] 2026-11-06-14 Sites screens

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
