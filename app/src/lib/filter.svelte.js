// @ts-check
// Free filter (docs/ui-specification.md, section 4, "Filters", and section 5,
// "Filter criteria"). The criteria are turned into Subsurface's own filter
// constraints and matched by the core (filterQuery, read-only); only the
// identifiers of the matching dives come back. The same filter applies to the
// Logbook, the Statistics and the map. A filter can be saved in the logbook as
// one of Subsurface's filter presets, and a saved filter applied again.
import { OpenDivesCore } from 'opendives-core';
import { t } from './i18n.js';
import { formatNumber } from './format.js';

/** @typedef {import('opendives-core').FilterRule} FilterRule */
/** @typedef {import('opendives-core').FilterOptions} FilterOptions */
/** @typedef {import('opendives-core').Prefs} Prefs */

/**
 * A range typed by the diver, in the diver's units; empty: no limit.
 * @typedef {{ min: string, max: string }} Range
 */

/**
 * @typedef {{
 *   mode: 'all'|'oc'|'rebreather',
 *   suits: string[], computers: string[], cylinderTypes: string[], tags: string[],
 *   people: string[], sites: string[], countries: string[], regions: string[], trips: string[],
 *   weekdays: string[], planned: string[],
 *   year: Range, date: Range, timeOfDay: Range, depth: Range, duration: Range, sac: Range,
 *   waterTemp: Range, airTemp: Range, cylinderSize: Range, o2: Range, he: Range,
 *   rating: number, visibility: number, current: number, wavesize: number, surge: number, chill: number,
 *   notes: string, fulltext: string,
 *   preset: SavedFilter|null,
 * }} Criteria
 * `preset`: a saved filter applied as the core keeps it (its rules are added
 * to the other criteria).
 */

/**
 * A filter saved in the logbook (Subsurface's filter presets).
 * @typedef {{ name: string, fulltext: string, mode: string, rules: FilterRule[] }} SavedFilter
 */

/** @returns {Criteria} */
export function emptyCriteria() {
  /** @returns {Range} */
  const range = () => ({ min: '', max: '' });
  return {
    mode: 'all',
    suits: [], computers: [], cylinderTypes: [], tags: [], people: [], sites: [], countries: [], regions: [], trips: [],
    weekdays: [], planned: [],
    year: range(), date: range(), timeOfDay: range(), depth: range(), duration: range(), sac: range(),
    waterTemp: range(), airTemp: range(), cylinderSize: range(), o2: range(), he: range(),
    rating: 0, visibility: 0, current: 0, wavesize: 0, surge: 0, chill: 0,
    notes: '', fulltext: '',
    preset: null,
  };
}

/** @param {Criteria} c */
function copy(c) {
  return /** @type {Criteria} */ (JSON.parse(JSON.stringify(c)));
}

export const filter = $state({
  /** The filter applied to the sections. */
  applied: emptyCriteria(),
  /** Identifiers of the matching dives, or null without a filter. */
  ids: /** @type {Set<number>|null} */ (null),
  /** The filter being edited on the Filter screen, and its live count. */
  draft: emptyCriteria(),
  draftCount: /** @type {number|null} */ (null),
  /** Values present in the logbook, for the criteria that apply. */
  options: /** @type {FilterOptions|null} */ (null),
  /** The core refused the filter or could not be asked. */
  failed: false,
  /** Filters saved in the logbook, as the core lists them. */
  presets: /** @type {import('opendives-core').FilterPreset[]} */ ([]),
});

/**
 * Kinds of criteria: a list of values (exact match of any), a fixed choice,
 * a range in the diver's units, stars (at least), a text.
 * @typedef {'list'|'choice'|'range'|'stars'|'text'} Kind
 */

/**
 * Every criterion, by group, in the order of the screen. `option`: key of
 * FilterOptions that says whether it applies to this logbook.
 * @type {{ group: string, keys: { key: keyof Criteria, kind: Kind, option?: keyof FilterOptions }[] }[]}
 */
export const groups = [
  {
    group: 'gear',
    keys: [
      { key: 'suits', kind: 'list', option: 'suits' },
      { key: 'computers', kind: 'list', option: 'computers' },
      { key: 'cylinderTypes', kind: 'list', option: 'cylinderTypes' },
      { key: 'cylinderSize', kind: 'range', option: 'cylinderSize' },
      { key: 'o2', kind: 'range', option: 'oxygen' },
      { key: 'he', kind: 'range', option: 'helium' },
      { key: 'tags', kind: 'list', option: 'tags' },
    ],
  },
  {
    group: 'when',
    keys: [
      { key: 'date', kind: 'range' },
      { key: 'year', kind: 'range' },
      { key: 'weekdays', kind: 'choice' },
      { key: 'timeOfDay', kind: 'range' },
    ],
  },
  {
    group: 'where',
    keys: [
      { key: 'sites', kind: 'list', option: 'sites' },
      { key: 'countries', kind: 'list', option: 'countries' },
      { key: 'regions', kind: 'list', option: 'regions' },
      { key: 'trips', kind: 'list' },
    ],
  },
  { group: 'people', keys: [{ key: 'people', kind: 'list', option: 'people' }] },
  {
    group: 'dive',
    keys: [
      { key: 'depth', kind: 'range' },
      { key: 'duration', kind: 'range' },
      { key: 'sac', kind: 'range', option: 'sac' },
      { key: 'rating', kind: 'stars', option: 'rating' },
      { key: 'planned', kind: 'choice', option: 'planned' },
    ],
  },
  {
    group: 'conditions',
    keys: [
      { key: 'waterTemp', kind: 'range', option: 'waterTemp' },
      { key: 'airTemp', kind: 'range', option: 'airTemp' },
      { key: 'visibility', kind: 'stars', option: 'visibility' },
      { key: 'current', kind: 'stars', option: 'current' },
      { key: 'wavesize', kind: 'stars', option: 'wavesize' },
      { key: 'surge', kind: 'stars', option: 'surge' },
      { key: 'chill', kind: 'stars', option: 'chill' },
    ],
  },
  {
    group: 'text',
    keys: [
      { key: 'notes', kind: 'text', option: 'notes' },
      { key: 'fulltext', kind: 'text' },
    ],
  },
];

/** @param {keyof Criteria} key */
export function kindOf(key) {
  for (const g of groups) for (const k of g.keys) if (k.key === key) return k.kind;
  return 'text';
}

/**
 * Whether a criterion applies to this logbook (spec: a criterion that applies
 * to no dive is not shown). Without options yet, every criterion is offered.
 * @param {{ option?: keyof FilterOptions }} k
 * @param {FilterOptions|null} options
 */
export function applies(k, options) {
  if (!options || !k.option) return true;
  const v = options[k.option];
  return Array.isArray(v) ? v.length > 0 : !!v;
}

/** Fixed choices: days of the week (0 is Sunday, as the core's utc_weekday), real or planned. */
export const choices = {
  weekdays: ['1', '2', '3', '4', '5', '6', '0'],
  planned: ['logged', 'planned'],
};

/**
 * A number typed in the device's format ("12,5" in French); NaN when empty or invalid.
 * @param {string} text
 */
export function parseNumber(text) {
  const s = text.trim().replace(/\s/g, '').replace(',', '.');
  return s === '' || !/^-?\d*\.?\d+$/.test(s) ? NaN : Number(s);
}

/**
 * Converts one bound typed by the diver into the core's unit.
 * @param {keyof Criteria} key
 * @param {string} text
 * @param {Prefs} prefs
 * @returns {number} NaN when not a valid value
 */
function toCore(key, text, prefs) {
  if (key === 'timeOfDay') {
    const m = /^(\d{1,2})(?:[:h.](\d{2}))?$/.exec(text.trim());
    if (!m || Number(m[1]) > 24 || Number(m[2] ?? 0) > 59) return NaN;
    return Math.min(Number(m[1]) * 3600 + Number(m[2] ?? 0) * 60, 24 * 3600 - 60);
  }
  const v = parseNumber(text);
  if (Number.isNaN(v)) return NaN;
  switch (key) {
    case 'depth':
      return Math.round(prefs.length === 'ft' ? v * 304.8 : v * 1000);
    case 'duration':
      return Math.round(v * 60);
    case 'sac':
      return Math.round(prefs.volume === 'cuft' ? v * 28316.8 : v * 1000);
    case 'waterTemp':
    case 'airTemp':
      return Math.round(((prefs.temperature === 'F' ? ((v - 32) * 5) / 9 : v) + 273.15) * 1000);
    case 'cylinderSize':
      // The core keeps the water capacity in litres: typed in litres.
      return Math.round(v * 1000);
    case 'o2':
    case 'he':
      return Math.round(v * 10);
    default:
      return Math.round(v);
  }
}

/** @param {string} text "YYYY-MM-DD"; null when invalid */
function parseDate(text) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text.trim());
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')} 00:00:00`;
}

/**
 * Whether a range bound is valid (empty is valid).
 * @param {keyof Criteria} key
 * @param {string} text
 * @param {Prefs} prefs
 */
export function validBound(key, text, prefs) {
  if (!text.trim()) return true;
  return key === 'date' ? parseDate(text) !== null : !Number.isNaN(toCore(key, text, prefs));
}

/** Subsurface's tokens for each criterion. */
const TYPES = /** @type {Record<string, string>} */ ({
  suits: 'suit', computers: 'dive_computer', cylinderTypes: 'cylinder_type', tags: 'tags', people: 'people',
  sites: 'location', countries: 'od_country', regions: 'od_region', trips: 'od_trip',
  year: 'year', date: 'date', timeOfDay: 'time_of_day', depth: 'depth', duration: 'duration', sac: 'sac',
  waterTemp: 'water_temp', airTemp: 'air_temp', cylinderSize: 'cylinder_size', o2: 'cylinder_o2', he: 'cylinder_he',
  rating: 'rating', visibility: 'visibility', current: 'current', wavesize: 'wavesize', surge: 'surge', chill: 'chill',
  notes: 'notes',
});

/**
 * The core's rules for a set of criteria; invalid bounds are left out.
 * @param {Criteria} c
 * @param {Prefs} prefs
 * @returns {FilterRule[]}
 */
export function rulesFor(c, prefs) {
  /** @type {FilterRule[]} */
  const rules = [];
  // Dive mode, a bit field of the core's divemode_t: OC 0, CCR 1, PSCR 2.
  if (c.mode === 'oc') rules.push({ type: 'dive_mode', data: String(1 << 0) });
  if (c.mode === 'rebreather') rules.push({ type: 'dive_mode', data: String((1 << 1) | (1 << 2)) });
  for (const g of groups) {
    for (const { key, kind } of g.keys) {
      const type = TYPES[key];
      if (kind === 'list') {
        const values = /** @type {string[]} */ (c[key]);
        // One value per line, so that the core keeps commas inside a value.
        if (values.length) rules.push({ type, stringMode: 'exact', data: `${values.join('\n')}\n` });
      } else if (kind === 'range') {
        const r = /** @type {Range} */ (c[key]);
        const conv = (/** @type {string} */ s) => {
          if (!s.trim()) return null;
          if (key === 'date') return parseDate(s);
          const v = toCore(key, s, prefs);
          return Number.isNaN(v) ? null : String(v);
        };
        const min = conv(r.min);
        const max = conv(r.max);
        if (min === null && max === null) continue;
        const zero = key === 'date' ? '' : '0';
        const rangeMode = min !== null && max !== null ? 'range' : min !== null ? 'greater' : 'less';
        rules.push({ type, rangeMode, data: `${min ?? zero},${max ?? zero}` });
      } else if (kind === 'stars') {
        const n = /** @type {number} */ (c[key]);
        if (n > 0) rules.push({ type, rangeMode: 'greater', data: `${n},0` });
      } else if (key === 'notes') {
        if (c.notes.trim()) rules.push({ type, stringMode: 'substring', data: `${c.notes.trim()}\n` });
      }
    }
  }
  if (c.weekdays.length && c.weekdays.length < 7) {
    const bits = c.weekdays.reduce((b, d) => b | (1 << Number(d)), 0);
    rules.push({ type: 'day_of_week', data: String(bits) });
  }
  if (c.planned.length === 1) rules.push({ type: c.planned[0], data: '' });
  if (c.preset) rules.push(...c.preset.rules);
  return rules;
}

/**
 * Fulltext query and mode of a set of criteria: the diver's search, else the
 * saved filter's.
 * @param {Criteria} c
 */
function fulltextOf(c) {
  if (c.fulltext.trim() || !c.preset) return { fulltext: c.fulltext.trim(), mode: 'starts_with' };
  return { fulltext: c.preset.fulltext, mode: c.preset.mode };
}

/** @param {Criteria} c */
export function isEmpty(c) {
  return JSON.stringify(c) === JSON.stringify(emptyCriteria());
}

/**
 * Identifiers of the dives matching the criteria, from the core.
 * @param {Criteria} c
 * @param {Prefs} prefs
 */
async function match(c, prefs) {
  /** @type {number[]} */
  const ids = await OpenDivesCore.filterQuery({ kind: 'dives', ...fulltextOf(c), rules: rulesFor(c, prefs) });
  return new Set(ids);
}

/** Reads the values present in the logbook (after each load). */
export async function loadOptions() {
  try {
    filter.options = await OpenDivesCore.filterQuery({ kind: 'options' });
  } catch (e) {
    console.error('Reading the filter criteria', e);
    filter.options = null;
  }
}

/** Reads the filters saved in the logbook. */
export async function loadPresets() {
  try {
    filter.presets = (await OpenDivesCore.filterPresets({ action: 'list' })).presetList;
  } catch (e) {
    console.error('Reading the saved filters', e);
    filter.presets = [];
  }
}

/**
 * Saves criteria in the logbook under a name (replacing a saved filter of the
 * same name): one undoable step. Errors keep the core's code: NOT_IN_PRESET
 * when the filter uses a criterion the logbook cannot keep.
 * @param {string} name
 * @param {Criteria} c
 * @param {Prefs} prefs
 * @returns {Promise<string>} the text of the step, for Undo
 */
export async function savePreset(name, c, prefs) {
  const result = await OpenDivesCore.filterPresets({ action: 'save', name, ...fulltextOf(c), rules: rulesFor(c, prefs) });
  filter.presets = result.presets.presetList;
  return result.undo;
}

/**
 * Deletes a saved filter: one undoable step.
 * @param {number} index
 * @returns {Promise<string>} the text of the step, for Undo
 */
export async function deletePreset(index) {
  const result = await OpenDivesCore.filterPresets({ action: 'delete', index });
  filter.presets = result.presets.presetList;
  return result.undo;
}

/**
 * The criteria of a saved filter: its rules, kept as the core keeps them.
 * @param {import('opendives-core').FilterPreset} p
 * @returns {Criteria}
 */
export function presetCriteria(p) {
  return { ...emptyCriteria(), preset: { name: p.name, fulltext: p.filter.fulltext, mode: p.filter.mode, rules: p.filter.rules } };
}

/** Opening the Filter screen: the draft starts from the applied filter. */
export function startDraft() {
  filter.draft = copy(filter.applied);
  filter.draftCount = null;
}

let counting = 0;
/**
 * Live count of the draft ("Show the 4 dives").
 * @param {Prefs} prefs
 */
export async function countDraft(prefs) {
  const asked = ++counting;
  try {
    const ids = await match(filter.draft, prefs);
    if (asked === counting) filter.draftCount = ids.size;
  } catch (e) {
    console.error('Counting the filtered dives', e);
    if (asked === counting) filter.draftCount = null;
  }
}

/**
 * Applies criteria to the sections; also after each load, as dive
 * identifiers change.
 * @param {Criteria} c
 * @param {Prefs} prefs
 */
export async function applyFilter(c, prefs) {
  filter.applied = copy(c);
  filter.failed = false;
  if (isEmpty(c)) {
    filter.ids = null;
    return;
  }
  try {
    filter.ids = await match(c, prefs);
  } catch (e) {
    // Never the raw core text on screen: the filter is shown as not applied.
    console.error('Applying the filter', e);
    filter.ids = null;
    filter.failed = true;
  }
}

/**
 * Removes one criterion from the applied filter (the × of its chip).
 * @param {keyof Criteria} key
 * @param {Prefs} prefs
 */
export function removeCriterion(key, prefs) {
  const c = copy(filter.applied);
  /** @type {any} */ (c)[key] = /** @type {any} */ (emptyCriteria())[key];
  return applyFilter(c, prefs);
}

/** @param {Prefs} prefs */
export function clearFilter(prefs) {
  return applyFilter(emptyCriteria(), prefs);
}

/** @param {keyof Criteria} key @param {Criteria} c */
export function isSet(key, c) {
  return JSON.stringify(c[key]) !== JSON.stringify(/** @type {any} */ (emptyCriteria())[key]);
}

/**
 * Units shown next to a range.
 * @param {keyof Criteria} key
 * @param {Prefs} prefs
 */
export function unitOf(key, prefs) {
  switch (key) {
    case 'depth':
      return prefs.length === 'ft' ? t('units.feet') : t('units.meters');
    case 'duration':
      return t('units.minutes');
    case 'sac':
      return prefs.volume === 'cuft' ? t('units.cubicFeetPerMinute') : t('units.litersPerMinute');
    case 'waterTemp':
    case 'airTemp':
      return prefs.temperature === 'F' ? t('units.fahrenheit') : t('units.celsius');
    case 'cylinderSize':
      return t('units.liters');
    case 'o2':
    case 'he':
      return t('units.percent');
    default:
      return '';
  }
}

/**
 * Short text of a criterion's value ("Drysuit", "12 to 30 m", "3 of 5 or more").
 * @param {keyof Criteria} key
 * @param {Criteria} c
 * @param {Prefs} prefs
 * @param {(id: string) => string} [tripName]
 */
export function valueText(key, c, prefs, tripName = (id) => id) {
  const kind = kindOf(key);
  const value = c[key];
  if (kind === 'list' || kind === 'choice') {
    const list = /** @type {string[]} */ (value);
    if (!list.length) return t('filter.any');
    const names = list.map((v) =>
      key === 'trips' ? tripName(v) : key === 'weekdays' ? t(`filter.weekdays.${v}`) : key === 'planned' ? t(`filter.plannedValues.${v}`) : v,
    );
    return names.length <= 2 ? names.join(', ') : t('filter.several', { first: names[0], n: names.length - 1 });
  }
  if (kind === 'range') {
    const r = /** @type {Range} */ (value);
    const unit = unitOf(key, prefs);
    const min = r.min.trim();
    const max = r.max.trim();
    if (!min && !max) return t('filter.any');
    if (min && max) return t(unit ? 'filter.rangeBoth' : 'filter.rangeBothNoUnit', { min, max, unit });
    if (min) return t(unit ? 'filter.rangeMin' : 'filter.rangeMinNoUnit', { min, unit });
    return t(unit ? 'filter.rangeMax' : 'filter.rangeMaxNoUnit', { max, unit });
  }
  if (kind === 'stars') {
    const n = /** @type {number} */ (value);
    return n ? t('filter.starsAtLeast', { n: formatNumber(n) }) : t('filter.any');
  }
  const text = /** @type {string} */ (value).trim();
  return text ? t('filter.quoted', { text }) : t('filter.any');
}

/**
 * The criteria set in the applied filter, for the active filter row.
 * @param {Criteria} c
 */
export function activeKeys(c) {
  /** @type {(keyof Criteria)[]} */
  const keys = [];
  if (c.preset) keys.push('preset');
  if (c.mode !== 'all') keys.push('mode');
  for (const g of groups) for (const k of g.keys) if (isSet(k.key, c)) keys.push(k.key);
  return keys;
}
