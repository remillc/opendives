// @ts-check
// Statistics section (docs/ui-specification.md, section 1 and 5, "Statistics").
//
// Every figure comes from the Subsurface core: the facade's `stats`
// (core/libopendives/stats.cpp) runs calculate_stats_summary() and
// calculate_stats_selected() on the dives that meet the criteria, invalid
// dives left out as Subsurface does. Nothing is summed here. The free filter
// applies too (spec: "Statistics apply to the filtered results"): its dives
// are passed as an "id" criterion.
import { OpenDivesCore } from 'opendives-core';
import { t, tIfExists } from './i18n.js';
import { formatDepth, formatGasLong, formatHours, formatLongDate, locale } from './format.js';
import { filter } from './filter.svelte.js';

/** @typedef {import('opendives-core').Dive} Dive */

/**
 * Figures of a set of dives, as Subsurface's stats_t (statistics.h). Integer SI
 * units; 0 means "unknown", as in the core.
 * @typedef {Object} StatsFigures
 * @property {number} dives selection_size
 * @property {number} totalSeconds total_time
 * @property {number} shortestSeconds shortest_time
 * @property {number} longestSeconds longest_time
 * @property {number} maxDepthMm max_depth
 * @property {number} meanDepthMm avg_depth, weighted by duration
 * @property {number} meanMaxDepthMm combined_max_depth / selection_size
 * @property {number} meanSacMlMin avg_sac
 * @property {number} minTempMk min_temp (water)
 * @property {number} maxTempMk max_temp
 * @property {number} meanTempMk combined_temp / combined_count
 */

/**
 * Result of the facade's `stats` on the dives that meet the criteria.
 * @typedef {Object} StatsResult
 * @property {number} logDives number of dives counted in the whole logbook
 * @property {StatsFigures} total
 * @property {(StatsFigures & {year: number})[]} yearly stats_yearly
 * @property {(StatsFigures & {year: number, month: number})[]} monthly stats_monthly
 * @property {(StatsFigures & {start: string, location: string})[]} byTrip stats_by_trip
 * @property {(StatsFigures & {mode: string})[]} byMode stats_by_type: OC, CCR, PSCR, Freedive
 * @property {(StatsFigures & {value: string})[]} bySuit "" for dives without a suit
 * @property {(StatsFigures & {value: string})[]} byBuddy
 * @property {number[]} diveIds the dives counted (for the per-dive chart)
 */

/**
 * One criterion of a statistic: several values count dives having any of
 * them; several criteria count dives meeting all of them (spec).
 * @typedef {{field: string, values: string[]}} Criterion
 */

/** @typedef {{id: string, name: string, criteria: Criterion[]}} SavedStatistic */

/**
 * Criteria of "New statistic", in the order of the spec. Weight is never
 * offered (decided on 6 November 2026). "month" is only used by the year
 * screen's rows.
 */
export const CRITERIA = ['suit', 'tag', 'buddy', 'guide', 'site', 'trip', 'mode', 'gas', 'cylinder', 'computer', 'year', 'rating'];

/**
 * Figures of the dives meeting `criteria` and the free filter (all dives when
 * both are empty), computed by the core. Null when the core fails.
 * @param {Criterion[]} criteria
 * @param {{ignoreFilter?: boolean}} [options]
 * @returns {Promise<StatsResult|null>}
 */
export async function computeStatistics(criteria, options = {}) {
  /** @type {Record<string, string[]>} */
  const object = {};
  for (const c of criteria) if (c.values.length) object[c.field] = [...c.values];
  if (filter.ids && !options.ignoreFilter) object.id = [...filter.ids].map(String);
  try {
    return await OpenDivesCore.statsQuery({ kind: 'stats', criteria: object });
  } catch (e) {
    console.error('Statistics', e);
    return null;
  }
}

/**
 * Supporting line of a row: "4 plongées · 4 h 07 · max 28,7 m"; empty while
 * the core computes.
 * @param {StatsFigures|null|undefined} figures
 * @param {import('opendives-core').Prefs} prefs
 */
export function summaryLine(figures, prefs) {
  if (!figures) return '';
  const dives = t('trip.dives', { n: figures.dives });
  return figures.maxDepthMm
    ? t('stats.rowSummary', { dives, time: formatHours(figures.totalSeconds), depth: formatDepth(figures.maxDepthMm, prefs) })
    : t('stats.rowSummaryNoDepth', { dives, time: formatHours(figures.totalSeconds) });
}

/**
 * The values of a criterion found in the logbook, with their number of dives
 * (the core's stats_values, the whole logbook). "Not set" last; years and
 * ratings from the highest, the others alphabetically.
 * @param {string} field
 * @param {Dive[]} dives
 * @returns {Promise<{key: string, label: string, dives: number}[]>}
 */
export async function criterionValues(field, dives) {
  /** @type {{key: string, dives: number, location?: string}[]} */
  const values = await OpenDivesCore.statsQuery({ kind: 'values', field });
  const descending = field === 'year' || field === 'month' || field === 'rating' || field === 'trip';
  return values
    .map((v) => ({
      key: v.key,
      label: field === 'trip' && v.key ? tripName({ start: v.key, location: v.location ?? '' }) : valueLabel(field, v.key, dives),
      dives: v.dives,
    }))
    .sort((a, b) => {
      if (!a.key || !b.key) return a.key ? -1 : b.key ? 1 : 0;
      return descending ? b.key.localeCompare(a.key) : a.label.localeCompare(b.label, locale);
    });
}

/**
 * Trips of these dives, the latest first. A trip is identified by the date of
 * its first dive: the core's trip identifiers change at each load and are
 * never stored (spec, section 4, "Trip").
 * @param {Dive[]} dives
 * @returns {{id: number, start: string, location: string}[]}
 */
export function tripsOf(dives) {
  /** @type {Map<number, {id: number, start: string, location: string}>} */
  const trips = new Map();
  for (const d of dives) {
    if (!d.trip) continue;
    const trip = trips.get(d.trip.id);
    if (!trip) trips.set(d.trip.id, { id: d.trip.id, start: d.date, location: d.trip.location });
    else if (d.date < trip.start) trip.start = d.date;
  }
  return [...trips.values()].sort((a, b) => b.start.localeCompare(a.start));
}

/** @param {{start: string, location: string}} trip */
export function tripName(trip) {
  return trip.location || t('trip.startingOn', { date: formatLongDate(trip.start) });
}

/** @param {Dive[]} dives */
export function chronological(dives) {
  return [...dives].sort((a, b) => a.date.localeCompare(b.date));
}

const monthFormat = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' });
const monthYearFormat = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Month name, capitalised for a row: "Février". @param {number} month 1 to 12 */
export function monthName(month) {
  const text = monthFormat.format(new Date(Date.UTC(2000, month - 1, 1)));
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/** @param {number} year @param {number} month */
function monthYearName(year, month) {
  return monthYearFormat.format(new Date(Date.UTC(year, month - 1, 1)));
}

/**
 * Text of one value of a criterion, as shown in a chip or a name.
 * @param {string} field
 * @param {string} value
 * @param {Dive[]} dives
 */
export function valueLabel(field, value, dives) {
  if (field === 'month') {
    const [year, month] = value.split('-').map(Number);
    return monthYearName(year, month);
  }
  if (field === 'trip') {
    const trip = tripsOf(dives).find((tr) => tr.start === value);
    return trip ? tripName(trip) : t('trip.startingOn', { date: formatLongDate(value) });
  }
  if (field === 'mode') return t(`detail.modes.${value}`);
  if (field === 'rating' && value) return t('stats.stars', { n: Number(value) });
  if (field === 'gas' && value) {
    const [o2, he] = value.split('/').map(Number);
    return formatGasLong(o2, he);
  }
  return value || notSetLabel(field);
}

/** "Non renseignée" for a suit, "Sans site"…: the value of dives without one. @param {string} field */
export function notSetLabel(field) {
  return tIfExists(`stats.notSetFor.${field}`) ?? t('stats.notSet');
}

/**
 * "Combinaison : dry suit" for one criterion; criteria joined by " · ".
 * @param {Criterion[]} criteria
 * @param {Dive[]} dives
 */
export function criteriaName(criteria, dives) {
  return criteria
    .filter((c) => c.values.length)
    .map((c) =>
      t('stats.criterionValue', {
        criterion: t(`stats.criteria.${c.field}`),
        value: c.values.map((v) => valueLabel(c.field, v, dives)).join(', '),
      }),
    )
    .join(' · ');
}

const STORE_KEY = 'od.statistics';

/** @returns {SavedStatistic[]} */
function readSaved() {
  try {
    const list = JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** "My statistics": stored on this device (spec, "New statistic"). */
export const myStatistics = $state({ list: readSaved() });

function writeSaved() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(myStatistics.list));
  } catch {
    // Not fatal: the statistic lasts until the app closes.
  }
}

/** @param {string} name @param {Criterion[]} criteria */
export function saveStatistic(name, criteria) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  myStatistics.list = [...myStatistics.list, { id, name, criteria: criteria.filter((c) => c.values.length) }];
  writeSaved();
  return id;
}

/** @param {string} id */
export function removeStatistic(id) {
  myStatistics.list = myStatistics.list.filter((s) => s.id !== id);
  writeSaved();
}

/**
 * Criteria of a filtered result, carried in its URL as JSON (?c=…).
 * @param {Criterion[]} criteria
 */
export function encodeCriteria(criteria) {
  return encodeURIComponent(JSON.stringify(criteria));
}

/** @param {string|undefined} text @returns {Criterion[]} */
export function decodeCriteria(text) {
  try {
    const list = JSON.parse(decodeURIComponent(text ?? '[]'));
    return Array.isArray(list) ? list.filter((c) => c && typeof c.field === 'string' && Array.isArray(c.values)) : [];
  } catch {
    return [];
  }
}
