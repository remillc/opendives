# AGENTS.md — OpenDives

Instructions for coding agents (Claude Code and others) working in this repository.

**Language rule:** all code, comments, identifiers, commit messages and documentation in this repository are written in **English**. The app's user-visible texts are the exception: they live in the translation files (`app/src/i18n/fr.json`, `en.json`). Conversations with the project owner are in French.

## The project

OpenDives is a full dive log app for mobile. It improves on Subsurface-mobile, but it is not a mere companion to the desktop app. It runs on iPhone, Android phones and tablets (iPad and Android) from the first version.

- **Data:** the Subsurface cloud (git repositories on `ssrf-cloud-*.subsurface-divelog.org`) is **the only synchronised data source**. We connect to it; we do not replace it. No other providers.
- **GeoNames and divelogs.de** work as in Subsurface: one-off import or upload, no synchronisation.
- **Local mode** without an account is supported.
- **Photos** stay on the device.
- **Coexistence:** desktop Subsurface reads and writes the same cloud log; never do anything that breaks a log read by Subsurface. Subsurface-mobile is left out of our reasoning (decided on 8 November 2026): it is neither a reference nor a case to handle.
- **Subsurface maintainers:** no contact for now.

## Tech stack (decided)

- **App:** Capacitor (hybrid).
- **Web layer:** Svelte 5 + Framework7 v9, in **JavaScript with JSDoc**. No TypeScript.
- **Business logic:** Subsurface's C++ core, reused as is, plus libdivecomputer. It is exposed to the web layer by a native Capacitor plugin (Swift / Kotlin + JNI).
- **Offline maps:** self-hosted PMTiles built from OpenStreetMap data.

## Golden rule: Subsurface is never modified

- `third_party/subsurface` is a **pinned submodule**. None of its files are modified. To follow Subsurface, change the pinned commit, then rerun the tests.
- Everything OpenDives adds to build that code goes in `core/compat/`:
  - fake Qt headers (`qtshim/`);
  - replacement headers (`shadow/`, found through `-iquote`);
  - rewritten helper functions (`*_compat.cpp`).
- A patch in `patches/` is only for unavoidable cases and must be justified.
- Anything that touches written data (git format, XML, coordinates) is ported **exactly** from Subsurface. Unknown data is preserved as is.

## User interface

- **Reference for coding the UI:** `docs/system-design.md` (principles, CSS naming, colours, type, layout, shared components, states) and `docs/ui-specification.md` (each screen, core data). They take precedence over the mock-ups. These UI documents exist only here, in English (their old French versions on claude.ai were abandoned on 10 November 2026).
- **iPhone and iPad:** iOS conventions (Human Interface Guidelines).
- **Android:** **standard Material Design 3**, not Expressive.
- **Tablets:** an iOS variant and an Android variant.
- **No UI patterns or features typical of AI agents:** no chat assistant, no "magic" summary, no sparkle button, etc.
- **Do not copy Subsurface-mobile's screens:** they are its main weakness.
- **Languages:** multilingual from the start, French and English. No hard-coded visible text: one key per text, translations in `app/src/i18n/fr.json` and `en.json`; the language follows the device, English is the fallback. The diver's own data is never translated.
- **CSS names:** every component carries a class that names it, prefixed `od-`, in kebab case (`od-coordinate-field`); a part adds a `--` suffix (`od-coordinate-field--drag-handle`). See docs/system-design.md, section 2.
- **Colours:** declared as `--od-*` variables, never hard-coded in a component. The chosen theme is finalist 3: black and white, colour allowed sparingly within WCAG 2.2 AA contrast and never as the only carrier of meaning (neutral light UI, ink #1F2124, strong contrast, sans-serif titles; the dive profile's water column goes from sand #FBE3B2 to rust #B4530F by depth; in dark mode honey #E5B961 to amber #EF7625). Values for light and dark are in docs/system-design.md, section 3. The debug theme picker can be removed. Meaning colours stay common: alarm, oxygen, pending.
- **Filters:** on almost every field of a dive, gear included (full list in the specification).
  - Dive mode (open circuit or rebreather) is shown first.
  - Never offered: weight and weight type, start and end pressures, water density, nitrogen percentage.
  - Other gear goes through tags.
  - Statistics apply to the filtered results.
- **Statistics tab:** opens on precompiled statistics with a "Free filter" button. Examples: number of dives per buddy, dive hours per suit.
- **First launch:** three choices (existing account, create an account, no account), each with its consequence written out; "no account" means the log stays on the device, with an upload possible later.
- **Units:** each measure is set separately (depth, temperature, pressure, volume, weight), like Subsurface's "personalised" mode.
- **Planner:** can start from a dive in the log (gases, measured SAC). Results are volumes per gas; when the diver gives the volume carried for a gas and it is too little, the total is shown in the alarm colour. Saved plans are planned dives of the logbook, listed by the planner only.
- **States to build:** empty log, failed download, offline with pending changes, sync conflict (version choice: to be confirmed, an OpenDives addition).
- **Log screen:** no permanent Download button; a "+" button opens download, import or manual entry.
- **Navigation (decided on 6 November 2026):** no bottom bar on phones, on iOS or Android. A top bar with a ☰ button opens a side menu (Logbook, Sites, Statistics, Tools, then Account and Settings); see docs/system-design.md, section 7. Tablets keep the iPad sidebar and the Android navigation rail.
- **divelogs.de:** one-off import of the log when creating an account; divelogs.de credentials are never stored.
- **Scope of v1:** every function rated "essential" and "adapted", plus every mobile novelty (rating in the reverse-engineering document).

## Repository layout

```
AGENTS.md                 this file
app/                      Capacitor app (Svelte 5, Framework7) + report (README.md)
plugins/opendives-core/   local Capacitor plugin: JSDoc contract, Kotlin, JNI
core/compat/              OpenDives additions to build Subsurface's core without Qt
core/libopendives/        C++ facade over the core
native/                   Android build of the core and its dependencies
poc/                      proof of concept: build.sh + report (README.md)
tests/                    roundtrip.cpp, run-roundtrip.sh, facade.cpp, plan_test.cpp, plan_oracle.cpp,
                          release-check.sh (the release lock), app/ (node:test), android/, e2e/
third_party/subsurface/   pinned Subsurface submodule (+ its libdivecomputer submodule)
docs/                     design documents
site/                     public web pages built from the app's files (privacy policy) + README
```

## Commands

On Linux or WSL; dependencies are listed at the top of `poc/build.sh`.

```sh
git submodule update --init third_party/subsurface
git -C third_party/subsurface submodule update --init libdivecomputer
poc/build.sh                      # builds the core + build/poc/{roundtrip,facade}
tests/run-roundtrip.sh build/poc/roundtrip build/rt \
  third_party/subsurface/dives/*.xml third_party/subsurface/dives/*.ssrf
```

The expected result is **97 passed, 1 known failure** (`TestDiveSeabearNewFormat.xml`), explained in `poc/README.md`. Any new regression must be fixed before delivering.

### Android app

The native code is built under WSL with the Linux NDK; `cmake`, `ninja-build` and `unzip` are also needed. Output goes to `build/android/`, never into git.

```sh
native/install-ndk.sh             # once: installs the NDK under ~
native/build-android.sh           # dependencies + libopendives.so (arm64-v8a and x86_64)
```

The APK is then built on Windows, in PowerShell, with **JDK 21** (not Android Studio's) and SDK API 35:

```powershell
cd app
npm ci
npm run android:sync
cd android
$env:JAVA_HOME = "C:\Program Files\Java\jdk-21"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
.\gradlew.bat assembleDebug
& "$env:ANDROID_HOME\platform-tools\adb.exe" install -r app\build\outputs\apk\debug\app-debug.apk
```

Gradle does not rebuild the native code: rerun `native/build-android.sh` when the C++ changes. Report: `app/README.md`.

## Conventions

- The app is versioned with Semantic Versioning 2.0.0: `MAJOR.MINOR.PATCH`, with an optional pre-release such as `0.2.0-beta.1`. The current version is **0.2.0**. Its one source is `app/package.json`: Android `versionName`, iOS `CFBundleShortVersionString` and the web build read it. Build numbers (`versionCode`, `CFBundleVersion`) are internal and only increase.
- Each release updates `CHANGELOG.md` at the root (Keep a Changelog: Added, Changed, Fixed, in detail), creates the tag `vX.Y.Z` on `main` and a GitHub release with those notes and the APK attached.
- **Release lock (planner calculations): no tag without a green report for that commit.** On the commit to release, with the working tree clean, run `tests/release-check.sh` (about 7 minutes with the builds warm, much longer from a clean tree; needs the emulator `emulator-5554` on the test account, the NDK, JDK 21, and the app's `npm ci`). It checks: the 17 cases of Subsurface's `testplan.cpp` through the façade (the ones the façade cannot express are listed in its output), an independent ZH-L16C checker over 360 plans, the app chain (units, request, displayed values, alarms), that wrong inputs make each of them fail, the same programs compiled with the NDK and run on the emulator, and the planner scenarios in the real app. It writes `build/release-check/report-<commit>.json`, tied to the commit and to the pinned Subsurface commit. Before tagging, `tests/release-check.sh --verify` must print GREEN; attach the report to the GitHub release. Changing the Subsurface pin or any planner code means a new report.
- **Changing a reference value** in these tests (`tests/plan_test.cpp`, `tests/plan_oracle.cpp`, `tests/app/`, `tests/e2e/`) needs a commit that says why: what moved, by how much, and what justifies the new value. A value or a tolerance is never changed to make a test pass; a test that fails is a discrepancy to explain.
- Release notes (About → Nouveautés, `about.releaseNotes` in `app/src/i18n/fr.json` and `en.json`) describe the current version. Every change a user can see adds or updates a line there in the same commit; a new version starts a new list.
- Addresses, in the app's routes and on the public site: a resource has no trailing slash (`/about`, `/dive/42`, `/site/7/edit`; on the site, `/fr/privacy`); a collection has one (`/sites/`, `/tools/`, `/settings/`, `/statistics/`; on the site, each language: `/fr/`, `/en/`); the home page is `/`.
- Branch names always start with a prefix that says what the branch is for: `feature/...`, `fix/...`, `release/1.0.0`, and so on.
- One branch per problem or task, created from `main` before its first change. `main` is the integration branch; branches are merged into it when Christian asks.
- Every commit is pushed right away (`git push`, or `git push -u origin <branch>` for a new branch); so is every merge.
- Commit messages in English, imperative mood, short summary line.
- Author of every commit: Christian Rémillard. No `Co-Authored-By` or `Claude-Session` line in commit messages.
- Code files taken from or derived from Subsurface: `SPDX-License-Identifier: GPL-2.0` header. OpenDives is GPLv2 because it reuses Subsurface's core.
- Never commit Subsurface cloud credentials or a personal dive log.
- Existing French comments and documentation are translated to English when the file is next touched.

## Agent inbox

Decisions and tasks from the design sessions on claude.ai arrive in `docs/agent-inbox.md`. Do its open tasks in order, following its rules, and mark each one done in the same commit as its work. A task marked **Wait** waits for Christian's go-ahead in the chat. The mock-ups the tasks refer to are copied in `docs/mockups/`.
