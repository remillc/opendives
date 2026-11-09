// @ts-check
// Interface languages (docs/ui-specification.md, section 2, "Langues").
// No visible text is hard-coded in a component: every text has a key, and its
// translations live in src/i18n/<language>.json. French is the reference
// language; an untranslated language falls back to English.
// Diver data (site names, notes, tags) never goes through this module.
import fr from '../i18n/fr.json';
import frCA from '../i18n/fr-CA.json';
import en from '../i18n/en.json';

/** @type {Record<string, Record<string, any>>} */
const catalogs = { fr, 'fr-CA': frCA, en };
const FALLBACK = 'en';

/**
 * Catalogs searched for a key, in order. fr-CA holds only what differs from
 * fr (a plural object counts as one leaf), then fr, then English.
 * @param {string} lang
 */
export function catalogChain(lang) {
  return lang === 'fr-CA' ? ['fr-CA', 'fr', FALLBACK] : lang === FALLBACK ? [FALLBACK] : [lang, FALLBACK];
}

/**
 * Interface language for a list of device language tags: fr-CA for a tag
 * fr-CA (any case), fr for any other fr-*, else the first tag that has a
 * translation, else English.
 * @param {readonly string[]} tags
 */
export function pickLanguage(tags) {
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    if (lower === 'fr-ca') return 'fr-CA';
    const code = lower.split('-')[0];
    if (code in catalogs) return code;
  }
  return FALLBACK;
}

/** Device language that has a translation, or English. */
export const deviceLanguage = pickLanguage(typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []);

/**
 * Interface language: the one chosen in Settings ("App language", kept by
 * settings.svelte.js), else the device's. Changing it restarts the app.
 */
export const language = (() => {
  try {
    const chosen = JSON.parse(localStorage.getItem('od.appSettings') ?? '{}').language;
    if (chosen in catalogs) return chosen;
  } catch {
    // The device's language.
  }
  return deviceLanguage;
})();

/** Number format: the device's ("1 353" in French). */
const numbers = new Intl.NumberFormat(typeof navigator !== 'undefined' ? navigator.language : language);
const plurals = new Intl.PluralRules(language.split('-')[0]); // fr-CA follows French

/**
 * @param {Record<string, any>} catalog
 * @param {string} key e.g. "logbook.title"
 */
function lookup(catalog, key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), /** @type {any} */ (catalog));
}

/** @param {string} key */
function find(key) {
  for (const name of catalogChain(language)) {
    const value = lookup(catalogs[name], key);
    if (value != null) return value;
  }
  return undefined;
}

/**
 * Translated text. Parameters replace the {names}; the numeric parameter `n`
 * selects the plural form (Intl.PluralRules) and is shown in the device's
 * number format.
 * @param {string} key
 * @param {Record<string, string|number>} [params]
 * @returns {string}
 */
export function t(key, params = {}) {
  let value = find(key);
  if (value == null) {
    console.warn(`Missing text: ${key}`);
    return key;
  }
  if (typeof value === 'object') {
    const n = typeof params.n === 'number' ? params.n : 0;
    value = value[plurals.select(n)] ?? value.other;
  }
  return String(value).replace(/\{(\w+)\}/g, (whole, name) => {
    if (!(name in params)) return whole;
    const v = params[name];
    return typeof v === 'number' ? numbers.format(v) : v;
  });
}

/**
 * Optional translated text: undefined when the key does not exist (e.g. an
 * unknown dive mode, then shown as the core gives it).
 * @param {string} key
 */
export function tIfExists(key) {
  const value = find(key);
  return typeof value === 'string' ? value : undefined;
}

if (typeof document !== 'undefined') document.documentElement.lang = language;
