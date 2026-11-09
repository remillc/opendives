// @ts-check
// Logbook snapshot: the first rows of the list, kept in the app's storage
// after each load and drawn at once at the next start, while the core reads
// the log. It is only a picture of the top of the list (rows that cannot be
// tapped); the real list replaces it as soon as the dives are loaded. Nothing
// here is read back as data: the log stays the core's.

/** @typedef {import('opendives-core').Dive} Dive */
/** @typedef {import('opendives-core').Prefs} Prefs */
/**
 * @typedef {{ type: 'dive', dive: Dive } | { type: 'trip', location: string, dives: Dive[] }} SnapshotEntry
 * @typedef {{ v: 1, total: number, prefs: Prefs, entries: SnapshotEntry[] }} Snapshot
 */

const KEY = 'od.logbookSnapshot';
const VERSION = 1;
/** Dives and collapsed trips kept: a little more than a screen. */
const ENTRIES = 16;
/** TripRow draws four thumbnails; the other dives of a trip only count (number, depths, dates). */
const TRIP_PROFILES = 4;

/**
 * The top of the list as the Logbook screen builds it: dives outside trips
 * and trips, most recent first (the same grouping as Logbook.svelte).
 * @param {Dive[]} sortedDives from the most recent to the oldest
 * @param {Prefs} prefs
 * @returns {Snapshot}
 */
export function buildSnapshot(sortedDives, prefs) {
  /** @type {SnapshotEntry[]} */
  const entries = [];
  /** @type {Map<number, Extract<SnapshotEntry, {type: 'trip'}>>} */
  const trips = new Map();
  /** @type {Set<number>} trips past the kept entries */
  const skipped = new Set();
  for (const dive of sortedDives) {
    if (!dive.trip) {
      if (entries.length < ENTRIES) entries.push({ type: 'dive', dive });
      continue;
    }
    const id = dive.trip.id;
    if (skipped.has(id)) continue;
    let trip = trips.get(id);
    if (!trip) {
      if (entries.length >= ENTRIES) {
        skipped.add(id);
        continue;
      }
      trip = { type: 'trip', location: dive.trip.location, dives: [] };
      trips.set(id, trip);
      entries.push(trip);
    }
    trip.dives.push(trip.dives.length < TRIP_PROFILES ? dive : { ...dive, profile: [] });
  }
  // A trip of one dive is drawn as that dive, as in the logbook.
  const drawn = entries.map((e) => (e.type === 'trip' && e.dives.length === 1 ? { type: /** @type {const} */ ('dive'), dive: e.dives[0] } : e));
  return { v: VERSION, total: sortedDives.length, prefs, entries: drawn };
}

/** @param {Snapshot|null} snapshot null forgets it */
export function saveSnapshot(snapshot) {
  try {
    if (snapshot && snapshot.entries.length) localStorage.setItem(KEY, JSON.stringify(snapshot));
    else localStorage.removeItem(KEY);
  } catch {
    // Not fatal: the next start shows the loading bars.
  }
}

/** @returns {Snapshot|null} */
export function readSnapshot() {
  try {
    const text = localStorage.getItem(KEY);
    if (!text) return null;
    const s = JSON.parse(text);
    if (s?.v !== VERSION || !Array.isArray(s.entries) || !s.entries.length || !s.prefs) return null;
    return s;
  } catch {
    return null;
  }
}
