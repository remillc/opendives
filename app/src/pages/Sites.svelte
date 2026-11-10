<script>
  // @ts-check
  // Sites section (docs/mockups/android-sites.dc.html; spec, section 4,
  // "Sites"): the section header (☰, title, search), the map of the sites
  // with a position and "centre on my position", then the list panel: the
  // count, the list items that apply (dives without a site, sites without
  // coordinates, possible duplicates), a divider and the sites.
  import { tick } from 'svelte';
  import { Page, Navbar, NavRight, Link, List, Popover, f7, theme } from 'framework7-svelte';
  import { showSnackbar } from '../lib/snackbar.js';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from '../components/Icon.svelte';
  import MenuButton from '../components/MenuButton.svelte';
  import SectionBand from '../components/SectionBand.svelte';
  import SiteMap from '../components/SiteMap.svelte';
  import MenuItem from '../components/MenuItem.svelte';
  import ChoiceDialog from '../components/ChoiceDialog.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { possibleDuplicates, siteChange } from '../lib/sites.svelte.js';
  import { defaultKeeper, sortSitesByName, sortSitesByRecent } from '../lib/site-merge.js';
  import { offerUndo } from '../lib/undo.js';
  import { formatDepth, formatLongDate, locale } from '../lib/format.js';
  import { layout, ios, listWidth } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';
import { connection } from '../lib/online.svelte.js';
import { offlineMaps, downloadRegionAt } from '../lib/offline-maps.svelte.js';
import { inBbox } from '../lib/maps-logic.js';
import { matchesSite, highlightParts } from '../lib/site-search.js';

  /** @type {import('opendives-core').SiteSummary[]} */
  let sites = $state([]);
  let withoutSite = $state(0);
  let duplicates = $state(0);
  /** @type {SiteMap|undefined} */
  let siteMap = $state();

  // "Voir sur la carte" of the offline maps screen.
  $effect(() => {
    if (!offlineMaps.viewBbox || !siteMap) return;
    siteMap.fitBbox(offlineMaps.viewBbox);
    offlineMaps.viewBbox = null;
  });

  const SORT_KEY = 'od.sitesSort';
  /** The order of the list, a setting of this device. */
  let sortBy = $state(/** @type {'name'|'recent'} */ (localStorage.getItem(SORT_KEY) === 'recent' ? 'recent' : 'name'));

  /** @param {'name'|'recent'} order */
  function setSort(order) {
    sortBy = order;
    localStorage.setItem(SORT_KEY, order);
  }

  /** Sites used by dives, in the chosen order. */
  const used = $derived.by(() => {
    const list = sites.filter((s) => s.dives > 0);
    return sortBy === 'recent' ? sortSitesByRecent(list) : sortSitesByName(list, locale);
  });
  const located = $derived(used.filter((s) => s.hasLocation));
  const unplaced = $derived(used.length - located.length);
  const diveCount = $derived(used.reduce((n, s) => n + s.dives, 0));

  // The search (spec, "Sites, search open and its animation"): open, it takes
  // the top bar; the sites that match stay on the map and in the list.
  let searching = $state(false);
  let query = $state('');
  /** @type {HTMLElement|undefined} */
  let searchEl = $state();
  /** @type {HTMLInputElement|undefined} */
  let searchInput = $state();
  /** @type {HTMLElement|undefined} */
  let todoEl = $state();
  /** @type {HTMLElement|undefined} */
  let fabEl = $state();
  /** The map's view before the search, which Close brings back. @type {{ center: import('maplibre-gl').LngLat, zoom: number }|null} */
  let viewBeforeSearch = null;
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let focusTimer;
  const GROW_MS = 300;
  const FADE_MS = 150;

  const typed = $derived(searching && query.trim() !== '');
  const results = $derived(typed ? used.filter((s) => matchesSite(s, query)) : used);
  const matching = $derived(typed ? new Set(results.map((s) => s.uuid)) : null);
  const searchCount = $derived(
    !typed ? '' : results.length ? t('sites.searchCount', { n: results.length, text: query.trim() }) : t('sites.noMatch'),
  );

  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * Reduced motion: the states change at once, with a 150 ms cross-fade in.
   * (The global rule of theme.css stops every CSS transition; this is not one.)
   * @param {(HTMLElement|null|undefined)[]} els
   */
  async function fadeIn(els) {
    if (!reducedMotion()) return;
    await tick();
    for (const el of els) el?.animate?.({ opacity: [0, 1] }, { duration: FADE_MS });
  }

  function openSearch() {
    if (searching) return;
    viewBeforeSearch = siteMap?.getView() ?? null;
    searching = true;
    fadeIn([searchEl]);
    // The keyboard opens when the field has grown.
    clearTimeout(focusTimer);
    focusTimer = setTimeout(() => searchInput?.focus(), reducedMotion() ? FADE_MS : GROW_MS);
  }

  function closeSearch() {
    if (!searching) return;
    clearTimeout(focusTimer);
    // The keyboard goes first.
    searchInput?.blur();
    searching = false;
    query = '';
    siteMap?.setView(viewBeforeSearch);
    viewBeforeSearch = null;
    fadeIn([searchEl?.closest('.view')?.querySelector('.od-sites--bar .navbar-inner') ?? null, todoEl, fabEl]);
  }

  function clearSearch() {
    query = '';
    searchInput?.focus();
  }

  // The system Back (lib/back-button.js) asks the open search to close.
  $effect(() => {
    const el = searchEl;
    el?.addEventListener('od-cancel', closeSearch);
    return () => el?.removeEventListener('od-cancel', closeSearch);
  });

  /** The sites checked, by uuid. */
  /** @type {Record<number, boolean>} */
  let checked = $state({});
  const selection = $derived(used.filter((s) => checked[s.uuid]));
  let choosingKeeper = $state(false);

  const LONG_PRESS_MS = 500;
  /** How far the finger may move before a press becomes a scroll, px. */
  const PRESS_SLOP = 10;

  /**
   * The list's selection: a long press on a site checks it and shows the boxes;
   * while sites are checked, touching a site checks or unchecks it.
   * @param {HTMLElement} el
   */
  function selectable(el) {
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    let timer;
    let startX = 0;
    let startY = 0;
    let pressed = false;
    /** @param {Event} e */
    const rowOf = (e) => /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('.od-sites--site-row'));
    const cancel = () => clearTimeout(timer);

    /** @param {PointerEvent} e */
    function down(e) {
      const row = rowOf(e);
      pressed = false;
      if (!row || /** @type {HTMLElement} */ (e.target).closest('.od-sites--site-check')) return;
      startX = e.clientX;
      startY = e.clientY;
      timer = setTimeout(() => {
        pressed = true;
        checked[Number(row.dataset.uuid)] = true;
      }, LONG_PRESS_MS);
    }
    /** @param {PointerEvent} e */
    function move(e) {
      if (Math.abs(e.clientX - startX) > PRESS_SLOP || Math.abs(e.clientY - startY) > PRESS_SLOP) cancel();
    }
    /**
     * On the window, in the capture phase: Framework7 follows the links from
     * the document's own capture phase, which would open the site.
     * @param {MouseEvent} e
     */
    function click(e) {
      if (!el.contains(/** @type {Node} */ (e.target))) return;
      const row = rowOf(e);
      if (!row || /** @type {HTMLElement} */ (e.target).closest('.od-sites--site-check')) return;
      if (pressed) {
        pressed = false;
      } else if (selection.length) {
        const uuid = Number(row.dataset.uuid);
        checked[uuid] = !checked[uuid];
      } else {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    }
    /** @param {Event} e The WebView's own long-press menu is not wanted. */
    const menu = (e) => rowOf(e) && e.preventDefault();

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointercancel', cancel);
    window.addEventListener('click', click, true);
    el.addEventListener('contextmenu', menu);
    return {
      destroy() {
        cancel();
        el.removeEventListener('pointerdown', down);
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', cancel);
        el.removeEventListener('pointercancel', cancel);
        window.removeEventListener('click', click, true);
        el.removeEventListener('contextmenu', menu);
      },
    };
  }

  /** Merges every other selected site into the one kept: one undoable step each. @param {string} value */
  async function mergeSelection(value) {
    choosingKeeper = false;
    const keep = Number(value);
    const others = selection.filter((s) => s.uuid !== keep);
    let done = 0;
    try {
      for (const other of others) {
        await siteChange({ action: 'merge', uuid: keep, other: other.uuid });
        done++;
      }
      checked = {};
    } catch (e) {
      console.error('Merge sites', e);
      showSnackbar(t('edit.failed'));
    }
    if (done) offerUndo(t('sites.done'), undefined, 6000, done);
  }

  // Offline, a hint when the map looks mostly outside the downloaded regions
  // (spec, "Sites map offline"): once per area, an area being a tile of zoom 7.
  const HINT_MIN_ZOOM = 7;
  const HINT_AREA_ZOOM = 7;
  /** @type {{ center: [number, number], bounds: [number, number, number, number], zoom: number }|undefined} */
  let view = $state.raw();
  const hinted = new Set();

  /** Share (0 to 1) of the visible area inside a downloaded region, by sampling. */
  function coveredShare(/** @type {[number, number, number, number]} */ [w, s, e, n]) {
    const regions = offlineMaps.regions.filter((r) => r.status === 'ready' || r.status === 'updating');
    const N = 8;
    let inside = 0;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const lng = w + ((e - w) * (i + 0.5)) / N;
        const lat = s + ((n - s) * (j + 0.5)) / N;
        if (regions.some((r) => inBbox(lng, lat, r.bbox))) inside++;
      }
    }
    return inside / (N * N);
  }

  function hintIfNotDownloaded() {
    if (connection.online || !view || view.zoom < HINT_MIN_ZOOM || coveredShare(view.bounds) >= 0.5) return;
    const [lng, lat] = view.center;
    const n = 2 ** HINT_AREA_ZOOM;
    const x = Math.floor(((lng + 180) / 360) * n);
    const y = Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n);
    const area = `${x}/${y}`;
    if (hinted.has(area)) return;
    hinted.add(area);
    showSnackbar(t('sites.areaNotDownloaded'), {
      action: t('sites.downloadArea'),
      timeout: 6000,
      onAction: () => downloadRegionAt(lng, lat),
    });
  }

  /** @param {{ center: [number, number], bounds: [number, number, number, number], zoom: number }} v */
  function onview(v) {
    view = v;
    hintIfNotDownloaded();
  }

  // The device goes offline with the map already in view.
  $effect(() => {
    if (!connection.online) hintIfNotDownloaded();
  });

  async function load() {
    try {
      sites = await OpenDivesCore.siteQuery({ kind: 'list' });
      withoutSite = (await OpenDivesCore.siteQuery({ kind: 'without' })).length;
      duplicates = (await possibleDuplicates()).length;
    } catch (e) {
      console.error('Sites', e);
    }
  }

  // Read again when the logbook or a site changes.
  $effect(() => {
    logbook.loading;
    logbook.sitesVersion;
    if (!logbook.loading) load();
  });

  /** @param {number} uuid */
  const open = (uuid) => f7.views.current?.router.navigate(`/sites/${uuid}`);

  function centreOnDevice() {
    const failed = () => showSnackbar(t('sites.noDevicePosition'));
    if (!navigator.geolocation) return failed();
    navigator.geolocation.getCurrentPosition(
      (pos) => siteMap?.centreOn({ latUdeg: Math.round(pos.coords.latitude * 1e6), lonUdeg: Math.round(pos.coords.longitude * 1e6) }),
      failed,
      { timeout: 15000 },
    );
  }
</script>

{#snippet mapBlock(/** @type {string} */ height)}
  {#if located.length}
    <div class="od-sites--map">
      <!-- 5:4 landscape, full width (task 2026-11-07-24). -->
      <SiteMap bind:this={siteMap} sites={located} onselect={open} {onview} {height} {matching} />
      <!-- Tablet: no header band, the pill sits on the map. -->
      {#if !layout.phone && !connection.online}
        <p class="od-sites--offline-chip od-sites--over-map" role="status"><Icon name="offline" size={16} weight={2} />{t('sites.offline')}</p>
      {/if}
      <button type="button" class="od-sites--locate" onclick={centreOnDevice}>
        <Icon name="locate" size={20} />
        <span class="od-sr-only">{t('sites.centreOnMe')}</span>
      </button>
    </div>
  {/if}
{/snippet}

{#snippet panel()}
  <section class="od-sites--panel" aria-label={t('sites.listLabel')}>
    <!-- On a phone, the band says it. -->
    {#if !layout.phone}<p class="od-sites--count od-value">{searchCount || `${t('sites.siteCount', { n: used.length })}, ${t('sites.diveCount', { n: diveCount })}`}</p>{/if}

    {#if withoutSite || unplaced || duplicates}
     <div class="od-sites--todo" class:od-sites--hidden={searching} bind:this={todoEl}>
      <div class="od-sites--todo-inner">
      <div class="list od-sites--links od-sites--surface">
        <ul>
          {#if withoutSite}
            <li><a href="/sites/without/" class="item-link item-content"><div class="item-inner"><div class="item-title">{t('sites.withoutLink', { n: withoutSite })}</div></div></a></li>
          {/if}
          {#if unplaced}
            <li><a href="/sites/unplaced/" class="item-link item-content"><div class="item-inner"><div class="item-title">{t('sites.unplacedLink', { n: unplaced })}</div></div></a></li>
          {/if}
          {#if duplicates}
            <li><a href="/sites/cleanup" class="item-link item-content"><div class="item-inner"><div class="item-title">{t('sites.duplicatesLink', { n: duplicates })}</div></div></a></li>
          {/if}
        </ul>
      </div>
      </div>
     </div>
    {/if}

    {#if results.length}
      <!-- No chevron on the site rows (android-sites.dc.html). -->
      <div class="list no-chevron od-sites--surface od-sites--list" use:selectable>
        <ul>
          {#each results as site (site.uuid)}
            <li class="od-sites--site-row" data-uuid={site.uuid}>
              {#if selection.length}
                <label class="checkbox od-sites--site-check">
                  <input type="checkbox" bind:checked={checked[site.uuid]} aria-label={t('sites.selectSite', { name: site.name || t('sites.noName') })} />
                  <i class="icon-checkbox"></i>
                </label>
              {/if}
              <a href="/sites/{site.uuid}" class="item-link item-content">
                <div class="item-inner">
                  <div class="od-sites--text">
                    <div class="item-title od-site-name">{#if site.name}{#each highlightParts(site.name, typed ? query : '') as part}{#if part.match}<mark class="od-sites--match">{part.text}</mark>{:else}{part.text}{/if}{/each}{:else}{t('sites.noName')}{/if}</div>
                    <div class="item-text">
                      {site.hasLocation
                        ? t('sites.rowDives', { n: site.dives, date: formatLongDate(site.lastDate) })
                        : t('sites.rowNoGps', { n: site.dives })}
                    </div>
                  </div>
                  {#if site.maxDepthMm}<div class="od-sites--depth od-value">{formatDepth(site.maxDepthMm, logbook.prefs)}</div>{/if}
                </div>
              </a>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
    {#if typed && !results.length}
      <div class="list"><ul><li class="item-content"><div class="item-inner">{t('sites.noMatch')}</div></li></ul></div>
    {/if}
  </section>
{/snippet}

{#snippet fab()}
    <!-- MD3 FAB, 56 dp, over the list panel: a new site. -->
    <div class="fab fab-right-bottom od-fab-add od-sites--fab" class:od-sites--hidden={searching} bind:this={fabEl}>
      <a href="/sites/new" aria-label={t('sites.newSite')}><i class="icon"><Icon name="plus" /></i></a>
    </div>
{/snippet}

<Page class="od-sites" onPageReinit={load}>
  {#snippet fixedContent()}
    <!-- The open search: ← and the field take the place of the top bar's items. -->
    <div class="od-sites--search" class:od-sites--open={searching} inert={!searching} bind:this={searchEl} role="search">
      <button type="button" class="od-icon-button od-sites--search-back" onclick={closeSearch}>
        <Icon name="arrowBack" /><span class="od-sr-only">{t('sites.closeSearch')}</span>
      </button>
      <div class="od-sites--search-field">
        <input
          bind:this={searchInput}
          bind:value={query}
          type="search"
          class="od-sites--search-input"
          placeholder={t('sites.searchPlaceholder')}
          aria-label={t('sites.search')}
          enterkeyhint="search"
          autocomplete="off"
          onkeydown={(e) => e.key === 'Enter' && searchInput?.blur()}
        />
        {#if query}
          <button type="button" class="od-sites--search-clear" onclick={clearSearch}>
            <Icon name="close" /><span class="od-sr-only">{t('sites.clearSearch')}</span>
          </button>
        {/if}
      </div>
    </div>
    {#if selection.length}
      <!-- While sites are checked, the top bar gives way to their number. -->
      <div class="od-sites--selection">
        <button type="button" class="od-icon-button" onclick={() => (checked = {})}>
          <Icon name="close" /><span class="od-sr-only">{t('logbook.selectionClose')}</span>
        </button>
        <span class="od-sites--selection-count od-value" role="status">{t('sites.selected', { n: selection.length })}</span>
        {#if selection.length >= 2}
          <a href="#menu" class="link icon-only od-sites--popover-open od-sites--selection-more" data-popover=".od-sites-menu" role="button">
            {#if theme.ios}<Icon name="moreCircle" />{:else}<Icon name="more" weight={4} />{/if}
            <span class="od-sr-only">{t('detail.moreOptions')}</span>
          </a>
        {/if}
      </div>
    {/if}
    {#if layout.phone && !selection.length}
      {@render fab()}
    {:else if layout.phone}
      <!-- Selecting: no FAB. -->
    {:else}
      <!-- Tablet (spec, section 3): the list on the left, the map on the right. -->
      <div class="od-sites--split" class:ios>
        <div class="od-sites--list-pane" style="width: {listWidth + (ios ? 0 : 20)}px">
          <div class="od-sites--scroll">{@render panel()}</div>
          {@render fab()}
        </div>
        <div class="od-sites--map-pane">{@render mapBlock('100%')}</div>
      </div>
    {/if}
  {/snippet}
  <Popover class="od-menu od-sites-sort-menu" backdrop={false}>
    <List noChevron>
      <MenuItem icon={sortBy === 'name' ? 'check' : 'blank'} text={t('sites.sortName')} onclick={() => setSort('name')} />
      <MenuItem icon={sortBy === 'recent' ? 'check' : 'blank'} text={t('sites.sortRecent')} onclick={() => setSort('recent')} />
    </List>
  </Popover>

  <Popover class="od-menu od-sites-menu" backdrop={false}>
    <List noChevron>
      <MenuItem icon="merge" text={t('sites.mergeSites')} onclick={() => (choosingKeeper = true)} />
    </List>
  </Popover>

  {#if choosingKeeper && selection.length >= 2}
    <ChoiceDialog
      title={t('sites.keepTitle')}
      note={t('sites.keepNote')}
      options={selection.map((s) => ({ value: String(s.uuid), label: s.name || t('sites.noName'), example: t('sites.diveCount', { n: s.dives }) }))}
      value={String(defaultKeeper(selection).uuid)}
      onselect={mergeSelection}
      oncancel={() => (choosingKeeper = false)}
    />
  {/if}

  <Navbar class="od-band-bar od-sites--bar{searching ? ' od-sites--searching' : ''}" title={t('sites.title')}>
    {#snippet left()}<MenuButton />{/snippet}
    <NavRight>
      <Link iconOnly onClick={openSearch}><Icon name="search" /><span class="od-sr-only">{t('sites.search')}</span></Link>
      <Link iconOnly popoverOpen=".od-sites-sort-menu">
        {#if theme.ios}<Icon name="moreCircle" />{:else}<Icon name="more" weight={4} />{/if}
        <span class="od-sr-only">{t('detail.moreOptions')}</span>
      </Link>
    </NavRight>
  </Navbar>

  {#if layout.phone}
    <SectionBand
      overMap
      chip={!connection.online}
      summaryKey={searching}
      summary={searchCount || (used.length ? [t('band.sites', { n: used.length }), t('band.dives', { n: diveCount })].join(' · ') : '')}
    >
      {#if !connection.online}
        <p class="od-sites--offline-chip" role="status"><Icon name="offline" size={16} weight={2} />{t('sites.offline')}</p>
      {/if}
    </SectionBand>
    {@render mapBlock('calc(100vw * 4 / 5)')}
    {@render panel()}
  {/if}
</Page>

<style>
  @layer od.components {
    /* Tablet: below the navigation bar, two panes side by side. */
    .od-sites--split {
      position: absolute;
      inset: calc(var(--f7-navbar-height) + var(--f7-safe-area-top)) 0 0 0;
      display: flex;
    }

    .od-sites--list-pane {
      position: relative;
      flex: none;
      display: flex;
      flex-direction: column;
      border-right: 0.5px solid var(--od-separator);
    }

    .od-sites--scroll {
      flex: 1;
      overflow-y: auto;
    }

    .od-sites--map-pane {
      position: relative;
      flex: 1;
      min-width: 0;
    }

    /* Android: the map is a rounded pane, 16 px from the edges. */
    .od-sites--split:not(.ios) .od-sites--map-pane {
      margin: 16px 16px 16px 0;
      border-radius: 28px;
      overflow: hidden;
    }

    /* iPad: 44 pt button at the top right of the map. */
    .od-sites--split.ios .od-sites--locate {
      top: 24px;
      bottom: auto;
      width: 44px;
      height: 44px;
    }

    .od-sites--split :global(.od-fab-add) {
      position: absolute;
    }

    /* "Offline" (android-sites-hors-ligne.dc.html): 28 dp, translucent white, under the summary. */
    .od-sites--offline-chip {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 28px;
      margin: 6px 0 0 12px;
      padding: 0 12px 0 8px;
      border-radius: 14px;
      background: var(--od-band-control);
      color: var(--od-on-band);
      font-size: 13px;
      font-weight: 600;

      &.od-sites--over-map {
        position: absolute;
        z-index: 2;
        top: 16px;
        left: 16px;
        margin: 0;
      }
    }

    /* The open search, in the top bar's place (spec, "Sites, search open and its
       animation"). Closed, the field is clipped to the size of the magnifier
       button, at its place on the right: opening grows it to full width from
       there, closing shrinks it back. Closing is quicker and accelerates. */
    .od-sites--search {
      --od-search-from-right: 44px;
      --od-search-open-ease: cubic-bezier(0.05, 0.7, 0.1, 1);
      --od-search-close-ease: cubic-bezier(0.3, 0, 0.8, 0.15);
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      z-index: 600;
      height: calc(var(--f7-navbar-height) + var(--f7-safe-area-top));
      padding: var(--f7-safe-area-top) 12px 0 4px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 4px;
      pointer-events: none;
      color: var(--od-on-band);

      &.od-sites--open > * {
        pointer-events: auto;
      }
    }

    .od-sites--search-back {
      flex: none;
      color: inherit;
      opacity: 0;
      transition: opacity 100ms linear 100ms;

      .od-sites--open & {
        opacity: 1;
        transition-delay: 0s;
      }
    }

    .od-sites--search-field {
      flex: 1;
      min-width: 0;
      height: 48px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 4px 0 16px;
      border-radius: 24px;
      background: transparent;
      clip-path: inset(0 var(--od-search-from-right) 0 calc(100% - var(--od-search-from-right) - 48px) round 24px);
      transition:
        clip-path 200ms var(--od-search-close-ease),
        background-color 200ms var(--od-search-close-ease);

      .od-sites--open & {
        background: var(--od-band-control);
        clip-path: inset(0 0 0 0 round 24px);
        transition-duration: 300ms;
        transition-timing-function: var(--od-search-open-ease);
      }
    }

    .od-sites--search-input {
      flex: 1;
      min-width: 0;
      height: 100%;
      padding: 0;
      border: none;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 16px;
      outline: none;
      appearance: none;
      opacity: 0;
      transition: opacity 100ms linear;

      .od-sites--open & {
        opacity: 1;
        transition-delay: 100ms;
      }

      &::-webkit-search-cancel-button {
        display: none;
      }

      &::placeholder {
        color: var(--od-on-band-2);
      }
    }

    .od-sites--search-clear {
      flex: none;
      width: 40px;
      height: 40px;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: none;
      color: var(--od-on-band-2);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* The top bar's own items give way: out in the first 100 ms of opening,
       back in the last 100 ms of closing. */
    :global(.navbar.od-sites--bar .navbar-inner > *) {
      transition: opacity 100ms linear 100ms;
    }

    :global(.navbar.od-sites--searching .navbar-inner > *) {
      opacity: 0;
      visibility: hidden;
      transition:
        opacity 100ms linear,
        visibility 0s linear 100ms;
    }

    /* The "à faire" card and the + button: fade and slide, 150 ms, and the
       card's room closes so the results rise under the map. */
    .od-sites--todo {
      display: grid;
      grid-template-rows: 1fr;
      transition:
        grid-template-rows 150ms linear,
        opacity 150ms linear,
        transform 150ms linear,
        visibility 0s;

      &.od-sites--hidden {
        grid-template-rows: 0fr;
        opacity: 0;
        transform: translateY(8px);
        visibility: hidden;
        transition:
          grid-template-rows 150ms linear,
          opacity 150ms linear,
          transform 150ms linear,
          visibility 0s linear 150ms;
      }
    }

    .od-sites--todo-inner {
      min-height: 0;
      overflow: hidden;
    }

    .od-sites--fab {
      transition:
        opacity 150ms linear,
        transform 150ms linear,
        visibility 0s;

      &.od-sites--hidden {
        opacity: 0;
        transform: translateY(8px);
        visibility: hidden;
        transition:
          opacity 150ms linear,
          transform 150ms linear,
          visibility 0s linear 150ms;
      }
    }

    /* The matched part of a name. */
    .od-sites--match {
      background: var(--od-secondary-container);
      color: inherit;
      border-radius: 2px;
    }

    .od-sites--map-pane .od-sites--map {
      height: 100%;
    }

    .od-sites--map {
      position: relative;
    }

    /* 40 dp, white surface, 12 dp corners, elevation 1, 16 dp from the right
       of the map, above its credits. */
    .od-sites--locate {
      position: absolute;
      right: 16px;
      bottom: 32px;
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 12px;
      background: var(--od-surface);
      color: var(--od-text);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.3), 0 1px 3px 1px rgb(0 0 0 / 0.15);
    }

    .od-sites--selection {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      z-index: 600;
      height: calc(var(--f7-navbar-height) + var(--f7-safe-area-top));
      padding: var(--f7-safe-area-top) 8px 0 4px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--od-surface-2);
    }

    .od-sites--selection-count {
      font-size: 22px;
      line-height: 28px;
      color: var(--od-text);
    }

    .od-sites--selection-more {
      margin-left: auto;
    }

    /* The box sits beside the row's link: touching it never opens the site. */
    .od-sites--site-row {
      display: flex;
      align-items: center;
      user-select: none;
      -webkit-touch-callout: none;

      > a {
        flex: 1;
        min-width: 0;
      }
    }

    .od-sites--site-check {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      margin-left: 4px;
    }

    .od-sites--panel {
      border-top: 1px solid var(--od-separator);
      /* On a phone, the first group sits under the map without the count line. */
      padding-top: 12px;
      /* Room for the FAB under the last site. */
      padding-bottom: 88px;
    }

    .od-sites--count {
      margin: 0;
      padding: 16px 24px 4px 16px;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    /* White surfaces, 20 dp corners, 16 dp side margins, 12 dp apart, light
       dividers between the rows (task 2026-11-07-24). */
    .od-sites--surface {
      margin: 0 16px 12px;
      border-radius: 20px;
      overflow: hidden;
      background: var(--od-surface);

      ul {
        background: none;
      }

      li + li {
        border-top: 1px solid var(--od-row-divider);
      }
    }

    /* Maintenance rows: 48 dp, 14/20 ink, 24 dp chevron. */
    .od-sites--links {
      .item-content,
      .item-inner {
        min-height: 48px;
      }

      .item-inner {
        padding-top: 0;
        padding-bottom: 0;
      }

      .item-title {
        font-size: 14px;
        line-height: 20px;
        letter-spacing: 0.25px;
        color: var(--od-text);
      }
    }

    /* Site rows: 72 dp, name 16/24, supporting 14/20, trailing depth 16/24
       medium ink, no chevron. */
    .od-sites--list {
      .item-inner {
        min-height: 72px;
        padding: 8px 20px 8px 0;
        gap: 16px;
      }

      .od-sites--text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }

      .item-title {
        font-size: 16px;
        line-height: 24px;
        font-weight: 400;
        letter-spacing: 0.15px;
        color: var(--od-text);
      }

      .item-text {
        font-size: 14px;
        line-height: 20px;
        letter-spacing: 0.25px;
        color: var(--od-text-2);
      }

      .od-sites--depth {
        flex: none;
        font-size: 16px;
        line-height: 24px;
        font-weight: 500;
        color: var(--od-text);
      }
    }
  }
</style>
