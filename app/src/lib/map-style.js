// @ts-check
// The base map shared by the Sites map and the map behind a dive's header.
//
// Reading order (spec, "Offline maps"): tiles from a downloaded package, else
// OpenFreeMap online, else the simplified world map shipped with the app
// (land and coasts only). The tiles come through offline-tiles.js; this file
// builds the style that draws them.
import { language } from './i18n.js';
import { TILE_PROTOCOL, TILE_MAX_ZOOM, registerTileProtocol } from './offline-tiles.js';
import { offlineMaps } from './offline-maps.svelte.js';

// Coloured base map (Christian's choice): water, land use and relief read at
// a glance, which helps place a dive site. OpenFreeMap's vector tiles, from
// OpenStreetMap data.
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const STYLE_TIMEOUT_MS = 8000;

/** @param {string} name */
const colour = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * The style simplified for use without the network: sea, land from the world
 * map, and, inside the downloaded areas, the package's water, green areas,
 * roads and borders. No place names: their fonts are online.
 * @param {string} channel
 * @returns {Promise<import('maplibre-gl').StyleSpecification>}
 */
async function offlineStyle(channel) {
  const world = (await import('../assets/world-land.json')).default;
  const regions = offlineMaps.regions.filter((r) => r.status === 'ready' || r.status === 'updating');
  const sea = colour('--od-map-sea') || '#D3E0EC';
  const land = colour('--od-map-land') || '#F7F6F2';
  const landLow = colour('--od-map-land-low') || '#EDECE7';
  const road = colour('--od-map-road') || '#D9D3C4';
  const outline = colour('--od-text-2') || '#4A4D52';
  const areas = {
    type: 'FeatureCollection',
    features: regions.map((r) => {
      const [w, s, e, n] = r.bbox;
      return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } };
    }),
  };
  return {
    version: 8,
    sources: {
      world: { type: 'geojson', data: /** @type {any} */ (world) },
      areas: { type: 'geojson', data: /** @type {any} */ (areas) },
      openmaptiles: { type: 'vector', tiles: [`${TILE_PROTOCOL}://${channel}/{z}/{x}/{y}`], minzoom: 0, maxzoom: TILE_MAX_ZOOM },
    },
    layers: [
      { id: 'sea', type: 'background', paint: { 'background-color': sea } },
      { id: 'world-land', type: 'fill', source: 'world', paint: { 'fill-color': landLow, 'fill-antialias': true } },
      // Inside a package the land is complete: its water polygons cut the sea out of it.
      { id: 'area-land', type: 'fill', source: 'areas', paint: { 'fill-color': land } },
      { id: 'landcover', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover', paint: { 'fill-color': landLow } },
      { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: { 'fill-color': sea } },
      { id: 'waterway', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway', paint: { 'line-color': sea, 'line-width': 1 } },
      {
        id: 'road',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 8,
        paint: { 'line-color': road, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 14, 2] },
      },
      {
        id: 'boundary',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'boundary',
        filter: ['<=', ['get', 'admin_level'], 2],
        paint: { 'line-color': outline, 'line-width': 0.8, 'line-opacity': 0.5, 'line-dasharray': [4, 2] },
      },
      // The outline of the downloaded areas, at low zoom.
      { id: 'area-outline', type: 'line', source: 'areas', maxzoom: 9, paint: { 'line-color': outline, 'line-width': 1.2, 'line-dasharray': [5, 4] } },
    ],
  };
}

/**
 * The online style (OpenFreeMap's Liberty) with its tiles read through the
 * chain above, so that a downloaded package wins.
 * @param {string} channel
 * @returns {Promise<import('maplibre-gl').StyleSpecification>}
 */
async function onlineStyle(channel) {
  const response = await fetch(MAP_STYLE, { signal: AbortSignal.timeout(STYLE_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Map style: HTTP ${response.status}`);
  const style = await response.json();
  for (const source of Object.values(style.sources)) {
    const s = /** @type {any} */ (source);
    if (s.type === 'vector' && typeof s.url === 'string' && s.url.startsWith('https://tiles.openfreemap.org/planet')) {
      delete s.url;
      s.tiles = [`${TILE_PROTOCOL}://${channel}/{z}/{x}/{y}`];
      s.minzoom = 0;
      s.maxzoom = TILE_MAX_ZOOM;
    }
  }
  return style;
}

/**
 * The style to give MapLibre. `degraded` when it is the simplified one (no
 * network for the style): a picture drawn with it is not kept as the site's map.
 * @param {typeof import('maplibre-gl')} maplibregl
 * @param {string} [channel] names the map asking, see offline-tiles.js
 * @returns {Promise<{ style: import('maplibre-gl').StyleSpecification, degraded: boolean }>}
 */
export async function buildMapStyle(maplibregl, channel = 'map') {
  registerTileProtocol(maplibregl);
  if (navigator.onLine) {
    try {
      return { style: await onlineStyle(channel), degraded: false };
    } catch (e) {
      console.warn('Map style', e);
    }
  }
  return { style: await offlineStyle(channel), degraded: true };
}

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
