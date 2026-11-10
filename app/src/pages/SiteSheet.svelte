<script>
  // @ts-check
  // Site sheet (docs/mockups/sites-fiche-android.dc.html): name and country,
  // map, coordinates with "Open in Maps", description, notes, region and city
  // found from the position, then the dives at this site.
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from '../components/Icon.svelte';
  import SiteMap from '../components/SiteMap.svelte';
  import ProfileThumbnail from '../components/ProfileThumbnail.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { diveLines, formatCoordinates, mapsLink } from '../lib/sites.svelte.js';
  import { formatLongDateTime } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7route: { params: { uuid: string } } }} */
  let { f7route } = $props();
  const uuid = Number(f7route.params.uuid);

  let site = $state(/** @type {import('opendives-core').SiteDetail|null} */ (null));
  /** Second line of each dive, by dive id. */
  let lines = $state(/** @type {Record<number, string>} */ ({}));

  $effect(() => {
    logbook.sitesVersion;
    OpenDivesCore.siteQuery({ kind: 'site', uuid }).then((s) => {
      site = s;
      if (s?.diveList) diveLines(s.diveList, (l) => (lines = l));
    });
  });

  const place = $derived(site ? [site.city.value, site.region.value].filter(Boolean).join(', ') : '');
  /** The latest dive first, as in the logbook. */
  const latestFirst = $derived(site ? [...site.diveList].sort((a, b) => b.date.localeCompare(a.date)) : []);
  const anyManual = $derived(!!site && (site.city.manual || site.region.manual));
  /** The logbook's dives, for the profile thumbnails. */
  const byId = $derived(new Map(logbook.dives.map((d) => [d.id, d])));
</script>

<Page class="od-site-sheet">
  <Navbar>
    {#snippet left()}
      <Link back iconOnly><i class="icon icon-back"></i><span class="od-sr-only">{t('common.back')}</span></Link>
    {/snippet}
    {#snippet right()}
      <Link iconOnly href="/sites/{uuid}/edit"><Icon name="edit" weight={2.2} /><span class="od-sr-only">{t('sites.edit')}</span></Link>
    {/snippet}
  </Navbar>

  {#if site && site.uuid}
    <header class="od-site-sheet--head">
      <h1>{site.name || t('sites.noName')}</h1>
      {#if site.country}<p class="od-site-sheet--sub">{site.country}</p>{/if}
    </header>

    {#if site.hasLocation}
      <!-- Inside the margins, 16 dp corners, 170 dp high (task 2026-11-07-24). -->
      <div class="od-site-sheet--map">
        <SiteMap pin={{ latUdeg: site.latUdeg, lonUdeg: site.lonUdeg }} height="170px" />
      </div>
      <div class="od-site-sheet--coords">
        <span class="od-value">{formatCoordinates(site.latUdeg, site.lonUdeg)}</span>
        <a class="external od-text-button" href={mapsLink(site.latUdeg, site.lonUdeg, site.name)}>
          {t('sites.openInMaps')}<Icon name="openInNew" size={18} /><span class="od-sr-only">, {t('sites.opensElsewhere')}</span>
        </a>
      </div>
    {/if}

    <h2 class="od-site-sheet--title">{t('sites.about')}</h2>
    <ul class="od-site-sheet--surface">
      <li class="od-site-sheet--row">
        <span class="od-site-sheet--headline">{t('sites.description')}</span>
        <span class="od-site-sheet--supporting od-site-sheet--text">{site.description || t('sites.noDescription')}</span>
      </li>
      <li class="od-site-sheet--row">
        <span class="od-site-sheet--headline">{t('sites.notes')}</span>
        <span class="od-site-sheet--supporting od-site-sheet--text">{site.notes || t('sites.noNotes')}</span>
      </li>
      {#if place}
        <li class="od-site-sheet--row">
          <span class="od-site-sheet--headline">{t('sites.regionCity')}</span>
          <span class="od-site-sheet--supporting">{place}<br />{anyManual ? t('sites.corrected') : t('sites.foundAutomatically')}</span>
        </li>
      {/if}
    </ul>

    {#if site.diveList.length}
      <h2 class="od-site-sheet--title">{t('sites.divesHere')}</h2>
      <ul class="od-site-sheet--surface">
        {#each latestFirst as dive (dive.id)}
          {@const listed = byId.get(dive.id)}
          <li>
            <a href="/dives/{dive.id}" class="od-site-sheet--row od-site-sheet--dive">
              {#if listed}
                <ProfileThumbnail profile={listed.profile} maxDepthMm={listed.maxDepthMm} prefs={logbook.prefs} />
              {/if}
              <span class="od-site-sheet--text-column">
                <span class="od-site-sheet--date od-value">{dive.number ? t('sites.diveNumberDate', { number: dive.number, date: formatLongDateTime(dive.date) }) : formatLongDateTime(dive.date)}</span>
                <span class="od-site-sheet--supporting od-value">{lines[dive.id] ?? ''}</span>
              </span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</Page>

<style>
  @layer od.components {
    .od-site-sheet--head {
      padding: 0 20px;

      h1 {
        margin: 0;
        font-size: 32px;
        line-height: 38px;
        font-weight: 800;
        letter-spacing: -0.3px;
      }
    }

    .od-site-sheet--sub {
      margin: 2px 0 0;
      font-size: 15px;
      color: var(--od-text-2);
    }

    .od-site-sheet--map {
      margin: 14px 16px 0;
      border-radius: 16px;
      overflow: hidden;
    }

    .od-site-sheet--coords {
      margin: 4px 8px 0 20px;
      min-height: 48px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      color: var(--od-text-2);
    }

    /* Section titles of the sheet: 14 medium, as in the mock-up. */
    .od-site-sheet--title {
      margin: 22px 16px 8px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 500;
      color: var(--od-text-2);
    }

    .od-site-sheet--surface {
      margin: 0 16px;
      padding: 0;
      list-style: none;
      border-radius: 16px;
      background: var(--od-surface);
      overflow: hidden;

      li + li,
      > li + li {
        border-top: 1px solid var(--od-separator);
      }
    }

    .od-site-sheet--row {
      min-height: 56px;
      padding: 10px 16px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 2px;
    }

    .od-site-sheet--headline {
      font-size: 16px;
      line-height: 24px;
      color: var(--od-text);
    }

    .od-site-sheet--supporting {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .od-site-sheet--text {
      white-space: pre-line;
    }

    /* A dive: the profile thumbnail, the long date, then minutes, buddies, mode. */
    .od-site-sheet--dive {
      min-height: 64px;
      flex-direction: row;
      align-items: center;
      justify-content: flex-start;
      gap: 12px;
      color: var(--od-text);
      text-decoration: none;
    }

    .od-site-sheet--text-column {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-site-sheet--date {
      font-size: 16px;
      line-height: 24px;
      font-weight: 600;
    }
  }
</style>
