<script>
  // @ts-check
  // Sites section (docs/mockups/android-sites.dc.html; spec, section 4,
  // "Sites"): the section header (☰, title, search), the map of the sites
  // with a position and "centre on my position", then the list panel: the
  // count, the list items that apply (dives without a site, sites without
  // coordinates, possible duplicates), a divider and the sites.
  import { Page, Navbar, NavRight, Link, Searchbar, f7 } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from '../components/Icon.svelte';
  import MenuButton from '../components/MenuButton.svelte';
  import SiteMap from '../components/SiteMap.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { possibleDuplicates } from '../lib/sites.svelte.js';
  import { formatDepth, formatLongDate } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /** @type {import('opendives-core').SiteSummary[]} */
  let sites = $state([]);
  let withoutSite = $state(0);
  let duplicates = $state(0);
  /** @type {SiteMap|undefined} */
  let siteMap = $state();

  /** Sites used by dives, the latest dive first. */
  const used = $derived(sites.filter((s) => s.dives > 0).sort((a, b) => b.lastDate.localeCompare(a.lastDate)));
  const located = $derived(used.filter((s) => s.hasLocation));
  const unplaced = $derived(used.length - located.length);
  const diveCount = $derived(used.reduce((n, s) => n + s.dives, 0));

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
  const open = (uuid) => f7.views.current?.router.navigate(`/site/${uuid}/`);

  function centreOnDevice() {
    const failed = () => f7.toast.create({ text: t('sites.noDevicePosition'), closeTimeout: 3000 }).open();
    if (!navigator.geolocation) return failed();
    navigator.geolocation.getCurrentPosition(
      (pos) => siteMap?.centreOn({ latUdeg: Math.round(pos.coords.latitude * 1e6), lonUdeg: Math.round(pos.coords.longitude * 1e6) }),
      failed,
      { timeout: 15000 },
    );
  }
</script>

<Page onPageReinit={load}>
  <Navbar title={t('sites.title')}>
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

  {#if located.length}
    <div class="map">
      <SiteMap bind:this={siteMap} sites={located} onselect={open} height="45vh" />
      <button type="button" class="locate" onclick={centreOnDevice}>
        <Icon name="locate" />
        <span class="od-sr-only">{t('sites.centreOnMe')}</span>
      </button>
    </div>
  {/if}

  <section class="sites-panel" aria-label={t('sites.listLabel')}>
    <p class="count od-value">{t('sites.siteCount', { n: used.length })}, {t('sites.diveCount', { n: diveCount })}</p>

    {#if withoutSite || unplaced || duplicates}
      <div class="list links">
        <ul>
          {#if withoutSite}
            <li><a href="/sites/without/" class="item-link item-content"><div class="item-inner"><div class="item-title">{t('sites.withoutLink', { n: withoutSite })}</div></div></a></li>
          {/if}
          {#if unplaced}
            <li><a href="/sites/unplaced/" class="item-link item-content"><div class="item-inner"><div class="item-title">{t('sites.unplacedLink', { n: unplaced })}</div></div></a></li>
          {/if}
          {#if duplicates}
            <li><a href="/sites/cleanup/" class="item-link item-content"><div class="item-inner"><div class="item-title">{t('sites.duplicatesLink', { n: duplicates })}</div></div></a></li>
          {/if}
        </ul>
      </div>
      <div class="divider" role="separator"></div>
    {/if}

    <div class="list media-list od-sites-list">
      <ul>
        {#each used as site (site.uuid)}
          <li>
            <a href="/site/{site.uuid}/" class="item-link item-content">
              <div class="item-inner">
                <div class="item-title-row">
                  <div class="item-title od-site-name">{site.name || t('sites.noName')}</div>
                  {#if site.maxDepthMm}<div class="item-after od-value">{formatDepth(site.maxDepthMm, logbook.prefs)}</div>{/if}
                </div>
                <div class="item-text">
                  {site.hasLocation
                    ? t('sites.rowDives', { n: site.dives, date: formatLongDate(site.lastDate) })
                    : t('sites.rowNoGps', { n: site.dives })}
                </div>
              </div>
            </a>
          </li>
        {/each}
      </ul>
    </div>
    <div class="list searchbar-not-found"><ul><li class="item-content"><div class="item-inner">{t('sites.noMatch')}</div></li></ul></div>
  </section>
</Page>

<style>
  @layer od.components {
    .map {
      position: relative;
    }

    /* MD3 FAB, 56 dp with 16 dp corners, on the map. */
    .locate {
      position: absolute;
      right: 16px;
      bottom: 16px;
      width: 56px;
      height: 56px;
      border: none;
      border-radius: 16px;
      background: var(--od-surface-2);
      color: var(--od-text);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
    }

    .sites-panel {
      border-top: 1px solid var(--od-separator);
    }

    .count {
      margin: 0;
      padding: 16px 24px 4px 16px;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .links {
      margin: 0;
    }

    .divider {
      height: 1px;
      margin: 4px 0;
      background: var(--od-separator);
    }

    .od-sites-list {
      margin-top: 0;
    }
  }
</style>
