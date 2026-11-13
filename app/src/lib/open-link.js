// @ts-check
// Deep links and files sent to the app (decided on 13 November 2026): acts on what
// lib/deep-link.js understood. A link opens the matching screen of the main view, or the
// closest collection with a short message when its target is not in this logbook; a
// logbook file is imported after a confirmation, never silently.
//
// Cold start: App.getLaunchUrl(). Running app: the "appUrlOpen" event. Both give the
// address of an https link (App Links, Universal Links), of opendives://, or of a file
// (Android content://, iOS file://).
import { App as CapacitorApp } from '@capacitor/app';
import { f7 } from 'framework7-svelte';
import { OpenDivesCore } from 'opendives-core';
import { logbook, importData } from './logbook.svelte.js';
import { goToSection, openOver, backToFirstScreen } from './navigation.svelte.js';
import { anyDirty } from './leave-guard.js';
import { checkSharedFile, importErrorKey, parseLink } from './deep-link.js';
import { confirmAction } from './dialogs.js';
import { showSnackbar } from './snackbar.js';
import { offerUndo } from './undo.js';
import { t } from './i18n.js';

/** How long a link waits for the logbook to be read (cold start), in ms. */
const READY_LIMIT = 20000;

/** @param {number} ms */
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** The logbook is read: the screens are built and the dives are known. */
async function whenReady() {
  const start = Date.now();
  while (logbook.loading && Date.now() - start < READY_LIMIT) await sleep(100);
  return !logbook.loading;
}

/**
 * The view of a section, back on its first screen.
 * @param {import('./deep-link.js').LinkSection} section
 */
async function freshView(section) {
  goToSection(section);
  const view = f7.views.get(`#view-${section}`);
  const router = view?.router;
  // Waited for: a navigate made before the back is over is dropped (a link from one tool
  // to another left the Tools list).
  if (router && router.history.length > 1) await backToFirstScreen(router);
  return view;
}

/** Closes what floats over the screens (side menu, sheets), so that the target shows. */
function clearOverlays() {
  f7.panel.close(undefined, false);
  f7.actions.close(undefined, false);
  f7.sheet.close(undefined, false);
  f7.dialog.close();
}

/**
 * @param {import('./deep-link.js').LinkSection} section the collection to show
 * @param {string} messageKey the short message saying why
 */
async function fallBackTo(section, messageKey) {
  await freshView(section);
  showSnackbar(t(messageKey));
}

/** @param {import('./deep-link.js').LinkTarget} target */
async function openTarget(target) {
  if (target.kind === 'route') {
    if (target.over) {
      openOver(target.path);
      return;
    }
    const view = await freshView(target.section);
    const root = { logbook: '/', sites: '/sites/', statistics: '/statistics/', tools: '/tools/', account: '/account' }[target.section];
    if (target.path !== root) /** @type {any} */ (view?.router).navigate(target.path, { reloadDetail: true });
    return;
  }
  if (target.kind === 'dive') {
    // The stable key is the start time (lib/deep-link.js); the id is only valid until the next load.
    const dive = logbook.dives.find((d) => d.date.slice(0, 19) === target.date);
    if (!dive) {
      await fallBackTo('logbook', 'link.diveNotFound');
      return;
    }
    const view = await freshView('logbook');
    /** @type {any} */ (view?.router).navigate(`/dives/${dive.id}`, { reloadDetail: true });
    return;
  }
  if (target.kind === 'site') {
    let found = false;
    try {
      const site = await OpenDivesCore.siteQuery({ kind: 'site', uuid: target.uuid });
      found = !!site?.uuid;
    } catch {
      found = false;
    }
    if (!found) {
      await fallBackTo('sites', 'link.siteNotFound');
      return;
    }
    const view = await freshView('sites');
    view?.router.navigate(`/sites/${target.uuid}`);
  }
}

/**
 * A logbook file sent by another app: read, checked, confirmed, imported.
 * @param {string} uri
 */
async function openFile(uri) {
  /** @param {string} key @param {Record<string, string>} [values] */
  const refuse = (key, values) => f7.dialog.create({ title: t('link.fileTitle'), text: t(key, values), buttons: [{ text: t('dialog.ok') }] }).open();
  let file;
  try {
    file = await OpenDivesCore.readSharedFile({ uri });
  } catch (e) {
    const code = String(/** @type {any} */ (e)?.code ?? /** @type {any} */ (e)?.message ?? '');
    console.error('Read a shared file', code);
    refuse(code.includes('TOO_BIG') ? 'link.fileTooBig' : 'link.fileUnreadable');
    return;
  }
  // The mime type is unreliable (.ssrf often arrives as application/octet-stream): the contents decide.
  const head = atob(file.data.slice(0, 5464));
  const check = checkSharedFile(file.name, head, file.size);
  const label = file.name || t('link.fileUnnamed');
  if (!check.ok) {
    refuse(check.reason === 'TOO_BIG' ? 'link.fileTooBig' : check.reason === 'EMPTY' ? 'link.fileEmpty' : 'link.fileNotLogbook', { name: label });
    return;
  }
  const { name } = check;
  confirmAction({
    title: t('link.fileTitle'),
    text: t('link.fileText', { name: label }),
    action: t('link.fileAction'),
    onConfirm: async () => {
      try {
        const n = await importData(name, file.data);
        offerUndo(t('logbook.imported', { n }));
      } catch (e) {
        const code = String(/** @type {any} */ (e)?.message ?? '');
        console.error('Import a shared file', code);
        f7.dialog.create({ title: t('logbook.importTitle'), text: t(importErrorKey(code)), buttons: [{ text: t('dialog.ok') }] }).open();
      }
    },
  });
}

/** Opens a dive of the logbook by its identifier (after a dive received by QR code). @param {number} id */
export async function openDiveById(id) {
  clearOverlays();
  const view = await freshView('logbook');
  /** @type {any} */ (view?.router).navigate(`/dives/${id}`, { reloadDetail: true });
}

/** Opens the list of planned dives (after a plan received by QR code). */
export async function openPlans() {
  clearOverlays();
  const view = await freshView('tools');
  /** @type {any} */ (view?.router).navigate('/plans/', { reloadDetail: true });
}

/** One address at a time, and the same address twice in a row (launch URL and event) once. */
let queue = Promise.resolve();
let lastUrl = '';
let lastAt = 0;

/** @param {string} url */
export function handleLink(url) {
  const now = Date.now();
  if (url === lastUrl && now - lastAt < 2000) return;
  lastUrl = url;
  lastAt = now;
  queue = queue
    .then(async () => {
      const target = parseLink(url);
      if (target.kind === 'unknown') {
        showSnackbar(t('link.unknown'));
        return;
      }
      if (!(await whenReady())) return;
      // First launch, before any way to start was chosen: nothing to open it in yet.
      if (logbook.welcome) {
        showSnackbar(t('link.notReady'));
        return;
      }
      // A form with unsaved changes is not left behind by a link.
      if (anyDirty()) {
        showSnackbar(t('link.unsaved'));
        return;
      }
      clearOverlays();
      if (target.kind === 'file') await openFile(target.uri);
      else await openTarget(target);
    })
    .catch((e) => console.error('Open a link', e));
}

/** Listens for links: the one that started the app, then those that come while it runs. */
export function enableDeepLinks() {
  CapacitorApp.addListener('appUrlOpen', (event) => handleLink(event.url));
  CapacitorApp.getLaunchUrl()
    .then((launch) => {
      if (launch?.url) handleLink(launch.url);
    })
    .catch(() => {});
}
