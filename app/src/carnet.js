// @ts-check
/** @typedef {import('opendives-core').Dive} Dive */

/**
 * @typedef {Object} TripGroup
 * @property {string} key
 * @property {string} title
 * @property {Dive[]} dives
 */

/**
 * Regroupe les plongées par voyage, la plus récente d'abord. Les plongées
 * sans voyage consécutives forment un groupe sans titre.
 * @param {Dive[]} dives
 * @returns {TripGroup[]}
 */
export function groupByTrip(dives) {
  /** @type {TripGroup[]} */
  const groups = [];
  const sorted = [...dives].sort((a, b) => b.date.localeCompare(a.date));
  for (const dive of sorted) {
    const key = dive.trip ? `trip-${dive.trip.id}` : 'none';
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.dives.push(dive);
    else groups.push({ key, title: dive.trip ? dive.trip.location : '', dives: [dive] });
  }
  return groups;
}

/**
 * La date du cœur est l'heure locale de la plongée : elle est affichée telle quelle.
 * @param {string} iso ex. 2012-11-05T10:15:00
 */
export function formatDate(iso) {
  const [date, time] = iso.split('T');
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y} ${time.slice(0, 5)}`;
}

/** @param {number} mm profondeur en millimètres */
export function formatDepth(mm) {
  return `${(mm / 1000).toFixed(1)} m`;
}

/** @param {number} seconds durée en secondes */
export function formatDuration(seconds) {
  return `${Math.round(seconds / 60)} min`;
}
