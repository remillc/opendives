// @ts-check
// Shared logbook state: dives, the log's units, sync status.
import { OpenDivesCore } from 'opendives-core';
import { defaultPrefs } from './format.js';

/** @typedef {import('opendives-core').Dive} Dive */
/** @typedef {import('opendives-core').Prefs} Prefs */

/**
 * - cloud: read and synced with the Subsurface cloud;
 * - offline: the device's copy, the server did not answer;
 * - local: logbook on this device only (no account).
 * @typedef {'cloud'|'offline'|'local'} SyncState
 */

export const logbook = $state({
  /** @type {Dive[]} */
  dives: [],
  /** @type {Prefs} */
  prefs: { ...defaultPrefs },
  /** @type {SyncState} */
  sync: 'local',
  loading: true,
  /** @type {string|null} */
  error: null,
});

export async function loadLogbook() {
  logbook.loading = true;
  logbook.error = null;
  try {
    const cloud = await OpenDivesCore.listCloudDives();
    if (cloud.available && cloud.dives) {
      logbook.dives = cloud.dives;
      logbook.sync = cloud.synced ? 'cloud' : 'offline';
    } else {
      let local = await OpenDivesCore.listDives();
      if (!local.exists) {
        await OpenDivesCore.importSample();
        local = await OpenDivesCore.listDives();
      }
      logbook.dives = local.dives;
      logbook.sync = 'local';
    }
    logbook.prefs = await OpenDivesCore.getPrefs();
  } catch (e) {
    // Never the raw core text on screen (spec, section 6): it goes to the log.
    console.error('Loading the logbook', e);
    logbook.error = 'load';
  } finally {
    logbook.loading = false;
  }
}
