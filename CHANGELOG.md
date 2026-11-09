# Changelog

All notable changes to OpenDives are listed here, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the app uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). This file is updated at
each release; the app's own "What's new" list (About) describes the current version
in fewer words.

## [Unreleased]

### Added

- **Release check for the planner's calculations** (`tests/release-check.sh`, no tag without a green report for the commit): the 17 cases of Subsurface's planner tests through the façade, an independent ZH-L16C checker over 360 plans, the app chain (units, request, displayed values, alarms), proof that wrong inputs make each fail, the same tests compiled with the NDK and run on the emulator, and planner scenarios in the real app. A GitHub Actions workflow runs the checks that need no device on each push to `main`.

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

[0.2.0]: https://github.com/remillc/opendives/releases/tag/v0.2.0
