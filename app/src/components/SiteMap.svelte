<script>
  // @ts-check
  // Map of dive sites, with MapLibre GL JS (BSD-3-Clause). Tiles: OpenFreeMap's
  // vector tiles from OpenStreetMap data, online, until the offline PMTiles of
  // the architecture exist (MapLibre reads PMTiles too). Markers for the sites;
  // with `draggable`, one pin the diver moves (onmove gets micro-degrees).
  import { onMount, onDestroy } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   sites?: { uuid: number, name: string, latUdeg: number, lonUdeg: number }[],
   *   pin?: { latUdeg: number, lonUdeg: number } | null,
   *   draggable?: boolean,
   *   onmove?: (pos: { latUdeg: number, lonUdeg: number }) => void,
   *   onselect?: (uuid: number) => void,
   *   height?: string,
   * }}
   */
  let { sites = [], pin = null, draggable = false, onmove, onselect, height = '240px' } = $props();

  const STYLE = 'https://tiles.openfreemap.org/styles/positron';

  /** @type {HTMLElement|undefined} */
  let container = $state();
  /** @type {maplibregl.Map|undefined} */
  let map;
  /** @type {maplibregl.Marker[]} */
  let markers = [];
  /** @type {maplibregl.Marker|undefined} */
  let pinMarker;

  /** @param {{latUdeg: number, lonUdeg: number}} p */
  const lngLat = (p) => /** @type {[number, number]} */ ([p.lonUdeg / 1e6, p.latUdeg / 1e6]);

  function drawSites() {
    if (!map) return;
    for (const m of markers) m.remove();
    markers = sites.map((site) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'od-site-marker';
      el.setAttribute('aria-label', site.name || t('sites.noName'));
      el.addEventListener('click', () => onselect?.(site.uuid));
      return new maplibregl.Marker({ element: el }).setLngLat(lngLat(site)).addTo(/** @type {maplibregl.Map} */ (map));
    });
  }

  function fit() {
    if (!map) return;
    const points = [...sites.map(lngLat), ...(pin ? [lngLat(pin)] : [])];
    if (points.length === 1) {
      map.jumpTo({ center: points[0], zoom: 13 });
    } else if (points.length > 1) {
      const bounds = points.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(points[0], points[0]));
      map.fitBounds(bounds, { padding: 40, maxZoom: 12, animate: false });
    }
  }

  onMount(() => {
    if (!container) return;
    map = new maplibregl.Map({
      container,
      style: STYLE,
      center: [0, 20],
      zoom: 1,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.on('load', () => {
      drawSites();
      fit();
    });
    if (pin || draggable) {
      pinMarker = new maplibregl.Marker({ color: getComputedStyle(container).getPropertyValue('--od-text').trim() || '#1F2124', draggable })
        .setLngLat(pin ? lngLat(pin) : [0, 20])
        .addTo(map);
      pinMarker.on('dragend', () => {
        const p = /** @type {maplibregl.Marker} */ (pinMarker).getLngLat();
        onmove?.({ latUdeg: Math.round(p.lat * 1e6), lonUdeg: Math.round(p.lng * 1e6) });
      });
    }
    // A tap places the pin too.
    if (draggable) {
      map.on('click', (e) => onmove?.({ latUdeg: Math.round(e.lngLat.lat * 1e6), lonUdeg: Math.round(e.lngLat.lng * 1e6) }));
    }
  });

  // Follow the pin when the coordinates are typed.
  $effect(() => {
    if (pinMarker && pin) {
      pinMarker.setLngLat(lngLat(pin));
      map?.easeTo({ center: lngLat(pin), zoom: Math.max(map.getZoom(), 12) });
    }
  });

  $effect(() => {
    sites;
    if (map?.loaded()) {
      drawSites();
    }
  });

  onDestroy(() => map?.remove());
</script>

<div class="site-map" style:height bind:this={container} role="region" aria-label={t('sites.map')}></div>

<style>
  @layer od.components {
    .site-map {
      width: 100%;
      background: var(--od-surface-2);
    }

    :global(.od-site-marker) {
      width: 16px;
      height: 16px;
      padding: 0;
      border-radius: 50%;
      border: 2px solid var(--od-surface);
      background: var(--od-text);
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.3);
      cursor: pointer;
    }
  }
</style>
