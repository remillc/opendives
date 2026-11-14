// @ts-check
// What the Desaturation tool reads from the dives the core used (toolQuery 'desaturation'):
// the surface interval since the last dive, and the first pair of dives that overlap.
// Pure functions on the façade's JSON, in JavaScript (AGENTS.md, « JavaScript first »).
//
// Why: the core's init_decompression() returns a negative surface interval and stops loading
// the tissues as soon as two dives overlap. On 13 November 2026 a dive received twice by QR
// code made the « Dernière plongée » tile read « Plus de 48 h » two hours after a dive. The
// interval is therefore taken from the dives' own times, and the overlap is reported so that
// the screen can say why the tissues are short.

/**
 * A dive as the façade lists it among the dives used by the calculation.
 * @typedef {{ date: string, endDate: string }} UsedDive
 */

/**
 * Milliseconds of a local date-time without a zone (« 2026-11-13T16:10:00 »), read as UTC
 * like the rest of the app, so that two such dates subtract to the right interval.
 * @param {string} iso
 * @returns {number}
 */
const ms = (iso) => Date.parse(`${iso.slice(0, 19)}Z`);

/**
 * Seconds since the end of the last dive used by the calculation: the latest end of them all,
 * whatever their order or overlaps. -1 when no dive counts (none in the last 48 hours); 0 while
 * a dive is not over yet.
 * @param {UsedDive[]} dives the façade's « dives »
 * @param {string} now the façade's « now », local time
 * @returns {number}
 */
export function surfaceSeconds(dives, now) {
  if (!dives.length) return -1;
  const lastEnd = Math.max(...dives.map((d) => ms(d.endDate)));
  return Math.max(0, Math.round((ms(now) - lastEnd) / 1000));
}

/**
 * The start of the first dive that begins before the end of the one before it, in time order:
 * where the core stops loading the tissues. Null when no two dives overlap.
 * @param {UsedDive[]} dives the façade's « dives »
 * @returns {string|null} the dive's local start, as the façade gives it
 */
export function overlapStart(dives) {
  const ordered = [...dives].sort((a, b) => ms(a.date) - ms(b.date));
  for (let i = 1; i < ordered.length; i++) if (ms(ordered[i].date) < ms(ordered[i - 1].endDate)) return ordered[i].date;
  return null;
}
