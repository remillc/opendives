// @ts-check
// OpenFreeMap's current tiles: the address (it carries the date of the data,
// so it changes with each weekly build) and the version taken from it. Read
// from the TileJSON, never written in the app.

export const TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
const TIMEOUT_MS = 15000;

/**
 * @typedef {Object} TileSource
 * @property {string} template address with {z}, {x}, {y}
 * @property {string} version the build of the data, e.g. `20261104_001001_pt`
 */

/**
 * The version is the path segment before `{z}`; the whole address when the
 * address has another shape (it then still changes with each build).
 * @param {string} template
 */
export function versionOfTemplate(template) {
  return /\/([^/]+)\/\{z\}/.exec(template)?.[1] ?? template;
}

/** @returns {Promise<TileSource>} */
export async function readTileSource() {
  const response = await fetch(TILEJSON_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`TileJSON: HTTP ${response.status}`);
  const json = await response.json();
  const template = String(json.tiles[0]);
  return { template, version: versionOfTemplate(template) };
}
