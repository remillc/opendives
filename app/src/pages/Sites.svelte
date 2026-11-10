<script>
  // @ts-check
  // Sites section (docs/mockups/android-sites.dc.html; spec, section 4,
  // "Sites"): the section header (☰, title, search), the map of the sites
  // with a position and "centre on my position", then the list panel: the
  // count, the list items that apply (dives without a site, sites without
  // coordinates, possible duplicates), a divider and the sites.
  import { Page, Navbar, NavRight, Link, Searchbar, List, Popover, f7, theme } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from '../components/Icon.svelte';
  import MenuButton from '../components/MenuButton.svelte';
  import SectionBand from '../components/SectionBand.svelte';
  import SiteMap from '../components/SiteMap.svelte';
  import MenuItem from '../components/MenuItem.svelte';
  import ChoiceDialog from '../components/ChoiceDialog.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { possibleDuplicates, siteChange } from '../lib/sites.svelte.js';
  import { defaultKeeper, sortSitesByName } from '../lib/site-merge.js';
  import { offerUndo } from '../lib/undo.js';
  import { formatDepth, formatLongDate, locale } from '../lib/format.js';
  import { layout, ios, listWidth } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';
import { connection } from '../lib/online.svelte.js';
import { offlineMaps, downloadRegionAt } from '../lib/offline-maps.svelte.js';
import { inBbox } from '../lib/maps-logic.js';

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

  /** Sites used by dives, by name. */
  const used = $derived(sortSitesByName(sites.filter((s) => s.dives > 0), locale));
  const located = $derived(used.filter((s) => s.hasLocation));
  const unplaced = $derived(used.length - located.length);
  const diveCount = $derived(used.reduce((n, s) => n + s.dives, 0));

  /** The sites checked, by uuid. */
  /** @type {Record<number, boolean>} */
  let checked = $state({});
  const selection = $derived(used.filter((s) => checked[s.uuid]));
  let choosingKeeper = $state(false);

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
      f7.toast.create({ text: t('edit.failed'), closeTimeout: 4000 }).open();
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
    f7.toast
      .create({
        text: t('sites.areaNotDownloaded'),
        closeButton: true,
        closeButtonText: t('sites.downloadArea'),
        closeTimeout: 6000,
        position: 'bottom',
        on: { closeButtonClick: () => downloadRegionAt(lng, lat) },
      })
      .open();
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
    const failed = () => f7.toast.create({ text: t('sites.noDevicePosition'), closeTimeout: 4000 }).open();
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
    <div class="map">
      <!-- 5:4 landscape, full width (task 2026-11-07-24). -->
      <SiteMap bind:this={siteMap} sites={located} onselect={open} {onview} {height} />
      <!-- Tablet: no header band, the pill sits on the map. -->
      {#if !layout.phone && !connection.online}
        <p class="offline-chip over-map" role="status"><Icon name="offline" size={16} weight={2} />{t('sites.offline')}</p>
      {/if}
      <button type="button" class="locate" onclick={centreOnDevice}>
        <Icon name="locate" size={20} />
        <span class="od-sr-only">{t('sites.centreOnMe')}</span>
      </button>
    </div>
  {/if}
{/snippet}

{#snippet panel()}
  <section class="sites-panel" aria-label={t('sites.listLabel')}>
    <!-- On a phone, the band says it. -->
    {#if !layout.phone}<p class="count od-value">{t('sites.siteCount', { n: used.length })}, {t('sites.diveCount', { n: diveCount })}</p>{/if}

    {#if withoutSite || unplaced || duplicates}
      <div class="list links surface">
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
    {/if}

    {#if used.length}
      <!-- No chevron on the site rows (android-sites.dc.html). -->
      <div class="list no-chevron surface od-sites-list">
        <ul>
          {#each used as site (site.uuid)}
            <li class="od-site-row">
              <label class="checkbox od-site-check">
                <input type="checkbox" bind:checked={checked[site.uuid]} aria-label={t('sites.selectSite', { name: site.name || t('sites.noName') })} />
                <i class="icon-checkbox"></i>
              </label>
              <a href="/sites/{site.uuid}" class="item-link item-content">
                <div class="item-inner">
                  <div class="text">
                    <div class="item-title od-site-name">{site.name || t('sites.noName')}</div>
                    <div class="item-text">
                      {site.hasLocation
                        ? t('sites.rowDives', { n: site.dives, date: formatLongDate(site.lastDate) })
                        : t('sites.rowNoGps', { n: site.dives })}
                    </div>
                  </div>
                  {#if site.maxDepthMm}<div class="depth od-value">{formatDepth(site.maxDepthMm, logbook.prefs)}</div>{/if}
                </div>
              </a>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
    <div class="list searchbar-not-found"><ul><li class="item-content"><div class="item-inner">{t('sites.noMatch')}</div></li></ul></div>
  </section>
{/snippet}

{#snippet fab()}
    <!-- MD3 FAB, 56 dp, over the list panel: a new site. -->
    <div class="fab fab-right-bottom od-fab-add">
      <a href="/sites/new" aria-label={t('sites.newSite')}><i class="icon"><Icon name="plus" /></i></a>
    </div>
{/snippet}

<Page onPageReinit={load}>
  {#snippet fixedContent()}
    {#if selection.length}
      <!-- While sites are checked, the top bar gives way to their number. -->
      <div class="od-sites-selection">
        <button type="button" class="od-icon-button" onclick={() => (checked = {})}>
          <Icon name="close" /><span class="od-sr-only">{t('logbook.selectionClose')}</span>
        </button>
        <span class="od-sites-selection-count od-value" role="status">{t('sites.selected', { n: selection.length })}</span>
        {#if selection.length >= 2}
          <a href="#menu" class="link icon-only popover-open od-sites-selection-more" data-popover=".od-sites-menu" role="button">
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
      <div class="split" class:ios>
        <div class="list-pane" style="width: {listWidth + (ios ? 0 : 20)}px">
          <div class="scroll">{@render panel()}</div>
          {@render fab()}
        </div>
        <div class="map-pane">{@render mapBlock('100%')}</div>
      </div>
    {/if}
  {/snippet}
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

  <Navbar class="od-band-bar" title={t('sites.title')}>
    {#snippet left()}<MenuButton />{/snippet}
    <NavRight>
      <Link iconOnly searchbarEnable=".od-sites-search"><Icon name="search" /><span class="od-sr-only">{t('sites.search')}</span></Link>
    </NavRight>
    <Searchbar
      class="od-sites-search"
      expandable
      searchContainer=".od-sites-list"
      searchIn=".od-site-name"
      placeholder={t('sites.searchPlaceholder')}
      disableButtonText={t('logbook.cancel')}
    />
  </Navbar>

  {#if layout.phone}
    <SectionBand overMap chip={!connection.online} summary={used.length ? [t('band.sites', { n: used.length }), t('band.dives', { n: diveCount })].join(' · ') : ''}>
      {#if !connection.online}
        <p class="offline-chip" role="status"><Icon name="offline" size={16} weight={2} />{t('sites.offline')}</p>
      {/if}
    </SectionBand>
    {@render mapBlock('calc(100vw * 4 / 5)')}
    {@render panel()}
  {/if}
</Page>

<style>
  @layer od.components {
    /* Tablet: below the navigation bar, two panes side by side. */
    .split {
      position: absolute;
      inset: calc(var(--f7-navbar-height) + var(--f7-safe-area-top)) 0 0 0;
      display: flex;
    }

    .list-pane {
      position: relative;
      flex: none;
      display: flex;
      flex-direction: column;
      border-right: 0.5px solid var(--od-separator);
    }

    .scroll {
      flex: 1;
      overflow-y: auto;
    }

    .map-pane {
      position: relative;
      flex: 1;
      min-width: 0;
    }

    /* Android: the map is a rounded pane, 16 px from the edges. */
    .split:not(.ios) .map-pane {
      margin: 16px 16px 16px 0;
      border-radius: 28px;
      overflow: hidden;
    }

    /* iPad: 44 pt button at the top right of the map. */
    .split.ios .locate {
      top: 24px;
      bottom: auto;
      width: 44px;
      height: 44px;
    }

    .split :global(.od-fab-add) {
      position: absolute;
    }

    /* "Offline" (android-sites-hors-ligne.dc.html): 28 dp, translucent white, under the summary. */
    .offline-chip {
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

      &.over-map {
        position: absolute;
        z-index: 2;
        top: 16px;
        left: 16px;
        margin: 0;
      }
    }

    .map-pane .map {
      height: 100%;
    }

    .map {
      position: relative;
    }

    /* 40 dp, white surface, 12 dp corners, elevation 1, 16 dp from the right
       of the map, above its credits. */
    .locate {
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

    .od-sites-selection {
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

    .od-sites-selection-count {
      font-size: 22px;
      line-height: 28px;
      color: var(--od-text);
    }

    .od-sites-selection-more {
      margin-left: auto;
    }

    /* The box sits beside the row's link: touching it never opens the site. */
    .od-site-row {
      display: flex;
      align-items: center;

      > a {
        flex: 1;
        min-width: 0;
      }
    }

    .od-site-check {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      margin-left: 4px;
    }

    .sites-panel {
      border-top: 1px solid var(--od-separator);
      /* On a phone, the first group sits under the map without the count line. */
      padding-top: 12px;
      /* Room for the FAB under the last site. */
      padding-bottom: 88px;
    }

    .count {
      margin: 0;
      padding: 16px 24px 4px 16px;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    /* White surfaces, 20 dp corners, 16 dp side margins, 12 dp apart, light
       dividers between the rows (task 2026-11-07-24). */
    .surface {
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
    .links {
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
    .od-sites-list {
      .item-inner {
        min-height: 72px;
        padding: 8px 20px 8px 0;
        gap: 16px;
      }

      .text {
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

      .depth {
        flex: none;
        font-size: 16px;
        line-height: 24px;
        font-weight: 500;
        color: var(--od-text);
      }
    }
  }
</style>
