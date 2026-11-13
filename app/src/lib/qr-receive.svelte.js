// @ts-check
// Receiving a dive or a plan by QR code (inbox task 2026-11-13-102): "Scanner un code QR" of the
// "+" menu opens the native scanner, which hands back the raw texts of every code of one transfer;
// they are put together (lib/qr-transfer.js), read for the preview (lib/qr-preview.js) and shown on
// the "received" screen (components/QrReceived.svelte), where the diver adds them or not.
import { OpenDivesCore } from 'opendives-core';
import { logbook, importReceived } from './logbook.svelte.js';
import { t } from './i18n.js';
import { showSnackbar } from './snackbar.js';
import { decodeTexts } from './qr-transfer.js';
import { readPreview, startKey } from './qr-preview.js';
import { openDiveById, openPlans } from './open-link.js';

/**
 * What the received screen shows; `open` is false when it is closed.
 * @type {{
 *   open: boolean,
 *   kind: 'd'|'p',
 *   xml: string,
 *   preview: import('./qr-preview.js').ReceivedPreview|null,
 *   duplicate: boolean,
 *   adding: boolean,
 * }}
 */
export const received = $state({ open: false, kind: 'd', xml: '', preview: null, duplicate: false, adding: false });

/** Every visible text of the native scanner, from the translation files. */
function scanOptions() {
  return {
    title: t('qr.scanTitle'),
    close: t('qr.close'),
    hint: t('qr.scanHint'),
    hintFirst: t('qr.scanHintFirst'),
    kindDive: t('qr.kindDive'),
    kindPlan: t('qr.kindPlan'),
    progress: t('qr.progress', { n: '{n}', total: '{total}' }),
    progressOne: t('qr.progressOne', { total: '{total}' }),
    progressBar: t('qr.progressBar'),
    foreign: t('qr.foreign'),
    newerVersion: t('qr.newerVersion'),
    otherTitle: t('qr.otherTitle'),
    otherText: t('qr.otherText'),
    otherRestart: t('qr.otherRestart'),
    otherKeep: t('qr.otherKeep'),
    permissionReason: t('qr.permissionReason'),
    permissionButton: t('qr.permissionButton'),
    permissionDeniedTitle: t('qr.permissionDeniedTitle'),
    permissionDenied: t('qr.permissionDenied'),
    permissionSettings: t('qr.permissionSettings'),
    cameraFailed: t('qr.cameraFailed'),
  };
}

/** "Scanner un code QR": the camera, then the received screen. */
export async function scanQr() {
  /** @type {import('opendives-core').QrScanResult} */
  let result;
  try {
    result = await OpenDivesCore.qrScan(scanOptions());
  } catch (e) {
    console.error('QR scan', e);
    showSnackbar(t('qr.cameraFailed'));
    return;
  }
  if (result.action !== 'done') return;
  let decoded;
  try {
    decoded = await decodeTexts(result.codes);
  } catch (e) {
    console.error('QR decode', e);
    showSnackbar(t('qr.corrupt'));
    return;
  }
  const preview = readPreview(decoded.xml);
  if (!preview) {
    showSnackbar(t('qr.unreadable'));
    return;
  }
  received.kind = decoded.kind;
  received.xml = decoded.xml;
  received.preview = preview;
  // The same date and time to the second is the same dive (as for the links, lib/deep-link.js).
  received.duplicate = decoded.kind === 'd' && logbook.dives.some((d) => d.date.slice(0, 19) === startKey(preview));
  received.adding = false;
  received.open = true;
}

/** "Ajouter au carnet" / "Ajouter aux plongées planifiées" / "Ajouter quand même". */
export async function addReceived() {
  if (received.adding || !received.preview) return;
  received.adding = true;
  const kind = received.kind;
  try {
    const { id } = await importReceived(received.xml);
    received.open = false;
    showSnackbar(t(kind === 'p' ? 'qr.addedPlan' : 'qr.addedDive'));
    // A dive is opened; a plan goes to the list of planned dives.
    if (kind === 'p') await openPlans();
    else if (id) await openDiveById(id);
  } catch (e) {
    console.error('QR import', e);
    showSnackbar(t('qr.addFailed'));
  } finally {
    received.adding = false;
  }
}

/** "Annuler" or the close button. */
export function dismissReceived() {
  received.open = false;
}
