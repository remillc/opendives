# OpenDives — Functional reverse engineering of Subsurface

2026-11-05 · Christian Rémillard

English copy of the French original kept on claude.ai ([online](https://claude.ai/artifact/JoAhr3WfF5DVPiJabCuE2D)).

## 1. Summary and scope

Subsurface covers **13 functional domains** and about 75 undoable actions. The mobile app covers only part of them. OpenDives, which will be a complete app, must aim for the whole. This document describes **what** Subsurface does (features, data, rules, integrations), never **how** its screens present it: OpenDives' interface is designed separately, from a blank page.

- **Analysed:** the desktop app and the mobile app, from the code (`core/`, `commands/` which lists every undoable action, `stats/`, `profile-widget/`), the user manual (desktop, 5,600 lines) and the mobile manual v3. The reference commit is `258beb4` of 4 November 2026.
- **Decisions already made:** OpenDives connects to the existing Subsurface cloud, uses Capacitor (web interface in a native app), and Subsurface's C++ core is reused or reproduced to stay compatible.
- **What follows:** from the catalogue (section 2), the features of the first version are chosen. Architecture and interface design can then move forward in parallel.

Not everything belongs on a phone: section 2 ranks each feature in tiers (essential, adapted, not very relevant, impossible, new). This ranking has been validated.

## 2. Feature catalogue

The desktop covers all 13 domains; mobile covers about half, often partially. "Partial" means the feature exists on mobile with fewer options than on desktop.

| Domain | Features | Desktop | Mobile |
| --- | --- | --- | --- |
| 1. Logbook | Dive list, configurable columns, sorting, numbering and renumbering, multiple selection, deletion, shifting the time of a batch of dives | Yes | Partial (list, deletion) |
| 2. Entry and editing | Manual entry; date, duration, depth, site, divemaster(s), buddies, suit, tags, notes, overall rating and condition ratings (visibility, waves, current, surge, chill), air and water temperatures, atmospheric pressure, water type, dive mode, invalid dive; **editing several dives at once**; copying and pasting fields between dives | Yes | Partial (one dive, main fields) |
| 3. Equipment | Cylinders (volume, working pressure, O2/He mix, start and end pressures, OC, diluent or O2 use), weights, pressure sensor → cylinder mapping, renaming a cylinder type, default cylinder | Yes | Partial |
| 4. Profile and events | Detailed profile with toggleable layers (ceiling, tissues, ppO2/ppN2/ppHe, MOD, EAD, NDL/TTS, SAC, heart rate, cylinder pressure, CCR sensors); measuring ruler; adding bookmarks, gas changes, setpoint or mode changes; renaming or hiding an event; drawing a profile by hand | Yes | Partial (read-only profile) |
| 5. Operations on dives | Merging dives, splitting a dive at a given moment, separating or deleting a dive computer, choosing the main dive computer, applying GPS positions | Yes | No |
| 6. Dive computers | USB, classic Bluetooth and BLE download (about 366 models), "new dives only" or download everything again, several dive computers per dive, device nicknames, configuring some models (OSTC, Suunto Vyper) | Yes | Partial (download, 4 remembered devices) |
| 7. Dive sites | Create, edit (name, description, notes, GPS, country and region), merge duplicates, delete unused sites, import and export (XML, KML), map of all sites, search for nearby sites | Yes | Partial (map, site choice) |
| 8. Trips | Automatic grouping (gap of at most 3 days), create, merge, split, add or remove dives, trip location and notes | Yes | Partial (editing location and notes) |
| 9. Media | Photos and videos linked to a dive, camera ↔ dive computer time synchronisation, display on the profile, GPS position from EXIF, moved files | Yes | No |
| 10. Search and filters | Full-text search; combinable filters on 33 criteria (date, depth, duration, SAC, gas, cylinder, people, tags, site, dive computer, mode, condition ratings…); saved filters | Yes | Partial (full text) |
| 11. Statistics | Configurable charts (bars, histograms, scatter plots with regression, box plots, pie charts) on about 30 variables; summary by period; yearly statistics | Yes | Yes |
| 12. Planning and gas | OC, pSCR and CCR planner, with bailout gases, repetitive dives, Bühlmann ZH-L16 with gradient factors or VPM-B; replanning a dive; printing the plan; gas calculator (MOD, best mix) | Yes | Partial |
| 13. Import, export, cloud | Import from other logbooks and formats (section 6); export to XML, UDDF, CSV, HTML, world map, LaTeX/TeX, profile images, divelogs.de; printing with templates; Subsurface cloud, several users on one computer | Yes | Partial (export, cloud, file import) |

All desktop changes go through an **undo / redo** stack (about 75 commands in `commands/`). The texts of these commands are also used as the Git commit message during synchronisation.

### Relevance on mobile (validated on 5 November 2026)

A complete app does not mean reproducing everything identically: some desktop features make no sense on a phone, others must be simplified, and mobile offers possibilities the desktop does not have. Four tiers are proposed. The "Tablet" column shows what a large screen could recover.

| Tier | Features | Tablet |
| --- | --- | --- |
| **Essential**: the heart of mobile use | BLE download; quick entry (site, buddies, divemaster, cylinders, rating); list and full-text search; read-only profile with events; cloud synchronisation and offline; trips; sites and map; gas calculator (MOD, best mix); undo; filters on all criteria, equipment included, and statistics on the filtered dives | Same |
| **Adapted**: useful, but in a simplified form | Editing several dives (selection, then common fields); planner (recreational and OC deco first, CCR and pSCR next); merging and splitting dives; importing common files (XML, UDDF, FIT); export and sharing through the system share sheet; profile layers (reduced selection) | More complete version |
| **Not very relevant**: left to the desktop or to a possible web version | Printing and custom templates; TeX, LaTeX, HTML, world map exports; universal CSV import with column mapping; SmartTrak import and other desktop software databases; configurable list columns; drawing a profile by hand; configuring dive computers (OSTC, Vyper); several users on one device; managing media on an external disk | Possible for some (CSV import, profile drawing) |
| **Impossible or limited by the platform** | USB serial and classic Bluetooth on iPhone (BLE only); command line | — |
| **New, specific to mobile** (missing from or removed from Subsurface) | GPS position of the site taken by the phone on the boat; photos and videos from the gallery, synchronised with the profile; sharing a dive as an image; home-screen widget; offline map; reminders (surface interval, desaturation before flying) | Same |

Two consequences follow. "Not very relevant" features must still **preserve the data** they produce: a dive with a profile drawn on the desktop must stay intact after an edit on mobile. And the architecture must make it possible to add a richer tablet or web version later, without redoing the core.

**Decided on 5 November 2026: full filters and statistics everywhere.** On every version (phone and tablet), dives can be filtered on all criteria, equipment included, and the statistics of the filtered results can be shown. Example: how many dives with a given drysuit. Subsurface's core already allows it: suit, cylinder type and size, weight type and dive computer are among the 33 filter criteria, and statistics apply to the dives visible after filtering. Only the presentation changes between phone and tablet, not the possibilities.

Clarifications of 5 November 2026:

- **Dive mode:** the open circuit or rebreather filter is put forward (Subsurface's "mode" criterion, which also distinguishes pSCR and freediving).
- **Weights:** no filter on weight or weight type in OpenDives. The core keeps these criteria; they are simply not offered.
- **Other equipment** (regulator, BCD, fins, torch…): Subsurface has no field for them. They are recorded as **tags** on the dive (for example "Regulator: …"), which can be filtered and counted, without breaking compatibility.

## 3. Data model

A **log** contains dives, trips, sites, devices and saved filters. Each dive brings together the data of one or more dive computers. OpenDives must take this model as is to stay compatible with the cloud.

| Entity | Key attributes | Relationships |
| --- | --- | --- |
| Log (`divelog`) | Automatic grouping setting | Contains everything else |
| Dive (`dive`) | Number, date and time, duration, max and mean depths, temperatures, surface pressure, salinity, notes, divemaster(s), buddies, suit, rating 0-5, conditions 0-5 (visibility, waves, current, surge, chill), SAC, CNS, OTU, invalid, "not in a trip" | 0-1 trip, 0-1 site; n cylinders, n weights, n tags, n pictures; **1 to n dive computers** |
| Dive computer within the dive (`divecomputer`) | Model, serial number, firmware, device and dive identifiers, mode (OC, CCR, pSCR, freedive), number of O2 cells, time zone, salinity | n samples, n events, key-value extra data, sensor → cylinder mapping |
| Sample (`sample`) | Time, depth, temperature, pressures (10 sensors max), setpoint and 6 ppO2 cells, NDL, TTS, RBT, deco stop, CNS, heading, heart rate, in deco | Belongs to a dive computer |
| Event (`event`) | Time, type, name, value, hidden; gas change (cylinder, mix) or mode change | Belongs to a dive computer |
| Cylinder (`cylinder`) | Type (volume, working pressure, description), O2/He, start/end pressures (entered and measured), use (OC, diluent, O2), switch depth | Belongs to a dive |
| Weight (`weightsystem`) | Weight, description (belt, integrated…) | Belongs to a dive |
| Site (`dive_site`) | Identifier (uuid), name, GPS, description, notes, taxonomy (country, region, city) | Shared by n dives |
| Trip (`dive_trip`) | Location, notes, created automatically or not | Groups n dives |
| Picture or video (`picture`) | File name, offset within the dive, GPS | Belongs to a dive (the file itself is not in the cloud) |
| Device (`device`) | Model, serial number, nickname | Log level |
| Saved filter | Name, text, list of constraints | Log level |

**Conventions to respect.** Internal units are fine-grained SI integers (mm, mK, mbar, ml, g, seconds); metric/imperial conversion happens only at display time. Dates are in seconds, in the local time of the dive, without time zone. Pictures and videos are referenced only by their file path: the Subsurface cloud does not store them.

## 4. Business rules and calculations

These rules determine the figures the diver sees. OpenDives must produce **exactly the same results** as Subsurface, otherwise the same dive would show different values depending on the app. This is a strong argument for reusing `core` rather than rewriting it.

| Rule | Behaviour in Subsurface | Source |
| --- | --- | --- |
| Start and end of the dive | The dive only counts below 75 cm | `divecomputer.h` (`SURFACE_THRESHOLD`) |
| Derived values | Max and mean depth, duration, min and max temperatures, recomputed from the samples (`fixup_dive`); the water temperature is the average of the dive computers | `dive.cpp` |
| Duplicates on import | Two dives are considered "identical" if the dive computer matches (same model, same device and dive identifier). Otherwise, depth within 1 m, duration within 5 min and overlapping times are required. Dives entered by hand are never merged automatically | `dive::likely_same`, `match_one_dc` |
| Import options | Prefer imported data, mark as downloaded, merge into existing trips, or create a new trip | `import_flags` |
| Automatic trips | Dives grouped if they are less than 3 days apart, unless the dive is marked "not in a trip" | `trip.cpp` (`TRIP_THRESHOLD`) |
| Numbering | Next number assigned when adding; renumbering on demand | `divelist.cpp` |
| Consumption (SAC) | Gas used (real volume, with the gas compressibility factor) ÷ pressure at mean depth ÷ duration, on the first dive computer. No SAC if a used cylinder has no end pressure | `calculate_sac`, `gas-model.cpp` |
| Cylinder pressures | Interpolation between measured or entered pressures, according to the time spent on each gas | `gaspressures.cpp` |
| Water density | Fresh 1.000; brackish 1.010; EN13319 standard 1.020; sea 1.030 kg/l, or the dive computer's value | `units.h` |
| Decompression | Bühlmann ZH-L16 with gradient factors (GF low and high) or VPM-B with conservatism; tissues carried over from the dives of the previous 48 h; CNS and OTU | `deco.cpp`, `divelist.cpp` |
| Planner | Descent and ascent rates, last stop, minimum gas switch duration, bottom and deco SAC, automatic gas choice according to max ppO2, bailout gases for pSCR and CCR | `planner.cpp`, `plannernotes.cpp` |
| Gas | MOD according to max ppO2, MND and END, best O2/He mix for a depth | `dive.cpp` (`gas_mod`, `best_o2`, `best_he`) |
| Filters | 33 criteria combined with AND; operators equal, less, more, between, starts with, contains, exact, negation | `filterconstraint.h` |
| Statistics | One variable on the x axis, one on the y axis, grouping by category (year, month, gas, site, people…) | `stats/statsvariables.cpp` |

## 5. User journeys expressed as tasks

The tasks below describe what the diver wants to achieve, deduced from the features and the manuals. None assumes a particular screen: they are the inputs of the interface design. They are ordered by moment in the diver's life.

| Moment | Task | Domains (section 2) |
| --- | --- | --- |
| First use | Sign in to an existing Subsurface account and find the whole logbook, or create an account (PIN by email), or work without the cloud | 13 |
| First use | Pair the dive computer once and for all | 6 |
| Before the dive | Plan a dive (depth, gas, deco), check the MOD of a mix, see the remaining saturation from previous dives | 12 |
| On the boat | Download the day's new dives, offline | 6 |
| On the boat | Quickly note the site, buddies, divemaster, cylinders and the dive's rating | 2, 3, 7 |
| In the evening | Review the profile, read the events (alarms, gas changes), compare with a buddy or a second dive computer | 4, 5 |
| In the evening | Add photos and videos to the right dive at the right moment | 9 |
| In the evening | Fix a dive: split a wrongly detected surface interval, merge two downloads, shift the time | 5 |
| End of the trip | Group the dives into a trip, give it a name and notes, complete several dives at once | 2, 8 |
| At home | Import history from another logbook or an old dive computer | 13 |
| At home | Clean up sites (merge duplicates, add GPS and country) | 7 |
| Any time | Find a dive (text, filters), look at statistics, see sites on a map | 7, 10, 11 |
| Any time | Share or export (file, profile image, divelogs.de), print a logbook | 13 |
| Any time | Find the same data in Subsurface on the computer, without conflict | 13 |
| Any time | Undo a mistake | Cross-cutting |

## 6. External integrations and the cloud's Git format

Subsurface depends on five external services and reads about twenty formats. The cloud is the critical integration: its format must be reproduced faithfully.

| Integration | Use | Entry point |
| --- | --- | --- |
| Subsurface cloud | Storage and synchronisation of the logbook; account, PIN, password, account deletion | Git over HTTPS, `https://ssrf-cloud-{eu,us}.subsurface-divelog.org/git/<email>[<email>]`; `/verify` and `/passwordreset` |
| GeoNames | Country, region, city or ocean from a site's GPS coordinates | `secure.geonames.org` (`findNearbyPlaceNameJSON`, `findNearbyJSON`, `oceanJSON`) |
| Base maps | Sites map | Google Maps through Qt Location, with local cache |
| divelogs.de | Importing and uploading dives | `divelogs.de/api/login`, `/api/dives` |
| DiveShare | Public sharing of a dive | `dive-share.appspot.com/upload` (old service, to check) |

**Import formats:** Subsurface XML, UDDF, CSV (universal import with column mapping), Suunto DM3/DM4/DM5 and Suunto app (JSON), Shearwater Desktop, DivingLog, SeacSync, LogTRAK, Atomic Cobalt, Scubapro ASD, DataTrak/Wlog, Liquivision, Cochran, Uemis, Divesoft, OSTCtools, Garmin FIT, SmartTrak, Mares Dive Organizer, GPX (GPS positions).

**Export formats:** Subsurface XML (dives or sites only), UDDF, KML of sites, CSV (summary, profiles, profile data), profile image, HTML (with yearly statistics), HTML world map, TeX and LaTeX, picture-depth list, printing with editable HTML/CSS templates.

**The cloud's Git format**

- **Repository:** a branch named after the account email. Each save is a commit whose message repeats the actions undone or redone (`changesMade`).
- **Tree:** `00-Subsurface` (format version, devices, download fingerprints, units, automatic grouping, a few profile options), `01-Divesites/Site-<hex uuid>`, `02-Filterpresets/Preset-NNN`, then `YYYY/MM/`. A dive outside a trip is a folder `DD-Day-HH=MM=SS` (`=` replaces `:`, which is forbidden on Windows). A trip has its own folder, with its description and its dives. Folder dates are those of the start of the dive, or of the trip.
- **Files of a dive:** `Dive` (header: date, duration, depths, site, cylinders, weights, people, tags, notes…), then `Divecomputer`, `Divecomputer-001`… (samples and events as line-by-line text), and a `Pictures` folder with one file per picture, named after its offset within the dive. **Fingerprints** make it possible to download only a dive computer's new dives, even from another device.
- **Synchronisation:** fetch, then fast-forward if possible. Otherwise, libgit2's automatic merge ("Automatic merge" commit). Conflicts are resolved per file: a deletion on one side wins; otherwise one side is kept. A save that would overwrite unrelated data requires a confirmation (`classify_git_save`).
- **Local cache:** a full clone on the device, usable offline, synchronised on demand or automatically.
- **References for OpenDives:** `core/load-git.cpp`, `core/save-git.cpp`, `core/git-access.cpp` and the tests `tests/testgitstorage.cpp`.

## 7. Cross-cutting requirements

These requirements affect every feature. The first ones are inherited from Subsurface; the last ones are gaps to fill in OpenDives.

| Requirement | What Subsurface does | For OpenDives |
| --- | --- | --- |
| Offline first | Full Git clone on the device; everything works without network, synchronisation afterwards | Essential (boat, islands, countries without a data plan) |
| Units | Metric, imperial or choice per quantity (depth, pressure, volume, temperature, weight); always stored in SI | To reuse; the unit choice is also saved in `00-Subsurface` |
| Languages | 34 translations through Transifex; manuals in EN, FR, DE, ES, NL | French and English at least; reuse translations of diving terms if the licence allows |
| Settings | About 90 settings: units, default cylinder, GF low and high, VPM-B conservatism, max ppO2, default SAC, profile layers, map, network, cloud | Keep the settings that change calculations; simplify the others |
| Undo and redo | All changes on the desktop; the text of the actions is used as the commit message | To reuse, including on mobile |
| Data integrity | No loss during merges; confirmation before overwriting unrelated data | Also keep data the app cannot display |
| Volume | Logbooks of several thousand dives; samples every 1 to 10 s, on several dive computers | Smooth list and profile on an average phone; progressive loading |
| Support | Sending technical logs by email, developer menu | To reuse, with the user's consent |
| Security | Cloud password saved in the app settings, without the system keychain | **To improve**: iOS keychain and Android Keystore |
| Accessibility | Interface scaling, font size | **To fill**: screen readers, contrast, touch targets suited to wet hands |

## 8. Open questions (all decided)

1. **First version:** among the "essential" and "adapted" features, which ones are indispensable for a first release?
   **Decided on 5 November 2026:** all "essential" and "adapted" features of section 2 are part of the first version.
2. **Mobile ranking:** does the "Relevance on mobile" table (section 2) put each feature in the right tier? Should a tablet version be planned from the start?
   **Decided on 5 November 2026:** a tablet version is planned from the start. The "Tablet" column of section 2 therefore applies to the first version. The tier ranking is validated as is.
3. **New mobile features:** which mobile-specific features (site GPS, gallery photos, widget, offline map, reminders) come first?
   **Decided on 5 November 2026:** all new mobile features are kept for the first version (site GPS, gallery photos, sharing as an image, widget, offline map, reminders).
4. **No-cloud mode:** should OpenDives work without a Subsurface account (local logbook only, manual export or import)?
   **Decided on 5 November 2026:** yes, OpenDives also works without a Subsurface account, with a local logbook and manual import or export. It must be possible to move later from a local logbook to a cloud account without losing data.
5. **Photos:** the cloud does not store media files. Keep them on the device only, or plan a storage solution (iCloud, Google Photos, other)?
   **Decided on 5 November 2026:** photos and videos stay on the device, and only their reference is synchronised, as in Subsurface. On another device, the dive will show that a photo exists without being able to display it.
6. **External services:** keep GeoNames and divelogs.de? Which map provider (Google Maps like Subsurface, or OpenStreetMap, free and usable offline)?
   **Decided on 5 November 2026:** GeoNames and divelogs.de are kept. For divelogs.de, the aim is to reproduce what Subsurface does (importing and uploading dives), without synchronisation: the Subsurface cloud remains the only data source. Maps use OpenStreetMap, which also allows the offline map.
7. **Relationship with Subsurface:** tell the maintainers before connecting a new client to their servers? Contribute to the project (for example, making `core` independent of Qt) rather than copying it?
   **Decided on 5 November 2026:** nothing for now; the maintainers are not contacted and no contribution is made to the project. To revisit before publication.
8. **Coexistence:** OpenDives and Subsurface-mobile on the same phone with the same account: is this a case to handle explicitly?
   **Decided on 5 November 2026:** yes, coexistence is handled explicitly:
   - keep in full the data OpenDives does not know;
   - synchronise often and report resolved conflicts;
   - read without writing if the format has a newer version;
   - release the Bluetooth connection after each download;
   - rely on fingerprints and duplicate detection;
   - sign commits "OpenDives".
