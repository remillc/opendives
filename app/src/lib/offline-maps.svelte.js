// @ts-check
// Offline maps, state of this device (spec, section 4, "Offline maps"). The
// regions the diver downloaded, the two settings, the guards on storage, the
// updates and the dialogs. Kept on the device, not in the logbook. The native
// side (downloads, files, free space) is the plugin's maps* methods; the rules
// are in maps-logic.js.
import { f7 } from 'framework7-svelte';
import { OpenDivesCore } from 'opendives-core';
import { t, language } from './i18n.js';
import { loadCatalogue } from './map-catalogue.js';
import { showSection } from './navigation.svelte.js';
import {
  CAP_CHOICES,
  DEFAULT_CAP,
  checkStart,
  checkUpdate,
  shouldPause,
  canResume,
  floorBytes,
  updateCheckDue,
  isNewer,
  stalePartials,
  usedBytes as sumUsed,
  packageForPoint,
  packageName,
} from './maps-logic.js';

/** @typedef {import('./maps-logic.js').CataloguePackage} CataloguePackage */

/**
 * @typedef {Object} Region
 * @property {string} id catalogue id, or `drawn-…` for a region drawn by the diver
 * @property {'zone'|'country'|'drawn'} kind
 * @property {string} name a drawn region's name is diver data; the others show the catalogue's name in the language
 * @property {{fr?: string, en?: string}} [names] translated names of a zone or a country
 * @property {[number, number, number, number]} bbox [west, south, east, north]
 * @property {number} sizeBytes size of the package on the device (final size while downloading)
 * @property {string|number} version
 * @property {string} downloadedAt ISO date, empty until the package is ready
 * @property {'queued'|'waiting-wifi'|'downloading'|'paused'|'failed'|'ready'|'updating'} status
 * @property {number} bytesReceived
 * @property {string} [country]
 * @property {{ url: string, sha256: string }} [source] what to download again after a failure
 * @property {'network'|'checksum'|'space'|'server'|''} [error]
 * @property {number} [failedAt] ms
 * @property {'space'|''} [pausedReason] a download paused by the free-space floor
 * @property {{ version: string|number, sizeBytes: number, sha256: string, url: string }|null} [update] a newer package
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
  regions: readJson(REGIONS_KEY) ?? [],
  /** "Télécharger sur données mobiles": off by default. */
  cellular: stored.cellular === true,
  /** "Espace maximum pour les cartes", bytes. */
  capBytes: CAP_CHOICES.includes(stored.capBytes) ? /** @type {number} */ (stored.capBytes) : DEFAULT_CAP,
  freeBytes: 0,
  totalBytes: 0,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  /** @type {CataloguePackage[]} */
  catalogue: [],
  catalogueLoading: false,
  catalogueFailed: false,
  /** Last time the catalogue was compared with the regions, ms. */
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

/** Name shown: the diver's own for a drawn region, else the catalogue's in the app's language. @param {Region} r */
export function regionName(r) {
  return r.kind === 'drawn' ? r.name : (r.names ? packageName({ names: r.names }, language) : '') || r.name;
}

/** @param {CataloguePackage} pkg */
export const catalogueName = (pkg) => packageName(pkg, language);

/**
 * Names of a package as the diver reads them in a list of regions: a zone
 * carries its country ("Canterbury, Nouvelle-Zélande"), a country is alone.
 * @param {CataloguePackage} pkg
 */
export function fullNames(pkg) {
  if (pkg.kind !== 'zone') return pkg.names;
  const country = offlineMaps.catalogue.find((p) => p.kind === 'country' && p.country === pkg.country);
  if (!country) return pkg.names;
  /** @type {{fr?: string, en?: string}} */
  const out = {};
  for (const l of /** @type {const} */ (['fr', 'en'])) {
    const zone = pkg.names[l] ?? pkg.names.en;
    const name = country.names[l] ?? country.names.en;
    out[l] = zone && name ? `${zone}, ${name}` : zone;
  }
  return out;
}

/** @param {CataloguePackage} pkg */
export const fullName = (pkg) => packageName({ names: fullNames(pkg) }, language);

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

// --- Catalogue and updates ---------------------------------------------------------

/**
 * The catalogue, read once per run (or again when `force`).
 * @param {boolean} [force]
 */
export async function ensureCatalogue(force = false) {
  if (offlineMaps.catalogueLoading) return offlineMaps.catalogue;
  if (offlineMaps.catalogue.length && !force) return offlineMaps.catalogue;
  offlineMaps.catalogueLoading = true;
  try {
    offlineMaps.catalogue = await loadCatalogue();
    offlineMaps.catalogueFailed = false;
  } catch (e) {
    console.error('Reading the map catalogue', e);
    offlineMaps.catalogueFailed = true;
  } finally {
    offlineMaps.catalogueLoading = false;
  }
  return offlineMaps.catalogue;
}

/** Compares the regions' versions with the catalogue's. @param {CataloguePackage[]} catalogue */
function markUpdates(catalogue) {
  for (const r of offlineMaps.regions) {
    if (r.kind === 'drawn' || r.status === 'updating') continue;
    const pkg = catalogue.find((p) => p.id === r.id);
    r.update =
      r.status === 'ready' && pkg && isNewer(r.version, pkg.version)
        ? { version: pkg.version, sizeBytes: pkg.sizeBytes, sha256: pkg.sha256, url: pkg.url }
        : null;
  }
  save();
}

/**
 * At start, when online, at most once a day: reads the catalogue and compares
 * versions. Never automatic beyond that: updating is the diver's choice.
 * @param {{ force?: boolean }} [options]
 */
export async function checkForUpdates({ force = false } = {}) {
  if (!offlineMaps.online) return;
  if (!force && !updateCheckDue(offlineMaps.lastCheck, Date.now())) return;
  if (!offlineMaps.regions.length && !force) return;
  const catalogue = await ensureCatalogue(true);
  if (offlineMaps.catalogueFailed) return;
  markUpdates(catalogue);
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

/** @param {CataloguePackage} pkg @param {Partial<Region>} [extra] @returns {Region} */
function regionOf(pkg, extra = {}) {
  return {
    id: pkg.id,
    kind: pkg.kind,
    name: fullName(pkg),
    names: fullNames(pkg),
    bbox: pkg.bbox,
    sizeBytes: pkg.sizeBytes,
    version: pkg.version,
    downloadedAt: '',
    status: 'queued',
    bytesReceived: 0,
    country: pkg.country,
    source: { url: pkg.url, sha256: pkg.sha256 },
    error: '',
    ...extra,
  };
}

/**
 * Sends a package to the native downloader (one runs at a time there).
 * @param {Region} r @param {{ url: string, sha256: string, sizeBytes: number }} source
 */
async function startNative(r, source) {
  try {
    await core.mapsDownloadStart({
      id: r.id,
      url: source.url,
      sha256: source.sha256,
      sizeBytes: source.sizeBytes,
      allowCellular: offlineMaps.cellular,
      title: regionName(r),
    });
  } catch (e) {
    console.error('Starting a map download', e);
    fail(r, 'server');
  }
}

/** @param {Region} r @param {'network'|'checksum'|'space'|'server'} error */
function fail(r, error) {
  r.error = error;
  r.failedAt = Date.now();
  if (r.update && r.sizeBytes) {
    // The old package stays usable: the update is what failed.
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

/**
 * Starts the download of a package (zone, country, or a region drawn on the
 * map). Refused with a dialog when it would leave less than the floor free or
 * go over the cap. Returns whether it started.
 * @param {CataloguePackage} pkg
 * @param {{ name?: string }} [options] the diver's name for a drawn region
 */
export async function addRegion(pkg, { name } = {}) {
  const existing = findRegion(pkg.id);
  if (existing && !existing.pendingDelete) return false;
  await refreshSpace();
  const verdict = checkStart({
    sizeBytes: pkg.sizeBytes,
    freeBytes: offlineMaps.totalBytes ? offlineMaps.freeBytes : Number.MAX_SAFE_INTEGER / 2,
    totalBytes: offlineMaps.totalBytes,
    usedBytes: usedBytes(),
    capBytes: offlineMaps.capBytes,
  });
  if (!verdict.ok) {
    refuse(name || catalogueName(pkg), pkg.sizeBytes, verdict);
    return false;
  }
  if (existing) offlineMaps.regions = offlineMaps.regions.filter((r) => r.id !== pkg.id);
  const region = regionOf(pkg, name ? { name } : {});
  offlineMaps.regions.push(region);
  save();
  const r = /** @type {Region} */ (findRegion(pkg.id));
  await startNative(r, pkg);
  return true;
}

/**
 * Where the server builds and serves a package for a rectangle chosen on the
 * map. Not decided yet (the server side is not part of this task): empty, the
 * download is then refused with a message.
 */
export const DRAWN_PACKAGE_URL = '';

/**
 * A region drawn by the diver on the map: its name is diver data.
 * @param {string} name @param {[number, number, number, number]} bbox @param {number} sizeBytes estimate
 */
export async function addDrawnRegion(name, bbox, sizeBytes) {
  if (!DRAWN_PACKAGE_URL) {
    toast(t('maps.area.unavailable'));
    return false;
  }
  const query = `bbox=${bbox.join(',')}`;
  return addRegion(
    {
      id: `drawn-${Date.now().toString(36)}`,
      kind: /** @type {any} */ ('drawn'),
      names: {},
      country: '',
      bbox,
      sizeBytes,
      version: '',
      sha256: '',
      url: `${DRAWN_PACKAGE_URL}?${query}`,
    },
    { name },
  );
}

/** "Réessayer" on a failed download: the partial file is resumed. @param {string} id */
export async function retryRegion(id) {
  const r = findRegion(id);
  if (!r?.source) return;
  await refreshSpace();
  const verdict = checkStart({
    sizeBytes: Math.max(0, r.sizeBytes - r.bytesReceived),
    freeBytes: offlineMaps.totalBytes ? offlineMaps.freeBytes : Number.MAX_SAFE_INTEGER / 2,
    totalBytes: offlineMaps.totalBytes,
    usedBytes: sumUsed(visibleRegions().filter((x) => x.id !== id)),
    capBytes: offlineMaps.capBytes,
  });
  if (!verdict.ok) return refuse(regionName(r), r.sizeBytes, verdict);
  r.status = 'queued';
  r.error = '';
  save();
  await startNative(r, { ...r.source, sizeBytes: r.sizeBytes });
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

// --- Updates -------------------------------------------------------------------------

/**
 * Updates one region: both versions stay on the device until the new one is
 * checked. If that does not fit, "Remplacer la carte ?" (the old package goes
 * first); if even that does not fit, the dialog says why. Returns whether an
 * update started.
 * @param {string} id
 * @param {{ replace?: boolean }} [options] `replace`: the diver confirmed the replacement
 */
export async function updateRegion(id, { replace = false } = {}) {
  const r = findRegion(id);
  const upd = r?.update;
  if (!r || !upd || r.status !== 'ready') return false;
  await refreshSpace();
  const verdict = checkUpdate({
    newBytes: upd.sizeBytes,
    oldBytes: r.sizeBytes,
    freeBytes: offlineMaps.totalBytes ? offlineMaps.freeBytes : Number.MAX_SAFE_INTEGER / 2,
    totalBytes: offlineMaps.totalBytes,
    usedBytes: usedBytes(),
    capBytes: offlineMaps.capBytes,
  });
  if (verdict.mode === 'blocked') {
    refuse(regionName(r), upd.sizeBytes, verdict);
    return false;
  }
  if (verdict.mode === 'replace') {
    if (!replace) {
      offlineMaps.dialog = { kind: 'replace', id };
      return false;
    }
    // The old package goes first: the region is unavailable until the new one is complete.
    try {
      await core.mapsDelete({ id });
    } catch (e) {
      console.error('Removing the old map package', e);
    }
    r.sizeBytes = upd.sizeBytes;
    r.version = upd.version;
    r.source = { url: upd.url, sha256: upd.sha256 };
    r.update = null;
    r.downloadedAt = '';
    r.bytesReceived = 0;
    r.status = 'queued';
    save();
    await startNative(r, { ...r.source, sizeBytes: r.sizeBytes });
    return true;
  }
  r.status = 'updating';
  r.transfer = 'queued';
  r.bytesReceived = 0;
  save();
  await startNative(r, upd);
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

/** @param {{ id: string, status: string, bytesReceived: number, totalBytes: number, error?: 'network'|'checksum'|'space'|'server' }} d */
function applyDownload(d) {
  const r = findRegion(d.id);
  if (!r) return;
  const updating = r.status === 'updating';
  r.bytesReceived = d.bytesReceived;
  if (d.totalBytes && !updating) r.sizeBytes = d.totalBytes;
  switch (d.status) {
    case 'ready':
      if (r.update) {
        r.version = r.update.version;
        r.sizeBytes = r.update.sizeBytes;
        r.source = { url: r.update.url, sha256: r.update.sha256 };
        r.update = null;
      }
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
        // The package became ready while the app was closed.
        applyDownload({ id: r.id, status: 'ready', bytesReceived: file.sizeBytes, totalBytes: file.sizeBytes });
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
 * "Télécharger" in the snackbar of the Sites map: opens the add flow for what
 * contains this point (the smallest dive zone, else the country).
 * @param {number} lng @param {number} lat
 */
export async function downloadRegionAt(lng, lat) {
  const catalogue = await ensureCatalogue();
  const pkg = packageForPoint(lng, lat, catalogue);
  go(`/settings/maps/new?lng=${lng.toFixed(5)}&lat=${lat.toFixed(5)}${pkg ? `&id=${encodeURIComponent(pkg.id)}` : ''}`);
}
