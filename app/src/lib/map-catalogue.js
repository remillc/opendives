// @ts-check
// PLACEHOLDER written by the offline maps screens agent so that the screens
// type-check. The real catalogue loader (stub catalogue, then the server's
// JSON) belongs to the map agent: keep their version when merging.

/** @typedef {import('./maps-logic.js').CataloguePackage} CataloguePackage */

/** @returns {Promise<CataloguePackage[]>} */
export async function loadCatalogue() {
  return [
    { id: 'nz', kind: 'country', names: { fr: 'Nouvelle-Zélande', en: 'New Zealand' }, country: 'nz', bbox: [166, -48, 179, -34], sizeBytes: 640e6, version: '2026-11-01', sha256: '', url: '' },
    { id: 'nz-northland', kind: 'zone', names: { fr: 'Northland', en: 'Northland' }, country: 'nz', bbox: [172.5, -36.5, 175, -34.3], sizeBytes: 80e6, version: '2026-11-01', sha256: '', url: '' },
    { id: 'nz-canterbury', kind: 'zone', names: { fr: 'Canterbury', en: 'Canterbury' }, country: 'nz', bbox: [170, -44, 173, -42], sizeBytes: 96e6, version: '2026-11-01', sha256: '', url: '' },
  ];
}
