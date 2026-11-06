<script>
  // @ts-check
  // Site sheet (docs/mockups/sites-fiche-android.dc.html): name and country,
  // map, coordinates with "Open in Maps", the dives at this site, then
  // description, notes, and region and city found from the position.
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from '../components/Icon.svelte';
  import SiteMap from '../components/SiteMap.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { formatCoordinates, mapsLink } from '../lib/sites.svelte.js';
  import { formatDateTime, formatDepth, formatDuration } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7route: { params: { uuid: string } } }} */
  let { f7route } = $props();
  const uuid = Number(f7route.params.uuid);

  let site = $state(/** @type {import('opendives-core').SiteDetail|null} */ (null));

  $effect(() => {
    logbook.sitesVersion;
    OpenDivesCore.siteQuery({ kind: 'site', uuid }).then((s) => (site = s));
  });

  const place = $derived(site ? [site.city.value, site.region.value].filter(Boolean).join(', ') : '');
  /** The latest dive first, as in the logbook. */
  const latestFirst = $derived(site ? [...site.diveList].sort((a, b) => b.date.localeCompare(a.date)) : []);
  const anyManual =$derived(!!site && (site.city.manual || site.region.manual));
</script>

<Page>
  <Navbar>
    {#snippet left()}
      <Link back iconOnly><i class="icon icon-back"></i><span class="od-sr-only">{t('common.back')}</span></Link>
    {/snippet}
    {#snippet right()}
      <Link iconOnly href="/site/{uuid}/edit/"><Icon name="edit" weight={2.2} /><span class="od-sr-only">{t('sites.edit')}</span></Link>
    {/snippet}
  </Navbar>

  {#if site && site.uuid}
    <header class="head">
      <h1>{site.name || t('sites.noName')}</h1>
      {#if site.country}<p class="sub">{site.country}</p>{/if}
    </header>

    {#if site.hasLocation}
      <SiteMap pin={{ latUdeg: site.latUdeg, lonUdeg: site.lonUdeg }} height="200px" />
      <div class="coords">
        <span class="od-value">{formatCoordinates(site.latUdeg, site.lonUdeg)}</span>
        <a class="external od-text-button open" href={mapsLink(site.latUdeg, site.lonUdeg, site.name)}>
          {t('sites.openInMaps')}<Icon name="openInNew" size={18} /><span class="od-sr-only">, {t('sites.opensElsewhere')}</span>
        </a>
      </div>
    {/if}

    <div class="block-title">{t('sites.about')}</div>
    <div class="list list-strong inset list-dividers">
      <ul>
        <li class="item-content"><div class="item-inner"><div class="item-title">{t('sites.description')}<div class="item-footer text">{site.description || t('sites.noDescription')}</div></div></div></li>
        <li class="item-content"><div class="item-inner"><div class="item-title">{t('sites.notes')}<div class="item-footer text">{site.notes || t('sites.noNotes')}</div></div></div></li>
        {#if place}
          <li class="item-content">
            <div class="item-inner">
              <div class="item-title">{t('sites.regionCity')}<div class="item-footer text">{place}<br />{anyManual ? t('sites.corrected') : t('sites.foundAutomatically')}</div></div>
            </div>
          </li>
        {/if}
      </ul>
    </div>

    {#if site.diveList.length}
      <div class="block-title">{t('sites.divesHere')}</div>
      <div class="list list-strong inset list-dividers">
        <ul>
          {#each latestFirst as dive (dive.id)}
            <li>
              <a href="/dive/{dive.id}/" class="item-link item-content">
                <div class="item-inner">
                  <div class="item-title">
                    <span class="od-value">{formatDateTime(dive.date)}</span>
                    <div class="item-footer od-value">
                      {formatDuration(dive.durationSeconds)}{dive.maxDepthMm ? ` · ${formatDepth(dive.maxDepthMm, logbook.prefs)}` : ''}
                    </div>
                  </div>
                </div>
              </a>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

  {/if}
</Page>

<style>
  @layer od.components {
    .head {
      padding: 16px 20px 12px;

      h1 {
        margin: 0;
        font-size: 28px;
        line-height: 34px;
        font-weight: 800;
      }
    }

    .sub {
      margin: 4px 0 0;
      font-size: 15px;
      color: var(--od-text-2);
    }

    .coords {
      margin: 10px 16px 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      font-size: 15px;

      min-height: 48px;

      /* The button's own padding aligns its label with the margin. */
      .open {
        margin-right: -12px;
      }
    }

    .text {
      white-space: pre-line;
    }
  }
</style>
