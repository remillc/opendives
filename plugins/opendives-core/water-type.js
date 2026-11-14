// @ts-check
// The water type named from a salinity, in JavaScript (AGENTS.md, « JavaScript first »): the
// façade gives the dive's salinity (get_dive), the contract (core-api.js) adds the type.
/**
 * The water type of a salinity, with the thresholds of Subsurface's get_water_type_string()
 * (core/string-format.cpp): fresh under 10050, brackish under 10190, EN 13319 under 10210,
 * else salt; empty when the salinity is unknown (0 or less). In JavaScript since 14 November
 * 2026 (AGENTS.md, « JavaScript first »): the façade gives the salinity.
 * @param {number} salinity kg per 10000 L
 * @returns {''|'fresh'|'brackish'|'en13319'|'salt'}
 */
export function waterTypeOf(salinity) {
  if (!(salinity > 0)) return '';
  if (salinity < 10050) return 'fresh';
  if (salinity < 10190) return 'brackish';
  if (salinity < 10210) return 'en13319';
  return 'salt';
}
