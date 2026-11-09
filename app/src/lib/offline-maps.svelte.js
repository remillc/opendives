// @ts-check
// PLACEHOLDER. The real module is written by the screens agent (task
// 2026-11-09-33) and replaces this file when the branches are merged. It only
// holds the exports the map reading chain codes against.

/**
 * @typedef {object} Region
 * @property {string} id
 * @property {'zone'|'country'|'drawn'} kind
 * @property {string} name
 * @property {[number, number, number, number]} bbox west, south, east, north (degrees)
 * @property {number} sizeBytes
 * @property {string} version
 * @property {string} [downloadedAt]
 * @property {string} status 'queued'|'waiting-wifi'|'downloading'|'paused'|'failed'|'ready'|'updating'
 * @property {number} [bytesReceived]
 */

export const offlineMaps = $state(/** @type {{ regions: Region[] }} */ ({ regions: [] }));

/**
 * Opens the add flow for what contains this point.
 * @param {number} lng
 * @param {number} lat
 */
export function downloadRegionAt(lng, lat) {
  console.warn('downloadRegionAt: placeholder', lng, lat);
}
