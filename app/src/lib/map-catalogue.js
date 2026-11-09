// @ts-check
// The catalogue of the downloadable map packages (spec, "Offline maps").
//
// STUB: the OpenDives map server does not exist yet. Until it does, the
// catalogue is the static file `app/public/maps/catalogue.json`, shipped with
// the app and read from the app's own origin. When the server exists, point
// CATALOGUE_URL at it (same JSON shape: an array of packages) and delete the
// stub file. The package URLs of the stub are placeholders that answer
// nothing; only "northland" is a real, built package.

export const CATALOGUE_URL = '/maps/catalogue.json';

/**
 * @typedef {object} CataloguePackage
 * @property {string} id stable identifier, also the file name on the device
 * @property {'zone'|'country'} kind
 * @property {{ fr: string, en: string }} names
 * @property {string} country ISO 3166-1 alpha-2, lower case
 * @property {[number, number, number, number]} bbox west, south, east, north (degrees)
 * @property {number} sizeBytes
 * @property {string} version the build date, yyyy-mm-dd
 * @property {string} sha256 hex
 * @property {string} url
 */

/** @type {Promise<CataloguePackage[]>|undefined} */
let pending;

/**
 * The packages on offer. Read once per session unless `force`; rejects when
 * the catalogue cannot be read (the caller says "no network").
 * @param {boolean} [force]
 * @returns {Promise<CataloguePackage[]>}
 */
export function loadCatalogue(force = false) {
  if (!pending || force) {
    const request = fetch(CATALOGUE_URL, { cache: 'no-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(`Map catalogue: HTTP ${response.status}`);
        return response.json();
      })
      .then((list) => {
        if (!Array.isArray(list)) throw new Error('Map catalogue: not a list');
        return /** @type {CataloguePackage[]} */ (list.filter((p) => p && typeof p.id === 'string' && Array.isArray(p.bbox)));
      });
    request.catch(() => {
      if (pending === request) pending = undefined;
    });
    pending = request;
  }
  return pending;
}
