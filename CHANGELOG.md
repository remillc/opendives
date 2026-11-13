# Changelog

All notable changes to OpenDives are listed here, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the app uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). This file is updated at
each release; the app's own "What's new" list (About) describes the current version
in fewer words.

## [0.3.0] - 2026-11-13

### Added

- **Offline maps (Android).** From Settings, choose an area on the map with a fixed
  frame and download it. A search field finds a site of your logbook as you type, or a
  place when you press search. Without a network, the Sites map and the site maps read
  what was downloaded, then fall back on a simplified world map; an "Offline" pill says
  so. A space limit and a free-space floor protect the device, and updates are offered
  with a badge.
- **Your own git repository.** The logbook can live in your own git repository (GitHub,
  GitLab, Codeberg or your server) instead of the Subsurface cloud: "Use my own git
  repository" on the first page, with a help page to create an access token. The token
  stays encrypted on the device.
- **Planned dives.** The planner is rebuilt: plans are saved in the logbook as planned
  dives and synced, with several levels and gases, volumes per gas with a bar for the
  consumed part and the reserve, a CNS bar, a decompression model for each plan, and
  sharing. A plan can start from a logbook dive; from a rebreather dive it starts on the
  diluent.
- **The dives of a statistic.** Each row of My statistics and of the "By …" sections
  opens the list of its dives, newest first, under the filter in force.
- **Logbook dive computers.** In Settings and the logbook's ⋮ menu: rename, remove or
  merge duplicates, found by serial number, then by comparing the profiles. When editing
  a dive with several computers, choose the main one.
- **Site map on the dive page.** When the site has GPS coordinates, a map of the site
  sits behind the header, prepared ahead on Wi-Fi.
- **Desaturation.** A "Last dive" section with the time since surfacing, and "You can
  fly" once the wait is over.
- **Sync failures explained.** When a sync fails while the network works, the Logbook
  says why (password refused, cloud not answering, git repository refused) and offers
  what to do. The sync state shows in a pill in the header.
- **Trips in the Logbook.** A trip can be selected, and "Delete this trip" removes the
  trip and keeps its dives. "Remove from trip" is in the dive's ⋮ menu. While dragging a
  dive, a bar shows where it would be dropped.
- **Sites.** The search opens from the magnifier with an animation, dims the sites that
  do not match and highlights the match in the list. A menu sets the order of the list,
  alphabetical or most recent first, and a long press selects sites to merge them. Dives
  without a site show a thumbnail of their profile and open it in full.
- **Clean up sites.** A pencil on each site of a duplicate group opens its editor. "Not
  duplicates" stops suggesting a pair on this device, with "Undo".
- **French (Canada).** The app language can be Français (Canada), which says "nuage" and
  "courriel"; a phone set to French (Canada) picks it by itself.
- **Settings.** A "Default conditions" group (water type and altitude) for the planner
  and the gas tools; the water type written on downloaded dives that have none; default
  cylinders for open circuit and rebreather (diluent, oxygen, bailout); the number of
  dives for each cylinder type.
- **About.** Each open source library opens its website, and the privacy policy's links
  can be tapped.
- **Logbook month.** While scrolling, the band shows the month of the first visible dive
  and its number of dives, written as the display language writes it.
- **Release check for the planner's calculations** (`tests/release-check.sh`, no tag
  without a green report for the commit): the 17 cases of Subsurface's planner tests
  through the façade, an independent ZH-L16C checker over 360 plans, the app chain
  (units, request, displayed values, alarms), proof that wrong inputs make each fail, the
  same tests compiled with the NDK and run on the emulator, and planner scenarios in the
  real app.
- **Reading a gauge with the camera (Android).** In "Edit dive", a camera button in the
  Start and End fields of each cylinder reads the pressure on a digital gauge or dive
  computer display (one or two gauges, bar or psi), or on a photo chosen with "Photos",
  and fills the field to check. On-device text recognition; the photo is not kept. A
  needle dial is not read yet.
- **Rebreather dives.** The Gas section of a closed-circuit dive draws the rebreather
  seen from the back, diluent on the left and oxygen on the right, with the bailout and
  stage cylinders beside it; "Edit dive" draws the same unit. A cylinder without both
  its pressures is hatched in grey.
- **Water slate and plan sharing.** "Share plan" offers the water slate (a pocket card
  to print at actual size with cut marks, with backup plans: 5 min more, 3 m / 10 ft
  deeper or a lost deco gas, each calculated again), the PDF sheet, the table image, the
  planned dive's .ssrf file and the text summary. Settings › Language and formats ›
  Paper size: Automatic, Letter or A4.
- **Links.** `opendives://` and `https://opendives.app/` addresses open a dive, a site,
  the planner or a tool; a dive and a site can be shared as a link. A Subsurface
  logbook file (.ssrf, .xml) sent from a mail or file app opens in OpenDives to be
  imported, after a confirmation; any other file is refused.
- **Leaving a form.** Leaving a form whose values changed (←, ✕, Android Back, the iOS
  swipe) asks "Leave without saving?" with Stay, Save and Leave.
- **Planner.** The result lists every row of the dive (descent, levels, ascents, stops,
  the final ascent) with start, duration, end, speeds and gas; two SAC fields, "At the
  bottom" and "During deco"; a reserve with a SAC factor under stress and a number of
  divers; "Simplify profile" turns a measured profile into editable levels; "Save" asks
  for a title.
- **Best mix.** Two tabs, Nitrox and Trimix; the maximum END only applies to the trimix.
- **Units.** A "Partial pressures" unit, bar or ATA; "Pressure" becomes "Cylinder
  pressure".
- **Settings.** "Show photo and video fields" (off by default); a "Download" group for
  Bluetooth devices and remembered computers.
- **Offline maps on iPhone and iPad.**
- **Release check for the tools.** The gas calculator, the blender and the desaturation
  are checked in `tests/release-check.sh`: the desaturation against an independent
  ZH-L16C replay of real dives, the blender against an independent real-gas solution.

### Changed

- **New look.** The "Trois vagues" logo for the app icon, the launch screen, the menu
  and About; a band with a wave and a summary at the top of each section; the account at
  the top of the side menu; a search bar in the Logbook. Settings and About use the ☰
  menu.
- **Dive page.** Follows the mock-up: top bar, trip as a link, people and tags as chips,
  full-width profile, cylinder pressure bars from 0 to the working pressure.
- **Dive rows.** No dividers; on Android, the duration above and the depth below. The
  dive number comes before the date, and the dives of an open trip are indented on a
  white surface and can be checked in selection mode.
- **Durations.** From one hour, they follow the display language: "1 h 11" in French,
  "1:11" in English. The "Always in hours and minutes" option is gone.
- **Filter (Android).** The page is rebuilt: cylinder and gas criteria grouped, a saved
  filter fills the page and can be deleted at once with "Undo". The explanatory sentences
  under the criteria are gone.
- **Statistics.** The "By …" sections fold and are closed at first, rows no longer show
  the maximum depth, and the one-year view is gone. Charts that do not measure depth are
  blue.
- **Edit a dive.** Sections and cylinders are always open, the trip is chosen from a
  list, and a rebreather dive has no gas switch depth for its diluent and oxygen.
- **Sync conflict.** A new dialog with readable differences, "Later" and "Undo" before
  anything is sent. With several dives, a full-screen dialog with a "Same choice for all"
  switch.
- **Messages.** One style for every snackbar, above the + button when there is one.
- **Settings.** "Reset all settings" asks first, then keeps the planner settings and
  your list of cylinders.
- **Planner.** The SAC factor under stress is 2.0 by default.
- **Secure connections.** The OpenSSL library is replaced by Mbed TLS, compatible with
  the app's licence.
- **What's new.** The version date next to its number.
- **Blue theme.** Header bands, side menu, water of the profile and thumbnails, cylinder
  drawings, selections and progress bars are ocean blue; rust and sand mark data such as
  the water temperature and the statistics charts. The app icon, logo and splash screen
  have blue waves.
- **Material 3 Expressive (Android).** Springy motion; dates and times in the Material
  date picker and clock; dropdown menus under their field instead of wheels and radio
  buttons; connected button groups; large titles that shrink as you scroll; a floating
  toolbar for the actions of a dive, a trip, a site and a selection; a split "Sync now";
  a wavy progress line and a morphing loading shape.
- **Dive page.** Gas and Equipment are two sections: a drawing of each cylinder with its
  gas, use, size and pressures, and the gas changes in one line; the profile fills the
  phone's width and shows the entry and exit times and the average depth; the info grid
  no longer repeats them; the dive computers belong to the equipment; unused cylinders
  show.
- **Edit dive.** A Gas group with the dive mode and the cylinder drawings, each cylinder
  in its own sheet or card with its gas in plain words and its size from the type;
  cylinders can be reordered; deleting one asks first; Conditions start collapsed.
- **Cylinder drawings.** A slimmer, more realistic shape with shoulders and a neck, no
  valve, in every screen; a cylinder with only one or no pressure is hatched in grey.
- **Planner result.** One "Result" card: the total time and the deco stops as key
  figures, then the stops (the starting gas highlighted) or "Ascent with no stop", the
  volume per gas (total in large type, a bar and its legend) and the oxygen exposure in
  the same layout. The SAC list goes by 0.01 cu ft/min and every dropdown opens on its
  value; oxygen, helium and altitude are dropdowns of the usual values.
- **Account and first launch.** The sign-in, account creation, logbook import and git
  repository screens take the layout of first launch on Android and iPhone; first launch
  is simpler, and full screen on tablets.
- **Tablets.** In portrait, no navigation rail (☰ and the floating "+" as on a phone);
  the detail pane's back arrow only goes back inside the pane; Settings and About open
  full width.
- **Freediving.** No gas in the dive page or in "Edit dive".
- **Interface texts.** Shorter and clearer, following the writing guide.
- **Canadian French.** Times read "10 h 44" whatever the device region.

### Fixed

- **Slow buttons.** Navigation buttons reacted a fraction of a second late, because each
  touch restyled the hidden sections too.
- **Units.** The units chosen on the device no longer go back to the logbook's at
  restart, and a chosen unit system stays after a restart.
- **Saved plans.** A plan keeps its rates, reserve and other settings, and gives the
  same result when reopened.
- **Sharing.** The app no longer stays stuck under a grey veil after sharing a dive or a
  plan.
- **Trips.** A trip of one dive is shown as a dive, and a dive on its own no longer
  shows a trip.
- **Tablet.** The Logbook opens the first dive when none is shown.
- **What's new.** The list stopped after 20 entries.
- **Gas blender.** The helium step of a trimix was about 0.8 % short (the core read
  pure helium as air in its compressibility), and the oxygen step as much too long.
- **Keyboard (planner).** It closed while typing in a level, gas or GF field.
- **Logbook margins (Android).** Dive rows had 8 dp too much on each side.
- **Statistics.** The dives behind a row open faster with far less memory, and a value
  is no longer cut in the middle of a number or word.
- **Taps.** A tap that slid a little was sometimes ignored.
- **Start-up.** The app no longer stays on a white screen before its look has loaded.
- **Tools and Statistics.** A row no longer stays tinted grey after turning a large phone
  to landscape and back.
- **Units.** A single unit changed after "Imperial" or "Metric" is kept after a restart.
- **Tablet.** After signing out, the last dive no longer stays beside the empty
  logbook; section headers have their wavy edge again.

## [0.2.0] - 2026-11-08

### Added

- **Dive editor with every field Subsurface desktop edits**: date and time, site, trip,
  rating, people and tags, notes, suit, dive mode, every cylinder field (type, use,
  size, working pressure, start and end pressures, O₂, He, gas switch depth with the
  MOD as helper), weights, conditions, air and water temperatures, water type,
  atmospheric pressure and "Invalid dive". Duration and maximum depth are shown, as
  measured by the dive computer. Cylinders and weights can be added and removed (a
  cylinder used by the profile cannot be removed).
- **Weights**: choosing a weight location fills in the last weight used for it, from
  Subsurface's own table.
- **Site and trip typed or chosen**: the list narrows with every word typed, in any
  order, case and accents aside; a new name creates the site or the trip. The same
  applies to the suit.
- **Renumber a dive** from the dive's ⋮ menu: the dives in between shift by one, so
  numbers stay unique and without gaps; said live under the field. One undoable step,
  as Subsurface's RenumberDives.
- **Share a dive** from its ⋮ menu: a one-page PDF sheet (profile, gas, equipment,
  people, conditions, notes), or a short text with the profile image, through the
  system share sheet.
- **Export the selected dives** from the logbook's selection menu: full logbook
  (.ssrf), UDDF, CSV list of dives, CSV profiles or PDF sheets (one page per dive),
  with Subsurface's Anonymize option. The last format is remembered.
- **Dive profile**: graduated depth and time axes, and layers to show or hide as filter
  chips: water temperature (on by default), gas, ppO₂ (0 to 1.6 bar with the 1.4 and
  1.6 limits), decompression ceiling and the 16 tissue compartments at the cursor. The
  cursor readout adds the value of each layer shown.
- **Download from the dive computer**: a "Stop download" button; the progress bar moves
  steadily while each dive is transferred.
- **Planner**: settings on their own screen (rates, stops, gas, reserve), plan data
  edited in place, the decompression ceiling on the planned profile, the SAC chosen
  from a menu.
- **Sync**: the current stage and a progress bar in the side menu; "Sync now" shows its
  progress in the button and a message confirms the end or reports the error.
- **Tablets**: list and detail side by side for Statistics, Tools and Sites (list and
  map); the dive editor opens as a sheet (iPad) or a pane (Android) over the logbook.
- **Settings**: paper size of the PDF sheets ("System" follows the region: US Letter
  where it is used, A4 elsewhere).
- **Sites**: map, site page, dives without a site, sites without coordinates and
  duplicate clean-up.
- **Delete a dive** from its ⋮ menu, with "Undo" for 10 seconds.
- **About**: privacy policy (also published as a web page) and "Question / report a
  problem" by email.
- **Swipes** between the sections of the side menu and back from a sub-screen.

### Changed

- **Units**: every measure follows the units of the settings; round defaults in each
  system (45 ft, 3,000 psi, 30 and 60 ft/min, 500 psi); the SAC in cubic feet has two
  decimals; imperial symbols are translated in the language of use.
- **Planner**: a single ascent rate; the last stop as a choice of depth.
- **Gas blender**: nitrox by default, the last mode chosen is remembered.
- **Snackbars** stay at least 4 seconds, 6 seconds when they offer "Undo".
- **Text**: Source Sans 3 at the size of the mock-ups; shorter profile hint.
- **Addresses** inside the app: collections end with a slash, resources do not
  (`/dives/42`, `/sites/`).
- The "What's new" list is headed by the app's version, read from `package.json`.

### Fixed

- **Downloads**: new dives are numbered after the last dive of the logbook even when
  the download also reads older dives again.
- **Sharing by email**: Gmail sent a broken attachment, as it reads the file after the
  share sheet closes; the receiving apps now keep read access to the shared file.
- **Exports and imports through XSLT** (UDDF, CSV): Subsurface's stylesheets are shipped
  with the app, and stylesheets that include another one load again.
- **Back key**: closes only the search of the screen shown.
- **Sync now**: the list and the menu stay in place while it runs.

## [0.1.0] - 2026-11-07

First test version, for Android: logbook synced with the Subsurface cloud or kept on
the device only, dive pages with the profile, trips, sites on a map, download from the
dive computer over Bluetooth, statistics, planner and gas tools.

[0.3.0]: https://github.com/remillc/opendives/releases/tag/v0.3.0
[0.2.0]: https://github.com/remillc/opendives/releases/tag/v0.2.0
