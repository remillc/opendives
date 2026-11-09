<script>
  // @ts-check
  // /settings/maps/countries/:code (docs/mockups/android-cartes-pays.dc.html):
  // "Tout le pays" first, then the dive zones of the country, each with its
  // estimated size and a download button, or a check once downloaded.
  import { onMount } from 'svelte';
  import { Page, Navbar, Link } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import MapsRow from '../components/MapsRow.svelte';
  import { t, language } from '../lib/i18n.js';
  import { packageName } from '../lib/maps-logic.js';
  import { formatMapSize } from '../lib/maps-format.js';
  import { offlineMaps, ensureCatalogue, addRegion, findRegion, fullName } from '../lib/offline-maps.svelte.js';

  /** @type {{ f7route: { params: { code: string } }, f7router: any }} */
  let { f7route, f7router } = $props();
  const code = $derived(f7route.params.code.toLowerCase());

  onMount(() => {
    ensureCatalogue();
  });

  const country = $derived(offlineMaps.catalogue.find((p) => p.kind === 'country' && p.country.toLowerCase() === code));
  const zones = $derived(
    offlineMaps.catalogue
      .filter((p) => p.kind === 'zone' && p.country.toLowerCase() === code)
      .sort((a, b) => packageName(a, language).localeCompare(packageName(b, language), language)),
  );
  const title = $derived(country ? packageName(country, language) : code.toUpperCase());

  /** @param {import('../lib/maps-logic.js').CataloguePackage} pkg */
  async function download(pkg) {
    if (await addRegion(pkg)) f7router.back('/settings/maps/', { force: true });
  }
</script>

{#snippet button(/** @type {import('../lib/maps-logic.js').CataloguePackage} */ pkg)}
  {@const region = findRegion(pkg.id)}
  {#if region && !region.pendingDelete && (region.status === 'ready' || region.status === 'updating')}
    <span class="done" role="img" aria-label={t('maps.addScreen.downloaded')}><Icon name="check" /></span>
  {:else}
    <button type="button" class="maps-icon-button" disabled={!!region && !region.pendingDelete} aria-label={t('maps.addScreen.download', { name: fullName(pkg) })} onclick={() => download(pkg)}>
      <Icon name="download" />
    </button>
  {/if}
{/snippet}

<Page class="od-maps-page">
  <Navbar {title}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('detail.back')}</span>
      </Link>
    {/snippet}
  </Navbar>

  {#if country}
    <p class="maps-note">{t('maps.countries.countryText')}</p>
    <div class="maps-surface top" role="list">
      <div role="listitem">
        <MapsRow icon="map">
          {#snippet body()}
            <span>{t('maps.countries.wholeCountry')}</span>
            <span class="supporting">{t('maps.countries.approx', { size: formatMapSize(country.sizeBytes) })}</span>
          {/snippet}
          {#snippet trailing()}{@render button(country)}{/snippet}
        </MapsRow>
      </div>
    </div>
  {/if}

  {#if zones.length}
    <h2 class="maps-title">{t('maps.countries.zonesTitle')}</h2>
    <div class="maps-surface" role="list">
      {#each zones as zone (zone.id)}
        {@const downloaded = findRegion(zone.id)?.status === 'ready'}
        <div role="listitem">
          <MapsRow icon="map">
            {#snippet body()}
              <span>{packageName(zone, language)}</span>
              <span class="supporting">{downloaded ? t('maps.countries.downloaded') : t('maps.countries.approx', { size: formatMapSize(zone.sizeBytes) })}</span>
            {/snippet}
            {#snippet trailing()}{@render button(zone)}{/snippet}
          </MapsRow>
        </div>
      {/each}
    </div>
  {/if}

  {#if !country && !zones.length}
    <p class="maps-note">{offlineMaps.catalogueFailed ? t('maps.addScreen.catalogueFailed') : offlineMaps.catalogueLoading ? t('maps.addScreen.catalogueLoading') : t('maps.countries.unknown')}</p>
  {/if}
</Page>

<style>
  @layer od.components {
    .top {
      margin-top: 8px;
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
  }
</style>
