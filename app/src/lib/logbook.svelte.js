// @ts-check
// Shared logbook state: dives, the log's units, sync status.
import { OpenDivesCore } from 'opendives-core';
import { defaultPrefs } from './format.js';
import { mark } from './perf.js';
import { readSnapshot, saveSnapshot } from './snapshot.js';
import { nextProgress } from './sync-progress.js';
import { failureCause, isRefused, retryDelay } from './sync-failure.js';
import { applyDeviceSettings, keepCylinderLibrary, keepDiveComputers, prefsAfterLoad } from './settings.svelte.js';

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
 * Dives changed here and in the cloud on the same line, which Subsurface's
 * automatic merge could not combine (OpenDivesCore.syncConflicts).
 * @typedef {Extract<import('opendives-core').SyncConflicts, {conflict: true}>} Conflict
 */

export const logbook = $state({
  /** @type {Dive[]} */
  dives: [],
  /** The core's preferences (units, Settings); only the units until the first read. */
  prefs: /** @type {Prefs} */ ({ ...defaultPrefs }),
  /** @type {SyncState} */
  sync: 'local',
  /** Where the running sync is (lib/sync-progress.js); shown while sync is "syncing". */
  syncProgress: /** @type {import('./sync-progress.js').SyncProgress|null} */ (null),
  loading: true,
  /**
   * The top of the list as it was at the last load (lib/snapshot.js): drawn
   * while the dives are read at start, never used as data.
   * @type {import('./snapshot.js').Snapshot|null}
   */
  preview: readWelcome() ? null : readSnapshot(),
  /** @type {string|null} */
  error: null,
  /** Cloud account email, or the user name for a git repository; empty without an account. */
  email: '',
  /** Where the logbook is synced: the Subsurface cloud, or the user's own git repository. */
  mode: /** @type {'cloud'|'git'} */ ('cloud'),
  /** The git repository, "host/owner/name"; empty for the cloud. */
  repository: '',
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
   * A sync conflict to settle (spec, section 6, "Conflict"): read after each
   * sync of the cloud log, cleared once the diver chose a version.
   */
  conflict: /** @type {Conflict|null} */ (null),
  /** Why the last sync failed while the network works; null otherwise (spec, "Sync failures"). */
  syncFailure: /** @type {import('./sync-failure.js').SyncFailure|null} */ (null),
  /** The sheet explaining the failure is open. */
  syncFailureOpen: false,
  /** Minutes until the next automatic try; 0 when none is planned. */
  retryMinutes: 0,
  /** "Plus tard": the dialog is closed, sync stays paused until the choice is made. */
  conflictLater: false,
  /** First launch is shown (first start, or after signing out): nothing is loaded until a choice is made. */
  welcome: readWelcome(),
  /** Last dive changed by an edit or an undo, for the detail screen. */
  edited: /** @type {{ id: number, dive: import('opendives-core').DiveDetail }|null} */ (null),
  /** Last trip changed by a trip change or an undo, for the trip screen. */
  editedTrip: /** @type {import('opendives-core').TripDetail|null} */ (null),
  /** Text of the step that Undo would revert, e.g. "Edit notes [#12]". */
  undoText: '',
  /** Text of the step that Redo would apply again; empty when none. */
  redoText: '',
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
  logbook.redoText = result.redo ?? '';
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
  logbook.redoText = result.redo ?? '';
  logbook.dives = await OpenDivesCore.listLoadedDives();
  logbook.prefs = await prefsAfterLoad();
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
  logbook.redoText = result.redo ?? '';
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
  logbook.redoText = result.redo ?? '';
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
  logbook.redoText = '';
  logbook.dives = await OpenDivesCore.listLoadedDives();
  logbook.sitesVersion++;
  await persistChanges();
}

/**
 * Deletes a dive (one undoable step), saved and synced like an edit.
 * @param {number} id
 */
export async function deleteDive(id) {
  return deleteDives([id]);
}

/**
 * Deletes several dives in one undoable step (the logbook's selection),
 * saved and synced like an edit.
 * @param {number[]} ids
 */
export async function deleteDives(ids) {
  const result = await OpenDivesCore.deleteDive({ ids });
  logbook.undoText = result.undo;
  logbook.redoText = result.redo ?? '';
  logbook.dives = await OpenDivesCore.listLoadedDives();
  logbook.sitesVersion++;
  await persistChanges();
}

/**
 * Renumbers dives in date order from `start` (one undoable step), saved and
 * synced like an edit. No ids: all the dives, as Subsurface's Renumber dialog.
 * @param {number[]} ids
 * @param {number} start
 */
export async function renumberDives(ids, start) {
  const result = await OpenDivesCore.renumberDives({ ids, start });
  logbook.undoText = result.undo;
  logbook.redoText = result.redo ?? '';
  logbook.dives = await OpenDivesCore.listLoadedDives();
  await persistChanges();
}

/**
 * "Renuméroter la plongée": dive `id` takes number `target`, and the dives in
 * between shift by one so that numbers stay unique and without gaps (spec,
 * section 4, "Dive detail"). Moving dive n to a smaller m: dives m to n−1 go
 * up by one; to a larger m: dives n+1 to m go down by one; a number beyond
 * the last dive becomes the last number. An unnumbered dive is inserted: the
 * dives from m on go up by one.
 * @param {number} id
 * @param {number} target
 * @returns {{ ids: number[], numbers: number[], shifted: { from: number, to: number, by: number }|null, number: number }}
 */
export function renumberShiftPlan(id, target) {
  const dive = logbook.dives.find((d) => d.id === id);
  const numbered = logbook.dives.filter((d) => d.number > 0);
  const last = numbered.reduce((max, d) => Math.max(max, d.number), 0);
  const n = dive?.number ?? 0;
  const m = Math.max(1, Math.min(Math.round(target), n > 0 ? last : last + 1));
  /** @type {number[]} */
  const ids = [id];
  /** @type {number[]} */
  const numbers = [m];
  /** @type {{ from: number, to: number, by: number }|null} */
  let shifted = null;
  if (n > 0 && m < n) shifted = { from: m, to: n - 1, by: 1 };
  else if (n > 0 && m > n) shifted = { from: n + 1, to: m, by: -1 };
  else if (n === 0 && m <= last) shifted = { from: m, to: last, by: 1 };
  if (shifted) {
    const { from, to, by } = shifted;
    for (const d of numbered)
      if (d.id !== id && d.number >= from && d.number <= to) {
        ids.push(d.id);
        numbers.push(d.number + by);
      }
    if (ids.length === 1) shifted = null;
  }
  return { ids, numbers, shifted, number: m };
}

/**
 * Gives each dive its own number (one undoable step, as Subsurface's
 * RenumberDives), saved and synced like an edit.
 * @param {number[]} ids
 * @param {number[]} numbers
 */
export async function renumberDivesTo(ids, numbers) {
  const result = await OpenDivesCore.renumberDives({ ids, start: 0, numbers });
  logbook.undoText = result.undo;
  logbook.redoText = result.redo ?? '';
  logbook.dives = await OpenDivesCore.listLoadedDives();
  await persistChanges();
}

/**
 * The dives that a new dive logged in the middle of the logbook pushes down:
 * that dive and every later one, and the number the first one should take
 * (the previous dive's number plus one, 1 for the first dive of the log).
 * @param {number} id the new dive
 * @returns {{ ids: number[], start: number }|null} null if the dive is not in the logbook
 */
export function renumberPlanFrom(id) {
  const sorted = [...logbook.dives].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const i = sorted.findIndex((d) => d.id === id);
  if (i < 0) return null;
  return { ids: sorted.slice(i).map((d) => d.id), start: (sorted[i - 1]?.number ?? 0) + 1 };
}

/**
 * Logs a dive by hand (one undoable step), saved and synced like an edit.
 * @param {Record<string, string|number|string[]>} fields
 * @returns {Promise<number>} the new dive's identifier
 */
export async function addDive(fields) {
  const result = await OpenDivesCore.createDive({ fields });
  logbook.undoText = result.undo;
  logbook.redoText = result.redo ?? '';
  logbook.dives = await OpenDivesCore.listLoadedDives();
  await persistChanges();
  return result.list?.id ?? 0;
}

/**
 * Saves a plan as a planned dive, or replaces one (one undoable step), saved
 * and synced like an edit. The dive list does not show planned dives.
 * @param {import('opendives-core').PlanRequest} request
 * @param {number} [replaceId]
 */
export async function savePlan(request, replaceId = 0) {
  const result = await OpenDivesCore.savePlan({ request, replaceId });
  logbook.undoText = result.undo;
  logbook.redoText = result.redo ?? '';
  await persistChanges();
  return result.list?.id ?? 0;
}

/**
 * Imports a file chosen by the diver (one undoable step), saved and synced
 * like an edit. Errors keep the core's code (IMPORT_FAILED, NO_DIVES,
 * NO_NEW_DIVES) for the message.
 * @param {File} file
 * @returns {Promise<number>} the number of dives added to the logbook
 */
export async function importFile(file) {
  const before = logbook.dives.length;
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const result = await OpenDivesCore.importDives({ name: file.name, data });
  logbook.undoText = result.undo;
  logbook.redoText = result.redo ?? '';
  logbook.dives = await OpenDivesCore.listLoadedDives();
  logbook.sitesVersion++;
  await persistChanges();
  return Math.max(0, logbook.dives.length - before);
}

/** Dives logged on this device without an account (0 when none, or unreadable). */
export async function deviceDiveCount() {
  try {
    return (await OpenDivesCore.deviceLog({ action: 'count' })).count;
  } catch (e) {
    console.error('Device dives', e);
    return 0;
  }
}

/**
 * Adds the dives logged on this device without an account to the account's
 * logbook: one undoable step, saved and synced like an import.
 * @returns {Promise<number>} the number of dives added
 */
export async function importDeviceDives() {
  const before = logbook.dives.length;
  const result = await OpenDivesCore.deviceLog({ action: 'import' });
  logbook.undoText = result.undo;
  logbook.redoText = result.redo ?? '';
  logbook.dives = await OpenDivesCore.listLoadedDives();
  logbook.sitesVersion++;
  await persistChanges();
  return Math.max(0, logbook.dives.length - before);
}

/**
 * After a download from a dive computer (OpenDivesCore.downloadDives): the
 * new dives are one undoable step already made by the core; it is saved and
 * synced like an edit. The remembered computers, updated by the core after
 * every attempt as Subsurface does, are kept on this device.
 * @param {import('opendives-core').DownloadResult|null} result null after a failed attempt
 */
export async function afterDownload(result) {
  try {
    logbook.prefs = await prefsAfterLoad();
    if (logbook.prefs.diveComputerList) keepDiveComputers(logbook.prefs.diveComputerList);
  } catch (e) {
    console.error('Reading the remembered dive computers', e);
  }
  if (!result?.downloaded) return;
  logbook.undoText = result.undo;
  logbook.redoText = '';
  logbook.dives = await OpenDivesCore.listLoadedDives();
  logbook.sitesVersion++;
  await persistChanges();
}

/**
 * After each sync of the cloud log: the conflicts Subsurface's merge left,
 * if any (read only).
 */
async function readConflicts() {
  if (!logbook.email) return;
  try {
    const found = await OpenDivesCore.syncConflicts();
    logbook.conflict = found.conflict ? found : null;
  } catch (e) {
    console.error('Reading the sync conflicts', e);
  }
}

/** A choice just made and not sent yet: its snackbar can still take it back. */
let choiceHeld = false;

/**
 * The diver's choices for a sync conflict, dive by dive (by file path of the
 * git log): one new commit on this device. Nothing is sent before
 * sendConflictChoice().
 * @param {Record<string, 'device'|'cloud'>} choices
 */
export async function resolveConflict(choices) {
  await OpenDivesCore.resolveConflicts({ choices });
  choiceHeld = true;
  logbook.conflict = null;
  logbook.conflictLater = false;
  undoCleared();
  logbook.dives = await OpenDivesCore.listLoadedDives();
  await countPending();
}

/** "Plus tard": the dialog closes, the diver stays where they were; sync stays paused. */
export function postponeConflict() {
  logbook.conflictLater = true;
}

/** The status row of the Carnet or the sync card of the side menu: the dialog again. */
export function reopenConflict() {
  logbook.conflictLater = false;
}

/** The snackbar is gone: the choice is sent, like an edit. */
export async function sendConflictChoice() {
  choiceHeld = false;
  await persistChanges();
}

/** "Annuler": the conflict as it was, and its dialog again. */
export async function cancelConflictChoice() {
  choiceHeld = false;
  await OpenDivesCore.cancelConflictResolution();
  logbook.dives = await OpenDivesCore.listLoadedDives();
  await readConflicts();
  await countPending();
}

/** Undoes the last edit, saved and synced the same way. */
/**
 * Undoes the last change, or applies again the last one undone (`redo`).
 * @param {boolean} [redo]
 */
export async function undoLastChange(redo = false) {
  const result = await OpenDivesCore.undo({ redo });
  if (result.dive) logbook.edited = { id: result.dive.id, dive: result.dive };
  if (result.list) {
    logbook.dives = await OpenDivesCore.listLoadedDives();
    logbook.sitesVersion++;
  }
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
  logbook.redoText = result.redo ?? '';
  await persistChanges();
  return result;
}

async function persistChanges() {
  await OpenDivesCore.saveLocal();
  await countPending();
  clearTimeout(syncTimer);
  // With a conflict waiting, the automatic sync that would run only brings the dialog back (syncEdits).
  if (logbook.email && logbook.autoSync && !choiceHeld) syncTimer = setTimeout(syncEdits, SYNC_DELAY_MS);
}

/** The core's undo history was emptied (a load): no "Undo" may be offered any more. */
function undoCleared() {
  logbook.undoText = '';
  logbook.redoText = '';
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('od-undo-cleared'));
}

/**
 * The outcome of a sync, for the message after "Sync now": done; offline
 * (the server did not answer); failed (it answered, the exchange stopped).
 * @typedef {'done'|'offline'|'failed'} SyncOutcome
 */

/**
 * Sends the saved edits (automatic synchronisation).
 * @returns {Promise<SyncOutcome>}
 */
async function syncEdits() {
  // Paused while a conflict waits for the diver: a sync attempt brings its dialog
  // back ("Plus tard" lasts until the next attempt), and nothing is sent.
  if (logbook.conflict) {
    logbook.conflictLater = false;
    return /** @type {SyncOutcome} */ ('failed');
  }
  // Also paused while the choice can be taken back.
  if (choiceHeld) return /** @type {SyncOutcome} */ ('failed');
  logbook.syncProgress = null;
  logbook.sync = 'syncing';
  /** @type {SyncOutcome} */
  let outcome = 'failed';
  try {
    const status = await OpenDivesCore.syncChanges();
    if (status.reloaded) {
      // The cloud brought changes: the merged log was read again, its dives
      // are new objects and the undo history is gone (lib/undo.js).
      logbook.dives = await OpenDivesCore.listLoadedDives();
      undoCleared();
    }
    const reached = status.status !== 'offline' && status.status !== 'stopped';
    // Manual synchronisation: the state says so again once done (spec, section 4).
    logbook.sync = !reached ? 'offline' : logbook.autoSync ? 'cloud' : 'manual';
    if (reached) markSynced();
    outcome = reached ? 'done' : status.status === 'offline' ? 'offline' : 'failed';
    if (!reached) noteFailure(status.cause === 'auth');
    if (status.status === 'merged') await readConflicts();
  } catch (e) {
    console.error('Syncing the edits', e);
    logbook.sync = 'offline';
  }
  await countPending();
  return outcome;
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
 * Calls sent at the very start, before the screens are built, so that the
 * core reads the device copy while the interface starts; the first load
 * takes their answers instead of asking again. The core runs the calls in the
 * order they were sent: settings, account, device copy.
 * @type {{ configure: Promise<any>, cached: Promise<any>, probe: Promise<any>|null }|null}
 */
let early = null;

/** Set when an account was found: lets the next start send the probe at once. */
const ACCOUNT_HINT = 'od.cloudAccount';

/** @param {boolean} has */
function rememberAccount(has) {
  try {
    if (has) localStorage.setItem(ACCOUNT_HINT, '1');
    else localStorage.removeItem(ACCOUNT_HINT);
  } catch {
    // Not fatal: the probe is then sent after the account is read.
  }
}

/**
 * First thing the app does (main.js): the settings of this device go into the
 * core first, then, when this is not a first launch, the account and the
 * device copy are asked for without waiting, then startApp.
 * @returns {Promise<void>}
 */
export function boot() {
  const settingsApplied = applyDeviceSettings().then(() => mark('settings'));
  if (readWelcomeState() === 'done') {
    const configure = OpenDivesCore.configureCloud();
    const cached = OpenDivesCore.listCloudDives({ cached: true });
    let probe = null;
    try {
      // The probe runs on the plugin's network thread, not in the core's
      // order: it is sent once the account is set, or it finds none.
      if (logbook.autoSync && localStorage.getItem(ACCOUNT_HINT)) probe = configure.then(() => OpenDivesCore.probeCloud());
    } catch {
      // No hint: loadCloud sends the probe.
    }
    // Answers not taken (no account here): nothing to report.
    for (const call of [configure, cached, probe]) call?.catch(() => {});
    early = { configure, cached, probe };
  }
  return settingsApplied.then(() => startApp());
}

/**
 * At start: first launch is shown on the very first start, unless a cloud
 * account is already configured on this device (development credentials);
 * otherwise the logbook is loaded.
 */
export async function startApp() {
  mark('startApp');
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
  logbook.preview = null;
  saveSnapshot(null);
  logbook.dives = [];
  logbook.email = '';
  logbook.mode = 'cloud';
  logbook.repository = '';
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

/**
 * The logbook now lives in another git repository (Account, "Modifier le
 * dépôt"): what was shown belongs to the previous one, the new one is loaded.
 */
export function repositoryChanged() {
  logbook.preview = null;
  saveSnapshot(null);
  logbook.dives = [];
  logbook.pending = 0;
  logbook.pendingByDive = {};
  logbook.conflict = null;
  clearFailure();
  logbook.lastSync = null;
  try {
    localStorage.removeItem('od.lastSync');
  } catch {
    // Not fatal.
  }
  return loadLogbook({ force: true });
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

/**
 * "Sync now", in either mode. A logbook already shown: the exchange of the
 * automatic synchronisation (send, fetch, merge; read again only when the
 * cloud brought changes), so that only the status line moves, not the list
 * nor the menu (to-do #2). Otherwise (no copy yet, an error): the full load.
 */
export async function syncNow() {
  if (!logbook.email || logbook.loading || logbook.error || logbook.sync === 'syncing') {
    if (logbook.sync === 'syncing') return /** @type {SyncOutcome} */ ('failed');
    await loadLogbook({ force: true });
    return /** @type {SyncOutcome} */ (logbook.error ? 'failed' : logbook.sync === 'offline' ? 'offline' : 'done');
  }
  clearTimeout(syncTimer);
  return syncEdits();
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
  // Where the sync is: only while one is shown as running.
  OpenDivesCore.addListener('syncProgress', (/** @type {{ message: string }} */ { message }) => {
    if (logbook.sync === 'syncing') logbook.syncProgress = nextProgress(message, logbook.syncProgress);
  }).catch((/** @type {unknown} */ e) => console.error('Sync progress', e));
}

function readLastSync() {
  try {
    return localStorage.getItem('od.lastSync');
  } catch {
    return null;
  }
}

/** Notes a successful sync, kept across launches. */
/** @type {ReturnType<typeof setTimeout>|undefined} */
let retryTimer;
let retries = 0;

/** @param {boolean} refused the server answered and refused the credentials */
function noteFailure(refused) {
  logbook.syncFailure = failureCause({ online: navigator.onLine, gitMode: logbook.mode === 'git', refused });
  clearTimeout(retryTimer);
  logbook.retryMinutes = 0;
  // Only the unreachable server is tried again; the other two wait for the diver.
  if (logbook.syncFailure === 'server' && logbook.autoSync) {
    logbook.retryMinutes = retryDelay(retries++);
    retryTimer = setTimeout(syncNow, logbook.retryMinutes * 60000);
  }
}

function clearFailure() {
  clearTimeout(retryTimer);
  retries = 0;
  logbook.retryMinutes = 0;
  logbook.syncFailure = null;
  logbook.syncFailureOpen = false;
}

function markSynced() {
  clearFailure();
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
 * @param {typeof early} [pre] answers of the calls sent at start (boot), for the first load
 * @returns {Promise<boolean>} false when no cloud account is configured
 */
async function loadCloud(force, pre = null) {
  const account = await (pre?.configure ?? OpenDivesCore.configureCloud());
  rememberAccount(account.available);
  mark('configured');
  if (!account.available) {
    logbook.email = '';
    logbook.mode = 'cloud';
    logbook.repository = '';
    logbook.server = '';
    return false;
  }
  logbook.email = account.email;
  logbook.mode = account.mode === 'git' ? 'git' : 'cloud';
  logbook.repository = account.repository ?? '';

  if (!logbook.autoSync && !force) {
    try {
      const cached = await (pre?.cached ?? OpenDivesCore.listCloudDives({ cached: true }));
      if (cached.dives) {
        if (cached.server) logbook.server = cached.server;
        logbook.dives = cached.dives;
        logbook.prefs = await prefsAfterLoad();
        logbook.sync = 'manual';
        await countPending();
        return true;
      }
    } catch (e) {
      console.error('Reading the device copy of the cloud log', e);
    }
    // No copy on this device yet: the first one has to be fetched.
  }

  const probe = (pre?.probe ?? OpenDivesCore.probeCloud()).then(
    (head) => ({ ok: true, ...head }),
    (/** @type {unknown} */ error) => ({ ok: false, exists: false, head: '', error }),
  );

  /** @type {string|null} commit of the copy shown */
  let shownHead = null;
  try {
    const cached = await (pre?.cached ?? OpenDivesCore.listCloudDives({ cached: true }));
    mark('cachedRead');
    if (cached.server) logbook.server = cached.server;
    if (cached.dives) {
      logbook.dives = cached.dives;
      logbook.prefs = await prefsAfterLoad();
      logbook.syncProgress = null;
      logbook.sync = 'syncing';
      logbook.loading = false;
      shownHead = cached.head ?? '';
    }
  } catch (e) {
    // An unreadable copy is not fatal: the sync below reads the log again.
    console.error('Reading the device copy of the cloud log', e);
  }

  const server = await probe;
  mark('probeDone');
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
      noteFailure(isRefused(/** @type {any} */ (server.error)?.message));
      return true;
    }
  }
  try {
    const fresh = await OpenDivesCore.listCloudDives();
    if (fresh.dives) {
      logbook.dives = fresh.dives;
      logbook.prefs = await prefsAfterLoad();
    }
    if (fresh.server) logbook.server = fresh.server;
    logbook.sync = fresh.synced ? 'cloud' : 'offline';
    if (fresh.synced) markSynced();
    else noteFailure(isRefused(fresh.offlineReason));
  } catch (e) {
    if (shownHead === null) throw e;
    // The copy shown stays usable: the logbook is only out of date.
    console.error('Syncing with the cloud', e);
    logbook.sync = 'offline';
    noteFailure(isRefused(/** @type {any} */ (e)?.message));
  }
  return true;
}

let loadStarted = false;

/**
 * Loads the logbook: the cloud log when an account is configured, otherwise
 * the log on this device.
 * @param {{ force?: boolean }} [options] force: exchange with the server even
 *   with automatic synchronisation off ("Sync now")
 */
export async function loadLogbook({ force = false } = {}) {
  undoCleared();
  // The snapshot is for the first load only; a reload shows the loading bars.
  if (loadStarted) logbook.preview = null;
  const pre = early;
  early = null;
  loadStarted = true;
  logbook.loading = true;
  logbook.error = null;
  try {
    if (await loadCloud(force, pre)) {
      // Manual synchronisation: the state says so at all times, after a
      // "Sync now" too (spec, section 4).
      if (!logbook.autoSync) logbook.sync = 'manual';
      await countPending();
      await readConflicts();
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
      logbook.prefs = await prefsAfterLoad();
    }
  } catch (e) {
    // Never the raw core text on screen (spec, section 6): it goes to the log.
    console.error('Loading the logbook', e);
    logbook.error = 'load';
  } finally {
    logbook.loading = false;
  }
}
