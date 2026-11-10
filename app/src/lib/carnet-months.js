// @ts-check
// Carnet: the list split by month (spec, "Carnet, month headers that stay on
// top"). Plain functions, no framework: the grouping, the month names and the
// choice of the header to keep on top are tested in tests/app.

/**
 * @typedef {{ id: number, date: string, trip?: { id: number, location: string }|null }} MonthDive
 */

/**
 * @template {MonthDive} D
 * @typedef {{ type: 'dive', key: string, dive: D }
 *   | { type: 'trip', key: string, location: string, dives: D[] }} MonthEntry
 */

/**
 * @template {MonthDive} D
 * @typedef {{ key: string, year: number, month: number, count: number, entries: MonthEntry<D>[] }} MonthGroup
 */

/** "2014-04" from a local ISO date ("2014-04-09T10:05:00"); '' when it has none. @param {string} iso */
export function monthKey(iso) {
  const m = /^(\d{4})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[1]}-${m[2]}` : '';
}

/**
 * Dives outside trips and trips, grouped by month, newest first. `dives` are
 * sorted from the most recent to the oldest. A trip stays one group, under
 * the month of its first (oldest) dive even when it runs into the next one;
 * it comes first in that month, as its latest dive is the newest of the
 * month. A trip of one dive is drawn as that dive. The count of a month is
 * its dives, those of its trips included.
 * @template {MonthDive} D
 * @param {D[]} dives
 * @param {boolean} [flat] every dive is its own entry, trips are not formed (search results)
 * @returns {MonthGroup<D>[]}
 */
export function groupByMonth(dives, flat = false) {
  /** @type {MonthEntry<D>[]} */
  const list = [];
  /** @type {Map<number, Extract<MonthEntry<D>, {type: 'trip'}>>} */
  const trips = new Map();
  for (const dive of dives) {
    if (flat || !dive.trip) {
      list.push({ type: 'dive', key: `d${dive.id}`, dive });
      continue;
    }
    let trip = trips.get(dive.trip.id);
    if (!trip) {
      trip = { type: 'trip', key: `t${dive.trip.id}`, location: dive.trip.location, dives: [] };
      trips.set(dive.trip.id, trip);
      list.push(trip);
    }
    trip.dives.push(dive);
  }
  /** @type {MonthEntry<D>[]} */
  const entries = list.map((e) => (e.type === 'trip' && e.dives.length === 1 ? { type: /** @type {const} */ ('dive'), key: `d${e.dives[0].id}`, dive: e.dives[0] } : e));

  /** @param {MonthEntry<D>} e */
  const month = (e) => monthKey(e.type === 'trip' ? e.dives[e.dives.length - 1].date : e.dive.date);
  /**
   * Where the entry sorts inside its month: a trip crossing into a later
   * month sorts as the newest of its first month.
   * @param {MonthEntry<D>} e
   */
  const when = (e) => {
    if (e.type === 'dive') return e.dive.date;
    const first = e.dives[e.dives.length - 1].date;
    return monthKey(e.dives[0].date) === monthKey(first) ? e.dives[0].date : `${monthKey(first)}-99`;
  };

  /** @type {Map<string, MonthEntry<D>[]>} */
  const byMonth = new Map();
  for (const e of entries) {
    const key = month(e);
    const bucket = byMonth.get(key);
    if (bucket) bucket.push(e);
    else byMonth.set(key, [e]);
  }
  return [...byMonth.keys()]
    .sort((a, b) => b.localeCompare(a))
    .map((key) => {
      const bucket = /** @type {MonthEntry<D>[]} */ (byMonth.get(key));
      // Stable: entries of the same instant keep the log's order.
      const sorted = bucket.map((e, i) => ({ e, i, w: when(e) })).sort((a, b) => b.w.localeCompare(a.w) || a.i - b.i).map((x) => x.e);
      return {
        key,
        year: key ? Number(key.slice(0, 4)) : 0,
        month: key ? Number(key.slice(5, 7)) : 0,
        count: sorted.reduce((n, e) => n + (e.type === 'trip' ? e.dives.length : 1), 0),
        entries: sorted,
      };
    });
}

/** @type {Map<string, Intl.DateTimeFormat>} */
const monthFormats = new Map();
/** @type {Map<string, Intl.NumberFormat>} */
const yearFormats = new Map();

/**
 * The month's name in the device's language, capitalised ("Avril", "April").
 * @param {number} month 1 to 12
 * @param {string} locale
 */
export function monthName(month, locale) {
  if (!(month >= 1 && month <= 12)) return '';
  let f = monthFormats.get(locale);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' });
    monthFormats.set(locale, f);
  }
  const name = f.format(new Date(Date.UTC(2001, month - 1, 15)));
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}

/** The year in the device's digits, without a group separator ("2014"). @param {number} year @param {string} locale */
export function yearText(year, locale) {
  if (!year) return '';
  let f = yearFormats.get(locale);
  if (!f) {
    f = new Intl.NumberFormat(locale, { useGrouping: false });
    yearFormats.set(locale, f);
  }
  return f.format(year);
}

/**
 * The header to keep on top, from the rendered rows' positions.
 *
 * `rows` are the rows on screen, in order: their month, whether the row is
 * a month header, and the top and bottom of the row. `edge` is the bottom of
 * the top bar; `height` the height of the kept header. The kept month is the
 * one of the first row that ends below `edge`. The next header pushes it out
 * when its top comes within `height` of the edge: `shift` (0 or negative)
 * is how far the kept header has gone up under the top bar.
 *
 * Nothing is kept (`month` null) while the first month's header is still
 * below the kept header's place: the band shows it itself.
 * @param {{ month: string, header: boolean, top: number, bottom: number }[]} rows
 * @param {number} edge
 * @param {number} height
 * @returns {{ month: string|null, shift: number }}
 */
export function stickyHeader(rows, edge, height) {
  const first = rows.findIndex((r) => r.bottom > edge);
  if (first < 0) return { month: null, shift: 0 };
  const row = rows[first];
  // The header of the month the row belongs to is not above the screen yet:
  // before it, nothing is kept.
  if (row.header && row.top >= edge + height) return { month: null, shift: 0 };
  const month = row.month;
  const next = rows.find((r, i) => i > first && r.header && r.month !== month);
  const shift = next ? Math.min(0, next.top - (edge + height)) : 0;
  return { month, shift: Math.max(shift, -height) };
}
