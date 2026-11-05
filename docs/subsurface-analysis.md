# OpenDives — Analysis of the Subsurface project

2026-11-05 · Christian Rémillard

English copy of the French original kept on claude.ai ([online](https://claude.ai/artifact/PVHar8ng8ax2Cibm3JkAwN)).

## 1. Summary

Subsurface is a mature, free (GPLv2) dive log. All the code is in a single C++/Qt repository: a shared business core of about 62,000 lines and two interfaces, one for desktop and one for mobile. For OpenDives, the decision that shapes everything else is this one: reuse this core and libdivecomputer, or rewrite the business logic.

- **Strengths to keep:** 366 dive computers with direct download, recognised decompression calculations (Bühlmann ZH-L16 and VPM-B), an open data format, a free Git-based cloud, and offline operation.
- **Weaknesses to fix:** the mobile app is only a companion to the desktop. Its interface is dense and inherited from the desktop, its logic is concentrated in a monolithic controller (`QMLManager`, 2,715 lines), there is no GPS tracking while diving, and the iOS and Android versions do not do the same things.
- **Next step:** choosing the frameworks. Section 6 lists the criteria and compares the options.

**Sources analysed**

- The repository [github.com/subsurface/subsurface](https://github.com/subsurface/subsurface), branch `master`, commit `258beb4` of 4 November 2026: 1,869 files, with the CMake, the Android and iOS packaging, the mobile manual v3, the release notes and `SupportedDivecomputers.txt`.
- The submodule [Subsurface/libdc](https://github.com/Subsurface/libdc), branch `Subsurface-NG`: only its declaration, its content was not cloned.
- The website [subsurface-divelog.org](https://subsurface-divelog.org/), read on 5 November 2026: home, Current release, Release notes, FAQ, Documentation, Contribute, Privacy policy.
- The App Store and Play Store pages of Subsurface-mobile.

## 2. Overview and code architecture

Subsurface was created in 2011 by Linus Torvalds and has been maintained since 2012 by Dirk Hohndel. Since late 2023 there have been no formal releases, only frequent automated builds. The current "occasional" release is 6.0.5738 of 4 October 2026. The project is entirely volunteer-run and licensed under GPLv2. The website mentions about 20 languages; the repository contains 34 translation files, managed through Transifex.

**Technical stack:** C++ (std::vector, std::string), Qt 6.10 for mobile (Qt 5 is still supported on desktop), CMake build, and the libraries libgit2, libxml2/libxslt, SQLite (imports), libzip, libusb, libftdi (optional), LibRaw, Qt Bluetooth, Qt Location and KDE Kirigami for mobile. CI runs on GitHub Actions, with 14 build workflows: Android, iOS, Windows MSVC and MXE, macOS, Ubuntu, Fedora, Snap, AppImage.

| Module | Role | Size (lines) |
| --- | --- | --- |
| `core/` | Data model, calculations (deco, gas, SAC, CNS/OTU), planner, imports/exports, Git/cloud, Bluetooth/USB, libdivecomputer | 61,600 |
| `desktop-widgets/` | Desktop interface (Qt Widgets) | 24,100 |
| `tests/` | Qt Test unit tests | 17,600 |
| `mobile-widgets/` | Mobile interface: 37 Kirigami QML screens + `QMLManager` (C++) | 14,100 |
| `qt-models/` | Qt models (dive list, cylinders, etc.) shared by both interfaces | 10,300 |
| `stats/` | Statistics charts (Qt Quick scene graph) | 9,500 |
| `profile-widget/` | Dive profile rendering (Qt scene, `QMLProfile` for mobile) | 6,200 |
| `commands/` | Undo/redo (Command pattern) | 6,000 |
| `map-widget/` | Sites map (Qt Location, QML) | 1,400 |
| `smtk-import/`, `cli/`, `backend-shared/` | SmartTrak import, command line, export utilities | 3,200 |
| `libdivecomputer/` | Submodule: fork of libdivecomputer (LGPL-2.1) | external |
| `android-mobile/`, `ios/` | Java activity, manifest, Gradle (minSdk 28, targetSdk 36); iOS plist | 900 |

The layering is clear: `core` (plain C++, loosely tied to the interface) → `qt-models` and `commands` → two interfaces. This separation is what makes it possible to consider reusing `core` without the Qt interfaces. But `core` still depends on Qt in several places: `qthelper.cpp`, `qt-ble.cpp`, `cloudstorage.cpp` (QNetwork) and the settings (`core/settings`).

## 3. Business core, formats, cloud and dive computers

**Data model.** The log (`divelog`) holds dives, trips (`dive_trip`), sites (`dive_site`, with GPS coordinates and a country/region taxonomy), settings and filter presets. A dive (`struct dive`) carries the date, site, notes, divemaster, buddies, suit, cylinders, weights, tags, pictures, ratings from 0 to 5 (conditions, visibility, waves…), SAC, CNS and OTU, and **several dive computers** (`divecomputer`). Each dive computer has its own samples (`sample`: depth, temperature, up to 10 pressure sensors, ppO2 and 6 cells for rebreathers, NDL, TTS, deco, heading, heart rate), plus its events and extra data. Internal units are fine-grained SI integers (mm, mK, mbar, seconds), which avoids rounding errors.

**Calculations.** Bühlmann ZH-L16 decompression with gradient factors and VPM-B (`deco.cpp`), multi-gas planner for air, Nitrox and Trimix, with bailout gases and closed circuit (`planner.cpp`), partial pressures and MOD/MND, SAC, statistics and full-text filters.

**Formats.**

- Native: XML (`.ssrf`, `<divelog program='subsurface' version='3'>`), readable and versionable.
- Cloud: a **Git repository** organised as a `year/month/…` tree with one file per dive, plus `00-Subsurface` (settings) and `01-Divesites/Site-<uuid>`.
- Imports: CSV, Suunto (DM3/DM4/DM5, JSON), Shearwater, DivingLog, Seac, LogTrak, Cobalt, ASD, Datatrak, Liquivision, Cochran, Uemis, OSTC Tools, Garmin FIT, SmartTrak, GPX, plus MacDive and JDiveLog according to the website.
- Exports: XML, Git, CSV, profiles, HTML and world map, LaTeX, and upload to divelogs.de and DiveShare.

**Subsurface cloud.** It works through Git over HTTPS, with four mirror servers (`ssrf-cloud-us/u2/eu/e2.subsurface-divelog.org`, alias `cloud.subsurface-divelog.org`). The account is created with an email and password, then validated with a **PIN sent by email** (`/verify` endpoint). The account can be deleted and the password reset. Data is cached locally (offline operation) and synchronised on demand or automatically. Protection against overwriting data (`classify_git_save`) was added recently. A purely local "no cloud" mode also exists. The service is free, without monetisation, and funded by donations (Ko-fi, GitHub Sponsors).

**Dive computers.** Communication goes through a fork of libdivecomputer (branch `Subsurface-NG`, LGPL-2.1). The generated list counts **366 models from 40 manufacturers** with direct download, plus 11 file import formats (Garmin FIT, Shearwater Desktop, Suunto DM, etc.). The supported transports are:

- USB serial (libusb, FTDI, Android driver `serial_usb_android.cpp`);
- classic Bluetooth (`qtserialbluetooth.cpp`);
- **Bluetooth LE** (`qt-ble.cpp`), wired into libdivecomputer through its custom I/O.

Discovery (`btdiscovery.cpp`) recognises the manufacturer and model from the Bluetooth name. Some dive computers can also be configured (OSTC 3 and 4, Suunto Vyper). On iOS, only BLE is possible.

## 4. The current mobile app and the website

The project itself describes Subsurface-mobile as a **limited version, a companion to the desktop**, used to browse the logbook, make small edits and download from the dive computer. It uses the same C++ `core`, the same `qt-models`, the same profile and the same statistics as the desktop, with a QML and Kirigami (KDE) interface on top.

| Screen or feature (side menu) | Main QML file | Note |
| --- | --- | --- |
| Dive list, full-text filter, trips | `DiveList.qml`, `TripDetails.qml` | List grouped by trip |
| Dive detail with profile, swipe between dives | `DiveDetails*.qml` (about 2,300 lines) | Very long edit form (1,084 lines) |
| Manual dive entry | `DiveDetailsEdit.qml` |  |
| Download from the dive computer (USB, BT, BLE) | `DownloadFromDiveComputer.qml` | Choice of manufacturer, model and connection; 4 remembered dive computers |
| Manual or automatic cloud sync, credentials | `CloudCredentials.qml` | PIN by email |
| Summary and statistics (bars, scatter plots, comparisons) | `DiveSummary.qml`, `StatisticsPage.qml` |  |
| Export (file, email, divelogs.de, DiveShare) and file import | `Export*.qml` |  |
| Sites map | `MapPage.qml` | Qt Location; the former GPS tracking is gone |
| Dive planner and gas calculator | `DivePlanner*.qml` | About 1,700 lines of QML |
| Settings: theme, font, units, default cylinder, Bluetooth | `Settings.qml` | 879 lines |
| Help, manual, email support with logs, developer menu | `About.qml`, `Log.qml` |  |

**Technical findings.**

- All interface logic goes through `QMLManager` (2,715 lines, about 60 properties and methods exposed to QML). It is a "god object" that is hard to test.
- Navigation uses a side drawer and a Kirigami page stack, with a look quite far from Material 3 and iOS conventions.
- Platforms: Android 9 and later (minSdk 28, targetSdk 36) and iOS 17 and later. On iOS, only BLE is possible and releases are rare, since the App Store is the only distribution channel.
- Android distribution: Play Store and manually installed APK (with Obtainium). Switching from one to the other requires uninstalling the app and resynchronising from the cloud.
- The build is heavy: Qt 6 compiled for Android and iOS, Kirigami and ECM, libgit2, libssh2, libdivecomputer, in a dedicated Docker image.
- It has no home-screen widgets, no Apple Watch or Wear OS, no social sharing, no viewing or adding of photos (although they are in the data model), no offline map, and no wet-screen mode or dedicated sunlight readability.

**Website ([subsurface-divelog.org](https://subsurface-divelog.org/), read on 5 November 2026).** It presents the desktop (Windows, macOS, Linux) as the main product, and mobile as a complement. It contains:

- the Current release pages (6.0.5738 of 4 October 2026, with Windows Qt 5 and Qt 6 builds, macOS ARM and Intel, Android APK and iOS App Store) and Latest development build;
- the documentation (desktop and mobile manuals, list of dive computers, FAQ, account deletion);
- the forum, bug tracker, Contribute page and donations.

The privacy policy fits in one sentence: the service keeps only the account email, with servers in the United States and Germany, and no use of the data. The FAQ stresses the volunteer nature of the project, its independence from manufacturers and the VPM-B/Bühlmann planner. The website offers **no logbook viewable online** and no documented public API for the cloud: access is only through Git.

## 5. Strengths, weaknesses and opportunities for OpenDives

|  | Finding | Consequence for OpenDives |
| --- | --- | --- |
| Strength | 366 dive computers supported through libdivecomputer, with Bluetooth detection | Must be reused: rewriting it would take years |
| Strength | Proven decompression calculations and planner, covered by tests | Reuse, or port with its tests as the reference |
| Strength | Open formats (XML, Git) and free cloud | Compatibility with the cloud and Subsurface files is a strong adoption argument |
| Strength | Offline first, with a local cache | Keep as a principle |
| Weakness | Dense mobile interface, inherited from the desktop, drawer navigation | The main lever for improvement: a modern native mobile interface |
| Weakness | Monolithic `QMLManager`, interface logic mixed with business logic | Clearly separate the layers (domain, data, interface) |
| Weakness | Heavy Qt mobile build and few mobile contributors | Choose a mobile stack with a larger pool of developers |
| Weakness | iOS lagging behind (BLE only, rare releases) | iOS/Android parity from the design stage |
| Opportunity | Photos, offline map, widgets, watch, sharing, wet-screen mode missing | Possible differentiators for OpenDives |
| Constraint | GPLv2 code; libdivecomputer under LGPL-2.1 | Reusing `core` makes OpenDives GPLv2; libdivecomputer alone is more flexible (see section 6) |

## 6. Criteria and options for choosing the frameworks

The choice depends first on the answers to the five questions below. The table then compares seven options, without deciding.

**Questions to settle before choosing**

1. **Reuse:** keep Subsurface's C++ `core` as is, keep only libdivecomputer and rewrite the business logic, or rewrite everything?
2. **Compatibility — decided on 5 November 2026:** OpenDives connects to the existing Subsurface cloud and does not replace it. It reads and writes Subsurface users' data.
3. **Licence:** reusing `core` requires OpenDives to be GPLv2. libdivecomputer alone (LGPL-2.1) leaves more freedom, but imposes linking rules that are tricky on iOS. This is not legal advice: this point deserves checking.
4. **Platforms:** mobile only (Android and iOS) or also desktop and web? A watch?
5. **Skills:** which languages do the developers or targeted contributors know (Dart, Kotlin, Swift, TypeScript, C++)?

| Option | Interface | Access to the C++ core and libdivecomputer | BLE and USB | Advantages | Drawbacks |
| --- | --- | --- | --- | --- | --- |
| A. Qt 6 / QML (interface redesign only) | QML, Qt Quick Controls (Material, iOS) | Direct, 100 % reused | Qt Bluetooth, already in place | Maximum reuse, full compatibility, shortest path | Stays GPLv2, heavy build, small pool of developers, less native rendering |
| B. Flutter (Dart) | Material 3 and Cupertino, custom rendering (Impeller) | `dart:ffi` to a C/C++ library (libdivecomputer, possibly `core` without Qt) | BLE plugins (flutter_blue_plus) wired to libdivecomputer's custom I/O; USB through an Android plugin | One interface codebase, smooth, fast profile charts, large ecosystem | FFI bridge to build and maintain; `core` still depends on Qt, which requires extraction work |
| C. Kotlin Multiplatform + Compose Multiplatform | Compose (native Android, stable iOS) | cinterop (iOS) and JNI (Android) to libdivecomputer | Native BLE APIs, or Kable | Business logic shared in Kotlin, 100 % native Android interface, growing adoption | Business logic to rewrite or bridge, iOS tooling less mature than Flutter |
| D. React Native (new architecture) | Native components, Expo ecosystem | Native C++ modules through JSI / Turbo Modules | react-native-ble-plx | Very large JavaScript/TypeScript pool, close to the web | Profile charts heavy to optimise, two bridge layers (JS and native) |
| E. Native: SwiftUI + Jetpack Compose on a shared C++ core | 100 % native on each platform | Direct (C++ in Swift and through JNI) | Core Bluetooth and Android BLE | Best experience and system integration (widgets, watch) | Two interfaces to write and maintain, double cost |
| F. Hybrid: Capacitor (with or without Ionic) or Tauri 2 | HTML/CSS/TypeScript (React, Vue, Svelte, Angular) in a native web view | Custom native plugin (Swift/Kotlin, or Rust for Tauri) wrapping libdivecomputer, libgit2 and possibly core | Native BLE plugins (work on iOS); USB through an Android plugin; native network requests, so no CORS constraint | Reuses web skills; the same interface (Capacitor) can also be hosted as a web version; large JavaScript ecosystem | Native bridge to write for iOS and Android; profile charts to optimise (canvas/WebGL); less native rendering. Tauri does not target servers |
| G. Pure web app (PWA) served by a server | HTML/CSS/TypeScript in the browser, installable | libdivecomputer compiled to WebAssembly, or core run on the server | Web Bluetooth and WebUSB only in Chrome on Android and desktop; impossible on iPhone without a third-party tool (Bluefy, WebBLE) | No installation through app stores, instant updates, available on any screen | CORS closed on the Subsurface cloud (tested), so a relay server is required that holds credentials and logbooks; no download from the dive computer on iPhone |

**Consequences of the decision to connect to the Subsurface cloud**

- OpenDives must embed a **Git client** (libgit2, like Subsurface-mobile) and talk HTTPS to the `ssrf-cloud-*.subsurface-divelog.org` servers. There is no REST API: the Git repository **is** the interface.
- Subsurface's **Git storage format** (`year/month/…` tree, one text file per dive, `00-Subsurface`, `01-Divesites`) must be reproduced byte for byte, otherwise the desktop app and Subsurface-mobile may corrupt or reject the data. The reference is `core/load-git.cpp` and `core/save-git.cpp`. Unknown data must be kept as is.
- The **account cycle** must be reproduced: email and password credentials, PIN validation (`/verify`), password reset, choice of US or EU server, and offline local cache with merging of concurrent changes, including the `classify_git_save` protection.
- This strongly favours reusing the C++ `core` (Git loading and saving already tested), hence options A, B (through FFI), E and F (through a native plugin). Options C and D remain possible, but would require either rewriting the Git parser and serialiser, or bridging the `core`.
- Licence: reusing `load-git` and `save-git` puts OpenDives under GPLv2. It would also be courteous to tell the Subsurface maintainers, who fund the servers themselves, that a new client will connect to them.

**CORS test of 5 November 2026.** The test was run from the built-in browser (Chromium), with `fetch` requests to `/git/<account>/info/refs?service=git-upload-pack` on `ssrf-cloud-eu`, `ssrf-cloud-us` and `cloud.subsurface-divelog.org`. All three servers are reachable, but **none sends an `Access-Control-Allow-Origin` header**. Both the simple request and the `OPTIONS` preflight (with `Authorization`) are blocked by the browser. A web app running in a browser therefore cannot reach the Subsurface cloud directly: it needs either a native or hybrid app (requests made on the native side), or a relay server.

**Observations to guide the choice (without deciding).**

- The piece not to rewrite is libdivecomputer. Every option calls it in C. The real difference is the cost of the bridge and BLE handling on each platform.
- Since compatibility with the Subsurface cloud is required, reusing core (Git, XML, model) becomes the deciding factor. It is direct with A and E, feasible with B through FFI, and costly with C and D.
- For "an improved version" focused on the mobile experience, B and C offer the best balance between interface quality and shared code. A is the fastest if the goal is mostly to modernise the interface while keeping everything else.

The framework was then chosen: Capacitor with Svelte 5 and Framework7 (option F), on Subsurface's unmodified core; see [the architecture](architecture.md).

## Sources

- [Subsurface repository on GitHub](https://github.com/subsurface/subsurface), commit `258beb4` of 4 November 2026
- [Subsurface's libdivecomputer fork](https://github.com/Subsurface/libdc)
- [Subsurface website — home](https://subsurface-divelog.org/), [Current release](https://subsurface-divelog.org/current-release/), [FAQ](https://subsurface-divelog.org/faq/), [Privacy policy](https://subsurface-divelog.org/privacy-policy/), [Contribute](https://subsurface-divelog.org/contribute/), [Release notes](https://subsurface-divelog.org/release-changes/)
- [Subsurface-mobile user manual](https://subsurface-divelog.org/subsurface-mobile-user-manual/)
- [Subsurface-mobile on the App Store](https://apps.apple.com/app/id1093217161)
