# AGENTS.md — OpenDives

Instructions for coding agents (Claude Code and others) working in this repository.

**Language rule:** all code, comments, identifiers, commit messages and documentation in this repository are written in **English**. The app's user-visible texts are the exception: they live in the translation files (`app/src/i18n/fr.json`, `en.json`). Conversations with the project owner are in French.

## The project

OpenDives is a full dive log app for mobile. It improves on Subsurface-mobile, but it is not a mere companion to the desktop app. It runs on iPhone, Android phones and tablets (iPad and Android) from the first version.

- **Data:** the Subsurface cloud (git repositories on `ssrf-cloud-*.subsurface-divelog.org`) is **the only synchronised data source**. We connect to it; we do not replace it. No other providers.
- **GeoNames and divelogs.de** work as in Subsurface: one-off import or upload, no synchronisation.
- **Local mode** without an account is supported.
- **Photos** stay on the device.
- **Coexistence:** Subsurface-mobile may be installed on the same phone with the same account. The rules are in the architecture document; never do anything that breaks a log read by Subsurface.
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

- **Reference for coding the UI:** `docs/ui-specification.md` (colours, texts, components, screens, core data). It takes precedence over the mock-ups. The design documents in `docs/` are in English; their French originals are kept on claude.ai, and a change there must be carried over here in English.
- **iPhone and iPad:** iOS conventions (Human Interface Guidelines).
- **Android:** **standard Material Design 3**, not Expressive.
- **Tablets:** an iOS variant and an Android variant.
- **No UI patterns or features typical of AI agents:** no chat assistant, no "magic" summary, no sparkle button, etc.
- **Do not copy Subsurface-mobile's screens:** they are its main weakness.
- **Languages:** multilingual from the start, French and English. No hard-coded visible text: one key per text, translations in `app/src/i18n/fr.json` and `en.json`; the language follows the device, English is the fallback. The diver's own data is never translated.
- **Colours:** declared as `--od-*` variables, never hard-coded in a component. The chosen theme is finalist 3: black and white, colour reserved for data (neutral light UI, ink #1F2124, strong contrast, sans-serif titles; only the dive profile's water column is coloured, sand #FBE3B2 to rust #B4530F by depth; in dark mode honey #E5B961 to amber #EF7625). Values for light and dark are in docs/ui-specification.md, section 1. The debug theme picker can be removed. Meaning colours stay common: alarm, oxygen, pending.
- **Filters:** on almost every field of a dive, gear included (full list in the specification).
  - Dive mode (open circuit or rebreather) is shown first.
  - Never offered: weight and weight type, start and end pressures, water density, nitrogen percentage.
  - Other gear goes through tags.
  - Statistics apply to the filtered results.
- **Statistics tab:** opens on precompiled statistics with a "Free filter" button. Examples: number of dives per buddy, dive hours per suit.
- **First launch:** three choices (existing account, create an account, no account), each with its consequence written out; "no account" means the log stays on the device, with an upload possible later.
- **Units:** each measure is set separately (depth, temperature, pressure, volume, weight), like Subsurface's "personalised" mode.
- **Planner:** can start from a dive in the log (gas, cylinder, start pressure, measured SAC); an insufficient reserve is shown in the alarm colour.
- **States to build:** empty log, failed download, offline with pending changes, sync conflict (version choice: to be confirmed, an OpenDives addition).
- **Log screen:** no permanent Download button; a "+" button opens download, import or manual entry.
- **Navigation (decided on 6 November 2026):** no bottom bar on phones, on iOS or Android. A top bar with a ☰ button opens a side menu (Logbook, Sites, Statistics, Tools, then Account and Settings); see docs/ui-specification.md, section 3. Tablets keep the iPad sidebar and the Android navigation rail.
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
tests/                    roundtrip.cpp, run-roundtrip.sh, facade.cpp
third_party/subsurface/   pinned Subsurface submodule (+ its libdivecomputer submodule)
docs/                     design documents
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

- Commit messages in English, imperative mood, short summary line.
- Author of every commit: Christian Rémillard. No `Co-Authored-By` or `Claude-Session` line in commit messages.
- Code files taken from or derived from Subsurface: `SPDX-License-Identifier: GPL-2.0` header. OpenDives is GPLv2 because it reuses Subsurface's core.
- Never commit Subsurface cloud credentials or a personal dive log.
- Existing French comments and documentation are translated to English when the file is next touched.

## Agent inbox

Decisions and tasks from the design sessions on claude.ai arrive in `docs/agent-inbox.md`. Do its open tasks in order, following its rules, and mark each one done in the same commit as its work. A task marked **Wait** waits for Christian's go-ahead in the chat. The mock-ups the tasks refer to are copied in `docs/mockups/`.
