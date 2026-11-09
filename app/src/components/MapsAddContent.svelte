<script>
  // @ts-check
  // "Ajouter une région" (spec, section 4, "Offline maps", Adding;
  // docs/mockups/android-cartes-ajout.dc.html): the search field, the zones
  // that contain the sites of the logbook (trips first), then the ways to
  // browse: by country and area, or choose on the map. The content of the
  // /settings/maps/new screen, and the pane beside the list on a tablet.
  import { onMount } from 'svelte';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from './Icon.svelte';
  import MapsRow from './MapsRow.svelte';
  import { t } from '../lib/i18n.js';
  import { locale } from '../lib/format.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { suggestZones, matchesSearch, packageForPoint } from '../lib/maps-logic.js';
  import { formatMapSize } from '../lib/maps-format.js';
  import { offlineMaps, ensureCatalogue, addRegion, fullName, findRegion, go } from '../lib/offline-maps.svelte.js';

  /**
   * `near`: a point of the Sites map ("Télécharger" in its snackbar); `onstarted`: runs once a download started.
   * @type {{ near?: { lng: number, lat: number }|null, onstarted?: () => void }}
   */
  let { near = null, onstarted } = $props();

  /** @type {import('opendives-core').SiteSummary[]} */
  let sites = $state([]);
  let query = $state('');

  async function load() {
    ensureCatalogue();
    try {
      sites = await OpenDivesCore.siteQuery({ kind: 'list' });
    } catch (e) {
      console.error('Sites for the map suggestions', e);
    }
  }

  onMount(load);

  // Read again when a site changes.
  $effect(() => {
    logbook.sitesVersion;
    if (!logbook.loading) load();
  });

  const located = $derived(sites.filter((s) => s.hasLocation && s.dives > 0));
  const monthYear = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });

  /** The trips of the logbook with the located sites of their dives, the latest trip first. */
  const trips = $derived.by(() => {
    /** @type {Map<number, { name: string, date: string, sites: Set<string> }>} */
    const byId = new Map();
    for (const dive of logbook.dives) {
      if (!dive.trip || !dive.trip.location) continue;
      const entry = byId.get(dive.trip.id) ?? { name: dive.trip.location, date: dive.date, sites: new Set() };
      if (dive.date > entry.date) entry.date = dive.date;
      if (dive.site) entry.sites.add(dive.site);
      byId.set(dive.trip.id, entry);
    }
    return [...byId.values()]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((trip) => ({
        name: trip.name,
        date: trip.date,
        sites: located.filter((s) => trip.sites.has(s.name)).map((s) => ({ name: s.name, lng: s.lonUdeg / 1e6, lat: s.latUdeg / 1e6 })),
      }));
  });

  const suggestions = $derived(
    suggestZones({
      sites: located.map((s) => ({ name: s.name, lng: s.lonUdeg / 1e6, lat: s.latUdeg / 1e6, dives: s.dives })),
      trips,
      catalogue: offlineMaps.catalogue,
    }),
  );

  const nearPackage = $derived(near ? packageForPoint(near.lng, near.lat, offlineMaps.catalogue) : null);
  const results = $derived(query.trim() ? offlineMaps.catalogue.filter((p) => matchesSearch(p, query)) : []);

  /** "Voyage Canterbury, avril 2014 · Lake Coleridge", or "Northern Arch · 1 plongée". @param {(typeof suggestions)[number]} s */
  function describe(s) {
    const names = s.sites.map((x) => x.name);
    const siteText = names.length > 2 ? t('maps.addScreen.sitesMore', { site: names.slice(0, 2).join(', '), n: names.length - 2 }) : names.join(', ');
    const trip = s.trips[0];
    if (trip) {
      return trip.date
        ? t('maps.addScreen.trip', { name: trip.name, date: monthYear.format(new Date(trip.date)), sites: siteText })
        : t('maps.addScreen.tripNoDate', { name: trip.name, sites: siteText });
    }
    const only = s.sites[0];
    return s.sites.length === 1 && only.dives ? t('maps.addScreen.siteDives', { site: only.name, n: only.dives }) : siteText;
  }

  /** @param {import('../lib/maps-logic.js').CataloguePackage} pkg */
  async function download(pkg) {
    if (await addRegion(pkg)) onstarted?.();
  }
</script>

{#snippet downloadButton(/** @type {import('../lib/maps-logic.js').CataloguePackage} */ pkg)}
  {@const region = findRegion(pkg.id)}
  {#if region && !region.pendingDelete && (region.status === 'ready' || region.status === 'updating')}
    <span class="done" role="img" aria-label={t('maps.addScreen.downloaded')} title={t('maps.addScreen.downloaded')}>
      <Icon name="check" />
    </span>
  {:else}
    <button
      type="button"
      class="maps-icon-button"
      disabled={!!region && !region.pendingDelete}
      aria-label={t('maps.addScreen.download', { name: fullName(pkg) })}
      onclick={() => download(pkg)}
    >
      <Icon name="download" />
    </button>
  {/if}
{/snippet}

{#snippet packageRow(/** @type {import('../lib/maps-logic.js').CataloguePackage} */ pkg, /** @type {string} */ line)}
  <MapsRow icon="map">
    {#snippet body()}
      <span>{fullName(pkg)}</span>
      <span class="supporting">{line}</span>
    {/snippet}
    {#snippet trailing()}{@render downloadButton(pkg)}{/snippet}
  </MapsRow>
{/snippet}

<div class="add">
  <label class="search">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L20 20" /></svg>
    <input type="search" bind:value={query} placeholder={t('maps.addScreen.search')} aria-label={t('maps.addScreen.search')} />
  </label>

  {#if offlineMaps.catalogueFailed && !offlineMaps.catalogue.length}
    <p class="maps-note failed" role="alert">{t('maps.addScreen.catalogueFailed')}</p>
    <div class="retry"><button type="button" onclick={() => ensureCatalogue(true)}>{t('maps.addScreen.retry')}</button></div>
  {:else if offlineMaps.catalogueLoading && !offlineMaps.catalogue.length}
    <p class="maps-note">{t('maps.addScreen.catalogueLoading')}</p>
  {:else if query.trim()}
    <h2 class="maps-title">{t('maps.addScreen.results')}</h2>
    {#if results.length}
      <div class="maps-surface" role="list">
        {#each results as pkg (pkg.id)}
          <div role="listitem">
            {@render packageRow(pkg, t(pkg.kind === 'country' ? 'maps.countries.approx' : 'maps.addScreen.zoneSize', { size: formatMapSize(pkg.sizeBytes) }))}
          </div>
        {/each}
      </div>
    {:else}
      <p class="maps-note">{t('maps.addScreen.noResult')}</p>
    {/if}
  {:else}
    {#if near}
      <h2 class="maps-title">{t('maps.addScreen.nearTitle')}</h2>
      {#if nearPackage}
        <div class="maps-surface" role="list">
          <div role="listitem">{@render packageRow(nearPackage, t(nearPackage.kind === 'country' ? 'maps.countries.approx' : 'maps.addScreen.zoneSize', { size: formatMapSize(nearPackage.sizeBytes) }))}</div>
        </div>
      {:else}
        <p class="maps-note">{t('maps.addScreen.nearNone')}</p>
      {/if}
    {/if}

    <h2 class="maps-title">{t('maps.addScreen.fromLogbook')}</h2>
    {#if suggestions.length}
      <div class="maps-surface" role="list">
        {#each suggestions as s (s.pkg.id)}
          <div role="listitem">{@render packageRow(s.pkg, describe(s))}</div>
        {/each}
      </div>
      <p class="maps-note">{t('maps.addScreen.fromLogbookNote')}</p>
    {:else}
      <p class="maps-note">{t('maps.addScreen.fromLogbookNone')}</p>
    {/if}

    <h2 class="maps-title">{t('maps.addScreen.all')}</h2>
    <div class="maps-surface" role="list">
      <div role="listitem">
        <button type="button" class="link-row" onclick={() => go('/settings/maps/countries/')}>
          <span class="texts">
            <span class="label">{t('maps.addScreen.byCountry')}</span>
            <span class="supporting">{t('maps.addScreen.byCountryText')}</span>
          </span>
          <Icon name="chevron" size={20} />
        </button>
      </div>
      <div role="listitem">
        <button type="button" class="link-row" onclick={() => go(near ? `/settings/maps/area?lng=${near.lng}&lat=${near.lat}` : '/settings/maps/area')}>
          <span class="texts">
            <span class="label">{t('maps.addScreen.onMap')}</span>
            <span class="supporting">{t('maps.addScreen.onMapText')}</span>
          </span>
          <Icon name="chevron" size={20} />
        </button>
      </div>
    </div>
  {/if}
  <div class="bottom"></div>
</div>

<style>
  @layer od.components {
    .search {
      margin: 4px 16px 0;
      height: 56px;
      padding: 0 16px;
      border-radius: 28px;
      background: var(--od-surface-2);
      display: flex;
      align-items: center;
      gap: 16px;

      svg {
        flex: none;
        width: 24px;
        height: 24px;
        fill: none;
        stroke: var(--od-text);
        stroke-width: 2;
        stroke-linecap: round;
      }

      input {
        flex: 1;
        min-width: 0;
        border: none;
        background: none;
        font: inherit;
        font-size: 16px;
        color: var(--od-text);
        outline: none;
      }
    }

    .supporting {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
      font-variant-numeric: tabular-nums;
    }

    .done {
      flex: none;
      width: 48px;
      height: 48px;
      margin-right: -12px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--od-text);
    }

    .link-row {
      box-sizing: border-box;
      width: 100%;
      min-height: 64px;
      padding: 8px 24px 8px 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      border: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      text-align: start;
      cursor: pointer;

      .texts {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }

      .label {
        font-size: 16px;
        line-height: 24px;
      }

      :global(svg) {
        flex: none;
        color: var(--od-text-2);
      }
    }

    .failed {
      color: var(--od-error);
    }

    .retry {
      margin: 4px 8px 0;

      button {
        width: auto;
        height: 40px;
        padding: 0 12px;
        border: none;
        border-radius: 20px;
        background: none;
        color: var(--od-text);
        font: inherit;
        font-size: 14px;
        font-weight: 600;
      }
    }

    .bottom {
      height: 96px;
    }
  }
</style>
