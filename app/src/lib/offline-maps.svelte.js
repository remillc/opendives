// @ts-check
// Offline maps, state of this device (spec, section 4, "Offline maps"). The
// regions the diver downloaded, the two settings, the guards on storage, the
// updates and the dialogs. Kept on the device, not in the logbook. The native
// side (downloads, files, free space) is the plugin's maps* methods; the rules
// are in maps-logic.js.
import { f7 } from 'framework7-svelte';
import { OpenDivesCore } from 'opendives-core';
import { t, language } from './i18n.js';
import { showSection } from './navigation.svelte.js';
import { readTileSource } from './tilejson.js';
import {
  CAP_CHOICES,
  DEFAULT_CAP,
  MAX_REGION_BYTES,
  MAX_TILES,
  checkStart,
  checkUpdate,
  countTiles,
  shouldPause,
  canResume,
  floorBytes,
  updateCheckDue,
  isNewer,
  stalePartials,
  usedBytes as sumUsed,
} from './maps-logic.js';

/**
 * A region is a rectangle the diver drew; it holds the tiles of OpenFreeMap
 * for zooms 0 to `maxZoom`.
 * @typedef {Object} Region
 * @property {string} id `area-...`, also the name of its folder on the device
 * @property {string} name diver data, never translated
 * @property {[number, number, number, number]} bbox [west, south, east, north]
 * @property {12|14} maxZoom 14: full detail; 12: less detail, a larger area
 * @property {number} sizeBytes size on the device: what was received while downloading, the final size once ready
 * @property {string} version OpenFreeMap build of the tiles (from its TileJSON)
 * @property {string} downloadedAt ISO date, empty until the region is ready
 * @property {'queued'|'waiting-wifi'|'downloading'|'paused'|'failed'|'ready'|'updating'} status
 * @property {number} bytesReceived
 * @property {number} tilesDone
 * @property {number} tilesTotal
 * @property {'network'|'space'|'server'|'limit'|''} [error] `limit`: the 50 MB of OpenFreeMap's terms were reached
 * @property {number} [failedAt] ms
 * @property {'space'|''} [pausedReason] a download paused by the free-space floor
 * @property {{ version: string }|null} [update] a newer build of OpenFreeMap's data exists
 * @property {'queued'|'waiting-wifi'|'downloading'|'paused'|'failed'|'ready'} [transfer] the update's download, while status is 'updating'
 * @property {boolean} [pendingDelete] deleted on screen, the file goes when the snackbar closes
 */

/**
 * @typedef {{ kind: 'cellular', id: string }
 *   | { kind: 'space', name: string, sizeBytes: number, remainingBytes: number }
 *   | { kind: 'cap', name: string, sizeBytes: number, usedBytes: number, capBytes: number }
 *   | { kind: 'replace', id: string }
 *   | { kind: 'delete', id: string }
 *   | { kind: 'limit' }
 *   | { kind: 'manage' }} MapsDialog
 */

const REGIONS_KEY = 'od.offlineMaps';
const SETTINGS_KEY = 'od.offlineMapsSettings';

/** @param {string} key */
function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

/** @param {string} key @param {unknown} value */
function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not fatal: the state lasts until the app closes.
  }
}

const stored = readJson(SETTINGS_KEY) ?? {};

/** The native plugin's maps* methods (core-api.js, written by the native part). @type {any} */
const core = OpenDivesCore;

export const offlineMaps = $state({
  /** @type {Region[]} */
  // Regions kept by a version that downloaded packages (no maxZoom) are not tiles on this device: left out.
  regions: (readJson(REGIONS_KEY) ?? []).filter((/** @type {Region} */ r) => r.maxZoom === 12 || r.maxZoom === 14),
  /** "Télécharger sur données mobiles": off by default. */
  cellular: stored.cellular === true,
  /** "Espace maximum pour les cartes", bytes. */
  capBytes: CAP_CHOICES.includes(stored.capBytes) ? /** @type {number} */ (stored.capBytes) : DEFAULT_CAP,
  freeBytes: 0,
  totalBytes: 0,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  /** Last time OpenFreeMap's version was compared with the regions', ms. */
  lastCheck: Number(stored.lastCheck) || 0,
  /** @type {MapsDialog|null} */
  dialog: null,
  /**
   * "Voir sur la carte": the box of a region the Sites map should frame, [west, south, east, north].
   * Set when the diver asks; the Sites map reads it, frames it and sets it back to null.
   * @type {[number, number, number, number]|null}
   */
  viewBbox: null,
});

function save() {
  writeJson(REGIONS_KEY, offlineMaps.regions);
}

function saveSettings() {
  writeJson(SETTINGS_KEY, { cellular: offlineMaps.cellular, capBytes: offlineMaps.capBytes, lastCheck: offlineMaps.lastCheck });
}

// --- Reading ---------------------------------------------------------------------

/** The regions shown: not those deleted on screen and waiting for the snackbar to close. */
export const visibleRegions = () => offlineMaps.regions.filter((r) => !r.pendingDelete);

/** @param {string} id */
export const findRegion = (id) => offlineMaps.regions.find((r) => r.id === id);

/** @param {Region} r */
export const regionName = (r) => r.name;

/** Progress of a download as a share of the tiles, 0 to 100. @param {Region} r */
export const tilesPercent = (r) => (r.tilesTotal > 0 ? Math.min(100, Math.floor((r.tilesDone / r.tilesTotal) * 100)) : 0);

/** Bytes the maps take or will take. */
export const usedBytes = () => sumUsed(visibleRegions());

/** What a region is doing now: its own status, or its update's. @param {Region} r */
export const activity = (r) => (r.status === 'updating' ? (r.transfer ?? 'queued') : r.status);

/** Regions with a download to show in "Téléchargements" (an update stays in its row). */
export const downloadsList = () => visibleRegions().filter((r) => ['queued', 'waiting-wifi', 'downloading', 'paused', 'failed'].includes(r.status));

/** Regions in "Régions téléchargées": ready ones, and those being updated. */
export const readyList = () => visibleRegions().filter((r) => r.status === 'ready' || r.status === 'updating');

/** Number of regions with an update available: the badge of Settings. */
export const updatesCount = () => visibleRegions().filter((r) => r.update && r.status === 'ready').length;

/** The free-space floor of this device, bytes. */
export const floor = () => floorBytes(offlineMaps.totalBytes);

// --- Native calls -----------------------------------------------------------------

/** Free space of the device. Not fatal without the native part (web): the guards then pass. */
export async function refreshSpace() {
  try {
    const { freeBytes, totalBytes } = await core.mapsFreeSpace();
    offlineMaps.freeBytes = freeBytes;
    offlineMaps.totalBytes = totalBytes;
    return true;
  } catch {
    return false;
  }
}

/** @param {string} text */
function toast(text) {
  f7.toast.create({ text, closeTimeout: 4000, position: 'bottom' }).open();
}

/** @param {string} path */
export function go(path) {
  f7.views.current?.router.navigate(path);
}

/** "Voir sur la carte": opens Sites framed on the region. @param {string} id */
export function viewRegion(id) {
  const r = findRegion(id);
  if (!r) return;
  offlineMaps.viewBbox = r.bbox;
  showSection('sites');
}

// --- Update check ------------------------------------------------------------------------

/**
 * At start, when online, at most once a day: reads OpenFreeMap's TileJSON and
 * compares its version with each region's. Never automatic beyond that:
 * updating is the diver's choice.
 * @param {{ force?: boolean }} [options]
 */
export async function checkForUpdates({ force = false } = {}) {
  if (!offlineMaps.online) return;
  if (!force && !updateCheckDue(offlineMaps.lastCheck, Date.now())) return;
  if (!offlineMaps.regions.length && !force) return;
  let source;
  try {
    source = await readTileSource();
  } catch (e) {
    console.warn('Reading the OpenFreeMap TileJSON', e);
    return;
  }
  for (const r of offlineMaps.regions) {
    if (r.status === 'updating') continue;
    r.update = r.status === 'ready' && isNewer(r.version, source.version) ? { version: source.version } : null;
  }
  save();
  offlineMaps.lastCheck = Date.now();
  saveSettings();
}

// --- Settings ----------------------------------------------------------------------

/** @param {boolean} on */
export function setCellular(on) {
  offlineMaps.cellular = on;
  saveSettings();
}

/** @param {number} bytes */
export function setCap(bytes) {
  if (!CAP_CHOICES.includes(bytes)) return;
  offlineMaps.capBytes = bytes;
  saveSettings();
}

// --- Downloads ---------------------------------------------------------------------

/**
 * Sends a region to the native downloader (one runs at a time there). The
 * tile address and the version are read from OpenFreeMap just before.
 * @param {Region} r
 * @param {{ template: string, version: string }} source
 */
async function startNative(r, source) {
  try {
    await core.mapsTilesStart({
      id: r.id,
      bbox: r.bbox,
      maxZoom: r.maxZoom,
      urlTemplate: source.template,
      version: source.version,
      allowCellular: offlineMaps.cellular,
      title: regionName(r),
    });
  } catch (e) {
    console.error('Starting a map download', e);
    if (/** @type {any} */ (e)?.code === 'TOO_MANY_TILES') {
      toast(t('maps.area.tooBig'));
      offlineMaps.regions = offlineMaps.regions.filter((x) => x.id !== r.id);
      save();
      return;
    }
    fail(r, 'server');
  }
}

/** @param {Region} r @param {'network'|'space'|'server'|'limit'} error */
function fail(r, error) {
  r.error = error;
  r.failedAt = Date.now();
  if (r.status === 'updating') {
    // The old region stays usable: the update is what failed.
    r.status = 'ready';
    r.transfer = undefined;
    toast(t('maps.updateFailed', { name: regionName(r) }));
  } else {
    r.status = 'failed';
  }
  save();
}

/**
 * Opens the dialog of a refused download.
 * @param {string} name
 * @param {number} sizeBytes
 * @param {Exclude<ReturnType<typeof checkStart>, { ok: true }>} verdict
 */
function refuse(name, sizeBytes, verdict) {
  offlineMaps.dialog =
    verdict.reason === 'space'
      ? { kind: 'space', name, sizeBytes, remainingBytes: verdict.remainingBytes }
      : { kind: 'cap', name, sizeBytes, usedBytes: verdict.usedBytes, capBytes: verdict.capBytes };
}

/** Free space as the guards read it: without the native part (web) they pass. */
const spaceFigures = () => ({
  freeBytes: offlineMaps.totalBytes ? offlineMaps.freeBytes : Number.MAX_SAFE_INTEGER / 2,
  totalBytes: offlineMaps.totalBytes,
});

/**
 * Starts the download of a rectangle drawn on the map. Refused with a toast
 * above 3,000 tiles (the area screen blocks it before), and with a dialog
 * when it could leave less than the floor free or go over the cap (a region
 * takes 50 MB at most). Returns whether it started.
 * @param {string} name the diver's name for the region
 * @param {[number, number, number, number]} bbox
 * @param {12|14} maxZoom
 */
export async function addRegion(name, bbox, maxZoom) {
  const tilesTotal = countTiles(bbox, maxZoom);
  if (tilesTotal > MAX_TILES) {
    toast(t('maps.area.tooBig'));
    return false;
  }
  await refreshSpace();
  const verdict = checkStart({ sizeBytes: MAX_REGION_BYTES, ...spaceFigures(), usedBytes: usedBytes(), capBytes: offlineMaps.capBytes });
  if (!verdict.ok) {
    refuse(name, MAX_REGION_BYTES, verdict);
    return false;
  }
  let source;
  try {
    source = await readTileSource();
  } catch (e) {
    console.error('Reading the OpenFreeMap TileJSON', e);
    toast(t('maps.area.unavailable'));
    return false;
  }
  offlineMaps.regions.push({
    id: `area-${Date.now().toString(36)}`,
    name,
    bbox,
    maxZoom,
    sizeBytes: 0,
    version: source.version,
    downloadedAt: '',
    status: 'queued',
    bytesReceived: 0,
    tilesDone: 0,
    tilesTotal,
    error: '',
  });
  save();
  const r = /** @type {Region} */ (offlineMaps.regions[offlineMaps.regions.length - 1]);
  await startNative(r, source);
  return true;
}

/** "Réessayer" on a failed download: the tiles already received are kept. @param {string} id */
export async function retryRegion(id) {
  const r = findRegion(id);
  if (!r) return;
  await refreshSpace();
  const verdict = checkStart({
    sizeBytes: Math.max(0, MAX_REGION_BYTES - r.bytesReceived),
    ...spaceFigures(),
    usedBytes: sumUsed(visibleRegions().filter((x) => x.id !== id)),
    capBytes: offlineMaps.capBytes,
  });
  if (!verdict.ok) return refuse(regionName(r), MAX_REGION_BYTES, verdict);
  let source;
  try {
    source = await readTileSource();
  } catch (e) {
    console.error('Reading the OpenFreeMap TileJSON', e);
    toast(t('maps.area.unavailable'));
    return;
  }
  r.status = 'queued';
  r.error = '';
  r.version = source.version;
  save();
  await startNative(r, source);
}

/** "Retirer" on a failed download, and ✕ on a running one: the partial file goes. @param {string} id */
export async function removeDownload(id) {
  const r = findRegion(id);
  if (!r) return;
  try {
    await core.mapsDownloadCancel({ id });
  } catch (e) {
    console.error('Cancelling a map download', e);
  }
  if (r.status === 'updating') {
    r.status = 'ready';
    r.transfer = undefined;
    save();
  } else {
    offlineMaps.regions = offlineMaps.regions.filter((x) => x.id !== id);
    save();
  }
}

/** "Télécharger maintenant" went through the mobile data dialog. @param {string} id */
export async function downloadOverCellular(id) {
  offlineMaps.dialog = null;
  try {
    await core.mapsDownloadResume({ id, allowCellular: true });
  } catch (e) {
    console.error('Resuming a map download', e);
  }
}

/** @param {string} id */
export function askCellular(id) {
  offlineMaps.dialog = { kind: 'cellular', id };
}

// --- Updating ------------------------------------------------------------------------

/**
 * Updates one region: the same rectangle is downloaded again from OpenFreeMap's
 * current build, and both versions stay on the device until the new one is
 * complete. If that does not fit, "Remplacer la carte ?" (the old tiles go
 * first); if even that does not fit, the dialog says why. Returns whether an
 * update started.
 * @param {string} id
 * @param {{ replace?: boolean }} [options] `replace`: the diver confirmed the replacement
 */
export async function updateRegion(id, { replace = false } = {}) {
  const r = findRegion(id);
  if (!r?.update || r.status !== 'ready') return false;
  await refreshSpace();
  const verdict = checkUpdate({
    newBytes: MAX_REGION_BYTES,
    oldBytes: r.sizeBytes,
    ...spaceFigures(),
    usedBytes: usedBytes(),
    capBytes: offlineMaps.capBytes,
  });
  if (verdict.mode === 'blocked') {
    refuse(regionName(r), MAX_REGION_BYTES, verdict);
    return false;
  }
  if (verdict.mode === 'replace' && !replace) {
    offlineMaps.dialog = { kind: 'replace', id };
    return false;
  }
  let source;
  try {
    source = await readTileSource();
  } catch (e) {
    console.error('Reading the OpenFreeMap TileJSON', e);
    toast(t('maps.area.unavailable'));
    return false;
  }
  if (verdict.mode === 'replace') {
    // The old tiles go first: the region is unavailable until the new ones are complete.
    try {
      await core.mapsDelete({ id });
    } catch (e) {
      console.error('Removing the old region', e);
    }
    r.update = null;
    r.sizeBytes = 0;
    r.downloadedAt = '';
    r.bytesReceived = 0;
    r.tilesDone = 0;
    r.status = 'queued';
    r.version = source.version;
  } else {
    r.update = { version: source.version };
    r.status = 'updating';
    r.transfer = 'queued';
    r.bytesReceived = 0;
    r.tilesDone = 0;
  }
  save();
  await startNative(r, source);
  return true;
}

/** "Tout mettre à jour": one after the other; stops at the first that needs a dialog. */
export async function updateAll() {
  for (const r of visibleRegions().filter((x) => x.update && x.status === 'ready')) {
    if (!(await updateRegion(r.id)) && offlineMaps.dialog) return;
  }
}

// --- Deleting -------------------------------------------------------------------------

/** @param {string} id */
export function askDelete(id) {
  offlineMaps.dialog = { kind: 'delete', id };
}

/**
 * After the confirmation: the region leaves the screen at once, a snackbar
 * offers "Annuler" for 6 s, and the file is removed when it closes.
 * @param {string} id
 */
export function deleteRegion(id) {
  offlineMaps.dialog = null;
  const r = findRegion(id);
  if (!r) return;
  r.pendingDelete = true;
  save();
  let undone = false;
  f7.toast
    .create({
      text: t('maps.deleted', { name: regionName(r) }),
      cssClass: 'od-undo-toast',
      closeButton: true,
      closeButtonText: t('edit.undo'),
      closeTimeout: 6000,
      position: 'bottom',
      on: {
        closeButtonClick: () => {
          undone = true;
          r.pendingDelete = false;
          save();
        },
        closed: () => {
          if (!undone) finishDelete(id);
        },
      },
    })
    .open();
}

/** The file goes. @param {string} id */
async function finishDelete(id) {
  try {
    await core.mapsDownloadCancel({ id });
  } catch {
    // Nothing to cancel.
  }
  try {
    await core.mapsDelete({ id });
  } catch (e) {
    console.error('Deleting a map package', e);
  }
  offlineMaps.regions = offlineMaps.regions.filter((r) => r.id !== id);
  save();
  refreshSpace();
}

// --- Events from the native downloader ---------------------------------------------------

let lastSpaceCheck = 0;

/** @param {{ id: string, status: string, tilesDone: number, tilesTotal: number, bytesReceived: number, error?: 'network'|'space'|'server'|'limit' }} d */
function applyDownload(d) {
  const r = findRegion(d.id);
  if (!r) return;
  const updating = r.status === 'updating';
  r.bytesReceived = d.bytesReceived;
  r.tilesDone = d.tilesDone;
  if (d.tilesTotal) r.tilesTotal = d.tilesTotal;
  if (!updating) r.sizeBytes = d.bytesReceived;
  switch (d.status) {
    case 'ready':
      if (r.update) {
        r.version = r.update.version;
        r.update = null;
      }
      r.sizeBytes = d.bytesReceived;
      r.status = 'ready';
      r.transfer = undefined;
      r.downloadedAt = new Date().toISOString();
      r.error = '';
      r.pausedReason = '';
      refreshSpace();
      break;
    case 'failed':
      fail(r, d.error ?? 'server');
      return;
    case 'downloading':
      r.pausedReason = '';
    // falls through
    default:
      if (updating) r.transfer = /** @type {any} */ (d.status);
      else r.status = /** @type {any} */ (d.status);
  }
  save();
}

/** Free space is checked as data arrives (at most every 2 s): below the floor, the download pauses. @param {string} id */
async function guardSpace(id) {
  const now = Date.now();
  if (now - lastSpaceCheck < 2000) return;
  lastSpaceCheck = now;
  if (!(await refreshSpace())) return;
  if (!shouldPause(offlineMaps.freeBytes, offlineMaps.totalBytes)) return;
  const r = findRegion(id);
  if (!r) return;
  r.pausedReason = 'space';
  if (r.status === 'updating') r.transfer = 'paused';
  else r.status = 'paused';
  save();
  try {
    await core.mapsDownloadPause({ id });
  } catch (e) {
    console.error('Pausing a map download', e);
  }
}

/** Downloads paused for lack of space resume by themselves when room is back. */
async function resumePausedForSpace() {
  const paused = offlineMaps.regions.filter((r) => r.pausedReason === 'space');
  if (!paused.length) return;
  if (!(await refreshSpace()) || !canResume(offlineMaps.freeBytes, offlineMaps.totalBytes)) return;
  for (const r of paused) {
    r.pausedReason = '';
    try {
      await core.mapsDownloadResume({ id: r.id, allowCellular: offlineMaps.cellular });
    } catch (e) {
      console.error('Resuming a map download', e);
    }
  }
  save();
}

/**
 * Brings the regions in line with what the native side holds (files and
 * downloads), after a start or a long absence of the app.
 */
async function reconcile() {
  try {
    const [{ files }, { downloads }] = await Promise.all([core.mapsFiles(), core.mapsDownloads()]);
    for (const r of offlineMaps.regions) {
      const file = files.find((/** @type {{id: string}} */ f) => f.id === r.id);
      const d = downloads.find((/** @type {{id: string}} */ x) => x.id === r.id);
      if (d && d.status !== 'ready') applyDownload(d);
      else if (file && (r.status === 'ready' || r.status === 'updating')) r.sizeBytes = r.status === 'ready' ? file.sizeBytes : r.sizeBytes;
      else if (file && !d) {
        // The region became ready while the app was closed.
        applyDownload({ id: r.id, status: 'ready', tilesDone: r.tilesTotal, tilesTotal: r.tilesTotal, bytesReceived: file.sizeBytes });
      } else if (!file && !d && (r.status === 'ready' || r.status === 'updating')) {
        // The file is gone (cleared by the system, or by the diver).
        if (r.status === 'ready') offlineMaps.regions = offlineMaps.regions.filter((x) => x.id !== r.id);
        else {
          r.status = 'ready';
          r.transfer = undefined;
        }
      } else if (!file && !d && ['queued', 'waiting-wifi', 'downloading', 'paused'].includes(r.status)) {
        r.status = 'failed';
        r.error = 'server';
        r.failedAt = r.failedAt ?? Date.now();
      }
    }
    save();
  } catch {
    // No native part (web): the list shows what was kept.
  }
}

let started = false;

/**
 * At start: restores the state, follows the downloads, finishes a deletion
 * the app was closed during, cleans old partial files, checks for updates.
 */
export async function startOfflineMaps() {
  if (started) return;
  started = true;
  window.addEventListener('online', () => {
    offlineMaps.online = true;
    checkForUpdates();
  });
  window.addEventListener('offline', () => (offlineMaps.online = false));
  try {
    await core.addListener('mapsDownload', (/** @type {any} */ d) => {
      applyDownload(d);
      if (d.status === 'downloading') guardSpace(d.id);
    });
  } catch {
    // No native part (web).
  }
  for (const r of [...offlineMaps.regions]) if (r.pendingDelete) await finishDelete(r.id);
  await reconcile();
  for (const id of stalePartials(offlineMaps.regions, Date.now())) {
    try {
      await core.mapsDownloadCancel({ id });
    } catch {
      // Already gone.
    }
    offlineMaps.regions = offlineMaps.regions.filter((r) => r.id !== id);
  }
  save();
  await refreshSpace();
  setInterval(resumePausedForSpace, 30_000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshSpace();
      resumePausedForSpace();
    }
  });
  checkForUpdates();
}

// --- From the Sites map ------------------------------------------------------------------

/**
 * "Télécharger" in the snackbar of the Sites map: opens the area screen
 * with a rectangle around this point.
 * @param {number} lng @param {number} lat
 */
export function downloadRegionAt(lng, lat) {
  go(`/settings/maps/area?lng=${lng.toFixed(5)}&lat=${lat.toFixed(5)}`);
}
