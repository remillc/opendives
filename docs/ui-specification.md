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
| `--od-alarm` | #C62828 (5.1:1) | #FF8A80 (8.1:1) | Ceiling violated, fast ascent, insufficient gas reserve, errors; never anywhere else |
| `--od-oxygen` | #2E7D32 (4.7:1) | #7FD283 | ppO2 curve, nitrox and oxygen mixes |
| `--od-pending` | #8A4B00 (6.2:1) | #F2B84B (10.4:1) | "Offline, waiting to be sent" state; text only, always with an icon |

**One colour for data.** The rust of the water never appears on a button, a link or a state. To check on screen: the pending colour (#8A4B00) is from the same family; it stays readable because it is always text with an icon, never a surface.

**Dark mode.** Backgrounds are neutral and almost black; the ink becomes #F4F4F2. The water is a tempered amber gradient, from light honey at the surface (#E5B961) to a strong orange at depth (#EF7625), chosen on 5 November 2026: rust looked dull on a dark background, an amber starting from brown was too flat, saturated gradients were too bright. The gradient must stay visible: a shallow dive stays light, a deep dive goes down to the orange. The light profile line has a dark outline, which keeps it readable on the amber and on the background.

**Framework7.** The theme is set with `colors: { primary: '#1F2124' }` when the app is created; in dark mode, the primary colour must be overridden to #F4F4F2, because the one Framework7 derives from a near-black is not readable on a dark background. The Android mock-ups use these MD3 roles (light / dark): primary #1F2124 / #F4F4F2; surface #F4F4F2 / #121314; surface-container #EEEEEC / #1C1D1F; secondary-container #E8E8E5 / #3A3C40; on-secondary-container #1F2124 / #F4F4F2; outline-variant #DADAD6 / #3A3C40. On iOS, `--f7-ios-primary` is the ink; secondary text stays the system one (#3C3C43).

**Warning:** Framework7 re-injects its variables at initialisation, which can override an override placed in the CSS. The `--od-*` tokens do not have this problem; an override of `--f7-*` must be checked on screen, in light and dark mode.

**Contrast:** all text at least 4.5:1 on its background, 3:1 for text of 24 px and more and for chart lines. A colour never carries information alone: the alarm and pending states always have text that says what the problem is.

**Android follows Material 3 (decided on 6 November 2026).** Every Android screen uses MD3 components with their sizes and spacing; when a mock-up disagrees with MD3, MD3 wins and Christian is told. Reference values: touch targets at least 48 dp; top app bar 64 dp, 24 dp icons in 48 dp icon buttons; buttons 40 dp high, fully rounded, 24 dp side padding (12 dp for text buttons), labels 14 sp medium on one line; FAB 56 dp with 16 dp corners, small FAB 40 dp; list items 56 dp (one line) or 72 dp (two lines), 16 dp start and 24 dp end padding; switches 52 × 32 dp; radio buttons and checkboxes 20 / 18 dp in 48 dp targets, never shrunk by their layout; dialogs 28 dp corners and 24 dp padding, actions as text buttons at the bottom right (stacked and right-aligned when long); search bar 56 dp, fully rounded, with the leading icon (menu or back) inside the bar and trailing icons inside it too; navigation drawer items 56 dp with a full-pill active indicator; chips 32 dp with 8 dp corners. Menus (⋮): 16 dp corners (more rounded than the MD3 baseline of 4 dp, decided on 7 November 2026), surface-container background, elevation level 2, 8 dp vertical padding, items 48 dp high with 12 dp side padding, a 24 dp leading icon and a 12 dp gap, labels 14 sp medium on one line, width between 112 and 280 dp. A navigation entry in a bottom sheet or list is a list item with a trailing chevron, not a bare text link.

**Statistics (decided on 6 November 2026).** Four Android screens, `docs/mockups/android-stats.dc.html`, `stats-annee-android.dc.html`, `stats-filtre-android.dc.html`, `stats-nouvelle-android.dc.html`:
- *Main screen:* "Free filter" in the top bar; the three key figures (dives, time under water, deepest); *Charts*: two ready-made charts on cards scrolled sideways (dives per year; dive durations). Each bar is coloured with the water gradient by its value within the chart: the tallest bar is `--od-water-bottom` (#B4530F), the shortest stops at 70 % of the gradient (#C97E40) so every bar keeps 3:1 on white; in between, mixed linearly. The maximum depth chart was removed from this screen on 6 November 2026; maximum depth per dive stays on the year and filtered result screens. Users cannot create their own charts. *My statistics*: the user's saved statistics, each a two-line row (name, then dives · time · max depth) opening the filtered result, and a tonal "New statistic" button. Then *By year* (one row per year: dives · time · max depth, opening the year), *By mode*, *By suit*, *By buddy* (rows: value, number of dives, time). No totals by dive computer.
- *Year:* key figures, maximum depth per dive, rows by month and by trip, then the details of Subsurface's yearly statistics: total, mean, shortest and longest duration, mean and maximum depth, mean of maximum depths, mean SAC, mean water temperature.
- *Filtered result:* an input chip with the criterion ("Mode : circuit ouvert", removable) and "6 dives out of 9", key figures, maximum depth per dive, details, and a "Compare by suit" text button.
- *New statistic:* answers questions like "how many dives with this dry suit, or with this tag". A criterion (exposed dropdown: suit, tag, buddy, guide, site, trip, mode, gas, cylinder, weight, dive computer, year, rating…), the values found in the logbook for it, each with a checkbox and its number of dives; "Add a criterion"; the live result (dives, time under water, deepest), which opens the filtered result; an optional name proposed from the criteria; "Enregistrer" in the top bar adds it to *My statistics*. Several values of one criterion count dives having any of them; several criteria count dives meeting all of them. Saved statistics are stored per device unless a later decision says otherwise.

**Tools (decided on 6 November 2026).** Three tools, `docs/mockups/android-outils.dc.html` and `outils-desaturation-android.dc.html`:
- *Dive planner* (unchanged).
- *Desaturation:* computed by the core's Bühlmann tissue model from the logbook dives of the last days, with the planner's gradient factors. Shows the remaining desaturation time and the wait before flying (not computed by the core: OpenDives applies the 18-hour recommendation after several dives in a day, 12 hours after a single dive), the saturation of the 16 compartiments as bars from fast to slow with the limit as a dashed line, coloured with the water gradient by load (#FBE3B2 at 0 % to #B4530F at 100 %) and in `--od-alarm` from 90 %, with a legend; the dives used (rows opening the dive); and a note that the calculation only knows the logbook and that the dive computer prevails.
- *Gas calculator* (replaced on 7 November 2026 by the three gas tools below).

**About (decided on 7 November 2026).** An "À propos" entry in the side menu, after Réglages (info icon), opens a screen with a back arrow. Top: the logo, "OpenDives", the version only ("Version 0.1.0", no build number). Versions follow Semantic Versioning 2.0.0 (MAJOR.MINOR.PATCH, optional pre-release such as 0.2.0-beta.1); the same string is the Android `versionName` and the iOS `CFBundleShortVersionString`, while the build number (`versionCode`, `CFBundleVersion`) stays internal, one sentence "Carnet de plongée libre et gratuit, compatible avec les carnets Subsurface.". Under it, the author: "Par Christian Rémillard". The bottom line starts with "© 2026 Christian Rémillard." before the credit to Subsurface. Then, on white surfaces with titles on the page background: *Projet* (Nouveautés, opening the release notes for this version; Code source, https://github.com/remillc/opendives; Question / signaler un problème, see below), *Licences* (Licence: GNU GPL version 2, opening the full text in the app; Bibliothèques libres, a list of the open source components with their licences; Cartes: © OpenStreetMap contributors, ODbL; Pays et régions: GeoNames, CC BY 4.0), *Confidentialité* (Politique de confidentialité). Links that leave the app show the external-link icon and say so to screen readers. At the bottom, the credit to Subsurface, created by Linus Torvalds and Dirk Hohndel, and its contributors: required by the licence and the only place in the app that names Subsurface apart from the account and compatibility texts. Mock-up: `docs/mockups/apropos-android.dc.html`.

**Reporting a problem (decided on 7 November 2026).** "Question / signaler un problème" opens the phone's mail app (a `mailto:` link, mail icon instead of the external-link icon) to the support address, a build-time setting (`SUPPORT_EMAIL`), set to `support@opendives.app` (decided on 7 November 2026: the opendives.app domain forwards it to Christian's mailbox). Subject: "OpenDives X.Y.Z : question ou problème". The body starts with an empty line for the user's description, then a block "Informations techniques (à laisser dans le message)": app version, platform and OS version, device model, app language, units, logbook mode (cloud account or no account, never the email address), number of dives, last sync date and result, and the last error code if any. Nothing else: no credentials, no dive data, no location.

**Tools page and gas tools (decided on 7 November 2026).** The Tools page is only a list of links, on white surfaces with 20 dp corners and titles on the page background, like Settings: group "Plongée" (Planificateur de plongée, Désaturation), group "Gaz" (EAD et MOD, Meilleur mélange, Mélangeur de gaz). Each row: a 24 dp icon, the name, a one-line description, a chevron. Each tool opens its own screen with a back arrow. Surface pressure 1 013 mbar, oxygen counted as narcotic according to Settings, Décompression. **Water type (decided on 7 November 2026):** wherever a depth is turned into a pressure, the user chooses the water: "EAD et MOD", "Meilleur mélange" and the planner have a "Type d’eau" choice with Subsurface's water types, Eau douce (1 000 g/L), Eau saumâtre (1 010), EN 13319 (1 020), Eau de mer (1 030), default Eau de mer. The planner takes it from the dive it starts from when that dive has a salinity. Not on the gas blender, where no depth is involved. Mock-ups: `android-outils`, `outils-ead-mod-android`, `outils-meilleur-melange-android`, `outils-melangeur-android`.
- *EAD et MOD:* oxygen and helium (%), maximum ppO₂ (an inline wheel on a white surface, 1,0 to 1,6 bar by 0,1, default 1,4, three values visible, the current one framed), planned depth (m). Results: MOD for the ppO₂ (rounded down to the metre), EAD and END at the planned depth (`gas_mod`, the core's EAD and END functions).
- *Meilleur mélange:* depth, maximum ppO₂ (same wheel), maximum END (prefilled from Settings, Décompression, "END max meilleur mélange", changeable for this calculation only). Results, in this order: the nitrox with its END, flagged when it exceeds the limit, then the best trimix (O₂ rounded down, He rounded up, `gas_best_mix`).
- *Mélangeur de gaz:* partial pressure blending of nitrox and trimix, in one tool with a segmented control "Nitrox | Trimix" at the top (decided on 7 November 2026). The app remembers the last mode on the device. In Nitrox mode the helium fields and the helium step are hidden: the fill is oxygen, then the top-up gas. Inputs: wanted mix (O₂ %, He %), final pressure, cylinder size; what is in the cylinder (pressure, then its oxygen % and, in Trimix mode, its helium % as two separate dropdowns, any combination allowed; in Nitrox mode a single oxygen dropdown); top-up gas (Air by default, or a nitrox). Result: the fill in order. In Trimix mode a segmented control "Hélium d’abord | Oxygène d’abord" (default helium first, remembered on the device) sets whether helium or oxygen goes in first; the top-up gas is always last. Each step shows the pressure to reach, the pressure added and the volume of helium and oxygen used. Use the core's real-gas compressibility (`gas_compressibility_factor`), so the figures may differ slightly from an ideal-gas calculation. When the wanted mix cannot be reached (too much residual pressure, top-up gas too rich), say so and give the pressure to bleed down to. Warnings: pressures to read on a cooled cylinder; above 40 % oxygen, the cylinder and valve must be oxygen clean (in `--od-alarm`); analyse the mix before diving.

**Text fields (decided on 6 November 2026, updated the same day).** Every text field of the app on Android uses the MD3 **filled** variant (Framework7 MD inputs without the outline style): surface-container-highest background (#E8E8E5 light), 4 dp top corners, a 1 dp bottom indicator that becomes 2 dp in the primary colour on focus, the label inside the field: full size when the field is empty and not focused, with no placeholder; small above the value on focus or once the field has a value. Helper text sits under the field. A trailing icon (for example "use my position") is a plain 24 dp icon button, without a filled background. In a full-screen form, the save action is a text button at the right of the top bar ("Enregistrer"), the close action an X at the left. Reference: `docs/mockups/sites-edition-android.dc.html`.

**Logo (decided on 6 November 2026, redrawn on 7 November 2026): "Hublot", ring under the water.** A porthole seen from the front on the 108 grid: a disc of radius 30 centred on the icon, white (#FFFFFF) in light mode and #1E2023 in dark mode, on the icon background (#F4F4F2 light, #121314 dark). The water fills about 40 % of the disc, below a wavy waterline, in the water gradient (#FBE3B2 to #B4530F in light mode, #E5B961 to #EF7625 in dark mode). The ring exists only under the water: an arc 3 units thick, rounded ends, from the left end of the waterline to its right end through the bottom, in ink (#1F2124) in light mode and paper (#F4F4F2) in dark mode. Two filled bubbles above the water in the same colour as the arc (radius 3 and 2.1). **Size rule (decided on 7 November 2026):** at 64 px and below (app icons on every platform, notification marks, the logo next to the name in a header), the part of the circle above the water is completed by a grey arc of the same thickness (#A3A5A8 light, #6B6E72 dark), so the porthole stays readable. Above 64 px, when the logo stands alone (splash screen, About screen, first launch, website), there is no grey arc: only the ink arc under the water. The launcher icon is therefore always the version with the grey arc. Files: `docs/brand/opendives-icon-{light,dark}-{fullbleed,round,squircle}.svg` (icons, with the grey arc), `docs/brand/opendives-logo-{light,dark}.svg` (large standalone logo, transparent background, without the grey arc). Reference: `docs/mockups/logo-anneau-adaptatif.dc.html`.

## 2. Text, numbers and units

**Fonts (decided on 7 November 2026, replacing "system fonts only").** Body text uses **Source Sans 3** (SIL Open Font License) on Android and iOS: list rows, values, captions and helper text, fields, buttons, chips, menus, notes, tables. Titles keep the system font: screen and section titles, top bar titles, and the large key figures at the top of a dive (depth, duration, temperature), in Roboto on Android and SF Pro on iOS. The font is bundled with the app (weights 400 to 900, with the Latin Extended range so that ₂, ‰ and the other symbols render), registered as the app's body font, and scaled with the text size chosen in the phone's settings (Android `sp`, iOS Dynamic Type through `UIFontMetrics`). Tabular figures stay on for every dive value. **Sizes: unchanged with Source Sans 3 (decided on 7 November 2026).** Source Sans 3 draws smaller than Roboto at the same size (x-height 0.486 em against 0.528 em). So that body text keeps the same perceived size as with the system font, the font is registered with `size-adjust: 108%`, `ascent-override: 85.9%`, `descent-override: 22.6%` and `line-gap-override: 0%` (Roboto's line metrics after the adjustment). Every size in this specification (14/20, 16/24 and so on) stays as written and applies to Source Sans 3 through this adjustment: never raise the numbers instead. Reference: `docs/mockups/police-source-android.dc.html`; the Latin files used for the mock-up and the licence are in `docs/brand/fonts/`. Every Android and iOS mock-up uses it, with the same `@font-face` rules (files in `docs/brand/fonts/`).

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
| Sites | Map at the top, list in a fixed panel below it (not a draggable bottom sheet: no handle, the panel scrolls on its own) | List on the left, map on the right |
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

**Sign out (decided on 6 November 2026).** Subsurface-mobile has no sign-out: you change credentials or switch to no-cloud mode, and the account's local copy stays in the app's storage, not shown, and is reused if you sign in again. OpenDives does the same: "Sign out" forgets the credentials (removed from the keychain), closes the logbook and returns to first launch; the local copy is kept. A confirmation is always shown. If changes are not sent yet, it says so and offers "Sync, then sign out", "Sign out anyway" (they will be sent at the next sign-in to this account, from this device) and "Cancel". A "Also delete the copy on this device" checkbox, off by default, is only available once everything has been sent.

**Delete the account (decided on 6 November 2026).** Subsurface posts the email and password to `/delete-account`, then switches to no-cloud mode and keeps the loaded dives in the local logbook; it does not read the server's reply. OpenDives opens a separate screen: the account email and the consequence (account and dives deleted from the cloud for every device and for Subsurface desktop, no way back), a "Keep my dives on this device" checkbox, on by default (no-account logbook), an "Export a copy of the logbook" button (.ssrf), the password to type again, and a "Delete the account permanently" button in `--od-alarm`. Unsent changes are synced first. The account is only reported deleted if the server confirms it; otherwise "The account was not deleted" and nothing changes. Offline, the button is disabled ("Connection needed"). Try it on the test account only.

**Leaving the account, buttons (decided on 6 November 2026).** Their group is titled "Zone dangereuse" ("Danger zone"), preceded by a warning icon in `--od-alarm`, not "Quitter", so nobody thinks signing out is how to leave the app. "Sign out" and "Delete the account" are buttons, not list rows, each centred with its explanation under it: "Sign out" is an outlined button in the ink colour, "Delete the account" an outlined button in `--od-alarm` (text and border). Same sizes as "Sync now": 40 dp high and fully rounded on Android, 44 pt with 12 pt corners on iOS.

**Sign in and new account (decided on 6 November 2026).** Full-screen forms. On Android: an X at the left of the top bar, the bar title, then the screen title and its text, MD3 filled text fields, and the main button at the bottom right of the screen (as on the "Reprendre votre carnet ?" step). On iOS: "Annuler" at the left of the navigation bar, the step at the right, a large title, grouped inset rows (label on the left, value on the right), footers under the groups and a full-width main button at the bottom. Errors use `--od-alarm`: on Android the field's label, a 2 dp bottom indicator, an error icon at the end and the helper text replaced by the message; on iOS the value, an icon and the group footer in red. While a request runs, the fields and the button are disabled, the button shows a spinner and "Connexion…", and on Android a linear progress indicator runs under the top bar.
- *Sign in* (`compte-connexion-*`), opened from first launch ("J'ai déjà un compte Subsurface") and from Account without an account ("Se connecter à un compte existant"): bar title "Se connecter", title "Votre compte Subsurface", text "Le même compte que dans Subsurface sur l'ordinateur ou dans Subsurface-mobile. Vos plongées sont lues depuis le cloud, puis une copie reste sur cet appareil.", fields "Adresse e-mail" and "Mot de passe" (helper "Gardé seulement dans le stockage sécurisé de cet appareil", show/hide button on Android), button "Se connecter". States: in progress (`compte-connexion-encours-*`) and wrong credentials (`compte-connexion-erreur-*`): "Adresse ou mot de passe incorrect" under the password field.
- *New account, step 1 of 2* (`compte-creation-*`), opened from first launch ("Créer un compte Subsurface") and from Account without an account ("Créer un compte"): bar title "Nouveau compte", "Étape 1 sur 2", title "Créer votre compte Subsurface", text "Gratuit. Un code vous est envoyé par e-mail pour confirmer l'adresse.", fields "Adresse e-mail" (error "Cette adresse e-mail n'est pas valide") and "Mot de passe" (helper "Lettres sans accent, chiffres et @ . + _ - seulement": Subsurface's own password rules), button "Créer le compte" (`cloud_create_account`).
- *Confirmation code* (`compte-code-*`), a new screen between step 1 and step 2 ("Reprendre votre carnet ?"), as the PIN screen of Subsurface-mobile: still "Étape 1 sur 2", title "Confirmer votre adresse", text "Entrez le code envoyé à <adresse>. Il peut prendre quelques minutes à arriver.", one field "Code de confirmation" (`autocomplete="one-time-code"`), a "Renvoyer le code" button with a refresh icon right under the field (outlined button on Android, tinted grey button on iOS) (under its error when there is one), and "Confirmer" at the bottom (`cloud_verify_pin`), which leads to step 2. Wrong code (`compte-code-erreur-*`): "Code incorrect" under the field.
- *Bringing the logbook, step 2 of 2* (`android-compte-import`, `ios-compte-import`): the main button is "Continuer" and acts on the selected choice. A "Précédent" button goes back to step 1 (text button at the bottom left on Android, tonal button beside "Continuer" on iOS). Since the account already exists at that point, step 1 then shows its email without creating a second account. With divelogs.de, "Continuer" first checks the credentials with divelogs.de (button spinner, fields disabled). If they are refused, the user stays on step 2 with "divelogs.de a refusé ce nom d'utilisateur ou ce mot de passe" under the password field in `--od-alarm` (`compte-import-identifiants-*`). Once accepted, it opens the import progress screen. File opens the system file picker, then the same progress screen without the download step. Empty logbook opens the empty Logbook.
- *Import in progress* (`compte-import-encours-*`): no close button, title "Import de votre carnet", text "Gardez OpenDives ouverte jusqu'à la fin. Rien n'est envoyé à votre compte avant la dernière étape.", three steps with their state (done, running with a determinate progress bar and "128 sur 214", waiting): "Télécharger depuis divelogs.de", "Lire les plongées", "Enregistrer dans votre compte". A text button "Annuler l'import" stops it and nothing is sent. At the end the app opens the filled Logbook.
- *Import failed* (`compte-import-echec-*`): title "L'import n'a pas abouti", text "Votre compte est créé. Rien n'a été enregistré dedans.", the failed step with its message in `--od-alarm` (for example "Connexion perdue après 86 plongées sur 214."), the next steps "Pas commencé". Credentials were checked before, so this screen only covers failures during the import (network lost, unreadable file, save to the account refused). Buttons "Réessayer" (the credentials stay in memory until the screen closes, never stored) and "Carnet vide" on Android, "Commencer avec un carnet vide" on iOS.

**Full dive detail (decided on 6 November 2026).** The detail shows every field Subsurface stores, without crowding: the number on the date line; a "Gas and equipment" block (one line per cylinder with its pressure bar and the gas used; "Surface air consumption (SAC)" only when the core computes it; weights: "Lest" with the total on the right in weight 600, then one line per location in `#4A4D52` 14/20 with its weight on the right, when there are several entries; a single entry is one row with its location as supporting text); the notes in full, never "Read more"; a collapsed "Conditions" block. Reference: `docs/mockups/detail3-android.dc.html` and `detail3-android-sombre.dc.html`.

**Conditions (checked against Subsurface on 6 November 2026).** The rating and the five conditions (visibility, wave size, current, surge, chill) are all 0 to 5 star ratings in Subsurface (`core/dive.h`, `StarWidget` on desktop); 0 means not filled in. Each is shown with 1 to 5 stars; a condition at 0 is not shown, and the collapsed summary counts only the filled-in ones ("Visibility 4 of 5, chill 3 of 5, and 2 more"). Subsurface hides wave size, surge and chill by default: on desktop they only appear with the logbook preference "show tools for recording wave height, surge and chill" (`extraEnvironmentalDefault`, off by default), and Subsurface-mobile only edits the rating and the visibility. OpenDives does the same: editing shows the rating, visibility and current; a Settings switch "Vagues de surface, flux-reflux et froid" ("Surface waves, surge and chill"), off by default, adds the three others. Labels follow Subsurface's French translation: "Vagues de surface", "Visibilité", "Courant", "Flux-reflux", "Froid" (chill is a felt-cold rating, not a temperature). The detail always shows them when they are filled in (for example from Subsurface desktop), whatever the switch.

**Full editing and settings (decided on 6 November 2026).** The edit screen groups every editable field in collapsible groups ("Conditions", "Equipment", "Advanced"); the settings screen lists the language, each unit separately, the decompression and planning defaults of Subsurface (GF 30/75, VPM-B conservatism +3, ppO2 1.4 / 1.6 bar, SAC 20 / 17 L/min), appearance, the conditions switch, offline maps and dive computers. References: `docs/mockups/android-edition.dc.html`, `android-reglages.dc.html`.

**People and tags in dive editing (decided on 6 November 2026).** "Guide de palanquée", "Compagnons" and "Étiquettes" are filled fields whose values are MD3 input chips (32 dp, 8 dp corners, outlined, with a remove ×); typing proposes the people or tags already in the logbook, or adds a new one. Several buddies and several tags are allowed. Reference: `docs/mockups/android-edition.dc.html`.

**Settings, modelled on Subsurface (decided on 6 November 2026, replacing the settings part above).** The Settings screen follows Subsurface's preferences (desktop `desktop-widgets/preferences/*.ui`, mobile `mobile-widgets/qml/Settings.qml`), with Subsurface's defaults (`core/pref.cpp`), in this order: *Language and formats* (app language, date format, time format, each "System" by default); *Units* (Metric / Imperial / Personalised, then depth, pressure, volume, temperature, weight, ascent and descent speeds per minute or per second, duration "automatic" (minutes under an hour), GPS coordinates in degrees and minutes or decimal); *Logbook* (group dives into trips, on; show invalid dives, off; surface waves, surge and chill, off; edit water salinity, off); *Equipment* (default cylinder, show unused cylinders, offer standard sizes, cylinder types); *Dive profile* (mean depth, on; depth grid 1-2-5-10 or by 3; ceiling from the dive computer, on; ceiling in red, off; calculated ceiling, off, with Bühlmann GF 30/75 or VPM-B +3; tank bar, off); *Partial pressures* (pO₂ 0.16–1.6 bar, pN₂ 4.0, pHe 13.0, pO₂ for the MOD 1.6); *Rebreather* (default CCR setpoint 1.1 bar, O₂ sensors, setpoints, open-circuit gas as diluent, pSCR O₂ consumption 0.72 L/min, dilution 1:10, equivalent OC pO₂); *Dive computers* (remembered computers, forget them, show all Bluetooth devices); *Display* (theme, text size following the device); *Offline maps*; *Advanced* (reset all settings). As in Subsurface, these settings belong to the device; only trip grouping (`autogroup`) is stored in the logbook. The earlier statement that decompression and planning defaults are stored in the logbook was wrong: they belong to the device. The settings shared by several tools (decompression model, gradient factors, VPM-B conservatism, oxygen narcotic, best-mix END) are in Settings, group "Décompression", placed after "Profil de plongée" (decided on 6 November 2026); the planner reads them and does not repeat them. The planner-only settings (rates, reserve, SAC, ppO₂ at bottom and deco, last stop, gas switches) stay in the planner, as in Subsurface-mobile ("Dive planner setup"). Left out on purpose, being desktop-only or covered elsewhere: proxy, fonts and animation speed, default file, cloud credentials (Account), media and video thumbnails, map short names, developer menu. Reference: `docs/mockups/android-reglages.dc.html`.

**Planner settings, a screen of their own (decided on 8 November 2026).** The planner screen holds only the data of the plan: the starting dive, then MD3 filled text fields edited in place, two per line (Profondeur and Temps de fond as number fields with their unit as suffix; Gaz and Bouteille as exposed dropdown menus; Pression de départ and Consommation (SAC) as number fields; Type d’eau as an exposed dropdown menu, full width), then the computed plan, recomputed as soon as a field changes. The planned profile always shows the decompression ceiling computed by the core for the plan, as a red area filled from the surface down to the ceiling (`--od-alarm` at 35 % opacity, edged with a 1.5 dp `--od-alarm` line), with a one-line legend under the chart and a red swatch ("Plafond de décompression"); this is an exception to the rule that keeps `--od-alarm` for violations, decided on 8 November 2026; when the plan needs no stop, the ceiling stays at the surface and the line is not drawn. "Changer" replaces the starting dive; the values it brought stay editable. Its settings move to a separate screen, "Réglages du planificateur", opened from a "tune" icon button (24 dp, `aria-label` "Réglages du planificateur") in the planner's top bar, before "Enregistrer". The gradient factors row leaves the planner screen: they belong to Settings, group "Décompression". The settings screen has a back arrow, the intro "S’appliquent à chaque plan." and four groups on white surfaces (20 dp corners, titles 18/24 bold on the page background), with Subsurface's defaults:
- *Vitesses:* one ascent rate, "Remontée", 9 m/min (30 ft/min) by default (decided on 8 November 2026: a single rate instead of Subsurface's four depth bands); descent 18 m/min.
- *Paliers:* "Dernier palier", a value row opening a choice of 3 m or 6 m (10 ft or 20 ft), 3 m by default (Subsurface's `last_stop`); instant descent, Subsurface's drop stone mode (off); back-gas breaks during long oxygen stops (off); switch gas only at required stops (off); minimum duration at a gas switch 1 min.
- *Gaz:* bottom SAC 20 L/min ("Un plan fait depuis une plongée reprend la sienne"); deco SAC 17 L/min; bottom ppO₂ 1.4 bar; deco ppO₂ 1.6 bar.
- *Réserve:* minimum reserve 40 bar; problem-solving time 4 min; SAC factor under stress 2.0.
Value rows open the number or choice screens already drawn for Settings; switches change in place. These settings belong to the device, like the other settings. Reference: `docs/mockups/reglages-planificateur-android.dc.html`, `docs/mockups/android-planificateur.dc.html`.

**Settings: what each row does (decided on 6 November 2026, updated the same day).** Four kinds of row, and nothing else:
- *Switch:* the whole row toggles it; the value is saved at once, no confirmation.
- *Value on the right, followed by a small chevron:* the whole row opens an MD3 single-choice dialog (radio buttons, "Cancel" / "OK"). Each choice shows its effect. For the date format the choices are the dates themselves, the device's format first and selected by default (on a French-Canadian phone: 2026-11-06, 6 nov. 2026, 06/11/2026, 11/06/2026). Mock-ups: `reglages-choix-android.dc.html` (date), `reglages-vitesse-android.dc.html`, `reglages-duree-android.dc.html`, `reglages-coordonnees-android.dc.html`.
- *Number on the right, followed by a small chevron:* opens a dialog with one vertical wheel picker per value (the current value centred between two lines, larger and bold, neighbours fading above and below; scrolling changes it), the default under each wheel, and "Default values" / "Cancel" / "OK". No typing. See `reglages-nombre-android.dc.html` (pO₂ thresholds: minimum by 0.01, maximum by 0.1). Values follow the user's units and locale.
- *Chevron alone:* opens a sub-screen with a Back button.
Actions are outlined buttons, never rows, centred inside the rounded surface of their group (at its bottom): "Forget remembered dive computers" (confirmation dialog, then the core forgets them) and "Reset all settings" (confirmation dialog; the planning parameters and trip grouping are not reset). The ⋮ of a remembered dive computer opens a menu with "Rename" (the computer's nickname) and "Forget this computer", see `reglages-menu-android.dc.html`.

Choice dialogs follow the MD3 single-choice dialog exactly: 28 dp corners, 24 sp headline, a radio button at the start of each 56 dp row, the label then the example in secondary text at the end of the row, "Cancel" and "OK" as text buttons at the bottom right. Only the radio button shows the selection: no tinted row, no bold; dividers only when the list scrolls.

Layout: titles sit on the page background, 18 px bold; each group is a white surface with 20 px corners and 16 px side margins; no dividers between rows; rows 48 px minimum. In Units, the five units are one group and speeds, duration and GPS coordinates a second group. A search field at the top filters the rows as the user types. No semicolons in UI texts.

| Row | Control | Choices or range (default first) | Core preference |
| --- | --- | --- | --- |
| Langue de l'app | choice | System, Français, English | app setting |
| Format de la date | choice | System, day-month-year, month-day-year, year-month-day | `date_format`, `date_format_override` |
| Format de l'heure | choice | System, 24-hour, 12-hour | `time_format`, `time_format_override` |
| Unit system | segmented | Metric, Imperial, Personalised (set when one unit is changed) | `unit_system` |
| Depth, pressure, volume, temperature, weight | choice | m / ft; bar / psi; L / cuft; °C / °F; kg / lb | `units` |
| Vitesses de remontée et de descente | choice | per minute, per second | `units.vertical_speed_time` |
| Durée | choice | automatic (mm under one hour, else h:mm), always h:mm, always mm | `units.duration_units` |
| Coordonnées GPS | choice | decimal (-35.4485, default, unlike the core), degrees and decimal minutes (35° 26.9′ S), degrees, minutes and seconds (35° 26′ 54.6″ S) | `coordinates_traditional` covers only seconds (true) and decimal (false) in `printGPSCoords`: OpenDives formats coordinates itself, in all three forms |
| Regrouper les plongées en voyages | switch | on | logbook `autogroup` |
| Afficher les plongées invalides | switch | off | `display_invalid_dives` |
| Vagues de surface, flux-reflux et froid | switch | off | `extraEnvironmentalDefault` |
| Modifier la salinité de l'eau | switch | off | `salinityEditDefault` |
| Bouteille par défaut | choice | None, then the cylinder types | `default_cylinder` |
| Afficher les bouteilles inutilisées | switch | off | `include_unused_tanks` |
| Proposer les tailles standard | switch | on | `display_default_tank_infos` |
| Types de bouteilles | chevron | sub-screen, see below | core tank info table |
| Profondeur moyenne | switch | on | `show_average_depth` |
| Grille de profondeur | choice | 1, 2, 5, 10; by 3 (3, 6, 15) | `three_m_based_grid` |
| Plafond donné par l'ordinateur | switch | on | `dcceiling` |
| Plafond en rouge | switch | off | `redceiling` |
| Plafond calculé | switch | off; uses the model of the Décompression group | `calcceiling` |
| Décompression · warning | note | under the group title, always shown: an outlined note in `--od-alarm` with a warning icon: "Ces réglages changent les paliers et les limites calculés par l’app. Des valeurs mal choisies exposent à un accident de décompression. Ne les modifiez que si vous savez ce que vous faites." | none |
| Décompression · Modèle | choice | Bühlmann ZH-L16, VPM-B | `display_deco_mode` and `planner_deco_mode` set together |
| Décompression · Facteurs de gradient | number (two wheels) | GF low 10–150 % (30), GF high 40–150 % (75) | `gflow`, `gfhigh` |
| Décompression · Conservatisme VPM-B | number (wheel) | 0–4 (+3), shown dimmed with Bühlmann | `vpmb_conservatism` |
| Décompression · Oxygène narcotique | switch | on | `o2narcotic` |
| Décompression · END maximale du meilleur mélange | number (wheel) | 30 m | `bestmixend` |
| Bande des bouteilles (under the profile, which cylinder is in use at each moment) | switch | off | `tankbar` |
| Seuils de pO₂ | number | min 0.16, max 1.6 bar, step 0.01 / 0.1 | `pp_graphs.po2_threshold_min/max` |
| Seuil de pN₂ | number | 4.0 bar, step 0.1 | `pp_graphs.pn2_threshold` |
| Seuil de pHe | number | 13.0 bar, step 0.1 | `pp_graphs.phe_threshold` |
| pO₂ pour la MOD | number | 1.6 bar, step 0.1 | `modpO2` |
| Consigne par défaut (CCR) | number | 1.1 bar, 0–10, step 0.1 | `defaultsetpoint` |
| Capteurs d'O₂, consignes, gaz OC comme diluant, pO₂ équivalente OC | switch | off | `show_ccr_sensors`, `show_ccr_setpoint`, `allowOcGasAsDiluent`, `show_scr_ocpo2` |
| Consommation métabolique d'O₂ (pSCR) | number | 0.72 L/min, 3 decimals | `o2consumption` |
| Rapport de dilution (pSCR) | number | 1:10 (the user types 10) | `pscr_ratio` = 1000 / value |
| Montrer tous les appareils Bluetooth | switch | off | Bluetooth scan filter |
| Thème | choice | System, Light, Dark | app setting |
| Taille du texte | info | follows the device; not a control | none |
| Régions téléchargées | chevron | offline maps sub-screen (to be designed) | app setting |

*Cylinder types sub-screen* (`reglages-bouteilles-android.dc.html`): "Your types" (from the logbook) then "Standard" (the core's default table: AL80, ALU7, 10L 232 bar, …), each row showing volume and working pressure; a tap opens the type's sheet (name, volume, working pressure, Delete); the "Add a type" floating button opens an empty sheet. Renaming a type also renames the matching cylinders in the logbook; resizing or removing it does not change existing dives (same rule as the core's cylinder-type manager).

**Trip (decided on 6 November 2026).** Tapping a trip opens its screen: dates, place (or "Place to be specified"), number of dives and whether the trip was grouped automatically; place and notes are editable; each dive has a menu to remove it from the trip or split the trip there; the top menu merges with another trip, adds dives or ungroups. Reference: `docs/mockups/voyage-android.dc.html`.

**Sites (decided on 6 November 2026).** Four screens, from `docs/mockups/sites-*-android.dc.html`:
- *Site sheet:* name and country, map, coordinates with "Open in Maps" (an MD3 text button: 40 dp high in a 48 dp row, 12 dp side padding, 14 sp medium label, trailing "open in new" icon 18 dp with an 8 dp gap, and, for screen readers, "opens in another app"; the same rule for every link that leaves the app), then "About the site" (description, notes, region and city found automatically from the position), then the dives at this site.
- *New or edited site:* name and map on the page; then two rounded surfaces (white, 20 px corners), the first for coordinates, country and region with their explanation, the second for description and notes (field labels sit on the surface colour); position by moving the pin, by typing the coordinates (for example -35.4485, 174.732 or 35°26.9'S 174°43.9'E) or from the device position; country and region filled in from the coordinates (GeoNames) at each change of position, marked "automatic", and correctable: a corrected value is never replaced; offline, they are filled in when the network is back; description and notes. If a site already exists within 100 m (`get_by_gps_proximity`), the screen offers to use it instead of creating a duplicate.
- *Site form fields (decided on 6 November 2026):* text fields use the MD3 filled variant like every field of the app. The "site already within 100 m" note sits right under the map.
- *Edit a site* (`docs/mockups/sites-modifier-android.dc.html`, opened by the pencil of the site sheet): the same form titled "Modifier le site", filled with the site's values; no duplicate note; at the bottom, on its own surface, an outlined "Supprimer le site" button in `--od-alarm` with "The dive that uses it stays in the logbook, without a site", and a confirmation dialog. The "site already within 100 m" note only appears when creating a site.
- *Dives without a site:* each dive with "Choose a site" and "New site"; a suggestion is offered from the nearest site when the dive has a position, or from the site of the other dives of the same trip.
- *Clean up the sites:* imports sometimes create the same site several times. Possible duplicates (`get_same`: same name ignoring case and close, or same position with different names) are shown in pairs with their dives, with "These are not duplicates" and "Merge" (`MergeDiveSites`, one site keeps all the dives; undoable). Unused sites (no dive) are listed with check boxes, "Select all" and "Delete the selection (N)" (`PurgeUnusedDiveSites` logic, limited to the selection). The Sites screen has the same header as the other sections (64 dp top app bar: ☰, the title "Sites", a search icon button; no search bar floating over the map), then the map, then the fixed list panel. A 56 dp FAB "+" (aria-label "Nouveau site", 16 dp corners) sits at the bottom right, 16 dp from the edges, over the panel and opens the new site form; the panel keeps 88 dp of bottom padding so the last site is not hidden. The "Centrer sur ma position" button is a small 40 dp button at the bottom right of the visible map, above the panel. The panel starts, under its count line ("3 sites, 9 plongées"), with three list items with chevrons, shown only when they apply, followed by a divider and then the list of sites: "N dives without a site: assign them", "N sites without coordinates: place them" (opens the list of those sites; each opens the site editor to place it), and "N possible duplicates: clean up the sites". (Previously: the Sites screen shows "2 possible duplicates: clean up the sites" when there are some.

An insufficient gas reserve in the planner is an ordinary list row whose value is in `--od-alarm`, with the gap spelled out ("18 bar short to surface two divers").

## 5. Screens and data requested from the core

Each screen reads and writes through the `libopendives` facade (via the `OpenDivesCore` plugin), never through Subsurface's structures. Today it provides `init`, `log_exists`, `apply_log_prefs`, `import_file`, `list_dives`, `cloud_configure`, `set_ca_file`, `cloud_list_dives` and `cloud_branch_status` (read only). The right-hand column says what must be added, in the order in which the screens will be built.

| Screen | Content and actions | Core data (to add in bold) |
| --- | --- | --- |
| First launch | Three explained choices: existing account, create an account, start without an account | `cloud_configure`; **`cloud_create_account`** and **`cloud_verify_pin`** (validation with a PIN sent by email) |
| New account, bring a logbook | Empty logbook, divelogs.de (credentials never stored), or file, in that order | `import_file`; the download from divelogs.de happens in the app, then `import_file` on the received .dld file |
| Logbook | List by trip, search, synchronisation state, "+" button (download, import, log by hand) | `list_dives` (add the thumbnail: **`samples_summary`** per dive, a few dozen points); **`sync_status`** |
| Dive detail | From top to bottom: number in bold at the start of the date line, site as the large title, location below (the number has no row of its own); three key figures (max depth, duration, water); explorable profile, technical layers; secondary facts in a three-column grid (entry, exit, mean depth, air, CNS, OTU, mode, dive computer); "Gas and equipment" block: per cylinder, one line (gas, material and volume, start → end pressure), a remaining-pressure bar and a detail line (gas used, share remaining), then "Surface air consumption (SAC)" only if the core computes it (never on a rebreather), the suit, and the weights: total on the right, then one line per entry (location and weight) when there are several; on a rebreather, loop and bailout gases as pills; buddies and tags as pills, in separate blocks; notes in full, line breaks kept, no "Read more". A row without a value is not shown. Top right: Edit and a menu (iOS: circled "…" button, pull-down menu; Android: three vertical dots, MD3 menu) that holds "Plan from this dive" and, after a divider, "Supprimer la plongée" (trash icon, ink, not `--od-alarm`). Deleting needs no confirmation dialog: the dive is deleted through the core's undoable delete, the app goes back to the logbook and shows a snackbar "Plongée supprimée" with "Annuler" for 10 seconds; "Annuler" restores the dive. The deletion is synced with the cloud like any other change. No button at the bottom of the page. | **`get_dive`**: samples, cylinders, gases, events, ceiling, ppO2, dive computers, buddies, suit, weights, SAC, notes |
| Edit a dive, quick entry | Dive fields, buddies, open circuit or rebreather mode, cylinders; Save | **`update_dive`** then git save; Subsurface's undo commands depend on Qt, so undo must be rebuilt in the facade |
| Download | Pairing the first time, then one gesture; progress; failure explained | **`download_start`** with a transport provided by the app (libdivecomputer's `dc_custom_open` wired to the system Bluetooth); list of supported models |
| Sites | Offline map (PMTiles), list, sites without position, dives without site | **`list_sites`** (name, position, number of dives, max depth) |
| Statistics | Totals, ready-made charts, my statistics, by year, by mode, suit and buddy (no longer by dive computer); year detail; filtered result; new statistic. See "Statistics" in section 4 | **`stats`** on the current selection, based on `statistics.cpp` (yearly and monthly figures as in `yearlystatisticsmodel.cpp`) |
| Free filter | All criteria, equipment included; saved filters | **`filter_apply`**, based on `filterconstraint.cpp` and `fulltext.cpp`, already compiled; **`list_filter_presets`** |
| Tools, gas tools | EAD and MOD, best mix, gas blender (partial pressures, trimix) | **`gas_mod`**, **`gas_best_mix`**, **`gas_blend`** (based on `gas.cpp` and `gas-model.cpp`) |
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

**Open points to decide:** telling the pending colour apart from the colour of the water, to check on screen (in dark mode, the amber of the pending state is close to the honey of the water; chosen knowingly on 6 November 2026); version choice in case of conflict.
