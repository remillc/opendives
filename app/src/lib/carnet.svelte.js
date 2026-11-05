// @ts-check
// État partagé du carnet : plongées, unités du carnet, état de synchronisation.
import { OpenDivesCore } from 'opendives-core';
import { defaultPrefs } from './format.js';

/** @typedef {import('opendives-core').Dive} Dive */
/** @typedef {import('opendives-core').Prefs} Prefs */

/**
 * - cloud : lu et synchronisé avec le cloud Subsurface ;
 * - horsLigne : copie de l'appareil, le serveur n'a pas répondu ;
 * - local : carnet seulement sur cet appareil (sans compte).
 * @typedef {'cloud'|'horsLigne'|'local'} Synchro
 */

export const carnet = $state({
  /** @type {Dive[]} */
  dives: [],
  /** @type {Prefs} */
  prefs: { ...defaultPrefs },
  /** @type {Synchro} */
  synchro: 'local',
  chargement: true,
  /** @type {string|null} */
  erreur: null,
});

export async function chargerCarnet() {
  carnet.chargement = true;
  carnet.erreur = null;
  try {
    const cloud = await OpenDivesCore.listCloudDives();
    if (cloud.available && cloud.dives) {
      carnet.dives = cloud.dives;
      carnet.synchro = cloud.synced ? 'cloud' : 'horsLigne';
    } else {
      let local = await OpenDivesCore.listDives();
      if (!local.exists) {
        await OpenDivesCore.importSample();
        local = await OpenDivesCore.listDives();
      }
      carnet.dives = local.dives;
      carnet.synchro = 'local';
    }
    carnet.prefs = await OpenDivesCore.getPrefs();
  } catch (e) {
    // Jamais le texte brut du cœur à l'écran (section 6) : il part au journal.
    console.error('Chargement du carnet', e);
    carnet.erreur = 'chargement';
  } finally {
    carnet.chargement = false;
  }
}
