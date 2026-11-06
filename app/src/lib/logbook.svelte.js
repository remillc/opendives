// @ts-check
// Shared logbook state: dives, the log's units, sync status.
import { OpenDivesCore } from 'opendives-core';
import { defaultPrefs } from './format.js';

/** @typedef {import('opendives-core').Dive} Dive */
/** @typedef {import('opendives-core').Prefs} Prefs */

/**
 * - syncing: the device's copy is shown, the sync with the cloud is running;
 * - cloud: read and synced with the Subsurface cloud;
 * - offline: the device's copy, the server did not answer;
 * - local: logbook on this device only (no account).
 * @typedef {'syncing'|'cloud'|'offline'|'local'} SyncState
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

/**
 * Cloud log: the device's copy is read (no network) while the server is asked
 * for its head (network only), at the same time. The copy is shown as soon as
 * it is read; when the server's head is the copy's, the log is up to date and
 * nothing else is done. Otherwise the core syncs and reads the log again.
 * @returns {Promise<boolean>} false when no cloud account is configured
 */
async function loadCloud() {
  if (!(await OpenDivesCore.configureCloud()).available) return false;
  const probe = OpenDivesCore.probeCloud().then(
    (head) => ({ ok: true, ...head }),
    (/** @type {unknown} */ error) => ({ ok: false, exists: false, head: '', error }),
  );

  /** @type {string|null} commit of the copy shown */
  let shownHead = null;
  try {
    const cached = await OpenDivesCore.listCloudDives({ cached: true });
    if (cached.dives) {
      logbook.dives = cached.dives;
      logbook.prefs = await OpenDivesCore.getPrefs();
      logbook.sync = 'syncing';
      logbook.loading = false;
      shownHead = cached.head ?? '';
    }
  } catch (e) {
    // An unreadable copy is not fatal: the sync below reads the log again.
    console.error('Reading the device copy of the cloud log', e);
  }

  const server = await probe;
  if (shownHead !== null) {
    if (server.ok && server.exists && server.head === shownHead) {
      logbook.sync = 'cloud';
      return true;
    }
    if (!server.ok) {
      // The server did not answer: the copy shown is the offline logbook.
      console.error('Asking the cloud server for its head', server.error);
      logbook.sync = 'offline';
      return true;
    }
  }
  try {
    const fresh = await OpenDivesCore.listCloudDives();
    if (fresh.dives) {
      logbook.dives = fresh.dives;
      logbook.prefs = await OpenDivesCore.getPrefs();
    }
    logbook.sync = fresh.synced ? 'cloud' : 'offline';
  } catch (e) {
    if (shownHead === null) throw e;
    // The copy shown stays usable: the logbook is only out of date.
    console.error('Syncing with the cloud', e);
    logbook.sync = 'offline';
  }
  return true;
}

export async function loadLogbook() {
  logbook.loading = true;
  logbook.error = null;
  try {
    if (!(await loadCloud())) {
      let local = await OpenDivesCore.listDives();
      if (!local.exists) {
        await OpenDivesCore.importSample();
        local = await OpenDivesCore.listDives();
      }
      logbook.dives = local.dives;
      logbook.sync = 'local';
      logbook.prefs = await OpenDivesCore.getPrefs();
    }
  } catch (e) {
    // Never the raw core text on screen (spec, section 6): it goes to the log.
    console.error('Loading the logbook', e);
    logbook.error = 'load';
  } finally {
    logbook.loading = false;
  }
}
