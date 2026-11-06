<script>
  // @ts-check
  // Sites section (docs/mockups/android-sites.dc.html; spec, section 4,
  // "Sites"): map of the sites with a position, then the list; links to the
  // dives without a site and to the clean-up of possible duplicates.
  import { Page, Navbar, NavRight, Link, f7 } from 'framework7-svelte';
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

  /** Sites used by dives, the latest dive first. */
  const used = $derived(sites.filter((s) => s.dives > 0).sort((a, b) => b.lastDate.localeCompare(a.lastDate)));
  const located = $derived(used.filter((s) => s.hasLocation));
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
</script>

<Page onPageReinit={load}>
  <Navbar title={t('sites.title')}>
    {#snippet left()}<MenuButton />{/snippet}
    <NavRight>
      <Link iconOnly href="/site/new/"><Icon name="plus" /><span class="od-sr-only">{t('sites.newSite')}</span></Link>
    </NavRight>
  </Navbar>

  {#if located.length}
    <SiteMap sites={located} onselect={open} height="38vh" />
  {/if}

  <p class="summary od-value">{t('sites.siteCount', { n: used.length })}, {t('sites.diveCount', { n: diveCount })}</p>

  {#if withoutSite || duplicates}
    <div class="list list-strong inset list-dividers">
      <ul>
        {#if withoutSite}
          <li><a href="/sites/without/" class="item-link item-content"><div class="item-inner"><div class="item-title">{t('sites.withoutLink', { n: withoutSite })}</div></div></a></li>
        {/if}
        {#if duplicates}
          <li><a href="/sites/cleanup/" class="item-link item-content"><div class="item-inner"><div class="item-title">{t('sites.duplicatesLink', { n: duplicates })}</div></div></a></li>
        {/if}
      </ul>
    </div>
  {/if}

  <div class="list media-list list-dividers">
    <ul>
      {#each used as site (site.uuid)}
        <li>
          <a href="/site/{site.uuid}/" class="item-link item-content">
            <div class="item-inner">
              <div class="item-title-row">
                <div class="item-title">{site.name || t('sites.noName')}</div>
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
</Page>

<style>
  @layer od.components {
    .summary {
      margin: 12px 16px 0;
      font-size: 15px;
      color: var(--od-text-2);
    }
  }
</style>
