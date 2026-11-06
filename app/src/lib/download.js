// @ts-check
// Download from a dive computer: what the download screen and the "Download
// failed" screen share. The last attempt is kept in memory only, so that
// "Réessayer" starts it again; nothing is stored.

/**
 * A dive computer to download from: the model (a libdivecomputer model, as
 * the core names it), the Bluetooth address ("LE:" + MAC for Bluetooth Low
 * Energy, the MAC alone for Classic) and the device's Bluetooth name.
 * `classicAddress`: the same device paired as Bluetooth Classic, tried when BLE fails.
 * @typedef {{ vendor: string, product: string, address: string, name: string, classicAddress?: string }} Computer
 */

import { f7 } from 'framework7-svelte';
import { OpenDivesCore } from 'opendives-core';
import { afterDownload } from './logbook.svelte.js';
import { offerUndo } from './undo.js';
import { t } from './i18n.js';

/**
 * Keeps the dives received before a download failed or was cancelled, as a
 * full download: one undoable step, saved and synced, with "N dives
 * downloaded" and Undo.
 * @returns {Promise<boolean>} kept
 */
export async function keepReceived() {
  try {
    const result = await OpenDivesCore.downloadPartial({ action: 'keep' });
    await afterDownload(result);
    if (result.downloaded) offerUndo(t('download.done', { n: result.downloaded }));
    return true;
  } catch (e) {
    console.error('Keeping the dives received', e);
    f7.dialog.create({ title: t('download.title'), text: t('download.cannotAdd'), buttons: [{ text: t('dialog.ok') }] }).open();
    return false;
  }
}

/** @type {{ computer: Computer|null, forceDownload: boolean }} */
export const lastAttempt = { computer: null, forceDownload: false };

/**
 * The address to connect to, as Subsurface's scan writes it: devices seen by
 * the Bluetooth Low Energy scan or paired as LE get "LE:" when the model can
 * use it; otherwise Bluetooth Classic (paired devices only, as on Android).
 * @param {import('opendives-core').BluetoothDevice} device
 * @param {{ ble: boolean, classic: boolean }|null} transports the model's, null when unknown
 */
export function addressFor(device, transports) {
  const ble = !transports || transports.ble;
  if (device.le && ble) return `LE:${device.mac}`;
  if (device.classic && (!transports || transports.classic)) return device.mac;
  return device.le ? `LE:${device.mac}` : device.mac;
}

/**
 * The MAC address of a stored address ("LE:AA:BB…" or "AA:BB…").
 * @param {string} address
 */
export function macOf(address) {
  return address.replace(/^(LE|BT):/i, '').toUpperCase();
}
