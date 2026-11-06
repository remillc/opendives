// @ts-check
// Shared logbook state: dives, the log's units, sync status.
import { OpenDivesCore } from 'opendives-core';
import { defaultPrefs } from './format.js';
import { keepCylinderLibrary } from './settings.svelte.js';

/** @typedef {import('opendives-core').Dive} Dive */
/** @typedef {import('opendives-core').Prefs} Prefs */

/**
 * - syncing: the device's copy is shown, the sync with the cloud is running;
 * - cloud: read and synced with the Subsurface cloud;
 * - offline: the device's copy, the server did not answer;
 * - local: logbook on this device only (no account);
 * - manual: "Sync automatically" is off: nothing is sent or fetched until
 *   "Sync now" (spec, section 4, "Manual synchronisation").
 * @typedef {'syncing'|'cloud'|'offline'|'local'|'manual'} SyncState
 */

/**
 * A dive changed here and in the cloud that the core could not merge.
 * `date`: local time of the dive; `field`: what changed on both sides
 * (notes, suit…); `localWhen`, `cloudWhen`: where and when each version was
 * made, as sentences.
 * @typedef {{ date: string, field: string, localWhen: string, cloudWhen: string }} Conflict
 */

export const logbook = $state({
  /** @type {Dive[]} */
  dives: [],
  /** The core's preferences (units, Settings); only the units until the first read. */
  prefs: /** @type {Prefs} */ ({ ...defaultPrefs }),
  /** @type {SyncState} */
  sync: 'local',
  loading: true,
  /** @type {string|null} */
  error: null,
  /** Cloud account email; empty without an account. */
  email: '',
  /** Cloud server host in use, e.g. ssrf-cloud-eu.subsurface-divelog.org. */
  server: '',
  /** Local time of the last successful sync (ISO, no time zone), or null. */
  lastSync: /** @type {string|null} */ (readLastSync()),
  /** "Sync automatically" (Account screen); a setting of this device. */
  autoSync: readAutoSync(),
  /** Local changes of the cloud log not sent yet. */
  pending: 0,
  /**
   * Fields changed and not sent yet, by dive number (spec, section 4,
   * <DiveRow>: "Notes edited, waiting to be sent"); read from the texts of
   * the pending commits, which list the edits as Subsurface writes them.
   */
  pendingByDive: /** @type {Record<number, string[]>} */ ({}),
  /**
   * A sync the core could not merge (spec, section 6, "Conflict"); not
   * reported by the core yet: always null for now.
   */
  conflict: /** @type {Conflict|null} */ (null),
  /** First launch is shown (first start, or after signing out): nothing is loaded until a choice is made. */
  welcome: readWelcome(),
  /** Last dive changed by an edit or an undo, for the detail screen. */
  edited: /** @type {{ id: number, dive: import('opendives-core').DiveDetail }|null} */ (null),
  /** Last trip changed by a trip change or an undo, for the trip screen. */
  editedTrip: /** @type {import('opendives-core').TripDetail|null} */ (null),
  /** Text of the step that Undo would revert, e.g. "Edit notes [#12]". */
  undoText: '',
  /** Increases at each site change, so that site screens read the sites again. */
  sitesVersion: 0,
});

/**
 * One trip change (spec, section 4, "Trip"), saved and synced like a dive
 * edit; the logbook list is read again, as trips changed.
 * @param {Parameters<import('opendives-core').OpenDivesCorePlugin['tripAction']>[0]} options
 */
export async function tripChange(options) {
  const result = await OpenDivesCore.tripAction(options);
  logbook.editedTrip = result.trip ?? null;
  logbook.undoText = result.undo;
  logbook.dives = await OpenDivesCore.listLoadedDives();
  await persistChanges();
  return result;
}

/**
 * "Group dives into trips" (Settings), the logbook's autogroup: one undoable
 * step, saved and synced like a trip change.
 * @param {boolean} on
 */
export async function setAutogroup(on) {
  const result = await OpenDivesCore.tripAction({ action: 'autogroup', value: on ? 'on' : 'off' });
  logbook.undoText = result.undo;
  logbook.dives = await OpenDivesCore.listLoadedDives();
  logbook.prefs = await OpenDivesCore.getPrefs();
  await persistChanges();
}

/**
 * Renames a cylinder type (Settings, cylinder types): the cylinders of that
 * type in the logbook too, one undoable step, saved and synced like an edit.
 * @param {string} name
 * @param {string} newName
 */
export async function renameCylinderType(name, newName) {
  const result = await OpenDivesCore.cylinderTypes({ action: 'rename', name, value: newName });
  keepCylinderLibrary(result.library);
  logbook.undoText = result.undo;
  await persistChanges();
  return result;
}

/** Delay before an edit is synced: the time Undo is offered (spec: "a few seconds after a change"). */
const SYNC_DELAY_MS = 5000;
/** @type {ReturnType<typeof setTimeout>|undefined} */
let syncTimer;

/**
 * Saves an edit of one dive (one undoable step): saved locally at once; with
 * automatic synchronisation, synced a few seconds later.
 * @param {number} id
 * @param {Record<string, string|number|string[]>} changes
 */
export async function saveDiveChanges(id, changes) {
  const result = await OpenDivesCore.editDive({ id, changes });
  logbook.edited = { id, dive: result.dive };
  logbook.undoText = result.undo;
  await persistChanges();
  return result;
}

/**
 * After a change that may touch many dives (sites): the list is read again,
 * then saved and synced like an edit.
 * @param {string} undoText
 */
export async function refreshAfterChange(undoText) {
  logbook.undoText = undoText;
  logbook.dives = await OpenDivesCore.listLoadedDives();
  logbook.sitesVersion++;
  await persistChanges();
}

/** Undoes the last edit, saved and synced the same way. */
export async function undoLastChange() {
  const result = await OpenDivesCore.undo();
  if (result.dive) logbook.edited = { id: result.dive.id, dive: result.dive };
  if (result.trip) {
    logbook.editedTrip = result.trip;
    logbook.dives = await OpenDivesCore.listLoadedDives();
  }
  if (result.site) {
    logbook.dives = await OpenDivesCore.listLoadedDives();
    logbook.sitesVersion++;
  }
  if (result.cylinderTypes) keepCylinderLibrary(result.cylinderTypes.library);
  logbook.undoText = result.undo;
  await persistChanges();
  return result;
}

async function persistChanges() {
  await OpenDivesCore.saveLocal();
  await countPending();
  clearTimeout(syncTimer);
  if (logbook.email && logbook.autoSync) syncTimer = setTimeout(syncEdits, SYNC_DELAY_MS);
}

/** Sends the saved edits (automatic synchronisation). */
async function syncEdits() {
  logbook.sync = 'syncing';
  try {
    const status = await OpenDivesCore.syncChanges();
    if (status.reloaded) {
      // The merged log was read again: its dives are new objects.
      logbook.dives = await OpenDivesCore.listLoadedDives();
      logbook.undoText = '';
    }
    logbook.sync = status.status === 'offline' || status.status === 'stopped' ? 'offline' : 'cloud';
    if (logbook.sync === 'cloud') markSynced();
  } catch (e) {
    console.error('Syncing the edits', e);
    logbook.sync = 'offline';
  }
  await countPending();
}

/**
 * "od.welcome": "show" after signing out, "done" once a way to start was
 * chosen, absent before the first start.
 * @returns {string|null}
 */
function readWelcomeState() {
  try {
    return localStorage.getItem('od.welcome');
  } catch {
    return 'done';
  }
}

function readWelcome() {
  return readWelcomeState() === 'show';
}

/** @param {'show'|'done'} value */
function writeWelcomeState(value) {
  try {
    localStorage.setItem('od.welcome', value);
  } catch {
    // Not fatal: first launch may be shown again at the next start.
  }
}

/**
 * At start: first launch is shown on the very first start, unless a cloud
 * account is already configured on this device (development credentials);
 * otherwise the logbook is loaded.
 */
export async function startApp() {
  if (logbook.welcome) return;
  if (readWelcomeState() === null) {
    let configured = false;
    try {
      configured = (await OpenDivesCore.configureCloud()).available;
    } catch (e) {
      console.error('Reading the cloud account', e);
    }
    if (!configured) {
      logbook.welcome = true;
      logbook.loading = false;
      return;
    }
    writeWelcomeState('done');
  }
  await loadLogbook();
}

/**
 * Signs out (spec, section 4, "Sign out"): the core closes the log and forgets
 * the account, the credentials are forgotten, and first launch is shown. The
 * device copy is kept, unless deleteCopy (refused while changes are not sent).
 * @param {{ deleteCopy?: boolean }} [options]
 */
export async function signOut({ deleteCopy = false } = {}) {
  await OpenDivesCore.signOut({ deleteCopy });
  forgetAccount(true);
}

/**
 * After the server confirmed the deletion of the account: with keepDives, the
 * dives are now the logbook of this device, which is opened; otherwise first
 * launch is shown, as after signing out.
 * @param {{ keepDives: boolean }} options
 */
export async function accountDeleted({ keepDives }) {
  forgetAccount(!keepDives);
  if (keepDives) await loadLogbook();
}

/** @param {boolean} showWelcome */
function forgetAccount(showWelcome) {
  logbook.dives = [];
  logbook.email = '';
  logbook.server = '';
  logbook.sync = 'local';
  logbook.pending = 0;
  logbook.pendingByDive = {};
  logbook.lastSync = null;
  logbook.welcome = showWelcome;
  try {
    localStorage.removeItem('od.lastSync');
  } catch {
    // Not fatal.
  }
  if (showWelcome) writeWelcomeState('show');
}

/** First launch, "Start without an account": the logbook of this device. */
export function startWithoutAccount() {
  logbook.welcome = false;
  writeWelcomeState('done');
  return loadLogbook();
}

/**
 * Signed in, or a new account with its first logbook: first launch closes
 * and the logbook of the account is loaded (its credentials are stored).
 */
export function accountReady() {
  logbook.welcome = false;
  writeWelcomeState('done');
  logbook.lastSync = null;
  return loadLogbook();
}

function readAutoSync() {
  try {
    return localStorage.getItem('od.autoSync') !== 'false';
  } catch {
    return true;
  }
}

/**
 * Turns automatic synchronisation on or off. Off: the logbook stays as it is
 * and the state says so; on: a sync runs at once.
 * @param {boolean} value
 */
export function setAutoSync(value) {
  logbook.autoSync = value;
  try {
    localStorage.setItem('od.autoSync', String(value));
  } catch {
    // Not fatal: the setting only lasts until the app closes.
  }
  if (!logbook.email) return;
  if (value) {
    loadLogbook();
  } else {
    logbook.sync = 'manual';
    countPending();
  }
}

/** "Sync now": the full exchange with the server, in either mode. */
export function syncNow() {
  return loadLogbook({ force: true });
}

/**
 * Edits of each dive in the messages of the pending commits. Subsurface's
 * commit message lists the edit texts ("Edit notes [#12]", "(undo) Edit
 * tags [#12]"); a dive without a number is shown by its date ("[@…]") and
 * is not matched here.
 * @param {{ message: string }[]} commits
 */
export function pendingFields(commits) {
  /** @type {Record<number, string[]>} */
  const byDive = {};
  const edit = /Edit (notes|suit|rating|visibility|wavesize|current|surge|chill|buddies|dive guide|tags|dive site|dive) \[#(\d+)\]/g;
  for (const c of commits) {
    for (const m of c.message.matchAll(edit)) {
      const n = Number(m[2]);
      const field = m[1] === 'dive guide' ? 'diveguide' : m[1] === 'dive site' ? 'site' : m[1];
      byDive[n] ??= [];
      if (!byDive[n].includes(field)) byDive[n].push(field);
    }
  }
  return byDive;
}

async function countPending() {
  try {
    const commits = await OpenDivesCore.pendingChanges();
    logbook.pending = commits.length;
    logbook.pendingByDive = pendingFields(commits);
  } catch (e) {
    console.error('Counting the changes not sent', e);
  }
}

// Offline: sending starts by itself when the network is back (spec, section 6).
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (logbook.email && logbook.autoSync && logbook.sync === 'offline' && logbook.pending) syncEdits();
  });
}

function readLastSync() {
  try {
    return localStorage.getItem('od.lastSync');
  } catch {
    return null;
  }
}

/** Notes a successful sync, kept across launches. */
function markSynced() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
  logbook.lastSync = local;
  try {
    localStorage.setItem('od.lastSync', local);
  } catch {
    // Not fatal: only the Account screen shows it.
  }
}

/**
 * Cloud log: the device's copy is read (no network) while the server is asked
 * for its head (network only), at the same time. The copy is shown as soon as
 * it is read; when the server's head is the copy's, the log is up to date and
 * nothing else is done. Otherwise the core syncs and reads the log again.
 * With automatic synchronisation off, only the device's copy is read, unless
 * `force` ("Sync now") or there is no copy yet.
 * @param {boolean} force
 * @returns {Promise<boolean>} false when no cloud account is configured
 */
async function loadCloud(force) {
  const account = await OpenDivesCore.configureCloud();
  if (!account.available) {
    logbook.email = '';
    logbook.server = '';
    return false;
  }
  logbook.email = account.email;

  if (!logbook.autoSync && !force) {
    try {
      const cached = await OpenDivesCore.listCloudDives({ cached: true });
      if (cached.dives) {
        if (cached.server) logbook.server = cached.server;
        logbook.dives = cached.dives;
        logbook.prefs = await OpenDivesCore.getPrefs();
        logbook.sync = 'manual';
        await countPending();
        return true;
      }
    } catch (e) {
      console.error('Reading the device copy of the cloud log', e);
    }
    // No copy on this device yet: the first one has to be fetched.
  }

  const probe = OpenDivesCore.probeCloud().then(
    (head) => ({ ok: true, ...head }),
    (/** @type {unknown} */ error) => ({ ok: false, exists: false, head: '', error }),
  );

  /** @type {string|null} commit of the copy shown */
  let shownHead = null;
  try {
    const cached = await OpenDivesCore.listCloudDives({ cached: true });
    if (cached.server) logbook.server = cached.server;
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
      markSynced();
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
    if (fresh.server) logbook.server = fresh.server;
    logbook.sync = fresh.synced ? 'cloud' : 'offline';
    if (fresh.synced) markSynced();
  } catch (e) {
    if (shownHead === null) throw e;
    // The copy shown stays usable: the logbook is only out of date.
    console.error('Syncing with the cloud', e);
    logbook.sync = 'offline';
  }
  return true;
}

/**
 * Loads the logbook: the cloud log when an account is configured, otherwise
 * the log on this device.
 * @param {{ force?: boolean }} [options] force: exchange with the server even
 *   with automatic synchronisation off ("Sync now")
 */
export async function loadLogbook({ force = false } = {}) {
  logbook.loading = true;
  logbook.error = null;
  try {
    if (await loadCloud(force)) {
      // Manual synchronisation: the state says so at all times, after a
      // "Sync now" too (spec, section 4).
      if (!logbook.autoSync) logbook.sync = 'manual';
      await countPending();
    } else {
      let local = await OpenDivesCore.listDives();
      if (!local.exists) {
        await OpenDivesCore.importSample();
        local = await OpenDivesCore.listDives();
      }
      logbook.dives = local.dives;
      logbook.sync = 'local';
      logbook.pending = 0;
      logbook.pendingByDive = {};
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
