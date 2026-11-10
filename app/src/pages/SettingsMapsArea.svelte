<script>
  // @ts-check
  // /settings/maps/area: "Choisir sur la carte" (docs/mockups/android-cartes-choix-carte.dc.html).
  // A full-screen map under a fixed square frame: the diver moves and zooms the
  // map, and the downloaded area is what the frame covers, computed from the
  // map (map.unproject of the frame's corners) when Download is pressed. The
  // detail is always full (zoom 14), and the map's zoom limits
  // keep the area between about 20 km across and the largest the limit allows
  // (lib/area-frame.js). The search floats on the map. Needs the network (the
  // map of the place is drawn from the online tiles).
  import { onMount, onDestroy } from 'svelte';
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import TextField from '../components/TextField.svelte';
  import { t, language } from '../lib/i18n.js';
  import { MAP_STYLE, showLabelsInLanguage } from '../lib/map-style.js';
  import { nearestSite } from '../lib/maps-logic.js';
  import { frameSide, zoomLimits, clampZoom, zoomForFrameKm, frameBbox, frameDetail } from '../lib/area-frame.js';
  import { filterSites, searchPlaces, placeNameAt } from '../lib/area-search.js';
  import { formatNumber } from '../lib/format.js';
  import { formatMapSize } from '../lib/maps-format.js';
  import { offlineMaps, addRegion } from '../lib/offline-maps.svelte.js';

  /** @type {{ f7route: { query: Record<string, string> }, f7router: any }} */
  let { f7route, f7router } = $props();

  /** @type {typeof import('maplibre-gl')} */
  let maplibregl;
  /** @type {HTMLElement|undefined} */
  let stage = $state();
  /** @type {HTMLElement|undefined} */
  let container = $state();
  /** @type {HTMLElement|undefined} */
  let searchbar = $state();
  /** @type {HTMLElement|undefined} */
  let sheet = $state();
  /** @type {import('maplibre-gl').Map|undefined} */
  let map;

  /** What the frame covers: [west, south, east, north]. @type {[number, number, number, number]|null} */
  let bbox = $state(null);
  let name = $state('');
  /** The diver typed a name, or chose a site: the proposal does not replace it any more. */
  let named = false;
  /** @type {{ name: string, lng: number, lat: number }[]} */
  let located = [];
  let busy = $state(false);

  /** The frame on the screen, px in the stage; the map's padding matches its centre. */
  let frame = $state({ left: 0, top: 0, side: 0 });
  /** Height of the bottom sheet, px (the visible part of the map ends above it). */
  let sheetHeight = $state(0);

  const info = $derived(bbox ? frameDetail(bbox) : null);
  const fits = $derived(info?.fits ?? false);

  /** @param {number} km */
  const roundKm = (km) => (km >= 100 ? Math.round(km / 10) * 10 : Math.round(km));

  /** The centre of an area. @param {[number, number, number, number]} b @returns {[number, number]} */
  function centreOf(b) {
    const east = b[0] <= b[2] ? b[2] : b[2] + 360;
    return [(((b[0] + east) / 2 + 540) % 360) - 180, (b[1] + b[3]) / 2];
  }

  /** The logbook's site nearest the centre, among those inside the area. @param {[number, number, number, number]} b */
  function siteOf(b) {
    const inside = located.filter((s) => s.lat >= b[1] && s.lat <= b[3] && (b[0] <= b[2] ? s.lng >= b[0] && s.lng <= b[2] : s.lng >= b[0] || s.lng <= b[2]));
    return nearestSite(...centreOf(b), inside);
  }

  /** The name proposed for an area, after a site of the logbook inside it. @param {[number, number, number, number]} b */
  function proposal(b) {
    const site = siteOf(b);
    return site ? t('maps.area.around', { site: site.name }) : t('maps.area.aroundHere');
  }

  /** The area under the frame, from the map's own projection. @returns {[number, number, number, number]|null} */
  function currentBbox() {
    if (!map || !frame.side) return null;
    const tl = map.unproject([frame.left, frame.top]);
    const br = map.unproject([frame.left + frame.side, frame.top + frame.side]);
    return frameBbox(tl, br);
  }

  /** Keeps the map's zoom limits right for the latitude at the centre of the frame. */
  function applyLimits() {
    if (!map || !frame.side) return;
    const c = map.getCenter();
    const { minZoom, maxZoom } = zoomLimits(c.lng, c.lat, frame.side);
    if (Math.abs(map.getMinZoom() - minZoom) > 0.01) map.setMinZoom(minZoom);
    if (Math.abs(map.getMaxZoom() - maxZoom) > 0.01) map.setMaxZoom(maxZoom);
  }

  function refresh() {
    const b = currentBbox();
    if (!b) return;
    bbox = b;
    if (!named) name = proposal(b);
  }

  /**
   * Places the frame in the visible part of the map, between the search field
   * and the bottom sheet, and gives the map the same padding so that its centre
   * is the frame's centre.
   */
  function layout() {
    if (!stage || !searchbar || !sheet) return;
    const s = stage.getBoundingClientRect();
    const top = searchbar.getBoundingClientRect().bottom - s.top + 8;
    const bottom = s.bottom - sheet.getBoundingClientRect().top;
    sheetHeight = bottom;
    const visible = s.height - top - bottom;
    const side = frameSide(s.width, visible);
    frame = { left: Math.round((s.width - side) / 2), top: Math.round(top + (visible - side) / 2), side };
    map?.setPadding({ top, bottom, left: 0, right: 0 });
    applyLimits();
    refresh();
  }

  // --- Search ---------------------------------------------------------------------
  // Sites of the logbook filter as the diver types (local, no network). Places
  // go to Nominatim only on an explicit submit: its policy forbids client-side
  // autocomplete.
  /** @type {any[]} */
  let allSites = $state([]);
  let query = $state('');
  /** @type {{ name: string, detail: string, lng: number, lat: number }[]} */
  let places = $state([]);
  /** @type {'idle'|'loading'|'done'|'error'} */
  let placesState = $state('idle');
  /** The query the shown places answer; typing again hides them. */
  let placesFor = $state('');
  const siteResults = $derived(filterSites(query, allSites));
  const showPlaces = $derived(placesState !== 'idle' && placesFor === query.trim());
  const panelOpen = $derived(offlineMaps.online && query.trim() !== '');

  async function submitSearch() {
    const q = query.trim();
    if (!q || !offlineMaps.online || placesState === 'loading') return;
    placesFor = q;
    placesState = 'loading';
    try {
      const found = await searchPlaces(q, language);
      if (placesFor !== q) return;
      places = found;
      placesState = 'done';
    } catch (e) {
      console.error('Place search', e);
      if (placesFor !== q) return;
      places = [];
      placesState = 'error';
    }
  }

  /** @param {{ name: string, lng: number, lat: number }} hit @param {boolean} isSite */
  function choose(hit, isSite) {
    if (isSite) {
      name = t('maps.area.around', { site: hit.name });
      named = true; // the diver's choice: moving the map does not rename it
    } else {
      named = false;
    }
    if (map && frame.side) {
      // A suitable zoom: about 40 km across, inside the limits at the new place.
      const limits = zoomLimits(hit.lng, hit.lat, frame.side);
      map.setMinZoom(limits.minZoom);
      map.setMaxZoom(limits.maxZoom);
      map.easeTo({ center: [hit.lng, hit.lat], zoom: clampZoom(zoomForFrameKm(hit.lat, 40, frame.side), limits), duration: 600 });
    }
    query = '';
    placesState = 'idle';
    places = [];
    /** @type {HTMLElement|null} */ (document.activeElement)?.blur?.();
  }

  onMount(async () => {
    try {
      const list = await OpenDivesCore.siteQuery({ kind: 'list' });
      allSites = list;
      located = list
        .filter((/** @type {any} */ s) => s.hasLocation && s.dives > 0)
        .map((/** @type {any} */ s) => ({ name: s.name, lng: s.lonUdeg / 1e6, lat: s.latUdeg / 1e6 }));
    } catch (e) {
      console.error('Sites for the area name', e);
    }
    // The first view: around the point given by the Sites map, else around the first site, else the world.
    const qLng = Number(f7route.query?.lng);
    const qLat = Number(f7route.query?.lat);
    const centre = f7route.query?.lng && Number.isFinite(qLng) && Number.isFinite(qLat) ? { lng: qLng, lat: qLat } : located[0] ?? { lng: 0, lat: 20 };
    if (!offlineMaps.online || !container) return;

    const module = await import('maplibre-gl');
    maplibregl = /** @type {any} */ (module).default ?? module;
    if (!container?.isConnected) return;
    layout(); // measures the stage, the search field and the sheet
    const side = frame.side || 300;
    const limits = zoomLimits(centre.lng, centre.lat, side);
    const m = new maplibregl.Map({
      container,
      style: MAP_STYLE,
      center: [centre.lng, centre.lat],
      zoom: clampZoom(zoomForFrameKm(centre.lat, 40, side), limits),
      minZoom: limits.minZoom,
      maxZoom: limits.maxZoom,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map = m;
    m.touchZoomRotate.disableRotation();
    layout(); // gives the map its padding
    m.on('move', refresh);
    m.on('moveend', () => {
      applyLimits();
      refresh();
    });
    const resize = new ResizeObserver(() => {
      m.resize();
      layout();
    });
    resize.observe(container);
    if (sheet) resize.observe(sheet);
    m.once('remove', () => resize.disconnect());
    m.on('load', () => showLabelsInLanguage(m));
  });

  onDestroy(() => map?.remove());

  async function download() {
    if (busy) return;
    // The rectangle is computed from the map at this moment, not from the last update.
    const b = currentBbox();
    const detail = b ? frameDetail(b) : null;
    if (!b || !detail || detail.maxZoom === null) return;
    busy = true;
    try {
      let label = name.trim() || proposal(b);
      // No site of the logbook here: the name of the place, when it can be known.
      if (!named && !siteOf(b)) label = (await placeNameAt(...centreOf(b), language)) ?? label;
      if (await addRegion(label, b, detail.maxZoom)) {
        // This screen also opens from the Sites map, without the list behind it.
        if (f7router.history[f7router.history.length - 2] === '/settings/maps/') f7router.back();
        else f7router.navigate('/settings/maps/', { reloadCurrent: true });
      }
    } finally {
      busy = false;
    }
  }
</script>

<Page class="od-maps-area" noToolbar>
  <Navbar title={t('maps.area.title')}>
    {#snippet left()}
      <Link back iconOnly>
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" class="close"><path d="M6 6l12 12 M18 6L6 18" /></svg>
        <span class="od-sr-only">{t('detail.back')}</span>
      </Link>
    {/snippet}
  </Navbar>

  <div class="stage no-swipeback" bind:this={stage}>
    {#if offlineMaps.online}
      <div class="canvas" bind:this={container} role="region" aria-label={t('maps.area.mapLabel')}></div>
      <div class="veil" aria-hidden="true" style:left="{frame.left}px" style:top="{frame.top}px" style:width="{frame.side}px" style:height="{frame.side}px">
        <i class="mark nw"></i><i class="mark ne"></i><i class="mark sw"></i><i class="mark se"></i>
      </div>
      <p class="credits" style:bottom="{sheetHeight + 8}px">{t('sites.mapCredits')}</p>
    {:else}
      <p class="offline" role="status">{t('maps.area.needNetwork')}</p>
    {/if}

    <div class="search">
      <form
        class="searchbar"
        bind:this={searchbar}
        role="search"
        onsubmit={(e) => {
          e.preventDefault();
          submitSearch();
        }}
      >
        <input
          type="search"
          enterkeyhint="search"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          bind:value={query}
          disabled={!offlineMaps.online}
          placeholder={offlineMaps.online ? t('maps.area.search.label') : t('maps.area.search.offline')}
          aria-label={offlineMaps.online ? t('maps.area.search.label') : t('maps.area.search.offline')}
        />
        {#if query}
          <button type="button" class="clear" aria-label={t('maps.area.search.clear')} onclick={() => (query = '')}>×</button>
        {/if}
      </form>
      {#if panelOpen}
        <div class="results card">
          {#if siteResults.length}
            <p class="group">{t('maps.area.search.sites')}</p>
            {#each siteResults as hit, i (i)}
              <button type="button" class="hit" onclick={() => choose(hit, true)}>
                <span class="hit-name">{hit.name}</span>
                {#if hit.detail}<span class="hit-detail">{hit.detail}</span>{/if}
              </button>
            {/each}
          {/if}
          <p class="group">{t('maps.area.search.places')}</p>
          {#if !showPlaces}
            <button type="button" class="hit" onclick={submitSearch}>
              <span class="hit-name">{t('maps.area.search.searchPlaces', { query: query.trim() })}</span>
            </button>
          {:else if placesState === 'loading'}
            <p class="note" role="status">{t('maps.area.search.searching')}</p>
          {:else if placesState === 'error'}
            <p class="note over" role="alert">{t('maps.area.search.error')}</p>
          {:else}
            {#each places as hit, i (i)}
              <button type="button" class="hit" onclick={() => choose(hit, false)}>
                <span class="hit-name">{hit.name}</span>
                {#if hit.detail}<span class="hit-detail">{hit.detail}</span>{/if}
              </button>
            {:else}
              <p class="note" role="status">{t('maps.area.search.none')}</p>
            {/each}
            <p class="note small">{t('maps.area.search.attribution')}</p>
          {/if}
        </div>
      {/if}
    </div>

    <div class="sheet" bind:this={sheet}>
      <div class="field"><TextField label={t('maps.area.name')} bind:value={name} supporting={t('maps.area.nameHelp')} oninput={() => (named = true)} /></div>
      {#if info}
        {#if fits}
          <p class="estimate">
            {t('maps.area.size', { width: formatNumber(roundKm(info.km[0]), 0), height: formatNumber(roundKm(info.km[1]), 0) })}
            {' · '}
            {t('maps.area.estimate', { size: formatMapSize(Math.max(1e6, info.bytes)) })}
          </p>
        {:else}
          <p class="estimate over" role="alert">{t('maps.area.tooBig')}</p>
        {/if}
      {/if}
      <button type="button" class="download" disabled={!bbox || !offlineMaps.online || busy || !fits} onclick={download}>{t('maps.area.download')}</button>
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
      overflow: hidden;
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
      margin: 0;
      padding: 2px 6px;
      border-radius: 4px;
      background: color-mix(in srgb, var(--od-surface) 85%, transparent);
      color: var(--od-text-2);
      font-size: 11px;
      line-height: 14px;
      pointer-events: none;
    }

    .search {
      position: absolute;
      z-index: 2;
      top: calc(var(--f7-navbar-height, 56px) + var(--f7-safe-area-top, 0px) + 8px);
      left: 16px;
      right: 16px;
    }

    .searchbar {
      position: relative;
      height: 56px;
      border-radius: 28px;
      background: var(--od-surface);
      box-shadow: 0 1px 6px rgb(0 0 0 / 0.25);

      input {
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        padding: 0 52px 0 20px;
        border: none;
        border-radius: 28px;
        background: transparent;
        color: var(--od-text);
        font: inherit;
        font-size: 16px;

        &::placeholder {
          color: var(--od-text-2);
        }

        &:disabled {
          opacity: 0.6;
        }
      }
    }

    .clear {
      position: absolute;
      top: 4px;
      right: 4px;
      width: 48px;
      height: 48px;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: transparent;
      color: var(--od-text);
      font-size: 24px;
      line-height: 48px;
      cursor: pointer;
    }

    .results {
      margin: 8px 0 0;
      max-height: 45vh;
      overflow-y: auto;
      border-radius: 16px;
      background: var(--od-surface);
      box-shadow: 0 2px 10px rgb(0 0 0 / 0.25);
      padding: 4px 0 8px;
    }

    .group {
      margin: 8px 20px 0;
      font-size: 12px;
      line-height: 16px;
      font-weight: 600;
      color: var(--od-text-2);
    }

    .hit {
      width: 100%;
      min-height: 48px;
      padding: 6px 20px;
      border: none;
      background: transparent;
      color: var(--od-text);
      font: inherit;
      text-align: start;
      display: flex;
      flex-direction: column;
      justify-content: center;
      cursor: pointer;
    }

    .hit-name {
      font-size: 16px;
      line-height: 22px;
    }

    .hit-detail {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .note {
      margin: 8px 20px 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);

      &.over {
        color: var(--od-alarm);
      }

      &.small {
        font-size: 12px;
        line-height: 16px;
      }
    }

    .sheet {
      position: absolute;
      z-index: 2;
      left: 0;
      right: 0;
      bottom: 0;
      padding: 16px 0 calc(16px + var(--f7-safe-area-bottom, 0px));
      border-top: 1px solid var(--od-row-divider);
      background: var(--od-dialog);
      display: flex;
      flex-direction: column;
    }

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

    .estimate.over {
      color: var(--od-alarm);
    }

    .download {
      width: calc(100% - 48px);
      height: 48px;
      margin: 16px 24px 0;
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

    /* The fixed frame: its outline, its corner marks, and the veil outside it (a huge shadow). It never takes a touch: the map works under it. */
    .veil {
      position: absolute;
      z-index: 1;
      box-sizing: border-box;
      border: 1.5px solid var(--od-area-frame);
      box-shadow: 0 0 0 100vmax var(--od-area-veil);
      pointer-events: none;
    }

    .mark {
      position: absolute;
      width: 22px;
      height: 22px;
      border: 0 solid var(--od-area-frame);
      pointer-events: none;

      &.nw {
        top: -2px;
        left: -2px;
        border-top-width: 5px;
        border-left-width: 5px;
        border-top-left-radius: 2px;
      }

      &.ne {
        top: -2px;
        right: -2px;
        border-top-width: 5px;
        border-right-width: 5px;
        border-top-right-radius: 2px;
      }

      &.sw {
        bottom: -2px;
        left: -2px;
        border-bottom-width: 5px;
        border-left-width: 5px;
        border-bottom-left-radius: 2px;
      }

      &.se {
        right: -2px;
        bottom: -2px;
        border-bottom-width: 5px;
        border-right-width: 5px;
        border-bottom-right-radius: 2px;
      }
    }

    /* The top bar: a plain surface with a 1 dp divider, a close mark instead of the back arrow. */
    :global(.od-maps-area .navbar-bg) {
      border-bottom: 1px solid var(--od-row-divider);
    }

    .close {
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  }
</style>
