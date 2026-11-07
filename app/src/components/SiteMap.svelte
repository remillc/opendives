<script>
  // @ts-check
  // Map of dive sites, with MapLibre GL JS (BSD-3-Clause). Tiles: OpenFreeMap's
  // vector tiles from OpenStreetMap data, online, until the offline PMTiles of
  // the architecture exist (MapLibre reads PMTiles too). Markers for the sites;
  // with `editable`, a pin fixed at the centre: the diver moves the map under
  // it, and onmove gets the centre (micro-degrees) when the map stops.
  import { onMount, onDestroy } from 'svelte';
  import { language, t } from '../lib/i18n.js';

  // Loaded when a map is first shown: about 800 KB the start-up does not need.
  /** @type {typeof import('maplibre-gl')} */
  let maplibregl;

  /**
   * @type {{
   *   sites?: { uuid: number, name: string, latUdeg: number, lonUdeg: number }[],
   *   pin?: { latUdeg: number, lonUdeg: number } | null,
   *   editable?: boolean,
   *   onmove?: (pos: { latUdeg: number, lonUdeg: number }) => void,
   *   onselect?: (uuid: number) => void,
   *   height?: string,
   * }}
   */
  let { sites = [], pin = null, editable = false, onmove, onselect, height = '240px' } = $props();

  // Coloured base map (Christian's choice): water, land use and relief read at
  // a glance, which helps place a dive site.
  const STYLE = 'https://tiles.openfreemap.org/styles/liberty';

  /** @type {HTMLElement|undefined} */
  let container = $state();
  /** Reactive (not deeply): the pin's effect runs again once it exists. */
  let map = $state.raw(/** @type {import('maplibre-gl').Map|undefined} */ (undefined));
  /** @type {import('maplibre-gl').Marker[]} */
  let markers = [];
  /** @type {import('maplibre-gl').Marker|undefined} */
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
      return new maplibregl.Marker({ element: el }).setLngLat(lngLat(site)).addTo(/** @type {import('maplibre-gl').Map} */ (map));
    });
  }

  function fit() {
    if (!map) return;
    const points = [...sites.map(lngLat), ...(pin ? [lngLat(pin)] : [])];
    if (points.length === 1) {
      map.jumpTo({ center: points[0], zoom: 13 }, { programmatic: true });
    } else if (points.length > 1) {
      const bounds = points.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(points[0], points[0]));
      map.fitBounds(bounds, { padding: 40, maxZoom: 12, animate: false }, { programmatic: true });
    }
  }

  onMount(async () => {
    if (!container) return;
    const module = await import('maplibre-gl');
    maplibregl = /** @type {any} */ (module).default ?? module;
    if (!container?.isConnected) return;
    const m = new maplibregl.Map({
      container,
      style: STYLE,
      center: [0, 20],
      zoom: 1,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    map = m;
    m.touchZoomRotate.disableRotation();
    // Follow the size of the container (full screen on the edit screen).
    const resize = new ResizeObserver(() => map?.resize({ programmatic: true }));
    resize.observe(container);
    m.once('remove', () => resize.disconnect());
    m.on('load', () => {
      // The credits stay one tap away, behind the ⓘ button (OpenStreetMap's
      // licence asks for them to be reachable), but start collapsed.
      const credits = container?.querySelector('.maplibregl-ctrl-attrib');
      credits?.classList.remove('maplibregl-compact-show');
      credits?.removeAttribute('open');
      showLabelsInLanguage();
      drawSites();
      fit();
    });
    if (editable) {
      // The position under the pin, once the map stops; moves made by the
      // code (typed coordinates, device position) are not sent back.
      m.on('moveend', (e) => {
        if (/** @type {any} */ (e).programmatic) return;
        const c = m.getCenter();
        onmove?.({ latUdeg: Math.round(c.lat * 1e6), lonUdeg: Math.round(c.lng * 1e6) });
      });
      // A tap brings that point under the pin.
      m.on('click', (e) => m.easeTo({ center: e.lngLat }));
    }
  });

  /**
   * Centres the map on a position ("centre on my position" of the Sites map).
   * @param {{latUdeg: number, lonUdeg: number}} p
   */
  export function centreOn(p) {
    map?.easeTo({ center: lngLat(p), zoom: Math.max(map.getZoom(), 11) }, { programmatic: true });
  }

  /** Place names in the app's language, else in Latin script, else local. */
  function showLabelsInLanguage() {
    if (!map) return;
    for (const layer of map.getStyle().layers) {
      if (layer.type === 'symbol' && map.getLayoutProperty(layer.id, 'text-field')) {
        map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', `name:${language}`], ['get', 'name:latin'], ['get', 'name']]);
      }
    }
  }

  // Editable: the map brings a position set by the code (typed, from the
  // device, the site's own) under the fixed pin; one the diver chose by moving
  // the map is already there.
  $effect(() => {
    if (!map || !editable || !pin) return;
    const c = map.getCenter();
    if (Math.round(c.lat * 1e6) === pin.latUdeg && Math.round(c.lng * 1e6) === pin.lonUdeg) return;
    map.easeTo({ center: lngLat(pin), zoom: Math.max(map.getZoom(), 12) }, { programmatic: true });
  });

  // Read-only: a marker at the position.
  $effect(() => {
    if (!map || !container || editable) return;
    if (!pin) {
      pinMarker?.remove();
      pinMarker = undefined;
      return;
    }
    // A marker needs its position before it is added to the map.
    if (pinMarker) pinMarker.setLngLat(lngLat(pin));
    else
      pinMarker = new maplibregl.Marker({ color: getComputedStyle(container).getPropertyValue('--od-text').trim() || '#1F2124' })
        .setLngLat(lngLat(pin))
        .addTo(map);
  });

  $effect(() => {
    sites;
    if (map?.loaded()) {
      drawSites();
    }
  });

  onDestroy(() => map?.remove());
</script>

<div class="site-map" style:height role="region" aria-label={t('sites.map')}>
  <div class="canvas" bind:this={container}></div>
  {#if editable}
    <!-- The tip of the pin is the centre of the map. -->
    <svg class="center-pin" width="32" height="42" viewBox="-16 -40 32 42" aria-hidden="true">
      <path d="M0 0c-9-11-14-17-14-24a14 14 0 0 1 28 0c0 7-5 13-14 24z" />
      <circle cx="0" cy="-24" r="5" />
    </svg>
  {/if}
</div>

<style>
  @layer od.components {
    .site-map {
      position: relative;
      width: 100%;
      background: var(--od-surface-2);
    }

    .canvas {
      position: absolute;
      inset: 0;
    }

    .center-pin {
      position: absolute;
      left: 50%;
      top: 50%;
      /* The tip (y = 0 of the drawing, 2 px above its bottom) on the centre. */
      transform: translate(-50%, calc(-100% + 2px));
      pointer-events: none;
      filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.35));

      path {
        fill: var(--od-text);
        stroke: var(--od-surface);
        stroke-width: 2;
      }

      circle {
        fill: var(--od-surface);
      }
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

      /* 16 dp dot, 48 dp touch target, around the dot: MapLibre places the
         marker with position: absolute, which also holds the target (no
         position here, which would win over MapLibre's layer). */
      &::after {
        content: '';
        position: absolute;
        inset: -16px;
      }
    }
  }
</style>
