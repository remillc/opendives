# Android tablet screenshots

Task 2026-11-10-17. Taken on 10 November 2026 on an Android tablet emulator (Pixel Tablet size: 2560 × 1600 px at 320 dpi, so 1280 × 800 dp), light theme, app and device locale in French.

- **Scale:** 1 dp = 1 px. Each image is the whole screen, Android's status bar (24 dp) and the emulator's taskbar (60 dp) included: the app itself is 1280 × 716 dp in landscape and 800 × 1196 dp in portrait.
- **Data:** the logbook of the cloud test account (1,357 dives, 237 sites), at Christian's request, instead of the bundled sample log.
- **Layout common to every screen:** the navigation rail on the left, 96 dp, with + (add dives) at the top, Carnet, Sites, Statistiques, Outils, then Compte, Réglages and À propos at the bottom. The rail is the same in portrait.
- **Panes:** the list pane is 340 dp in the Carnet, 400 dp in Statistics and 360 dp in Tools, in both orientations; the detail pane takes the rest. Sites, Account, Settings and About use the whole content area.

| No. | Images | Route | Landscape | Portrait | Notes |
| --- | --- | --- | --- | --- | --- |
| 01 | [landscape](01-carnet-landscape.png), [portrait](01-carnet-portrait.png) | `/ and /dives/:id` | list 340 dp | list 340 dp | Home screen: the first dive opens beside the list. The band and the search bar sit in the list pane only. |
| 02 | [landscape](02-carnet-search-landscape.png), [portrait](02-carnet-search-portrait.png) | `/` | list 340 dp | list 340 dp | Search "lock": the list pane filters, the detail keeps the dive shown. |
| 03 | [landscape](03-carnet-selection-landscape.png), [portrait](03-carnet-selection-portrait.png) | `/` | list 340 dp | list 340 dp | Long press on a dive: selection mode in the list pane (✕, count, ⋮), check boxes before the thumbnails. |
| 04 | [landscape](04-trip-landscape.png), [portrait](04-trip-portrait.png) | `/trips/:id` | list 340 dp | list 340 dp | A trip opens in the detail pane (dates, place, notes, its dives). |
| 05 | [landscape](05-dive-detail-menu-landscape.png), [portrait](05-dive-detail-menu-portrait.png) | `/dives/:id` | list 340 dp, over it: od-menu popover | list 340 dp, over it: od-menu popover | The ⋮ menu of the detail is a popover at the top right of the detail pane. |
| 06 | [landscape](06-edit-dive-landscape.png), [portrait](06-edit-dive-portrait.png) | `/dives/:id/edit` | list 340 dp, over it: od-edit-dive od-edit-sheet popup | list 340 dp, over it: od-edit-dive od-edit-sheet popup | The editor is a large sheet over both panes, in two columns in landscape, one in portrait. |
| 07 | [landscape](07-add-menu-landscape.png), [portrait](07-add-menu-portrait.png) | `/` | list 1184 dp | list 704 dp | The + of the rail opens a bottom action sheet over the screen. |
| 08 | [landscape](08-download-landscape.png), [portrait](08-download-portrait.png) | `/download` | list 340 dp | list 340 dp | Download opens in the detail pane, the list stays. |
| 09 | [landscape](09-download-failed-landscape.png), [portrait](09-download-failed-portrait.png) | `/download/failed` | list 340 dp | list 340 dp | In the detail pane. |
| 10 | [landscape](10-new-dive-landscape.png), [portrait](10-new-dive-portrait.png) | `/dives/new` | no list pane | no list pane | Logging a dive by hand takes the whole content area (no list pane). |
| 11 | [landscape](11-filter-landscape.png), [portrait](11-filter-portrait.png) | `/filter` | list 340 dp | list 340 dp | The filter opens in the detail pane, with its bottom bar there. |
| 12 | [landscape](12-filter-criterion-landscape.png), [portrait](12-filter-criterion-portrait.png) | `/filter/suits` | list 340 dp | list 340 dp | A criterion takes the whole content area. |
| 20 | [landscape](20-sites-landscape.png), [portrait](20-sites-portrait.png) | `/sites/` | no list pane | no list pane | Sites: list on the left, map on the right in landscape; in portrait the map is wide and the list narrower. No list/detail split: a site replaces the whole area. |
| 21 | [landscape](21-site-landscape.png), [portrait](21-site-portrait.png) | `/sites/:id` | no list pane | no list pane | A site takes the whole content area (map at the top). |
| 22 | [landscape](22-site-edit-landscape.png), [portrait](22-site-edit-portrait.png) | `/sites/:id/edit` | no list pane | no list pane | Whole content area. |
| 23 | [landscape](23-site-new-landscape.png), [portrait](23-site-new-portrait.png) | `/sites/new` | no list pane | no list pane | Whole content area. |
| 24 | [landscape](24-sites-without-site-landscape.png), [portrait](24-sites-without-site-portrait.png) | `/sites/without/` | no list pane | no list pane | Whole content area. |
| 25 | [landscape](25-sites-unplaced-landscape.png), [portrait](25-sites-unplaced-portrait.png) | `/sites/unplaced/` | no list pane | no list pane | Whole content area. |
| 26 | [landscape](26-sites-cleanup-landscape.png), [portrait](26-sites-cleanup-portrait.png) | `/sites/cleanup` | no list pane | no list pane | Whole content area. |
| 30 | [landscape](30-statistics-landscape.png), [portrait](30-statistics-portrait.png) | `/statistics/` | list 400 dp | list 400 dp | List pane 400 dp; the detail pane says "Choose a statistic to see it here". |
| 31 | [landscape](31-statistics-result-landscape.png), [portrait](31-statistics-result-portrait.png) | `/statistics/result?c=…` | list 400 dp | list 400 dp | A result opens in the detail pane. |
| 32 | [landscape](32-statistics-dives-landscape.png), [portrait](32-statistics-dives-portrait.png) | `/statistics/dives/?section=byYear&title=2024&c=…` | list 400 dp | list 400 dp | The dives of a row (here "2024") open in the detail pane. |
| 33 | [landscape](33-statistics-new-landscape.png), [portrait](33-statistics-new-portrait.png) | `/statistics/new` | list 1184 dp, over it: od-statistic-new popup | list 704 dp, over it: od-statistic-new popup | "New statistic" is a popup over the whole screen. |
| 40 | [landscape](40-tools-landscape.png), [portrait](40-tools-portrait.png) | `/tools/` | list 1184 dp | list 704 dp | Tools list on its own until a tool is chosen. |
| 41 | [landscape](41-tools-desaturation-landscape.png), [portrait](41-tools-desaturation-portrait.png) | `/tools/desaturation` | list 360 dp | list 360 dp | Tools list 360 dp on the left, the tool in the detail pane. |
| 42 | [landscape](42-tools-ead-mod-landscape.png), [portrait](42-tools-ead-mod-portrait.png) | `/tools/ead-mod` | list 360 dp | list 360 dp | Tool in the detail pane. |
| 43 | [landscape](43-tools-best-mix-landscape.png), [portrait](43-tools-best-mix-portrait.png) | `/tools/best-mix` | no list pane | no list pane | Best mix takes the whole content area here (no list pane): differs from the other gas tools. |
| 44 | [landscape](44-tools-blender-landscape.png), [portrait](44-tools-blender-portrait.png) | `/tools/blender` | list 360 dp | list 360 dp | Tool in the detail pane. |
| 45 | [landscape](45-plans-landscape.png), [portrait](45-plans-portrait.png) | `/plans/` | list 360 dp | list 360 dp | Planned dives take the whole content area; the test account has no plan. |
| 46 | [landscape](46-planner-landscape.png), [portrait](46-planner-portrait.png) | `/plan/new` | list 360 dp | list 360 dp | A new plan opens in the detail pane beside the tools list. |
| 50 | [landscape](50-account-landscape.png), [portrait](50-account-portrait.png) | `/account` | no list pane | no list pane | Signed in to the test account: one column over the whole area. |
| 51 | [landscape](51-account-sign-in-landscape.png), [portrait](51-account-sign-in-portrait.png) | `/account/sign-in` | no list pane | no list pane | Full area form. |
| 52 | [landscape](52-account-create-landscape.png), [portrait](52-account-create-portrait.png) | `/account/create` | no list pane | no list pane | Full area form. |
| 53 | [landscape](53-account-git-landscape.png), [portrait](53-account-git-portrait.png) | `/account/git` | no list pane | no list pane | Full area form. |
| 54 | [landscape](54-account-git-token-help-landscape.png), [portrait](54-account-git-token-help-portrait.png) | `/account/git/token` | no list pane | no list pane | Full area page. |
| 60 | [landscape](60-settings-landscape.png), [portrait](60-settings-portrait.png) | `/settings/` | no list pane | no list pane | Settings: one long column over the whole area (no list/detail split). |
| 61 | [landscape](61-settings-computers-landscape.png), [portrait](61-settings-computers-portrait.png) | `/settings/computers/` | no list pane | no list pane | Whole area. |
| 62 | [landscape](62-settings-cylinders-landscape.png), [portrait](62-settings-cylinders-portrait.png) | `/settings/cylinders/` | no list pane | no list pane | Whole area. |
| 63 | [landscape](63-settings-cylinder-new-landscape.png), [portrait](63-settings-cylinder-new-portrait.png) | `/settings/cylinders/new` | no list pane | no list pane | Whole area. |
| 64 | [landscape](64-settings-maps-landscape.png), [portrait](64-settings-maps-portrait.png) | `/settings/maps/` | no list pane | no list pane | Offline maps: list on the left, "Add a region" panel on the right. |
| 65 | [landscape](65-settings-maps-area-landscape.png), [portrait](65-settings-maps-area-portrait.png) | `/settings/maps/area` | no list pane | no list pane | Choose on the map: the map with its fixed frame over the whole area. |
| 66 | [landscape](66-settings-planner-landscape.png), [portrait](66-settings-planner-portrait.png) | `/settings/planner` | no list pane | no list pane | Whole area. |
| 67 | [landscape](67-settings-bailout-landscape.png), [portrait](67-settings-bailout-portrait.png) | `/settings/bailout` | no list pane | no list pane | Whole area. |
| 70 | [landscape](70-about-landscape.png), [portrait](70-about-portrait.png) | `/about` | no list pane | no list pane | Whole area. |
| 71 | [landscape](71-about-notes-landscape.png), [portrait](71-about-notes-portrait.png) | `/about/notes` | no list pane | no list pane | Whole area. |
| 72 | [landscape](72-about-licence-landscape.png), [portrait](72-about-licence-portrait.png) | `/about/licence` | no list pane | no list pane | Whole area. |
| 73 | [landscape](73-about-privacy-landscape.png), [portrait](73-about-privacy-portrait.png) | `/about/privacy` | no list pane | no list pane | Whole area. |
| 74 | [landscape](74-about-libraries-landscape.png), [portrait](74-about-libraries-portrait.png) | `/about/libraries` | no list pane | no list pane | Whole area. |

## Not captured

- The sync states (offline with changes waiting, failure, conflict): they need a broken network or a conflicting change on the test account.
- The empty logbook and the Account screen without an account: the emulator is signed in to the test account.
- iPad: no iOS build here.

## Differences noticed

- **Best mix** opens over the whole content area, while the other gas tools open beside the tools list.
- **Statistics** in portrait keep the 400 dp list pane, which leaves the result about 300 dp wide.
- In portrait, the **Carnet** detail pane is about 360 dp wide: the dive's title wraps and the figures are tight.
- On an English device with the app set to French, dates and relative times stay in English (`Intl` follows the device locale, not the app language); these images use a French device locale.
