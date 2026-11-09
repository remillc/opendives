// @ts-check
// The base map shared by the Sites map and the map behind a dive's header.
import { language } from './i18n.js';

// Coloured base map (Christian's choice): water, land use and relief read at
// a glance, which helps place a dive site. OpenFreeMap's vector tiles, from
// OpenStreetMap data.
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

/**
 * Place names in the app's language, else in Latin script, else local.
 * @param {import('maplibre-gl').Map} map
 */
export function showLabelsInLanguage(map) {
  for (const layer of map.getStyle().layers) {
    if (layer.type === 'symbol' && map.getLayoutProperty(layer.id, 'text-field')) {
      map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', `name:${language}`], ['get', 'name:latin'], ['get', 'name']]);
    }
  }
}
