// @ts-check
// The partial pressure unit, bar or ATA (docs/ui-specification.md, "Partial
// pressure unit"). Display only: the number stays, only its label changes.
// Pure rules, so node tests can check them; the setting itself lives in
// settings.svelte.js (per device, never in the logbook).

/** @typedef {'bar'|'ata'} PpUnit */
/** @typedef {'metric'|'imperial'|'personalize'} UnitSystem */

/**
 * The partial pressure unit a unit system implies: bar for Métrique, ATA for
 * Impérial; none for Personnalisé (any value is allowed).
 * @param {string} system
 * @returns {PpUnit|null}
 */
export function impliedPpUnit(system) {
  if (system === 'metric') return 'bar';
  if (system === 'imperial') return 'ata';
  return null;
}

/**
 * The unit system after the unit was chosen by hand: Métrique or Impérial
 * become Personnalisé when the choice differs from what they imply; Personnalisé
 * stays.
 * @param {string} system
 * @param {PpUnit} ppUnit
 * @returns {string}
 */
export function systemAfterPpUnit(system, ppUnit) {
  const implied = impliedPpUnit(system);
  return implied && implied !== ppUnit ? 'personalize' : system;
}

/**
 * The unit after "Réinitialiser tous les réglages": what the reset unit system
 * implies (bar for Subsurface's metric default).
 * @param {string|undefined} system
 * @returns {PpUnit}
 */
export function ppUnitAfterReset(system) {
  return impliedPpUnit(system ?? 'metric') ?? 'bar';
}
