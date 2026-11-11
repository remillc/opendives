# OpenDives — System design

The rules every screen shares: principles, CSS naming, colours, visual identity, type, layout, shared components, states and messages. Each screen is described in the [UI specification](ui-specification.md), who the app is for in the [UI foundations](ui-foundations.md). Together, this document and the UI specification take precedence over the mock-ups.

Extracted on 10 November 2026 from the UI foundations and the UI specification, whose French originals are on claude.ai and predate this split.

## 1. Principles

Eight principles guide every screen. When two principles conflict, the higher one in the list wins.

1. **The dive first.** The profile and the dive's figures are the main content, not decoration around menus. Each dive is recognisable by the shape of its profile.
2. **Usable on the boat.** Touch targets of at least 48 points, text readable in full sunlight, choices in lists (nearby sites, usual buddies) rather than typing. No essential feature depends on the network.
3. **Native above all.** iOS and Android components and gestures (through Framework7) are used as they are. A custom component is created only where none exists, for example for the profile.
4. **Simple by default, technical on demand.** Technical data (ceiling, tissues, ppO2, helium) appears when the dive contains it or when the diver turns it on. A recreational diver does not see empty trimix fields.
5. **Undo rather than confirm.** Actions apply immediately and can be undone in one gesture. A confirmation is reserved for irreversible actions (deleting the account, overwriting cloud data).
6. **Synchronisation stays in the background.** The state is shown discreetly (synced, waiting for network, conflict resolved). It interrupts the diver only when they must act.
7. **The diver's vocabulary.** Stop, ceiling, SAC, MOD, gas, dive computer: the words of the trade, with the units the diver chose. Buttons say what they do ("Download dives") and the result repeats the same word ("3 dives downloaded").
8. **No typical AI patterns.** OpenDives has no AI feature, and nothing in its look should suggest one:
   - no conversational assistant, "suggest" button or generated summary;
   - no sparkle icons or emoji, no decorative gradients, no identical cards with big shadows, no number tiles on every screen;
   - no all-caps labels above titles, no single word coloured in a title, no "A · B · C" strings, no "→" arrow added to buttons;
   - no entrance animations on every element: motion only answers a gesture from the diver;
   - no filler text: mock-ups and empty screens use real data and useful instructions ("Pair your dive computer to download your dives").

Accessibility is not a separate principle: it is a floor. Screen readers (VoiceOver, TalkBack), system text sizes, sufficient contrast, reduced motion respected, and colours that never carry information alone.

**Native first:** everything Framework7 provides (bars, lists, sheets, buttons, fields) is used as is, with its iOS or MD3 theme. Only the components in section 8 are specific to OpenDives.

## 2. CSS naming

Every component carries a class that names it, prefixed `od-`, in kebab case: `od-coordinate-field`. A part of a component adds a `--` suffix: `od-coordinate-field--drag-handle`.

- The component name comes from its file: `StatisticsDives.svelte` is `od-statistics-dives`.
- CSS custom properties start with `--od-`: `--od-band-rise`.
- Framework7 and MapLibre classes (`item-content`, `navbar`, `list`) keep their names. Without the prefix, our classes collide with theirs: `.card`, `.chip` and `.panel` have already caused display bugs.
- Utility classes shared by several components, defined in `app/src/theme.css` (`od-value`, `od-text-button`, `od-sr-only`), have no component in their name.
- Where a Framework7 class really styles one of our elements (`card`, `chip`), the element keeps it next to its own: `class="chip od-site-edit--chip"`.

**Layers.** Framework7's CSS sits in the `framework7` layer, imported by `app/src/theme.css`; ours in `od.tokens`, `od.base` and `od.components` (the styles of Svelte components). Overrides of the `--f7-*` variables stay outside any layer: Framework7 injects its colours at start-up without a layer, and a rule in a layer would always lose.

**Nesting.** Nest only a real relation: a variant (`&.reduced`), a theme (`:global(.ios) &`), an element in its block (`.values strong`). Otherwise, flat rules.

## 3. Colours

The theme is **black and white**: a neutral light background, actions without a bright colour (#1F2124), strong contrast and sans-serif titles. In dive data, the water column of the profile and of the thumbnails goes from sand to rust with depth. Colour may also appear elsewhere in the interface, and we can play with it, but sparingly and always within the accessibility rules (WCAG 2.2 AA): text at least 4.5:1 against its background (3:1 for large text, 18 sp, or 14 sp bold), and 3:1 for icons, borders, selection marks and other meaningful graphics. Colour never carries meaning alone: a selection, a state or an alert also has a shape, an icon or a word. The code declares each colour once, as a CSS variable `--od-*`, and never hard-codes a value in a component.

| Token | Light | Dark | Use, and only this one |
| --- | --- | --- | --- |
| `--od-text` | #1F2124 (14.7:1 on the background) | #F4F4F2 | Main text, links, buttons, active tab, profile cursor; a filled button carries #FFFFFF text (16.1:1), #1F2124 in dark mode |
| `--od-text-2` | #4A4D52 (7.7:1) | #B5B8BC (9.3:1) | Secondary text, labels |
| `--od-background` | #F4F4F2 | #121314 | Screen background |
| `--od-surface` | #FFFFFF | #1C1D1F | Cell, block, profile |
| `--od-tint` | #E8E8E5 | #2E3033 | Pills (gases, buddies, tags), secondary button, selected item |
| `--od-separator` | #DADAD6 | #3A3C40 | Separators and outlines |
| `--od-outline` | #74777C | #8E9196 | Dashed outline of an empty profile thumbnail |
| `--od-water-top` | #FBE3B2 | #E5B961 | Top of the water column |
| `--od-water-bottom` | #B4530F | #EF7625 (tempered amber) | Water column at 60 m and deeper; in between, the colour is mixed according to the maximum depth |
| `--od-trace` | #1F2124 (3.2:1 on the bottom of the water) | #F4F4F2, 2 px, over a 4.5 px #121314 outline | Profile line |
| `--od-alarm` | #C62828 (5.1:1) | #FF8A80 (8.1:1) | Ceiling violated, fast ascent, insufficient gas reserve, errors; never anywhere else |
| `--od-oxygen` | #2E7D32 (4.7:1) | #7FD283 | ppO2 curve, nitrox and oxygen mixes |
| `--od-pending` | #8A4B00 (6.2:1) | #F2B84B (10.4:1) | "Offline, waiting to be sent" state; text only, always with an icon |

**Colour roles (decided on 9 November 2026).** Besides the water of the dive data, the interface has four MD3 colour roles, each with a colour, an on-colour, a container and an on-container. Each becomes a `--od-*` token and the matching Framework7/MD3 variable.

| Role | Light: colour / on / container / on-container | Dark: colour / on / container / on-container | Use, and only this one |
| --- | --- | --- | --- |
| Primary (ink) | #1F2124 / #FFFFFF / #E8E8E5 / #1F2124 | #F4F4F2 / #1F2124 / #2E3033 / #F4F4F2 | Main actions, links, text (unchanged) |
| Secondary (rust and sand) | #B4530F / #FFFFFF / #FBE3B2 / #3D2200 | #F0A66B / #3D2200 / #4A3216 / #FBE3B2 | Selection and active state (check badge, selected card, active row of the side menu), tonal buttons, small accents; never an alert. Rust text on the light background is 4.6:1: short bold labels only |
| Tertiary (blue) | #2F6DB5 / #FFFFFF / #DCE8F7 / #0F2F55 | #8AB4F8 / #0F2F55 / #1E3A5F / #DCE8F7 | Data series other than the water: temperature, charts of the logbook and of the statistics; sparingly |
| Error (red) | #C62828 / #FFFFFF / #FDE2E0 / #5F1010 | #FF8A80 / #3A0A08 / #5C1A16 / #FDE2E0 | Alarms and errors only (unchanged, `--od-alarm`) |

All text pairs reach 4.5:1 and all graphic marks 3:1 (ratios in the reference). Reference: `docs/mockups/palette-roles.dc.html`.

**Dark mode.** Backgrounds are neutral and almost black; the ink becomes #F4F4F2. The water is a tempered amber gradient, from light honey at the surface (#E5B961) to a strong orange at depth (#EF7625), chosen on 5 November 2026: rust looked dull on a dark background, an amber starting from brown was too flat, saturated gradients were too bright. The gradient must stay visible: a shallow dive stays light, a deep dive goes down to the orange. The light profile line has a dark outline, which keeps it readable on the amber and on the background.

**Framework7.** The theme is set with `colors: { primary: '#1F2124' }` when the app is created; in dark mode, the primary colour must be overridden to #F4F4F2, because the one Framework7 derives from a near-black is not readable on a dark background. The Android mock-ups use these MD3 roles (light / dark): primary #1F2124 / #F4F4F2; surface #F4F4F2 / #121314; surface-container #EEEEEC / #1C1D1F; outline-variant #DADAD6 / #3A3C40; secondary, tertiary and error as in "Colour roles" above (the former grey secondary-container #E8E8E5 / #3A3C40 becomes the primary container). On iOS, `--f7-ios-primary` is the ink; secondary text stays the system one (#3C3C43).

**Warning:** Framework7 re-injects its variables at initialisation, which can override an override placed in the CSS. The `--od-*` tokens do not have this problem; an override of `--f7-*` must be checked on screen, in light and dark mode.

**Contrast:** all text at least 4.5:1 on its background, 3:1 for text of 24 px and more and for chart lines. A colour never carries information alone: the alarm and pending states always have text that says what the problem is.

**Statistics charts in blue (decided on 9 November 2026).** Charts that do not measure depth (dives per year, dive durations, and any count or time) use the tertiary role: a ramp from #5B8BCB for the smallest value to #24589A for the largest (3.5:1 to 7.2:1 on the white card; dark mode from #8AB4F8 down to #5B8BCB on the dark card, to be checked on screen). Charts of depth keep the water colours. The Carnet keeps no blue: its only charts are the profile thumbnails, which are water. Mock-up: `android-stats.dc.html`.

## 4. Visual identity

OpenDives' identity lies in **the dive profile**, not in decoration. Around it, the interface stays native and plain.

**The idea: the water column.** In the profile, the area between the surface and the curve fills with water whose colour changes with depth, on the same scale for every dive. This gradient is not decorative: it encodes depth. A 40 m dive is recognisable at a glance next to a 12 m dive. In the list, each dive is represented by the thumbnail of its profile, instead of an icon.

**Logo (decided on 9 November 2026): "Trois vagues".** A porthole seen from the front on the 108 grid: a disc of radius 30 centred on the icon, white (#FFFFFF) in light mode and #1E2023 in dark mode, on the icon background (#F4F4F2 light, #121314 dark). The water fills half of the disc in three layers of waves, the same wave for all three (wavelength 22, amplitude 9 units), each layer slightly shifted to the left of the one above, so the crests are off centre. The layers start at y 52, 60.5 and 69 and each has its own short vertical gradient, in its own colour range so that the top of a layer is always darker than the bottom of the layer above; this keeps the three layers apart at small sizes (decided on 10 November 2026, "dégradés courts"): light mode #FBE3B2 to #F4C98C, #E5A661 to #D88A45, #C76A25 to #A9490C; dark mode #F5E2B0 to #EFD08F, #EBAD60 to #E3923C, #D9702A to #C2550F. The ring exists only under the water: an arc 3 units thick, rounded ends, from (24, 54) to (84, 54) through the bottom, in ink (#1F2124) in light mode and paper (#F4F4F2) in dark mode. Two filled bubbles above the water in the same colour as the arc, at (62, 39) radius 3.6 and (56.5, 30.8) radius 2.6. **Size rule (unchanged):** at 64 px and below (app icons on every platform, notification marks, the logo next to the name in a header), the top half of the circle is completed by a grey arc of the same thickness (#A3A5A8 light, #6B6E72 dark). Above 64 px, when the logo stands alone (splash screen, About screen, first launch, website), there is no grey arc. Files: `docs/brand/opendives-icon-{light,dark}-{fullbleed,round,squircle}.svg` (icons, with the grey arc), `docs/brand/opendives-logo-{light,dark}.svg` (large standalone logo, transparent background, without the grey arc), `app/public/favicon.svg`, `app/public/logo-{light,dark}.svg`. Reference: `docs/mockups/logo-petit-degrades-courts.dc.html`. For the record: the first gradients (overlapping ranges) in `docs/mockups/logo-variante-trois.dc.html`, and the flat-colour trial in `docs/mockups/logo-petit-aplats.dc.html`. The previous logo ("Hublot", one wave, two-colour gradient) is kept for the record in `docs/mockups/logo-anneau-adaptatif.dc.html`.

Files: [`docs/brand/`](brand/).

## 5. Android: Material 3 Expressive

**Android follows Material 3 (decided on 6 November 2026; Material 3 Expressive since 11 November 2026, see below).** Every Android screen uses MD3 components with their sizes and spacing; when a mock-up disagrees with MD3, MD3 wins and Christian is told. Reference values: touch targets at least 48 dp; top app bar 64 dp, 24 dp icons in 48 dp icon buttons; buttons 40 dp high, fully rounded, 24 dp side padding (12 dp for text buttons), labels 14 sp medium on one line; FAB 56 dp with 16 dp corners, small FAB 40 dp; list items 56 dp (one line) or 72 dp (two lines), 16 dp start and 24 dp end padding; switches 52 × 32 dp; radio buttons and checkboxes 20 / 18 dp in 48 dp targets, never shrunk by their layout; dialogs 28 dp corners and 24 dp padding, actions as text buttons at the bottom right (stacked and right-aligned when long); search bar 56 dp, fully rounded, with the leading icon (menu or back) inside the bar and trailing icons inside it too; navigation drawer items 56 dp with a full-pill active indicator; chips 32 dp with 8 dp corners. Menus (⋮): 16 dp corners (more rounded than the MD3 baseline of 4 dp, decided on 7 November 2026), surface-container background, elevation level 2, 8 dp vertical padding, items 48 dp high with 12 dp side padding, a 24 dp leading icon and a 12 dp gap, labels 14 sp medium on one line, width between 112 and 280 dp. A navigation entry in a bottom sheet or list is a list item with a trailing chevron, not a bare text link.

**Android reference: Material 3 Expressive (decided on 11 November 2026, replacing the decisions of 5 and 10 November).** Android follows Material 3 Expressive by default: its components (FAB menu, button groups, split buttons, floating toolbars, loading indicator, wavy progress indicators, Medium and Large FABs…), its shapes, its motion scheme (springs, the "expressive" scheme) and its emphasized type. A standard Material 3 component is used only where Expressive has no version of it, and the values below remain the baseline for those. No dynamic colour (Material You): the OpenDives theme of section 3 stays. Square floating action button with rounded corners, pill-shaped regular buttons, navigation rail on tablets in landscape. On iPhone and iPad, we follow Apple's conventions (Human Interface Guidelines).

## 6. Text, numbers and units

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
| Dive duration | whole minutes; from one hour, hours and minutes in the format of the display language, defined per language in the translation files ("1 h 11" in French, "1:11" in English); min:s in the profile (decided on 10 November 2026) |
| Pressure | whole number |
| Temperature | 1 decimal |
| Volume, SAC | 1 decimal |

**Long totals of time (decided on 10 November 2026).** A total of time under water (statistics key figures, "Par …" and "Mes statistiques" rows, any sum of dive durations) under 24 hours keeps hours and minutes ("11 h 26"). From 24 hours it is written in days and hours, without minutes: "80 j 16 h" in French, "80 d 16 h" in English (keys in the translation files), never "1936 h 02". A single dive duration does not change (see the dive duration format above).

## 7. Layout and navigation

Width decides the layout, not the type of device: below 768 px wide, phone layout; from 768 px, tablet layout. A phone that is folded or unfolded therefore changes layout without restarting.

|  | Phone | Tablet |
| --- | --- | --- |
| Main navigation | Top bar with a ☰ button on the left that opens a side menu (iOS and Android, decided on 6 November 2026); no bar at the bottom | iOS: 220 px sidebar; Android: 96 px navigation rail (from about 1000 dp wide); the Carnet's "+" is a floating button at the bottom right of the screen |
| Sections | Logbook, Sites, Statistics, Tools, then Account and Settings after a separator, in the side menu; the synchronisation state at the bottom of the menu. Account is a section (☰ in its top bar): the cloud account, its synchronisation and the server in use, or, without an account, the choices to create one or sign in | The same, plus Account and Settings at the bottom of the bar |
| Logbook | List, then full-screen detail | List (340 px) and detail side by side |
| Sites | Map at the top, list in a fixed panel below it (not a draggable bottom sheet: no handle, the panel scrolls on its own) | List on the left, map on the right |
| Tools | List of tools, then full-screen planner | Parameters on the left, computed plan on the right |
| Edit a dive | Full screen | iOS: 780 px sheet in two columns; Android: content pane in two columns |
| Settings | Scrolling list | 600 px centred column; two columns on Android |

**Touch targets:** at least 44 × 44 pt on iOS, 48 × 48 dp on Android; 56 px for list rows used on the boat (site choice, buddies).

**Side menu (decided on 6 November 2026, replacing the bottom bar):** the ☰ button appears on every screen listed in the menu (the four sections, Réglages and À propos, decided on 9 November 2026); a screen opened from another screen (detail, planner, editing, a settings sub-screen) has a Back button instead. The menu is 300 px wide and opens over a dark scrim; it closes by tapping the scrim, swiping it to the left or with the system back. Rows of 56 px on Android, 48 px on iOS, labels that follow the system text size; the active section is highlighted in `--od-tint` and announced as the current page. On Android, it is Material 3's modal navigation drawer. On iOS, Apple recommends the tab bar and has no native side menu: OpenDives draws it, and must take care of its accessibility (VoiceOver inside the menu, focus returned to the ☰ button on closing, the edge back gesture must not open it).

**Side menu and section headers, identity (decided on 9 November 2026).** The drawer opens with a header band: a diagonal gradient from sand to copper (#FBE3B2, #EFB677, #C97A35), a faint dive profile at the bottom (white 10 % fill, `#1F2124` 22 % line), and a wave that joins the menu surface. In the band: the logo (44 dp) and "OpenDives" in Title Large; under it, the account in a translucent white card (72 %, 16 dp corners): account icon, the cloud address, "Cloud · N plongées", chevron, opening Compte. "Compte" leaves the list. The active row uses #FBE3B2 with a filled icon; drawer title and labels follow MD3 (Title Small, Label Large). At the bottom, a white card with "Synchroniser maintenant" (tonal button) and, centred under it, the sync state with its icon (manual mode: "N modifications non envoyées" in #8A4B00). References: `appbar-tiroir-android-ouvert.dc.html`, `appbar-tiroir-android-ouvert-manuel.dc.html`.
The four sections use the same band as their header, MD3 Small top app bar (☰, title in 22 sp weight 500, actions) then one summary line in #3D3A33: Carnet "9 plongées · 4 sites · dernière plongée il y a 9 mois" (relative time in days, weeks, months or years), Sites "3 sites · 9 plongées", Statistiques "9 plongées sur 6 années, de 2013 à 2026", Outils "Planifier, vérifier la désaturation, préparer les gaz". The wave joins the content; on Sites, whose map runs under the bar, the band has the same wave and the same faint profile, but the wave cuts the band (a mask on its bottom edge) instead of being painted in the page colour, so the map shows under the curve; no rounded corners, no shadow (decided on 9 November 2026). Carnet: the search icon becomes an MD3 search bar under the summary (56 dp, translucent white, "Rechercher dans le carnet"), and the bar gets a ⋮ menu with "Filtrer" and "Renuméroter les plongées". References: `android-carnet.dc.html`, `android-carnet-menu.dc.html`, `android-etat-vide.dc.html`, `android-etat-horsligne.dc.html`, `android-etat-conflit.dc.html`, `android-sites.dc.html`, `android-stats.dc.html`, `android-outils.dc.html`.

**Spacing:** that of Framework7 lists and blocks; 16 px side margins on phones, 24 to 32 px in tablet panes. No cards with shadows: native full-width lists, or iOS grouped lists.

**Back:** the native gesture (swipe from the edge on iOS, system back on Android) works everywhere; a sheet also closes by dragging it down.

**Add (decided on 5 November 2026):** the Logbook no longer has a permanent Download button, which was of little use. Instead, a "+" button (navigation bar on iOS, floating action button in `secondary-container` on Android, at the bottom right of the screen on tablets, in landscape and portrait) opens three choices: download from the dive computer, import a file, log a dive by hand. The empty logbook offers the same choices directly.

**Android tablet in landscape: "+" out of the rail (decided on 10 November 2026).** The rail no longer has a "+" at the top. On every screen of the Carnet section, the "+" is a floating action button at the bottom right of the whole screen, 24 dp from the edges, over the detail pane, under any scrim, as in portrait. It opens the FAB menu (section 8). Mock-ups: the `android-tablette-*-paysage.dc.html` of the Carnet section.

**Android tablet in portrait: no rail (decided on 10 November 2026).** The navigation rail shows only when the window is at least about 1000 dp wide (Android tablet in landscape). Below that width, in portrait on a tablet as on a phone, there is no rail: the first pane's top bar has the ☰ button that opens the modal side menu of the phone (300 dp, scrim, same content: account card, Carnet, Sites, Statistiques, Outils, Réglages, À propos, sync card), and the Carnet's "+" is the floating button at the bottom right of the screen (24 dp from the edges, over the detail pane, under any scrim), not of the list pane. The list and detail panes keep their widths (340 dp list in the Carnet, the detail takes the rest: 459 dp on an 800 dp tablet instead of 363). Landscape is unchanged. Mock-ups: `android-tablette-accueil-portrait.dc.html`, `android-tablette-accueil-portrait-menu.dc.html` (menu open), and every `android-tablette-*-portrait.dc.html`.

**Back arrow in the detail pane, tablets (decided on 11 November 2026).** In the two-pane layouts (list on the left, detail on the right: Carnet, Statistiques, Outils, and Sites when it shows two panes), the detail pane has its own history.
- **First screen of the pane** (what a row of the list opened: a dive, a trip, a statistic, a tool): no ←. The list is on screen, so there is nothing to go back to: the diver picks another row. The top bar keeps its actions (✎, ⋮), aligned right, with the ← space left empty.
- **Deeper screens** (opened from inside the pane: dive → site, dive → buddy's dives, trip → dive, statistic → dive): ← at the top left, 48 dp target. It goes back one screen **in the detail pane only**. The list, its scroll position and its selected row do not change.
- **Android system back** (gesture or button) does the same as ← while the pane has history. When the pane is at its first screen, system back does what it does on the list alone (in Carnet, leaves the app; in another section, goes back to Carnet), and never only clears the selection.
- **Tasks** (edit a dive, new site, download, add): they keep ✕, never ←, as on the phone (section 7, ✕ closes a full-screen task).
- **Same in landscape and portrait.** Landscape keeps its rail and its two panes, and follows the same rule. Portrait only differs by the ☰ in the first pane.
- **iPad:** the same rule, in iOS form. The secondary column of the split view shows the system back button, a "‹" chevron followed by the previous screen's title (for example "‹ Lake Coleridge"), only when it has history. At its first screen it shows no back button. The edge swipe goes back in that column too.
Mock-ups: `android-tablette-accueil-{paysage,portrait}.dc.html` (first screen, no ←), `android-tablette-carnet-site-{paysage,portrait}.dc.html` (dive → site, with ←).

## 8. Shared components

Six components do not exist in Framework7; each is a single Svelte component, shared by iOS and Android, which only changes its colours and sizes with the theme.

**`<DiveProfile>`: the dive profile and its water column.**

- **Line:** depth over time, from the samples of the first dive computer; the surface at the top, depth downwards.
- **Water column:** the area between the surface and the curve is filled with a vertical gradient, from `--od-water-top` at the top to a bottom colour that depends on the maximum depth: a mix of `--od-water-top` and `--od-water-bottom` in the proportion maximum depth / 60 m, capped at 1. The same scale applies to all dives: a 40 m dive is visibly more rust-coloured than a 12 m one.
- **Exploring:** a finger on the profile places a vertical cursor in `--od-text` and shows the time and depth at that moment, above the graph.
- **Axes (decided on 8 November 2026):** the depth axis on the left has major graduations with labels (every 40 ft or 10 m, the first one carrying the unit, "0 ft") and a light grid line across the chart, plus minor tick marks without labels (every 10 ft or 2 m); the time axis at the bottom has major ticks with labels every 20 minutes (the last one carrying the unit, "80 min") and minor ticks every 10 minutes. Labels 11/14 `#4A4D52`, tabular figures.
- **Temperature curve:** a "Température" filter chip shows the water temperature recorded by the dive computer as a 2 dp blue line (`#2F6DB5`, dark `#8AB4F8`) on its own scale, labelled on the right in the same blue ("10°C", "7°", "4°"). It is on by default when the dive has temperature samples.
- **Technical layers:** Gas, Ceiling, ppO2, Tissues, as toggle chips (MD3 filter chips, iOS buttons); a layer is offered only if the dive has the data for it. Gas shows one band per mix under the profile; ppO2 uses `--od-oxygen`; a violated ceiling uses `--od-alarm`.
- **Landscape:** on phones, turning to landscape opens the profile full screen.

**`<ProfileThumbnail>`: the profile thumbnail**, instead of an icon in each row. 56 × 36 px on iOS (4 px corners), 56 × 40 px on Android (8 px corners). The curve uses the full height (scale specific to the dive); the background colour follows the water column rule, so depth stays readable. It has alternative text: "Profile, 27.6 m at the deepest".

**`<DiveRow>`: a dive in a list.** Thumbnail; site on the first line ("Site to be specified" in tertiary text when missing, never an invented name); date and time on the second; on the right, the maximum depth in bold, then the duration. A dive edited offline replaces the date with what is waiting to be sent ("Notes edited, waiting to be sent"), in `--od-pending`.

**`<TripRow>`: a collapsed trip.** Four reduced thumbnails in a 2 × 2 grid, "Trip of 2 February 2013", then "4 dives, from 21.8 to 28.7 m"; a tap expands the trip. The core's automatic trips are named like the others; their identifier changes at each load and is never stored.

**`<ActiveFilter>`: the active filter row.** While a filter is applied, a row at the top of the Logbook, the Statistics and the map recalls it with the number of matching dives ("Suit: dry suit, 12 dives") and a button to remove it. The filter is the same in all three sections.

**`<SyncStatus>`: the synchronisation state.** A row under the Logbook title, never a dialog: "Synced with the Subsurface cloud" (secondary text, check mark), "Offline: 2 changes will be sent when the network is back" or "Synchronisation stopped for one dive" (`--od-pending`, with an icon). It interrupts the diver only when a choice is needed (conflict, section 9).

**`<SplitButton>` (`od-split-button`): the split button (Android, Material 3 Expressive).** Two tonal buttons 2 dp apart, 40 dp high: the leading one (a `lead` snippet, here the "Synchroniser maintenant" button with its progress) and a 44 dp trailing chevron button. Outer corners fully rounded (20 dp), inner corners 4 dp. The chevron button is `aria-haspopup="menu"` and `aria-expanded`, with its own label ("Autres options de synchronisation"); it opens an `od-menu` popover (`menu` snippet) and, while open, turns 180° and becomes a full circle (no rotation with reduced motion). Used by `<SyncControl>` (side menu card and Account) when synchronisation is manual: "Passer en synchronisation automatique", "Voir les modifications non envoyées" (opens the Logbook, whose dives show what is waiting). With automatic sync, and on iOS, the plain button is kept.

**Flexible section header (`od-band-backdrop`, with `od-section-band`; Android, Carnet, Statistiques, Outils).** The band's gradient, faint profile and wave are one layer (`<BandBackdrop>`) pinned under the top bar; the texts stay in `<SectionBand bare>`. Scrolling, the layer rises until only the bar and the wave remain (Carnet: 64 dp, with the month heading fading in; Statistiques and Outils: the wave alone) while the summary line fades out. The state follows the scroll position, with no animation of its own, so reduced motion changes nothing. Sites keeps its band (the map runs under it).

**Dive rows, duration above depth (decided on 10 November 2026).** In every dive row on Android (Carnet, its trips and selection, export, the states, the dives of a statistic, dives in the Carnet with month headers, tablet Carnet), the right-hand column shows the duration first (16 sp, weight 500, "55 min") and the maximum depth under it (14 sp, `--od-on-surface-variant`, "91 ft"). Both stay right-aligned with tabular figures.

**`<ButtonGroup>` (`od-button-group`): an exclusive choice among a few short options (decided on 11 November 2026).** Android: the Material 3 Expressive connected button group: buttons 40 dp high with 2 dp gaps; unselected tonal (`--od-surface-container-high`, light #E8E8E5, dark #2E3033) with 8 dp inner corners and fully rounded outer ends; selected filled with the ink (`--od-primary-action`, text `--od-on-primary-action`) and fully rounded; no check mark; labels 14 sp medium. iOS: a segmented control. Accessibility: `role="radiogroup"` (named by `aria-label` or `aria-labelledby`) holding `role="radio"` buttons with `aria-checked`; roving tabindex; the arrow keys move the choice and the focus. Used for the unit system (Settings), the dive mode (filter), Nitrox / Trimix and the fill order (gas blender). Not used for the dive profile's curves (filter chips) nor for the single-choice dialogs of Settings, which stay Material radio lists (`reglages-choix-android` and the other `reglages-*-android` boards).

### Editorial pages (account flow, decided on 10 November 2026)

The first impression of the app continues past first launch: the pages that set up the log use the same editorial layout. They are, on Android: sign in (with its in-progress and error states), new account step 1, confirmation code (and wrong code), step 2 "Reprendre votre carnet" (with refused credentials, import in progress, import failed) and the git repository form (with its error states).
- **Top bar:** only ✕ (or ← for step 2), 48 dp target, no title in the bar.
- **Heading block,** 24 dp side margins: an eyebrow (14 sp, weight 500, `--od-on-surface-variant`) that names the flow and the step ("Se connecter", "Nouveau compte · étape 2 sur 2", "Dépôt git"); the page title (34 sp phone, 40 sp tablet, regular, line-height 40/48, letter-spacing −0.4/−0.5) ending with a full stop or its question mark (non-breaking space before "?" in French); the introduction (16 sp, line-height 24, `--od-on-surface-variant`).
- **Content card:** the fields, choices or progress in one `--od-surface-container-lowest` (white) card, 28 dp corners, 20 dp × 16 dp padding (28 × 24 on tablet), 24 dp below the introduction.
- **Actions:** the primary action is a 56 dp full-width pill in `--od-primary` with `--od-on-primary` text (16 sp, weight 500); a secondary action stays a text button beside it ("Précédent", "Annuler l’import", "Carnet vide"). Phone: anchored 28 dp above the bottom. Tablet: last element of the card.
- **Profile:** the decorative dive profile of first launch (1.5 dp `--od-on-surface` line over the water gradient, `aria-hidden`), across the whole width, 130 dp high: phone, just above the actions; tablet, at the bottom of the content area, behind the columns.
- **Tablet:** landscape, heading block on the left (from 48 dp) and the card in a 480 dp column on the right, centred vertically; portrait, one 520 dp column, card under the heading.
- **iPhone (decided on 10 November 2026):** the same layout with iOS conventions: the navigation bar keeps "Annuler" or "‹ Retour", with no title and no background; the bar title and step become the eyebrow (15 pt, semibold, secondary label colour); the title is 34 pt regular; the introduction 17 pt; inset grouped sections with 20 pt corners; the primary action a 56 pt capsule (`--od-primary`), a secondary action as a plain or grey capsule beside or under it; the profile just above the actions. Mock-ups: `compte-connexion-ios.dc.html`, `compte-connexion-encours-ios.dc.html`, `compte-connexion-erreur-ios.dc.html`, `compte-creation-ios.dc.html`, `compte-code-ios.dc.html`, `compte-code-erreur-ios.dc.html`, `ios-compte-import.dc.html`, `compte-import-identifiants-ios.dc.html`, `compte-import-encours-ios.dc.html`, `compte-import-echec-ios.dc.html`.
- **Git note:** the note under the git form reads only "Le jeton reste chiffré sur cet appareil." (13 sp, `--od-on-surface-variant`), with no background.
Mock-ups: `compte-connexion-android.dc.html`, `compte-connexion-encours-android.dc.html`, `compte-connexion-erreur-android.dc.html`, `compte-creation-android.dc.html`, `compte-code-android.dc.html`, `compte-code-erreur-android.dc.html`, `android-compte-import.dc.html`, `compte-import-identifiants-android.dc.html`, `compte-import-encours-android.dc.html`, `compte-import-echec-android.dc.html`, `git-config-android.dc.html`, `git-config-erreur-android.dc.html`, `git-config-adresse-android.dc.html`; tablet `android-tablette-compte-connexion-{paysage,portrait}.dc.html`, `android-tablette-compte-creation-…`, `android-tablette-depot-git-…`.

### FAB menu (Android, decided on 10 November 2026; phone too since 11 November 2026)

On Android, on phone and tablet (landscape and portrait), the Carnet's "+" opens the Material 3 Expressive FAB menu (`od-fab-menu`, `FabMenu.svelte`) instead of a bottom sheet; on the phone it is anchored at the FAB's place (`android-ajout.dc.html`). iOS keeps its action sheet.
- **Items,** right-aligned above the button, from bottom to top: "Télécharger depuis l’ordinateur" (primary, `--od-on-surface` #1F2124 background, #F4F4F2 text), "Importer un fichier", "Noter une plongée à la main" (tonal, #E3E1DC background, #1F2124 text). Each is a 56 dp pill, 24 dp padding on both sides, 24 dp icon, 8 dp between icon and label, label 16 sp weight 500 (Title Medium).
- **Spacing (wider than the Expressive default, so a finger cannot press two items):** 16 dp between items, 24 dp between the lowest item and the close button.
- **Close button:** the FAB becomes a 56 dp circle in `--od-on-surface` with a ✕, in the FAB's place (24 dp from the right and bottom edges). Scrim rgba(0, 0, 0, 0.16) over the screen; tapping it, ✕ or system back closes the menu.
- **Motion:** opening, the FAB morphs from its rounded square (16 dp corners) into the circle and its + turns 45° into ✕; the items unfold from the bottom one up, about 50 ms apart, each growing from the right edge and rising slightly with a light spring. Closing is faster, from the top item down, and ✕ turns back into +. Use the Expressive motion scheme springs of the Material library, not custom curves. With "Remove animations" on in Android, the menu appears and disappears without motion.
- **Accessibility:** the button announces "Ajouter des plongées" and its expanded state; the items are a menu; focus goes to the first item on opening and back to the button on closing.
Mock-ups: `android-tablette-ajout-paysage.dc.html`, `android-tablette-ajout-portrait.dc.html`.

### Wavy progress and loading indicator (Android, decided on 11 November 2026)

**`<LinearWavyProgress>` (`od-linear-wavy-progress`):** the Material 3 Expressive wavy linear progress indicator, for operations on Android (dive-computer download, offline maps download and update, account import, indeterminate bar under the top bar while signing in). iOS keeps its flat bar. The drawer's "Encore 1 plongée avant la 10e" gauge and the sync bar stay plain bars.
- **Props:** `value` (0 to 1) or `indeterminate`; `label` (required).
- **Geometry** (Compose `LinearWavyProgressIndicator` defaults): 4 dp stroke with round caps, wave amplitude 3 dp (10 dp high in all), wavelength 40 dp determinate and 20 dp indeterminate. Determinate: the wave for the done part, a 4 dp gap, the flat track, a 4 dp stop dot at its end; the amplitude flattens smoothly over the first 10 % and the last 5 %. Indeterminate: two wave segments run across, the track fills the gaps between them. The functions are in `app/src/lib/progress-geometry.js`.
- **Colours:** wave and dot `--od-action` (ink), track `--od-separator`; a screen may override `--od-linear-wavy-progress-active` and `--od-linear-wavy-progress-track`.
- **Accessibility:** `role="progressbar"`, `aria-label`, `aria-valuenow` (percent) unless indeterminate.
- **Motion:** the wave travels at 40 dp/s. With "Remove animations" (`prefers-reduced-motion`) the wave stands still and the indeterminate one is a static pair of segments.

**`<LoadingIndicator>` (`od-loading-indicator`):** the Material 3 Expressive loading indicator, uncontained, instead of circular spinners on Android: "À proximité" while scanning (20 dp), the running import step (24 dp), the "Connexion…" button (18 dp, hidden from TalkBack because the button text says it).
- **Props:** `size` (dp), `label` (required; "" hides it from TalkBack).
- **Shape:** it holds, then morphs between the Expressive polygons (soft burst, 9-sided cookie, pentagon, pill, sunny, 4-sided cookie, oval) while turning; the morph interpolates the shapes' radii.
- **Colour:** the water gradient from top to bottom, `--od-loading-indicator-top` and `--od-loading-indicator-bottom` (light sand #F3C47A to rust #B4530F; dark honey #E5B961 to amber #EF7625).
- **Accessibility:** `role="status"` with its `aria-label`. With "Remove animations", one static shape.
### Floating toolbar (Android, decided on 11 November 2026)

**Rule: every sheet carries its actions in the floating toolbar** (dive, trip, site, and the Carnet's selection); the top bar keeps only ← (or ✕ and the count). iOS keeps its top bar.

`FloatingToolbar.svelte`, class `od-floating-toolbar` (parts `od-floating-toolbar--button`, `--primary`, `--text`; modifiers `--hidden`, `--clear-fab`). The Material 3 Expressive vibrant floating toolbar, at the bottom centre of the page, 24 dp above the bottom edge: 64 dp high, fully rounded, 8 dp inner padding, 4 dp between actions, shadow like the FAB menu. Colours are `--od-toolbar-container` / `--od-toolbar-on-container` (ink with light icons; dark mode: light container with dark icons) and `--od-toolbar-primary` / `--od-toolbar-on-primary` for the primary pill.
- **Actions:** the first is the primary pill (48 dp high, icon and label, 14 sp weight 500); the others are 48 dp icon buttons, each with an accessible name. The last one, ⋮, opens a menu (`aria-haspopup="menu"`, an `od-menu` popover).
- **Dive detail:** Modifier (primary), Partager (the standard Android share icon: three connected dots), Planifier depuis cette plongée, ⋮ (Renuméroter la plongée, Retirer du voyage only when the dive is in a trip, a divider, then Supprimer la plongée in `--od-alarm`).
- **Trip sheet:** Modifier (primary), "+" (Ajouter des plongées), ⋮ (Fusionner avec un autre voyage, a divider, then Défaire le voyage in `--od-alarm`). The note under the dive list says the actions are in the bottom bar; the per-dive ⋮ of the list stays.
- **Site sheet:** Modifier (primary), map icon (Ouvrir dans Cartes; only when the site has a position), ⋮ (Fusionner avec un autre site, a divider, then Supprimer le site in `--od-alarm`).
- **Menu of ⋮:** an `od-menu` popover just above the toolbar, its right edge aligned with the ⋮ button, no arrow. The destructive item (last, after a divider) is in the alarm colour, icon and label. While the menu is open the ⋮ shows its pressed state (a state layer, `od-floating-toolbar--pressed`, `aria-expanded`).
- **Tooltips:** each button shows an MD3 plain tooltip (`od-floating-toolbar--tooltip`: inverse surface, 12 sp, 4 dp corners, 4 dp above the toolbar, centred on the button) with its name on long press (about 450 ms; it goes away 1.5 s after the finger lifts and the press does not trigger the action), and with a mouse on hover (700 ms) or keyboard focus.
- **Carnet selection:** Créer un voyage (primary), Exporter, Supprimer, ⋮ (Filtrer, Renuméroter, Ajouter au voyage…). The top bar keeps ✕ and the count.
- **Scrolling:** it hides while the page scrolls down (it slides out and fades with the Expressive "fast spatial" spring) and comes back on scrolling up, and when the end of the content is reached. The page content gets a bottom padding of 104 dp so the last row is never covered. With "Remove animations" it appears and disappears at once.
- **Tablets:** it sits in the page of the pane that owns the actions (the detail pane, or the list pane for the selection), centred; on a tablet in portrait, the detail's toolbar stays to the left of the "+" (`--clear-fab`).
- **Accessibility:** `role="toolbar"` with a label; one tab stop (roving tabindex), Left and Right arrows, Home and End move inside; hidden, it is `inert`.
- iOS does not use it.
Mock-ups: `detail3-android.dc.html`, `detail3-android-curseur.dc.html`, `detail3-android-sombre.dc.html`, `carnet-selection-android.dc.html`, `carnet-selection-menu-android.dc.html`, `android-tablette-detail-menu-*.dc.html`, `detail2-android-menu.dc.html`, `voyage-android.dc.html`, `android-tablette-voyage-*.dc.html`, `sites-fiche-android.dc.html`, `android-tablette-site-*.dc.html`, `android-tablette-carnet-site-*.dc.html`, `android-tablette-carnet-selection-*.dc.html`.

### Motion (Android, decided on 11 November 2026)

Android uses the Material 3 Expressive motion scheme: springs, not fixed curves. A spring is a damping ratio and a stiffness; `lib/motion.js` samples each one into a CSS `linear()` easing and a duration (the time to settle within 0.5 % of the target) and declares them once on `<html>`, on Android only (the `md` class), as `--od-motion-<name>` (easing) and `--od-motion-<name>-ms` (duration). iOS keeps Framework7's curves.

| Token | Damping ratio | Stiffness | Use |
|---|---|---|---|
| `spatial-fast` | 0.6 | 800 | small things: dialogs, FAB menu, floating toolbar, going back |
| `spatial-default` | 0.8 | 380 | pages, swipes between dives or sections, rows sliding in |
| `spatial-slow` | 0.8 | 200 | declared, unused for now |
| `effects-fast` | 1 | 3800 | colour and fade of the FAB menu |
| `effects-default` | 1 | 1600 | fades of dialogs, scrims, pages, rows |
| `effects-slow` | 1 | 800 | declared, unused for now |
| `anchored-default` | 1 | 380 | side drawer, sheets, popups |
| `anchored-fast` | 1 | 800 | declared, unused for now |

Spatial springs (position, size, scale) may overshoot a little; effects springs (opacity, colour) never do. The `anchored` tokens are an OpenDives addition: the spatial stiffness with a damping ratio of 1, for surfaces fixed to a screen edge, which must not leave it.

Where they apply (rules in `theme.css`, layer `od.base`, and in the components):

- **Page transitions** (opening a dive, Settings, any pushed page, phone): the new page and the one below use `spatial-default`; going back uses `spatial-fast` and `effects-fast` for the fade. Framework7's keyframes are kept; only their duration and easing change.
- **Swipe between dives or sections** (`od-slide-next`, `od-slide-previous`): the slide is `spatial-default`, the fade `effects-default`.
- **Side drawer, sheets, popups:** Framework7's `--f7-panel-*`, `--f7-sheet-*` and `--f7-popup-*` transition variables use `anchored-default`.
- **Dialogs:** Framework7's `.dialog` and `<Md3Dialog>` grow from 90 % with `spatial-fast` and fade with `effects-default`; the scrim fades with `effects-default`. Closing is immediate for `<Md3Dialog>`.
- **FAB menu and floating toolbar:** `spatial-fast` and `effects-fast` (see their sections).
- **List items:** the dives of a trip just expanded slide down (`spatial-default`) and fade in (`effects-default`). Nothing animates when a list is first drawn or scrolled, so the Logbook's virtual list costs nothing; rows removed disappear at once.
- **Tablet detail pane:** the pane swaps without animation, as before.

Springs are kept short (all under 0.4 s except `spatial-slow`). "Remove animations" (`prefers-reduced-motion`) cuts every transition and animation to 0.01 ms through the rule at the end of `od.base`; the `--od-motion-*` tokens need no special case.

### Text fields

**Text fields (decided on 6 November 2026, updated the same day).** Every text field of the app on Android uses the MD3 **filled** variant (Framework7 MD inputs without the outline style): surface-container-highest background (#E8E8E5 light), 4 dp top corners, a 1 dp bottom indicator that becomes 2 dp in the primary colour on focus, the label inside the field: full size when the field is empty and not focused, with no placeholder; small above the value on focus or once the field has a value. Helper text sits under the field. A trailing icon (for example "use my position") is a plain 24 dp icon button, without a filled background. In a full-screen form, the save action is a text button at the right of the top bar ("Enregistrer"), the close action an X at the left. Reference: `docs/mockups/sites-edition-android.dc.html`.

**Exposed dropdown menu (`<SelectField>`, `od-select-field`; decided on 11 November 2026).** The one pattern for choosing a single value in a list on Android: no wheel, no connected button group, no dialog. The field is the filled text field with a downward stroke chevron at its end. Open: a 2 dp ink underline, the label in ink, the chevron pointing up. The menu (`role="listbox"`, items `role="option"`) opens right under the field, 4 dp below it, at the field's width (above it when there is no room below), 4 dp corners, `--od-surface` background with the menu shadow (elevation level 2), 8 dp vertical padding, items 48 dp high at 16 sp with 16 dp side padding; at most about five and a half items show, the rest scrolls. The current value is highlighted with `--od-surface-container-highest` (light #E3E1DC, dark #3A3C40) and carries `aria-selected="true"`; no check mark. It closes on a choice, a tap outside, Escape or the system Back key (`lib/back-button.js` sends `od-cancel` to the open menu first). Keyboard: Arrow Down or Up opens the menu, the arrows, Home and End move the highlighted item (`aria-activedescendant`), Enter or Space chooses, Escape closes, Tab leaves. A value that is not in the list (read from a dive, typed earlier) shows in the field and heads the menu. A long list (the sites of "Edit dive") adds a search field at the top of the menu (words in any order, accents and case ignored) and a last item, "New site…", that turns the field into a text field for the new name. Two numbers side by side (the pO₂ thresholds of Settings) are two dropdown fields, each with "Default …" under it. Numbers with usual values (maximum pO₂ 1,0 to 1,6 bar by 0,1) are dropdown menus too, never wheels. iOS keeps its own pattern (the system's choice list). Not covered: the single-choice dialogs that act at once (merge with, keep which site) and the Settings rows, which stay Material radio lists.

### Snackbar

Every snackbar in the app uses one style, the one of `docs/mockups/sites-nettoyer-pas-doublons-android.dc.html`:

- Container: inverse surface, `--od-inverse-surface` #2E3033 in light mode (#E8E8E5 in dark mode), 4 dp corners, shadow 0 2 6 rgba(0, 0, 0, 0.25). Floating 16 dp from the left and right edges and 24 dp above the bottom of the screen, or above the FAB when there is one.
- Height at least 48 dp; padding 8 dp top and bottom, 16 dp left, 8 dp right. Text on up to two lines.
- Text: 14 sp, line height 20 sp, `--od-inverse-on-surface` #F4F4F2 (dark mode #1F2124).
- Action: a text button, 40 dp high, 12 dp side padding, 14 sp semibold, in `--od-inverse-primary` #8AB4F8 (dark mode #2F6DB5). At most one action, usually "Annuler".
- Duration: at least 4 s, 6 s when there is an action. One snackbar at a time; a new one replaces the old.
- `role="status"` so screen readers announce it; the action stays reachable with the keyboard and TalkBack until the snackbar closes.

## 9. States and messages

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

## 10. Never in OpenDives, and checks before delivering a screen

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
- [ ] Contrast as in section 3, and readability in full sunlight
- [ ] Reduced motion respected
- [ ] Mixed units (feet and °C, for example) and French number format
- [ ] The five states of section 9
- [ ] A real logbook read from the cloud (Christian's), and the Subsurface sample logbook

**Open points to decide:** telling the pending colour apart from the colour of the water, to check on screen (in dark mode, the amber of the pending state is close to the honey of the water; chosen knowingly on 6 November 2026); version choice in case of conflict.

**Not frozen yet:** colours must still be checked on a real phone, in full sunlight and at night; open points are marked **To decide**.

## 11. Earlier visual direction

Kept for context: where these paragraphs differ from the sections above, the sections above apply.

**Colours.** The first "water and buoy" direction (blues and buoy orange) was dropped on 5 November 2026: colours should not evoke water or the sky, but the diver's state of mind, the urge to dive again, with confidence and control. A "fir green and tangerine on cream" palette followed and was dropped the same day. The chosen theme is **black and white**: neutral light interface, ink #1F2124, strong contrast, sans-serif titles; in dive data, the water column goes from sand to rust with depth (honey to amber in dark mode). The earlier rule "colour reserved for data" was dropped on 9 November 2026. Its values are in section 3.

**Typography.** The system fonts: SF Pro on iOS, Roboto on Android. It is the native choice, and it keeps text readable at every accessibility size. One rule specific to OpenDives: dive figures (depth, duration, pressure) use **tabular figures**, so columns of values stay aligned from one row to the next.

**Layout.** Native full-width lists rather than cards, left alignment, numeric values aligned in columns. In a list row, metadata sits in columns, not chained with middle dots.

**What was set aside and why.** The first reflex was the "ocean" look: blue gradient background, a wave in the header, rounded cards with soft shadows. It is the default look of almost every diving app and of generated interfaces. It was replaced by a gradient reserved for data (the water column). The interface around it stays the system's.
