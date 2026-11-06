// @ts-check
// Download from a dive computer: what the download screen and the "Download
// failed" screen share. The last attempt is kept in memory only, so that
// "Réessayer" starts it again; nothing is stored.

/**
 * A dive computer to download from: the model (a libdivecomputer model, as
 * the core names it), the Bluetooth address ("LE:" + MAC for Bluetooth Low
 * Energy, the MAC alone for Classic) and the device's Bluetooth name.
 * @typedef {{ vendor: string, product: string, address: string, name: string }} Computer
 */

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
