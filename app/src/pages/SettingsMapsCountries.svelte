<script>
  // @ts-check
  // /settings/maps/countries/: the countries of the catalogue, each opening
  // its own screen (/settings/maps/countries/:code) with "Tout le pays" and its
  // dive zones. Alphabetical: the catalogue carries no continent.
  import { onMount } from 'svelte';
  import { Page, Navbar, Link } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import { t, language } from '../lib/i18n.js';
  import { packageName } from '../lib/maps-logic.js';
  import { offlineMaps, ensureCatalogue, go } from '../lib/offline-maps.svelte.js';

  onMount(() => {
    ensureCatalogue();
  });

  /** One entry per country code: its name and its number of dive zones. */
  const countries = $derived.by(() => {
    /** @type {Map<string, { code: string, name: string, zones: number }>} */
    const byCode = new Map();
    for (const p of offlineMaps.catalogue) {
      const code = (p.country || '').toLowerCase();
      if (!code) continue;
      const entry = byCode.get(code) ?? { code, name: '', zones: 0 };
      if (p.kind === 'country') entry.name = packageName(p, language);
      else entry.zones += 1;
      byCode.set(code, entry);
    }
    return [...byCode.values()].map((c) => ({ ...c, name: c.name || c.code.toUpperCase() })).sort((a, b) => a.name.localeCompare(b.name, language));
  });
</script>

<Page class="od-maps-page">
  <Navbar title={t('maps.countries.title')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('detail.back')}</span>
      </Link>
    {/snippet}
  </Navbar>

  {#if countries.length}
    <div class="maps-surface top" role="list">
      {#each countries as c (c.code)}
        <div role="listitem">
          <button type="button" class="country" onclick={() => go(`/settings/maps/countries/${c.code}`)}>
            <span class="texts">
              <span class="label">{c.name}</span>
              {#if c.zones}<span class="supporting">{t('maps.countries.zones', { n: c.zones })}</span>{/if}
            </span>
            <Icon name="chevron" size={20} />
          </button>
        </div>
      {/each}
    </div>
  {:else}
    <p class="maps-note">{offlineMaps.catalogueFailed ? t('maps.addScreen.catalogueFailed') : offlineMaps.catalogueLoading ? t('maps.addScreen.catalogueLoading') : t('maps.countries.none')}</p>
  {/if}
</Page>

<style>
  @layer od.components {
    .top {
      margin-top: 8px;
    }

    .country {
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

      .supporting {
        font-size: 14px;
        line-height: 20px;
        color: var(--od-text-2);
      }

      :global(svg) {
        flex: none;
        color: var(--od-text-2);
      }
    }
  }
</style>
