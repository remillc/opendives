<script>
  // @ts-check
  // /settings/maps/area: "Choisir sur la carte" (docs/mockups/android-cartes-choix-carte.dc.html).
  // A full-screen map, a rectangle with four handles, and a bottom sheet with
  // the name of the region (proposed from the nearest site of the logbook),
  // the estimated size and "Télécharger". Needs the network (the map of the
  // place is drawn from the online tiles); sizes say "environ".
  import { onMount, onDestroy } from 'svelte';
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import TextField from '../components/TextField.svelte';
  import { t } from '../lib/i18n.js';
  import { MAP_STYLE, showLabelsInLanguage } from '../lib/map-style.js';
  import { rectAround, nearestSite, estimateBytes, bboxSizeKm } from '../lib/maps-logic.js';
  import { formatMapSize } from '../lib/maps-format.js';
  import { formatNumber } from '../lib/format.js';
  import { offlineMaps, addDrawnRegion } from '../lib/offline-maps.svelte.js';

  /** @type {{ f7route: { query: Record<string, string> }, f7router: any }} */
  let { f7route, f7router } = $props();

  /** @type {typeof import('maplibre-gl')} */
  let maplibregl;
  /** @type {HTMLElement|undefined} */
  let container = $state();
  /** @type {import('maplibre-gl').Map|undefined} */
  let map;
  /** @type {Record<string, import('maplibre-gl').Marker>} */
  let handles = {};

  /** The rectangle: [west, south, east, north]. @type {[number, number, number, number]|null} */
  let bbox = $state(null);
  let name = $state('');
  /** The diver typed a name: it is not replaced by the proposal any more. */
  let named = false;
  /** @type {{ name: string, lng: number, lat: number }[]} */
  let located = [];
  let busy = $state(false);

  const MIN_SIDE = 0.02; // degrees

  const size = $derived(bbox ? estimateBytes(bbox) : 0);
  const km = $derived(bbox ? bboxSizeKm(bbox) : [0, 0]);

  /** @param {number} km */
  const roundKm = (km) => (km >= 100 ? Math.round(km / 10) * 10 : Math.round(km));

  /** The name proposed for a rectangle: after the site nearest to its centre. @param {[number, number, number, number]} b */
  function proposal(b) {
    const site = nearestSite((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, located);
    return site ? t('maps.area.around', { site: site.name }) : t('maps.area.aroundHere');
  }

  /** @param {[number, number, number, number]} b */
  function polygon(b) {
    const [w, s, e, n] = b;
    return /** @type {import('geojson').Feature} */ ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
    });
  }

  /** @param {[number, number, number, number]} b */
  function draw(b) {
    const source = /** @type {import('maplibre-gl').GeoJSONSource|undefined} */ (map?.getSource('region'));
    source?.setData(polygon(b));
    const [w, s, e, n] = b;
    handles.nw?.setLngLat([w, n]);
    handles.ne?.setLngLat([e, n]);
    handles.sw?.setLngLat([w, s]);
    handles.se?.setLngLat([e, s]);
  }

  /** @param {'nw'|'ne'|'sw'|'se'} corner */
  function addHandle(corner) {
    if (!map || !bbox) return;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'od-area-handle';
    el.setAttribute('aria-label', t('maps.area.handle', { corner: t(`maps.area.corners.${corner}`) }));
    const [w, s, e, n] = bbox;
    const marker = new maplibregl.Marker({ element: el, draggable: true })
      .setLngLat([corner.includes('w') ? w : e, corner.includes('n') ? n : s])
      .addTo(map);
    marker.on('drag', () => {
      if (!bbox) return;
      const p = marker.getLngLat();
      let [west, south, east, north] = bbox;
      if (corner.includes('w')) west = Math.min(p.lng, east - MIN_SIDE);
      else east = Math.max(p.lng, west + MIN_SIDE);
      if (corner.includes('n')) north = Math.max(p.lat, south + MIN_SIDE);
      else south = Math.min(p.lat, north - MIN_SIDE);
      bbox = [west, Math.max(-85, south), east, Math.min(85, north)];
      draw(bbox);
      if (!named) name = proposal(bbox);
    });
    handles[corner] = marker;
  }

  onMount(async () => {
    try {
      const list = await OpenDivesCore.siteQuery({ kind: 'list' });
      located = list
        .filter((/** @type {any} */ s) => s.hasLocation && s.dives > 0)
        .map((/** @type {any} */ s) => ({ name: s.name, lng: s.lonUdeg / 1e6, lat: s.latUdeg / 1e6 }));
    } catch (e) {
      console.error('Sites for the area name', e);
    }
    // The first rectangle: around the point given by the Sites map, else around the first site, else the world.
    const qLng = Number(f7route.query?.lng);
    const qLat = Number(f7route.query?.lat);
    const centre = f7route.query?.lng && Number.isFinite(qLng) && Number.isFinite(qLat) ? { lng: qLng, lat: qLat } : located[0] ?? { lng: 0, lat: 20 };
    bbox = rectAround(centre.lng, centre.lat);
    name = proposal(bbox);
    if (!offlineMaps.online || !container) return;

    const module = await import('maplibre-gl');
    maplibregl = /** @type {any} */ (module).default ?? module;
    if (!container?.isConnected) return;
    const m = new maplibregl.Map({
      container,
      style: MAP_STYLE,
      bounds: bbox,
      fitBoundsOptions: { padding: { top: 60, bottom: 300, left: 60, right: 60 } },
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map = m;
    m.touchZoomRotate.disableRotation();
    const resize = new ResizeObserver(() => m.resize());
    resize.observe(container);
    m.once('remove', () => resize.disconnect());
    m.on('load', () => {
      showLabelsInLanguage(m);
      const ink = getComputedStyle(container ?? document.body).getPropertyValue('--od-text').trim() || '#1F2124';
      if (!bbox) return;
      m.addSource('region', { type: 'geojson', data: polygon(bbox) });
      m.addLayer({ id: 'region-fill', type: 'fill', source: 'region', paint: { 'fill-color': ink, 'fill-opacity': 0.12 } });
      m.addLayer({ id: 'region-line', type: 'line', source: 'region', paint: { 'line-color': ink, 'line-width': 2.5 } });
      for (const corner of /** @type {const} */ (['nw', 'ne', 'sw', 'se'])) addHandle(corner);
    });
  });

  onDestroy(() => map?.remove());

  async function download() {
    if (!bbox || busy) return;
    busy = true;
    try {
      const label = name.trim() || proposal(bbox);
      if (await addDrawnRegion(label, bbox, size)) f7router.back('/settings/maps/', { force: true });
    } finally {
      busy = false;
    }
  }
</script>

<Page class="od-maps-area" noToolbar>
  <Navbar title={t('maps.area.title')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('detail.back')}</span>
      </Link>
    {/snippet}
  </Navbar>

  <div class="stage no-swipeback">
    {#if offlineMaps.online}
      <div class="canvas" bind:this={container} role="region" aria-label={t('maps.area.title')}></div>
      <p class="credits">{t('sites.mapCredits')}</p>
    {:else}
      <p class="offline" role="status">{t('maps.area.needNetwork')}</p>
    {/if}

    <div class="sheet">
      <div class="handle" aria-hidden="true"></div>
      <p class="help">{t('maps.area.help')}</p>
      <div class="field"><TextField label={t('maps.area.name')} bind:value={name} supporting={t('maps.area.nameHelp')} oninput={() => (named = true)} /></div>
      <p class="estimate">
        {t('maps.area.estimate', { width: formatNumber(roundKm(km[0]), 0), height: formatNumber(roundKm(km[1]), 0), size: formatMapSize(size) })}
      </p>
      <button type="button" class="download" disabled={!bbox || !offlineMaps.online || busy} onclick={download}>{t('maps.area.download')}</button>
    </div>
  </div>
</Page>

<style>
  @layer od.components {
    :global(.od-maps-area .page-content) {
      padding: 0;
      overflow: hidden;
    }

    .stage {
      position: absolute;
      inset: 0;
      background: var(--od-surface-2);
    }

    .canvas {
      position: absolute;
      inset: 0;
    }

    .offline {
      margin: 0;
      padding: 96px 24px 0;
      text-align: center;
      color: var(--od-text-2);
    }

    .credits {
      position: absolute;
      right: 8px;
      bottom: 276px;
      margin: 0;
      padding: 2px 6px;
      border-radius: 4px;
      background: color-mix(in srgb, var(--od-surface) 85%, transparent);
      color: var(--od-text-2);
      font-size: 11px;
      line-height: 14px;
      pointer-events: none;
    }

    .sheet {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      padding: 8px 0 calc(16px + var(--f7-safe-area-bottom, 0px));
      border-radius: 28px 28px 0 0;
      background: var(--od-dialog);
      box-shadow: 0 -2px 12px rgb(0 0 0 / 0.18);
      display: flex;
      flex-direction: column;
    }

    .handle {
      width: 32px;
      height: 4px;
      margin: 4px auto 8px;
      border-radius: 2px;
      background: var(--od-text-2);
      opacity: 0.4;
    }

    .help,
    .estimate {
      margin: 0 24px 12px;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .estimate {
      margin: 8px 24px 12px;
      font-variant-numeric: tabular-nums;
    }

    .download {
      width: auto;
      height: 48px;
      margin: 0 24px;
      padding: 0 20px;
      border: none;
      border-radius: 24px;
      background: var(--od-primary-action);
      color: var(--od-on-primary-action);
      font: inherit;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;

      &:disabled {
        opacity: 0.45;
        cursor: default;
      }
    }

    /* The corners of the rectangle: a 24 dp dot with a 48 dp touch target. */
    :global(.od-area-handle) {
      width: 24px;
      height: 24px;
      padding: 0;
      border-radius: 50%;
      border: 3px solid var(--od-surface);
      background: var(--od-text);
      box-shadow: 0 1px 4px rgb(0 0 0 / 0.4);
      cursor: grab;

      &::after {
        content: '';
        position: absolute;
        inset: -12px;
      }
    }
  }
</style>
