# OpenDives × OpenCaves: data needs

Written on 13 November 2026 for the OpenCaves project, which plans to build an API. OpenDives is a mobile dive log (Android first, iPhone next) built on the Subsurface core: a diver's log is a Subsurface log, read and written by both apps. This document says what OpenDives would like to read from OpenCaves, and why, so the API can be shaped around it. Nothing here is a commitment on the OpenCaves side; field names are suggestions.

## 1. What OpenDives wants to do with the data

1. **Find a site's position.** When a diver creates a site (« Nouveau site ») or cleans up their sites (« Nettoyer les sites »), OpenDives suggests the matching OpenCaves cave: name, coordinates, country and region. The diver confirms; only then are the values copied into their log.
2. **Show a cover photo.** On a site's page in OpenDives (« Fiche d'un site »), show one photo of the cave with its author and licence, and a link to the OpenCaves page.
3. **Link back.** Every place that shows OpenCaves data has « Voir sur OpenCaves », so divers who want more (access, fees, surveys) go to the source.
4. **Work offline.** Cave divers are often out of network at the site. OpenDives keeps a small local copy of the caves near the diver's sites, and refreshes it when online.

OpenDives does not want to copy descriptions, access details, surveys or videos into the app: those stay on OpenCaves.

## 2. Fields per cave

| Field | Type | Needed for | Notes |
|---|---|---|---|
| `id` | string, stable | all | Never reused, survives renames. OpenDives stores it with the site to keep the link. |
| `name` | string | 1, 2 | The usual name of the entrance, as divers say it. |
| `altNames` | string[] | 1 | Other names and spellings (with and without accents), to match what divers typed. |
| `system` | `{ id, name }` or null | 1, 2 | The cave system it belongs to. |
| `lat`, `lon` | number, WGS 84, decimal degrees | 1, 4 | Position of the entrance used to dive (or the main entrance). At least 5 decimals. |
| `positionAccuracy` | string or metres | 1 | « exact », « approximate », or an accuracy in metres. OpenDives warns when it is approximate. |
| `country` | ISO 3166-1 alpha-2 | 1 | e.g. `MX`. |
| `region` | string | 1 | State or province, e.g. « Quintana Roo ». |
| `locality` | string | 1 | Nearest town, e.g. « Tulum ». |
| `type` | enum | 1, 2 | `cenote`, `cave`, `spring`, `sinkhole`… |
| `maxDepthM` | number or null | 2 | Shown as information only. |
| `waterType` | enum or null | 1 | `fresh`, `salt`, `brackish`, `halocline`. OpenDives can pre-fill the water type of the dive. |
| `url` | string | 3 | Public page of the cave on opencaves.org. |
| `updatedAt` | ISO 8601 date-time, UTC | 4 | Last change to any field above. |
| `deleted` | boolean | 4 | Only in « changed since » answers, so a removed or merged cave can be dropped from the local copy. |
| `mergedInto` | `id` or null | 4 | When two entries were merged. |

## 3. Cover photo

| Field | Type | Notes |
|---|---|---|
| `photo.url` | string | One image chosen as the cave's cover. |
| `photo.thumbUrl` | string | About 400 px wide, for lists and offline storage (≤ 60 KB). |
| `photo.width`, `photo.height` | number | To lay out before loading. |
| `photo.author` | string | Shown under the photo. |
| `photo.licence` | string, SPDX-like | e.g. `CC-BY-4.0`. OpenDives shows only photos whose licence allows it. |
| `photo.sourceUrl` | string | Page of the photo, for the credit link. |
| `photo.alt` | string | Short description for screen readers. |

No photo is better than a photo without a known author and licence.

## 4. Requests

All read-only, JSON, no account needed. Coordinates in WGS 84.

1. **Near a point.** `GET /caves?near=20.2114,-87.4654&radius=5000&limit=20`. Sorted by distance, with `distanceM` in each result. Used when a diver creates a site at their current position or on the map.
2. **By name.** `GET /caves?q=dos%20ojos&limit=20`. Words in any order, accents and case ignored, matches `name` and `altNames`. Can be combined with `near` to rank close results first.
3. **One cave.** `GET /caves/{id}`. Used to refresh one linked site.
4. **In a box.** `GET /caves?bbox=minLon,minLat,maxLon,maxLat`. Used to build the offline copy around the diver's sites or a map region.
5. **Changed since.** `GET /caves?changedSince=2026-11-01T00:00:00Z&bbox=…`. Returns changed, added, deleted and merged caves, so the offline copy is refreshed without downloading everything again.

Answers are paged (`limit`, `cursor`, `nextCursor`). A full answer for a box of about 1 000 caves without photos should stay under about 300 KB, gzip accepted.

## 5. Licence, attribution and use

- OpenDives needs a clear licence for the data (for example ODbL or CC BY) that allows: showing it in the app, storing a local copy for offline use, and copying the name and position into a diver's personal log once the diver confirms.
- OpenDives shows « Données OpenCaves » with a link wherever the data appears, plus the photo credit.
- OpenDives keeps the OpenCaves warning in front of the data: the information can be incomplete or outdated and is not for dive planning.
- Rate limits: one app, low volume (a few requests per diver per day, plus one offline refresh). An app identifier in the `User-Agent` (`OpenDives/1.x`) or an API key, whichever OpenCaves prefers.

## 6. Later, not needed now

- Sending a correction from OpenDives (a better position measured at the entrance), with the diver's consent.
- Entrances as separate points when a system has several.
- Languages: names and fields in French and Spanish as well as English.

## 7. Contact

Christian Rémillard, for OpenDives.
