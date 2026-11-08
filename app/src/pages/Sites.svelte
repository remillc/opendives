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

<Page onPageReinit={load}>
  {#snippet fixedContent()}
    <!-- MD3 FAB, 56 dp, over the list panel: a new site. -->
    <div class="fab fab-right-bottom od-fab-add">
      <a href="/sites/new" aria-label={t('sites.newSite')}><i class="icon"><Icon name="plus" /></i></a>
    </div>
  {/snippet}
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
      <!-- 5:4 landscape, full width (task 2026-11-07-24). -->
      <SiteMap bind:this={siteMap} sites={located} onselect={open} height="calc(100vw * 4 / 5)" />
      <button type="button" class="locate" onclick={centreOnDevice}>
        <Icon name="locate" size={20} />
        <span class="od-sr-only">{t('sites.centreOnMe')}</span>
      </button>
    </div>
  {/if}

  <section class="sites-panel" aria-label={t('sites.listLabel')}>
    <p class="count od-value">{t('sites.siteCount', { n: used.length })}, {t('sites.diveCount', { n: diveCount })}</p>

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
            <li>
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
</Page>

<style>
  @layer od.components {
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

    .sites-panel {
      border-top: 1px solid var(--od-separator);
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
