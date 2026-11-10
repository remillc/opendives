// @ts-check
// The list of sites and the choice of the site kept by a merge. Plain
// functions, no framework: tested in tests/app.

/**
 * Sites by name, as a person sorts them ("Lock 9" before "Lock 10"); those
 * without a name come last.
 * @template {{ name: string }} S
 * @param {S[]} sites
 * @param {string} locale
 * @returns {S[]}
 */
export function sortSitesByName(sites, locale) {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
  return [...sites].sort((a, b) => {
    if (!a.name || !b.name) return Number(!a.name) - Number(!b.name);
    return collator.compare(a.name, b.name);
  });
}

/**
 * Sites by their latest dive, the most recent first.
 * @template {{ lastDate: string }} S
 * @param {S[]} sites
 * @returns {S[]}
 */
export function sortSitesByRecent(sites) {
  return [...sites].sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}

/**
 * The site kept by default: the most dives, then one with a position.
 * @template {{ dives: number, hasLocation: boolean }} S
 * @param {S[]} sites at least one
 * @returns {S}
 */
export function defaultKeeper(sites) {
  return sites.reduce((best, s) => (s.dives > best.dives || (s.dives === best.dives && s.hasLocation && !best.hasLocation) ? s : best));
}
