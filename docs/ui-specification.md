# OpenDives — UI specification for the code

2026-11-05 · Christian Rémillard

This document turns the mock-ups into rules the code applies as they are: colours, text, measurements, components, screens and the data requested from the core. It is written first for the coding agent that builds the app (Svelte 5, Framework7 v9, JavaScript with JSDoc), and for Christian to validate.

- **Order of precedence:** this document, then the [mock-ups](https://claude.ai/artifact/Jpuj8pGER3xz8n383JvYep), then the [UI foundations](ui-foundations.md). When they disagree, this document wins; a mock-up that contradicts it must be reported.
- **Native first:** everything Framework7 provides (bars, lists, sheets, buttons, fields) is used as is, with its iOS or MD3 theme. Only the components in section 4 are specific to OpenDives.
- **Not frozen yet:** colours must still be checked on a real phone, in full sunlight and at night; open points are marked **To decide**.
- **Language:** this is the English copy of the French original kept on claude.ai ([online](https://claude.ai/artifact/TJU7voFbP6zeNaSUci5p7i)). UI strings are quoted in English; French is the reference language for writing them (`app/src/i18n/fr.json`).

## 1. Colours

The theme chosen on 5 November 2026 is **black and white, colour reserved for data**: a neutral light background, actions without a bright colour (#1F2124), strong contrast and sans-serif titles. The only bright colour in the interface belongs to dive data: the water column of the profile and of the thumbnails goes from sand to rust with depth. The code declares each colour once, as a CSS variable `--od-*`, and never hard-codes a value in a component.

| Token | Light | Dark | Use, and only this one |
| --- | --- | --- | --- |
| `--od-text` | #1F2124 (14.7:1 on the background) | #F4F4F2 | Main text, links, buttons, active tab, profile cursor; a filled button carries #FFFFFF text (16.1:1), #1F2124 in dark mode |
| `--od-text-2` | #4A4D52 (7.7:1) | #B5B8BC (9.3:1) | Secondary text, labels |
| `--od-background` | #F4F4F2 | #121314 | Screen background |
| `--od-surface` | #FFFFFF | #1C1D1F | Cell, block, profile |
| `--od-tint` | #E8E8E5 | #2E3033 | Pills (gases, buddies, tags), secondary button, selected item |
| `--od-separator` | #DADAD6 | #3A3C40 | Separators and outlines |
| `--od-water-top` | #FBE3B2 | #E5B961 | Top of the water column |
| `--od-water-bottom` | #B4530F | #EF7625 (tempered amber) | Water column at 60 m and deeper; in between, the colour is mixed according to the maximum depth |
| `--od-trace` | #1F2124 (3.2:1 on the bottom of the water) | #F4F4F2, 2 px, over a 4.5 px #121314 outline | Profile line |
| `--od-alarm` | #C62828 (5.1:1) | To decide | Ceiling violated, fast ascent, insufficient gas reserve, errors; never anywhere else |
| `--od-oxygen` | #2E7D32 (4.7:1) | #7FD283 | ppO2 curve, nitrox and oxygen mixes |
| `--od-pending` | #8A4B00 (6.2:1) | To decide | "Offline, waiting to be sent" state; text only, always with an icon |

**One colour for data.** The rust of the water never appears on a button, a link or a state. To check on screen: the pending colour (#8A4B00) is from the same family; it stays readable because it is always text with an icon, never a surface.

**Dark mode.** Backgrounds are neutral and almost black; the ink becomes #F4F4F2. The water is a tempered amber gradient, from light honey at the surface (#E5B961) to a strong orange at depth (#EF7625), chosen on 5 November 2026: rust looked dull on a dark background, an amber starting from brown was too flat, saturated gradients were too bright. The gradient must stay visible: a shallow dive stays light, a deep dive goes down to the orange. The light profile line has a dark outline, which keeps it readable on the amber and on the background.

**Framework7.** The theme is set with `colors: { primary: '#1F2124' }` when the app is created; in dark mode, the primary colour must be overridden to #F4F4F2, because the one Framework7 derives from a near-black is not readable on a dark background. The Android mock-ups use these MD3 roles (light / dark): primary #1F2124 / #F4F4F2; surface #F4F4F2 / #121314; surface-container #EEEEEC / #1C1D1F; secondary-container #E8E8E5 / #3A3C40; on-secondary-container #1F2124 / #F4F4F2; outline-variant #DADAD6 / #3A3C40. On iOS, `--f7-ios-primary` is the ink; secondary text stays the system one (#3C3C43).

**Warning:** Framework7 re-injects its variables at initialisation, which can override an override placed in the CSS. The `--od-*` tokens do not have this problem; an override of `--f7-*` must be checked on screen, in light and dark mode.

**Contrast:** all text at least 4.5:1 on its background, 3:1 for text of 24 px and more and for chart lines. A colour never carries information alone: the alarm and pending states always have text that says what the problem is.

## 2. Text, numbers and units

Fonts are the system ones: SF Pro on iOS, Roboto on Android. Sizes follow each platform's scale and respect the text size chosen in the phone's settings.

| Role | iOS | Android (MD3) |
| --- | --- | --- |
| Large screen title | Large Title, 34 px bold | Headline small, 24 px |
| Bar title | 17 px semibold | Title large, 22 px |
| Section title in a list | 13 px, secondary text | Title small, 14 px medium, primary colour |
| List row | 17 px | Body large, 16 px |
| Supporting text of a row | 13 px, secondary text | Body medium, 14 px, on-surface-variant |
| Highlighted value (calculator, totals) | 22 px semibold | 24 px |
| Caption, note under a block | 13 px | Body small, 12 px |

**Numbers.** Every dive value (depth, duration, pressure, temperature, volume, weight, percentages) uses tabular figures (`font-variant-numeric: tabular-nums`) and is right-aligned in lists and tables.

**Languages (decided on 5 November 2026).** The app is multilingual from the start, in French and English; other languages will be added without touching the code.

- No visible text is hard-coded in a component: each text has a key, and its translations live in one file per language (`app/src/i18n/fr.json`, `en.json`). French is the reference language for writing texts.
- The language follows the device; an untranslated language falls back to English. A setting lets the diver choose it.
- Plurals and numbers go through `Intl.PluralRules` and `Intl.NumberFormat` ("1 dive", "3 dives").
- Messages from the Subsurface core arrive in English (`trGettext` returns the text as is): the facade turns them into codes, and the app translates them like its own texts.
- The diver's data (site names, notes, tags such as "boat") is never translated.
- The English diving vocabulary follows Subsurface's (dive computer, buddy, ceiling, SAC, MOD), so both apps speak the same language.

**Formats.** They follow the device language, through `Intl.NumberFormat` and `Intl.DateTimeFormat`; in French: decimal comma ("27,6 m"), non-breaking space before units and colons, thin space as thousands separator ("1 013 mbar"). The skeleton currently shows "4.1 m" in French: to be fixed.

**Units.** Each measurement follows its own setting, read from the Subsurface logbook preferences: depth (m or ft), temperature (°C or °F), pressure (bar or psi), volume (litres or cubic feet), weight (kg or lb). The core stores whole SI units (mm, mK, mbar, ml, g); conversion happens at display time, never in the data.

| Measurement | Displayed precision |
| --- | --- |
| Depth | 1 decimal in metres, whole number in feet |
| Dive duration | whole minutes; min:s in the profile |
| Pressure | whole number |
| Temperature | 1 decimal |
| Volume, SAC | 1 decimal |

## 3. Layout and navigation

Width decides the layout, not the type of device: below 768 px wide, phone layout; from 768 px, tablet layout. A phone that is folded or unfolded therefore changes layout without restarting.

|  | Phone | Tablet |
| --- | --- | --- |
| Main navigation | Top bar with a ☰ button on the left that opens a side menu (iOS and Android, decided on 6 November 2026); no bar at the bottom | iOS: 220 px sidebar; Android: 96 px navigation rail with the "+" button at the top |
| Sections | Logbook, Sites, Statistics, Tools, then Account and Settings after a separator, in the side menu; the synchronisation state at the bottom of the menu. Account is a section (☰ in its top bar): the cloud account, its synchronisation and the server in use, or, without an account, the choices to create one or sign in | The same, plus Account and Settings at the bottom of the bar |
| Logbook | List, then full-screen detail | List (340 px) and detail side by side |
| Sites | Map, list in a bottom sheet | List on the left, map on the right |
| Tools | List of tools, then full-screen planner | Parameters on the left, computed plan on the right |
| Edit a dive | Full screen | iOS: 780 px sheet in two columns; Android: content pane in two columns |
| Settings | Scrolling list | 600 px centred column; two columns on Android |

**Touch targets:** at least 44 × 44 pt on iOS, 48 × 48 dp on Android; 56 px for list rows used on the boat (site choice, buddies).

**Side menu (decided on 6 November 2026, replacing the bottom bar):** the ☰ button only appears on the four sections (Logbook, Sites, Statistics, Tools); a screen opened from a section (detail, planner, editing) has a Back button instead. The menu is 300 px wide and opens over a dark scrim; it closes by tapping the scrim, swiping it to the left or with the system back. Rows of 56 px on Android, 48 px on iOS, labels that follow the system text size; the active section is highlighted in `--od-tint` and announced as the current page. On Android, it is Material 3's modal navigation drawer. On iOS, Apple recommends the tab bar and has no native side menu: OpenDives draws it, and must take care of its accessibility (VoiceOver inside the menu, focus returned to the ☰ button on closing, the edge back gesture must not open it).

**Spacing:** that of Framework7 lists and blocks; 16 px side margins on phones, 24 to 32 px in tablet panes. No cards with shadows: native full-width lists, or iOS grouped lists.

**Back:** the native gesture (swipe from the edge on iOS, system back on Android) works everywhere; a sheet also closes by dragging it down.

**Add (decided on 5 November 2026):** the Logbook no longer has a permanent Download button, which was of little use. Instead, a "+" button (navigation bar on iOS, floating action button in `secondary-container` on Android, at the top of the rail on tablets) opens three choices: download from the dive computer, import a file, log a dive by hand. The empty logbook offers the same choices directly.

## 4. Components specific to OpenDives

Six components do not exist in Framework7; each is a single Svelte component, shared by iOS and Android, which only changes its colours and sizes with the theme.

**`<DiveProfile>`: the dive profile and its water column.**

- **Line:** depth over time, from the samples of the first dive computer; the surface at the top, depth downwards.
- **Water column:** the area between the surface and the curve is filled with a vertical gradient, from `--od-water-top` at the top to a bottom colour that depends on the maximum depth: a mix of `--od-water-top` and `--od-water-bottom` in the proportion maximum depth / 60 m, capped at 1. The same scale applies to all dives: a 40 m dive is visibly more rust-coloured than a 12 m one.
- **Exploring:** a finger on the profile places a vertical cursor in `--od-text` and shows the time and depth at that moment, above the graph.
- **Technical layers:** Gas, Ceiling, ppO2, Tissues, as toggle chips (MD3 filter chips, iOS buttons); a layer is offered only if the dive has the data for it. Gas shows one band per mix under the profile; ppO2 uses `--od-oxygen`; a violated ceiling uses `--od-alarm`.
- **Landscape:** on phones, turning to landscape opens the profile full screen.

**`<ProfileThumbnail>`: the profile thumbnail**, instead of an icon in each row. 56 × 36 px on iOS (4 px corners), 56 × 40 px on Android (8 px corners). The curve uses the full height (scale specific to the dive); the background colour follows the water column rule, so depth stays readable. It has alternative text: "Profile, 27.6 m at the deepest".

**`<DiveRow>`: a dive in a list.** Thumbnail; site on the first line ("Site to be specified" in tertiary text when missing, never an invented name); date and time on the second; on the right, the maximum depth in bold, then the duration. A dive edited offline replaces the date with what is waiting to be sent ("Notes edited, waiting to be sent"), in `--od-pending`.

**`<TripRow>`: a collapsed trip.** Four reduced thumbnails in a 2 × 2 grid, "Trip of 2 February 2013", then "4 dives, from 21.8 to 28.7 m"; a tap expands the trip. The core's automatic trips are named like the others; their identifier changes at each load and is never stored.

**`<ActiveFilter>`: the active filter row.** While a filter is applied, a row at the top of the Logbook, the Statistics and the map recalls it with the number of matching dives ("Suit: dry suit, 12 dives") and a button to remove it. The filter is the same in all three sections.

**`<SyncStatus>`: the synchronisation state.** A row under the Logbook title, never a dialog: "Synced with the Subsurface cloud" (secondary text, check mark), "Offline: 2 changes will be sent when the network is back" or "Synchronisation stopped for one dive" (`--od-pending`, with an icon). It interrupts the diver only when a choice is needed (conflict, section 6).

**Manual synchronisation (decided on 6 November 2026).** When "Sync automatically" is turned off in Account, the app behaves like Subsurface-mobile: changes are saved in the local copy, nothing is sent or fetched, and the full exchange (fetch, merge, send) only happens on "Sync now". The setting belongs to the device. In this mode, `<SyncStatus>` says so at all times, at the top of the Logbook and at the bottom of the side menu: "Manual sync: 3 changes not sent", in `--od-pending`; the side menu then offers the "Sync now" button; the Account screen adds a "Changes not sent" row, and the explanation under the switch becomes "Off: changes stay on this device, and those from other devices do not arrive, until you sync".

An insufficient gas reserve in the planner is an ordinary list row whose value is in `--od-alarm`, with the gap spelled out ("18 bar short to surface two divers").

## 5. Screens and data requested from the core

Each screen reads and writes through the `libopendives` facade (via the `OpenDivesCore` plugin), never through Subsurface's structures. Today it provides `init`, `log_exists`, `apply_log_prefs`, `import_file`, `list_dives`, `cloud_configure`, `set_ca_file`, `cloud_list_dives` and `cloud_branch_status` (read only). The right-hand column says what must be added, in the order in which the screens will be built.

| Screen | Content and actions | Core data (to add in bold) |
| --- | --- | --- |
| First launch | Three explained choices: existing account, create an account, start without an account | `cloud_configure`; **`cloud_create_account`** and **`cloud_verify_pin`** (validation with a PIN sent by email) |
| New account, bring a logbook | divelogs.de (credentials never stored), file, or empty logbook | `import_file`; the download from divelogs.de happens in the app, then `import_file` on the received .dld file |
| Logbook | List by trip, search, synchronisation state, "+" button (download, import, log by hand) | `list_dives` (add the thumbnail: **`samples_summary`** per dive, a few dozen points); **`sync_status`** |
| Dive detail | From top to bottom: number in bold at the start of the date line, site as the large title, location below (the number has no row of its own); three key figures (max depth, duration, water); explorable profile, technical layers; secondary facts in a three-column grid (entry, exit, mean depth, air, CNS, OTU, mode, dive computer); "Gas and equipment" block: per cylinder, one line (gas, material and volume, start → end pressure), a remaining-pressure bar and a detail line (gas used, share remaining), then "Surface air consumption (SAC)" only if the core computes it (never on a rebreather), the suit, and the weights: total on the right, then one line per entry (location and weight) when there are several; on a rebreather, loop and bailout gases as pills; buddies and tags as pills, in separate blocks; notes in full, line breaks kept, no "Read more". A row without a value is not shown. Top right: Edit and a menu (iOS: circled "…" button, pull-down menu; Android: three vertical dots, MD3 menu) that holds "Plan from this dive". No button at the bottom of the page. | **`get_dive`**: samples, cylinders, gases, events, ceiling, ppO2, dive computers, buddies, suit, weights, SAC, notes |
| Edit a dive, quick entry | Dive fields, buddies, open circuit or rebreather mode, cylinders; Save | **`update_dive`** then git save; Subsurface's undo commands depend on Qt, so undo must be rebuilt in the facade |
| Download | Pairing the first time, then one gesture; progress; failure explained | **`download_start`** with a transport provided by the app (libdivecomputer's `dc_custom_open` wired to the system Bluetooth); list of supported models |
| Sites | Offline map (PMTiles), list, sites without position, dives without site | **`list_sites`** (name, position, number of dives, max depth) |
| Statistics | Pre-compiled page (totals, by mode, suit, buddy, dive computer, year, site); Free filter | **`stats`** on the current selection, based on `statistics.cpp` |
| Free filter | All criteria, equipment included; saved filters | **`filter_apply`**, based on `filterconstraint.cpp` and `fulltext.cpp`, already compiled; **`list_filter_presets`** |
| Tools, gas calculator | MOD, best mix | **`gas_mod`**, **`gas_best_mix`** (based on `gas.cpp`) |
| Planner | New dive or from the logbook; plan, gases, reserve, CNS and OTU | **`plan_dive`** (based on `planner.cpp`, already tried in the proof of concept); **`plan_from_dive`** to reuse gas, cylinder, pressure and SAC |
| Settings | Account, units one by one, appearance, offline maps, dive computers | **`get_prefs`** / **`set_prefs`** for units, saved in the logbook as Subsurface does |

All these functions run on the core's single thread and return JSON; none blocks the interface. A long call (synchronisation, download) sends its progress through plugin events.

**Filter criteria (decided on 5 November 2026).** Almost every field of a dive can be filtered on; criteria combine without limit, and a filter can be saved for reuse. The same filter applies to the Logbook, the Statistics and the map.

| Group | Criteria | In Subsurface's filter |
| --- | --- | --- |
| When | Date or period, year, day of the week, time of day | Yes |
| Where | Site | Yes |
| Where | Country, region (from the site data) | No, to add in the facade |
| Where | Trip | No, to add in the facade |
| With whom | Buddies, divemaster | Yes |
| The dive | Max depth, duration, mode (open circuit or rebreather), consumption (SAC), rating from 1 to 5, real or planned dive | Yes |
| Conditions | Water and air temperature, visibility, current, waves, surge, chill | Yes |
| Equipment | Suit, dive computer, cylinder type and size, gas (% oxygen and helium) | Yes |
| Text | Tags, notes, free search across the whole dive | Yes |

**Never offered:** weight and weight type, start and end pressures, water density, nitrogen percentage (it follows from oxygen and helium). The dive mode is put forward at the top of the editor. A criterion that applies to no dive in the logbook is not shown (no "helium" criterion for a logbook without trimix).

## 6. States and messages

Each screen has five states to build, besides the normal one: loading, empty, error, offline and conflict. They are drawn for phones in the mock-ups.

| State | Rule |
| --- | --- |
| Loading | Rows keep their place (greyed thumbnails and texts); never a blank screen or a lone spinner in the middle |
| Empty | A title that states the situation ("No dives yet"), a sentence that says what to do, then the possible actions: pair a dive computer, import a file, download from divelogs.de, log by hand |
| Error | What happened, what did not change ("No dive was changed"), what to check, as a numbered list, then Retry; never the raw text of a core error |
| Offline | Everything works; `<SyncStatus>` counts the pending changes and each affected dive says so; sending starts by itself when the network is back |
| Conflict | Only when Subsurface cannot merge ("Remote storage and local data diverged"): a sheet (iOS) or a dialog (Android) offers to keep the device version or the cloud version, after comparing them; nothing is lost before the choice. **To validate**: an OpenDives addition |

**Core messages.** The facade turns them into codes, then the app into sentences in the diver's language. Some messages are never shown: `origin lookup failed` for a local logbook, for example, is normal in no-account mode.

**Writing.**

- The diver's words: stop, ceiling, SAC, MOD, gas, dive computer, buddy.
- A button says what it does ("Download dives"), and the result repeats the same word ("3 dives downloaded").
- A choice states its consequence under its label, as on first launch.
- No exclamation marks, no "Oops", no capitals for emphasis; in French, "vous" everywhere.
- Missing data is shown as missing ("Site to be specified"), never as an invented value.

## 7. Never in OpenDives, and checks before delivering a screen

**Never in OpenDives:**

- conversational assistant, "suggest" button, generated summary;
- sparkle icons or emoji, decorative gradients (the only gradient is the water column, which encodes depth), identical cards with big shadows, number tiles on every screen;
- all-caps labels above titles, a single word coloured in a title, "A · B · C" strings, an "→" arrow added to buttons;
- entrance animations: motion only answers a gesture;
- filler text or invented data, including in screenshots and tests.

**To check on a real phone, for each screen:**

- [ ] iOS and MD3 rendering, in light and dark mode
- [ ] Largest system text size: nothing is cut off or overlapping
- [ ] VoiceOver and TalkBack: every button has a name, every profile and thumbnail has alternative text, the reading order follows the screen
- [ ] Contrast as in section 1, and readability in full sunlight
- [ ] Reduced motion respected
- [ ] Mixed units (feet and °C, for example) and French number format
- [ ] The five states of section 6
- [ ] A real logbook read from the cloud (Christian's), and the Subsurface sample logbook

**Open points to decide:** alarm and pending colours in dark mode; telling the pending colour apart from the rust of the water, to check on screen; version choice in case of conflict.
