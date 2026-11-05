# Android application skeleton

**Goal:** check that the application runs on a real phone and shows dives read by the unmodified Subsurface C++ core, in git format. This is not the final interface.

**Result (5 November 2026):** the criterion is met on a Pixel 10 Pro XL running Android 17. The 29 dives of `SampleDivesV2.ssrf` are displayed, and a second launch reads them back from git.

## What works

- **Application:** Capacitor 7, Svelte 5, Framework7 v9 and Vite, in JavaScript with JSDoc. The automatic theme gives the Material look on Android. A single screen: the logbook, grouped by trip.
- **Core:** the 69 files of the POC, built for `arm64-v8a` and `x86_64`. The Subsurface submodule has no modifications.
- **`OpenDivesCore` plugin (Kotlin + JNI):**
  - `importSample()` saves the sample as a git repository with `parse_file` then `save_dives("<path>[main]")`.
  - `listDives()` reads this repository back with `parse_file` and returns the JSON.
  - The core runs on a single dedicated thread.

## Checks performed

| Check | Result |
| --- | --- |
| First launch (phone log) | Repository missing, 29 dives saved, then 29 read back |
| Second launch after a force stop | Repository present, 29 dives read back, no import |
| Repository copied from the phone to the development machine | `git fsck` without errors; 1 commit |
| Comparison with the same import done on the development machine | Identical git tree (`9ed06c7`) |
| Reading the copy with the POC program | 29 dives, 16 sites, 4 trips; XML export identical to the development machine's |
| Round-trip test under WSL (development machine) | 97 passed, 1 known failure (`TestDiveSeabearNewFormat.xml`) |

The `x86_64` application was built and bundled, but not launched on an emulator.

## Sizes

| Item | Size |
| --- | --- |
| Debug APK, two architectures | 12.9 MB (12,949,731 bytes) |
| Debug APK, `arm64-v8a` only | 8.8 MB (8,808,203 bytes) |
| `libopendives.so`, `arm64-v8a` | 4.1 MB (4,103,240 bytes) |
| `libopendives.so`, `x86_64` | 4.1 MB (4,137,944 bytes) |
| JavaScript, then CSS (uncompressed) | 897 KB, then 505 KB |
| Bundled sample log (uncompressed) | 1.7 MB |

The libraries already contain all dependencies, except the system zlib. No release APK has been produced: it will be smaller.

## Problems encountered

- **libgit2 and the NDK:** libgit2 forces `-std=c90`, where the NDK headers do not know `inline`. Fixed with `-Dinline=__inline__` in `native/build-deps.sh`, without touching its sources.
- **Vite and the local plugin:** since the plugin is a link to `../plugins`, Vite could not find `@capacitor/core`. Fixed with `resolve.dedupe`.
- **Java:** Android Studio 2026.2 bundles Java 25. Builds are run with a JDK 21, as Capacitor 7 requires. In Android Studio, this JDK must be selected as the "Gradle JDK".
- **Two-stage build:** libdivecomputer uses autotools. The native part is therefore built under WSL and the APK under Windows. Gradle does not rebuild the native part: rerun `native/build-android.sh` if the C++ changes.
- **Minimum API:** it goes from 23 (Capacitor's value) to 24, the native part's.

## Worth knowing for later

- **Commit author:** commits are signed "Subsurface", the core's default behaviour, whereas the architecture calls for "OpenDives". Nothing is set up for this yet.
- **Error message on save:** the core writes `origin lookup failed` for a repository without a remote, and the save still succeeds. Local mode will have to avoid showing this message.
- **`HEAD` branch:** `git_create_local_repo` leaves `HEAD` on `master`, with no commit, whereas the data is on `main`. This is Subsurface's code, and the core does read `main`.
- **Trips on screen:** the file declares 4, but it also enables automatic grouping. `listDives` therefore returns 6, with 5 different names, because two isolated dives each form an automatic trip. The location "Hoodsport" appears twice, because these are two separate trips.
- **Trip identifiers:** they change on every load and must not be stored.
- **Screen:** the time and the status bar icons, in white, are hard to read on the light background. Values are written "4.1 m", not "4,1 m" (French format). To be revisited with the real interface.
- **Application identifier:** `org.opendives.app` is provisional, to be confirmed before any release.
- **Outside this skeleton:** iOS, download from a dive computer, editing dives, upload to the cloud.

## Read-only Subsurface cloud (5 November 2026)

**Result:** on the same phone, the app reads the log of a development account: 1,353 dives, on `ssrf-cloud-eu.subsurface-divelog.org`.

| Situation | Result |
| --- | --- |
| First launch: clone by the core | 1,353 dives displayed; 3.7 s in native code, from the probe to the JSON |
| Following launches: cache update | 1,353 dives, `synced=true`, 4.0 to 5.4 s |
| Transient network error ("Software caused connection abort") | Before the fix: failure. Since then: the local copy is read |
| Offline with cache (on the development machine, without network) | 1,353 dives, `synced=false`, reason displayed |
| Offline without cache (on the development machine) | Clear error, nothing is created |
| Phone cache and server, before and after | Same head, `89a1e6a`: nothing was pushed |

**How it works:**

- **Network:**
  - libgit2 is built with HTTPS through OpenSSL 3.4.4, the version Subsurface uses on Android.
  - The server check (`canReachCloudServer`) reuses `https_openssl.cpp`, already tested under Linux.
- **Certificates:** Android does not provide a certificate file readable by OpenSSL.
  - At launch, the plugin exports the system's trusted authorities (`AndroidCAStore`) as PEM: 120 on this phone.
  - This file is handed to libgit2 and to the server check.
- **Façade:** `cloud_list_dives()` chains the following steps.
  1. Read-only probe of the branch. If the branch is missing on the server, the façade refuses to load, because the core would create it by pushing.
  2. Load by the core.
  3. Copy of the log's settings (`apply_log_prefs`).
  4. Production of the JSON.
  - If the server does not respond, the façade reads the local copy with `git_local_only`, like Subsurface when offline.
- **Writes:** the app never saves into the cloud cache. So nothing can be pushed.

**Credentials: TEMPORARY development solution.** The plugin reads `files/cloud-dev.env`, in the app's private storage. This file is neither in the APK nor in git, and the password is never logged. Without this file, the app falls back to the sample log. The real sign-in screen, with the Android keystore, remains to be done.

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
# install (the file is read on the development machine, never displayed)
Get-Content -Raw "$env:USERPROFILE\.opendives\cloud-dev.env" | & $adb shell "run-as org.opendives.app sh -c 'umask 077; cat > files/cloud-dev.env'"
# remove
& $adb shell "run-as org.opendives.app rm files/cloud-dev.env"
```

**Deviations from the architecture:** the server check uses OpenSSL in native code rather than Android's network stack. It therefore does not follow the system proxy, which must be revisited with the sign-in screen. The list of 1,353 dives is rendered in one block, without a virtual list.

## Logbook and Dive detail (5 November 2026)

First real screens, following `docs/specification-interface.md`, checked on the Pixel 10 Pro XL with the sample log and the cloud log (1,353 dives, read-only).

| Logbook (sample log) | Detail, cursor placed |
| --- | --- |
| ![Logbook](captures/carnet.png) | ![Detail](captures/detail.png) |

The screenshots come from the Subsurface sample log, never from a personal log.

**What works:**

- **Façade:**
  - `list_dives` gives, for each dive, an identifier, a thumbnail of about 40 points (time and depth) and the trip.
  - `get_dive` returns the facts, the cylinders and gases, the gas changes, the buddies, the suit, the tags, the notes and the dive computer. The profile is computed by the core (`create_plot_info_new`), with the cylinder breathed, the ppO2 and the ceiling if there is one.
  - `get_prefs` gives the log's units, one per quantity.
- **Theme:**
  - The `--od-*` color tokens are declared, in light and dark.
  - `colors.primary` is `#1E4D3A`, with cream backgrounds in light mode.
  - The CSS is organised in layers: `framework7`, `od.tokens`, `od.base`, `od.components`.
  - The `--f7-*` overrides stay outside any layer, otherwise the colors Framework7 injects at startup would override them. They were checked in the WebView: primary is #1e4d3a in light and #8fcfae in dark.
- **Components:** `<ProfileThumbnail>`, `<DiveRow>`, `<TripRow>`, `<DiveProfile>` (water column, finger cursor, Gas layer) and `<SyncStatus>`, plus icons drawn for the project.
- **Logbook:**
  - List from newest to oldest, collapsed trips that expand with a tap.
  - Search on site, trip, number or date.
  - Sync status: cloud, offline or device only.
  - "+" button opening the three choices, with no action for now.
  - Greyed-out rows while loading; empty and error states.
- **Detail:**
  - Profile, facts, cylinders and gases.
  - Buddies and tags in two separate blocks, then notes.
  - "Plan from this dive" in mandarin, with no action for now.
- **Navigation:**
  - Bottom bar with four sections; Sites, Statistics and Tools are empty.
  - The Android Back key closes a sheet, goes back to the previous screen or to the Logbook, then sends the app to the background (`@capacitor/app` plugin, MIT).
- **Numbers and units:**
  - The format follows the device language: in French, « 4,1 m », « 11,5 l/min », « 1er juin 2013 ».
  - Each quantity follows the log's setting: feet and °C in the cloud log, metres in the sample log.
  - An unknown depth (0) is not displayed.

**Checks performed on the phone:**

| Check | Result |
| --- | --- |
| Light | Compliant |
| Dark | System surfaces and dark fir green compliant. **Water column and trace: see "To be decided"** |
| Text at 200% | Text grows without overlapping. The four labels of the bottom bar fit: in French the tab shows « Statistiques » when there is room, « Stats » otherwise, and adjusts without restarting the app (`<AdaptiveLabel>`). Changing the text size does restart the Android screen, however, and so reloads the logbook. The profile's tick labels stay small |
| TalkBack (accessibility tree captured with uiautomator) | Each row is read "site, date, maximum depth, duration". Profile and thumbnails have alternative text, the Gas chip is a toggle button, "+" and Back have a name, and no icon name is read. TalkBack itself was not turned on |
| Sample log, cloud log | Both are displayed, with their respective units |

**Problems encountered and fixed:**

- **Framework7 icons read aloud:** they are font ligatures inserted by CSS, and TalkBack read "chevron_right". They now get empty alternative text (`content: … / ''`).
- **`Fab` component of framework7-svelte 9:** it calls `onclick` twice and leaves the link without a name. The "+" button is therefore written by hand.
- **Previous page still readable:** Framework7 keeps the previous page in the document, and TalkBack could go there. It now gets `inert`.
- **Back link:** in MD3, Framework7 hides its text, and it was read "#". It is replaced by a link named "back to the logbook" (« Retour au carnet » in French).
- **Android Back key:** it closed the application. It is now wired to the router.
- **Transient Capacitor error:** "Cannot read properties of undefined (reading 'triggerEvent')" appears once, on the first launch after a reinstall. It comes from Capacitor, not from OpenDives.

**Languages (rule of 5 November 2026):**

- **Catalogs:** no visible text is hard-coded. Each text has a key in `src/i18n/fr.json` (reference) and `src/i18n/en.json`; both have 87 keys, and a check verifies that they are identical.
- **Language:** `src/lib/i18n.js` picks the first translated language of the device, with English as the fallback. Plurals go through `Intl.PluralRules` (in French, « 1 plongée », « 27 plongées »).
- **Formats:** numbers and dates follow the device language, and units come from the catalog (« pi » in French, "ft" in English).
- **Diver data:** site names, notes, tags and gas names given by the core are not translated.
- **Check:** English was checked on the phone with Android's per-app language (`cmd locale set-app-locales`), without changing the phone's language.
- **Still to do:** the language setting inside the app does not exist yet.

**To be decided (specification):**

- **Water column in dark mode (theme under revision with Claude Desktop):** in dark mode, the two fir-green color tokens (#8FCFAE and #BFD9CB) are two light greens.
  - The gradient barely encodes depth any more: a dive to 91 feet looks like a dive to 48 feet.
  - The profile trace color token (#EAF5EF) on this background has a contrast of about 1.3:1 to 1.6:1, below the 3:1 expected for a graph.
  - The thumbnail background disappears on the dark surface.
- **Already open in the specification:** Alarm and Waiting colors in dark mode (the light values are kept in the meantime), distinguishing oxygen from fir green.

**What is missing:**

- Ceiling, ppO2 and Tissues layers; full-screen profile in landscape.
- Tablet layout.
- iOS rendering, which could not be seen.
- Actions of the "+" button and of the planner.
- Virtual list: the 1,353 dives are rendered in one block.
- `svelte-check` in continuous integration: a `jsconfig.json` was added for the editor, but it still reports typing errors in the framework7-svelte components.

**Sizes:** debug APK of 27.7 MB (two architectures). `libopendives.so` is 9.3 MB on arm64 and 9.6 MB on x86_64, OpenSSL included.

## Reproduce

The commands are in [AGENTS.md](../AGENTS.md#commands).
