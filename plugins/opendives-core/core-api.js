// @ts-check
// Contrat entre l'interface et le plugin natif OpenDivesCore.
import { registerPlugin } from '@capacitor/core';

/**
 * @typedef {Object} DiveTrip
 * @property {number} id
 * @property {string} location
 */

/**
 * Valeurs en unités SI entières, comme dans le cœur.
 * @typedef {Object} Dive
 * @property {number} number
 * @property {string} date heure locale de la plongée, ex. 2012-11-05T10:15:00
 * @property {string} site chaîne vide si aucun site
 * @property {number} maxDepthMm
 * @property {number} durationSeconds
 * @property {DiveTrip|null} trip
 */

/**
 * @typedef {Object} OpenDivesCorePlugin
 * @property {() => Promise<{count: number}>} importSample
 *   Enregistre le carnet d'exemple comme dépôt git local.
 * @property {() => Promise<{exists: boolean, dives: Dive[]}>} listDives
 *   Relit le dépôt git local. `exists` vaut false tant qu'aucun dépôt n'a été créé.
 */

/** @type {OpenDivesCorePlugin} */
export const OpenDivesCore = registerPlugin('OpenDivesCore');
