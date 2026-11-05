// @ts-check
// Interface languages (docs/ui-specification.md, section 2, "Langues").
// No visible text is hard-coded in a component: every text has a key, and its
// translations live in src/i18n/<language>.json. French is the reference
// language; an untranslated language falls back to English.
// Diver data (site names, notes, tags) never goes through this module.
import fr from '../i18n/fr.json';
import en from '../i18n/en.json';

/** @type {Record<string, Record<string, any>>} */
const catalogs = { fr, en };
const FALLBACK = 'en';

/** Interface language: the first device language that has a translation. */
export const language = (() => {
  const preferred = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [];
  for (const tag of preferred) {
    const code = tag.toLowerCase().split('-')[0];
    if (code in catalogs) return code;
  }
  return FALLBACK;
})();

/** Number format: the device's ("1 353" in French). */
const numbers = new Intl.NumberFormat(typeof navigator !== 'undefined' ? navigator.language : language);
const plurals = new Intl.PluralRules(language);

/**
 * @param {Record<string, any>} catalog
 * @param {string} key e.g. "logbook.title"
 */
function lookup(catalog, key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), /** @type {any} */ (catalog));
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
  let value = lookup(catalogs[language], key) ?? lookup(catalogs[FALLBACK], key);
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
  const value = lookup(catalogs[language], key) ?? lookup(catalogs[FALLBACK], key);
  return typeof value === 'string' ? value : undefined;
}

if (typeof document !== 'undefined') document.documentElement.lang = language;
