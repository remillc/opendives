# OpenDives — UI foundations

2026-11-05 · Christian Rémillard

English copy of the French original kept on claude.ai ([online](https://claude.ai/artifact/8goh1sZMXM9npSVThnA61r)). Where this document and the [UI specification](ui-specification.md) disagree, the specification wins.

## 1. Summary

OpenDives targets **recreational and technical divers**. The interface is simple by default, and technical features (deco, trimix, rebreather) stay within reach without cluttering the recreational diver's screen. It follows the native conventions of iOS and Android, thanks to Framework7. It uses **no feature and no visual pattern typical of AI-generated interfaces** (section 3).

- **This document sets** the usage situations, the principles, the app's organisation and a visual direction. It does not contain screens yet.
- **Starting point:** the tasks and the tier ranking from the reverse engineering, not Subsurface's screens.
- **Next:** mock-ups of the key screens (section 6), on phone and tablet, with real dive data.

## 2. Divers and usage situations

The same diver does not use the app the same way on the boat, in the evening and at home. The situation, more than the diver's profile, must guide the design.

**Three profiles**

| Profile | What they do | What they expect from OpenDives |
| --- | --- | --- |
| Recreational diver on a trip | 2 to 3 dives a day for a week, Bluetooth dive computer, often without network | Download fast, note the site and buddies, review dives, keep a clean logbook |
| Regular local diver | Lake, quarry or river, all year round, same sites and same buddies | Almost automatic entry (detected site, usual buddies), long-term statistics, temperatures |
| Technical diver | Nitrox, trimix, deco, sometimes rebreather, several dive computers | Detailed profile (ceiling, ppO2, tissues), planning with bailout gases, comparing dive computers |

**Situations**

| Moment | Physical context | Need | Consequence for the interface |
| --- | --- | --- | --- |
| On the boat, between dives | Wet hands, full sun, rolling, sometimes gloves, no network | Download, note the site and buddies in a few gestures | Large touch targets, strong contrast, entry by choosing rather than typing, everything works offline |
| Before the dive | Dry, often in a hurry | Check a mix, look at desaturation | Gas calculator two gestures from the home screen |
| In the evening, at the hotel | Calm, dark screen, variable network | Review the profile, add photos, complete the notes, group into a trip | Readable profile that can be explored with a finger, careful dark mode |
| At home | Phone or tablet, time available | Import history, clean up sites, statistics, plan the next trip | Two-column tablet view, bulk editing |
| Everywhere | Possible coexistence with Subsurface | Find the same data everywhere | Synchronisation state always understandable, without alarming |

## 3. Design principles

Moved to System design, section 1.

## 4. App organisation and navigation

> *Diagram: app organisation · 4 sections and settings — visible in [the online document](https://claude.ai/artifact/8goh1sZMXM9npSVThnA61r).*

The app opens on the **Logbook**, where most things happen: download, complete, review. Settings do not deserve a tab: they are rarely used, and they open from the logbook. Since 5 November 2026, the Logbook has no permanent Download button: a "+" button opens download, import and manual entry (see the UI specification, section 3).

|  | Phone | Tablet |
| --- | --- | --- |
| Main navigation | Tab bar at the bottom (4 tabs) | Sidebar on the left |
| Logbook | List, then full-screen detail; swipe between dives | List and detail side by side |
| Dive profile | At the top of the detail; full screen in landscape | Wide, with the technical layers beside it |
| Bulk editing, statistics, planner | Simplified version | Extra panels |
| Back | Native gesture (swipe from the edge on iOS, back button or gesture on Android) | Same |

**One shared filter.** The filter is set from the logbook or from the statistics, and it applies to both, and to the sites map. It covers every criterion of a dive, equipment included (suit, cylinder, dive computer), on phone and tablet. While a filter is active, a row at the top of the screen recalls it with the number of matching dives, and one gesture removes it. Useful filters can be saved, as in Subsurface.

**Statistics: decided on 5 November 2026.** The Statistics tab opens on a **pre-compiled page**: the totals (dives, time underwater, the deepest), then time and number of dives by mode (open circuit or rebreather), by suit, by buddy and by dive computer, then by year and by site. Tapping a row opens those dives with their detailed statistics. A **Free filter** button gives access to all criteria for rarer combinations. This flow was preferred to "filter, then look", which requires knowing what to look for.

## 5. Visual identity direction

Moved to System design, sections 4, 5 and 11.

## 6. Key screens to mock up first

Five screens cover the most frequent situations and the riskiest design choices. They are mocked up on iPhone (iOS style) and on an Android phone (Material You), plus a tablet view.

| Screen | Situation | What the mock-up must validate |
| --- | --- | --- |
| Logbook (list of dives) | Everywhere | Profile thumbnail as each dive's identity, grouping by trip, readability of figures in columns, access to download |
| Dive detail | In the evening | The water column, exploring the profile with a finger, the place of technical data (hidden for a recreational dive, visible for a trimix dive) |
| Download from the dive computer | On the boat | Pairing the first time, then download in one gesture; clear progress and result |
| Quick entry after download | On the boat | Site suggested from GPS, usual buddies in one tap, no keyboard |
| Logbook on tablet | At home | List and detail side by side, wide profile, bulk editing |

Two screens are added after the 5 November 2026 decision on filters: **the filter editor** (all criteria, grouped by theme, equipment included) and **the statistics of a filtered result** (for example, all dives made with one dive computer or one suit).

**Data used.** Profiles come from the sample files in the Subsurface repository: for example a dive at Lake Coleridge (`test42.xml`), a series of three dives, one of them in Finland (`test40-42.xml`), and a rebreather dive at Northern Arch (`test-apd-inspiration-reference.xml`). Real profile shapes and real values are used, not invented data.

## 7. Decisions made during the mock-ups (5 November 2026)

The mock-ups now cover, on iPhone and Android phone: first launch, sites and offline map, tools and gas calculator, planner, editing a dive, settings, detail in dark mode, and four states (empty logbook, failed download, offline with pending changes, synchronisation conflict). On iPad and Android tablet: sites, tools, editing a dive and settings.

| Topic | Decision |
| --- | --- |
| First launch | Three choices, each with its consequence written out: existing account (backup in the cloud, copy on the device readable without network), create an account (free, shared between devices), start without an account (logbook only on this device, no backup; an account can be created later and the logbook sent to it) |
| Units | Each measurement is set separately: depth, temperature, pressure, volume, weight (for example depth in feet and temperature in °C). This is Subsurface's "personalised" mode, already synchronised through the cloud |
| Planner | It can start from a dive in the logbook: it reuses its gas, cylinder, start pressure and measured consumption (SAC). Reached from Tools ("New dive or from the logbook") and from a dive's detail (menu "Plan from this dive") |
| Gas reserve | When less than the minimum reserve to bring two divers up would remain, the planner shows it in the alarm colour, with the gap in bar |
| Synchronisation conflict | Subsurface merges most concurrent changes itself; when it cannot ("Remote storage and local data diverged"), OpenDives would offer to keep the device version or the cloud version, after comparing them, without losing anything before the choice. **To validate**: an addition to OpenDives' synchronisation layer, without modifying Subsurface |

**divelogs.de (decided on 5 November 2026).** When creating an account, the diver can bring their divelogs.de logbook: dives are downloaded once into the Subsurface account, with no synchronisation afterwards. OpenDives does not keep the divelogs.de credentials.

The values in the planner mock-ups come from Subsurface's real planner, compiled without Qt in the proof of concept.

## 8. Snackbar style (decided on 10 November 2026)

Moved to System design, section 8.
