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
 * Résultat de la lecture du cloud. `available` vaut false quand aucun
 * identifiant n'est configuré ; les autres champs sont alors absents.
 * @typedef {Object} CloudDives
 * @property {boolean} available
 * @property {string} [server] ex. ssrf-cloud-eu.subsurface-divelog.org
 * @property {string} [head] commit de la branche sur le serveur
 * @property {boolean} [synced] false : copie locale, le serveur n'a pas répondu
 * @property {string} [offlineReason] raison, quand le serveur n'a pas répondu
 * @property {Dive[]} [dives]
 */

/**
 * @typedef {Object} OpenDivesCorePlugin
 * @property {() => Promise<{count: number}>} importSample
 *   Enregistre le carnet d'exemple comme dépôt git local.
 * @property {() => Promise<{exists: boolean, dives: Dive[]}>} listDives
 *   Relit le dépôt git local. `exists` vaut false tant qu'aucun dépôt n'a été créé.
 * @property {() => Promise<CloudDives>} listCloudDives
 *   Lecture seule du carnet du cloud Subsurface (identifiants de développement).
 */

/** @type {OpenDivesCorePlugin} */
export const OpenDivesCore = registerPlugin('OpenDivesCore');
