// @ts-check
// The name of a cylinder's use (task 2026-11-12-54): in a rebreather dive the
// core's "OC-gas" cylinder is the bailout, so it is named "Secours (bailout)";
// in an open-circuit dive it stays "Circuit ouvert". Label only: the logbook
// keeps "OC-gas", as Subsurface writes it.

/** @param {string} divemode */
export const isRebreather = (divemode) => divemode === 'CCR' || divemode === 'PSCR';

/**
 * The i18n key naming a use, `edit.uses.*`.
 * @param {string} use the core's value ("OC-gas", "diluent"…)
 * @param {string} divemode the dive's mode ("OC", "CCR", "PSCR"…)
 */
export const useKey = (use, divemode) => (use === 'OC-gas' && isRebreather(divemode) ? 'edit.uses.bailout' : `edit.uses.${use}`);
