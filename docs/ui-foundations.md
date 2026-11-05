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

OpenDives' identity lies in **the dive profile**, not in decoration. Around it, the interface stays native and plain.

**The idea: the water column.** In the profile, the area between the surface and the curve fills with water whose colour changes with depth, on the same scale for every dive. This gradient is not decorative: it encodes depth. A 40 m dive is recognisable at a glance next to a 12 m dive. In the list, each dive is represented by the thumbnail of its profile, instead of an icon.

**Colours.** The first "water and buoy" direction (blues and buoy orange) was dropped on 5 November 2026: colours should not evoke water or the sky, but the diver's state of mind, the urge to dive again, with confidence and control. A "fir green and tangerine on cream" palette followed and was dropped the same day. The chosen theme is **black and white, colour reserved for data**: neutral light interface, ink #1F2124, strong contrast, sans-serif titles; only the water column is coloured, from sand to rust with depth (honey to amber in dark mode). Its values are in the [UI specification](ui-specification.md), section 1.

**Android reference (decided on 5 November 2026).** We follow Material Design 3 in its standard version, not the "Expressive" variant: square floating action button with rounded corners, pill-shaped regular buttons, navigation bar on phones and navigation rail on tablets. On iPhone and iPad, we follow Apple's conventions (Human Interface Guidelines).

**Typography.** The system fonts: SF Pro on iOS, Roboto on Android. It is the native choice, and it keeps text readable at every accessibility size. One rule specific to OpenDives: dive figures (depth, duration, pressure) use **tabular figures**, so columns of values stay aligned from one row to the next.

**Layout.** Native full-width lists rather than cards, left alignment, numeric values aligned in columns. In a list row, metadata sits in columns, not chained with middle dots.

**What was set aside and why.** The first reflex was the "ocean" look: blue gradient background, a wave in the header, rounded cards with soft shadows. It is the default look of almost every diving app and of generated interfaces. It was replaced by a gradient reserved for data (the water column). The interface around it stays the system's.

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
