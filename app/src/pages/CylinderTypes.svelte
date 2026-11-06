<script>
  // @ts-check
  // Settings, "Types de bouteilles" (spec, section 4, "Cylinder types
  // sub-screen"; docs/mockups/reglages-bouteilles-android.dc.html): "Your
  // types" (from the logbook and added on this device) then "Standard" (the
  // core's default table), each with its volume and working pressure. A tap
  // opens the type's sheet; "Add a type" opens an empty one.
  import { Page, Navbar, Link, f7 } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import { OpenDivesCore } from 'opendives-core';
  import { t } from '../lib/i18n.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { formatCylinderSize, formatPressure } from '../lib/format.js';

  /** @type {import('opendives-core').CylinderType[]} */
  let types = $state([]);

  async function refresh() {
    try {
      types = (await OpenDivesCore.cylinderTypes({ action: 'list' })).types;
    } catch (e) {
      console.error('Reading the cylinder types', e);
    }
  }

  const yours = $derived(types.filter((type) => !type.standard));
  const standard = $derived(types.filter((type) => type.standard));

  /** "11,1 L · 207 bar", in the units of the settings. @param {import('opendives-core').CylinderType} type */
  function size(type) {
    return [formatCylinderSize(type.ml, type.mbar, logbook.prefs), type.mbar ? formatPressure(type.mbar, logbook.prefs) : '']
      .filter(Boolean)
      .join(' · ');
  }

  /** @param {string} name */
  function open(name) {
    f7.views.current.router.navigate(`/settings/cylinders/type/?name=${encodeURIComponent(name)}`);
  }
</script>

{#snippet list(/** @type {import('opendives-core').CylinderType[]} */ items)}
  <div class="surface" role="list">
    {#each items as type (type.name)}
      <div role="listitem">
        <button type="button" class="row" onclick={() => open(type.name)}>
          <span class="label">{type.name}</span>
          <span class="value">{size(type)}</span>
        </button>
      </div>
    {/each}
  </div>
{/snippet}

<Page class="od-cylinder-types" onPageBeforeIn={refresh}>
  <Navbar title={t('settings.cylinders.title')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('detail.back')}</span>
      </Link>
    {/snippet}
  </Navbar>

  <p class="intro">{t('settings.cylinders.intro')}</p>

  {#if yours.length}
    <h2 class="title">{t('settings.cylinders.yours')}</h2>
    {@render list(yours)}
  {/if}

  <h2 class="title">{t('settings.cylinders.standard')}</h2>
  {#if standard.length}
    {@render list(standard)}
    <p class="note">{t('settings.cylinders.standardNote')}</p>
  {:else}
    <p class="note">{t('settings.cylinders.hidden')}</p>
  {/if}
  <div class="bottom"></div>

  {#snippet fixedContent()}
    <!-- Extended floating button, written by hand as in the Logbook. -->
    <div class="fab fab-right-bottom fab-extended od-fab-add">
      <a href="/settings/cylinders/new/">
        <i class="icon"><Icon name="plus" /></i>
        <div class="fab-text">{t('settings.cylinders.add')}</div>
      </a>
    </div>
  {/snippet}
</Page>

<style>
  @layer od.components {
    .intro {
      margin: 8px 20px 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .title {
      margin: 0;
      padding: 22px 20px 8px;
      font-size: 18px;
      line-height: 24px;
      font-weight: 700;
    }

    .surface {
      margin: 0 16px;
      border-radius: 20px;
      background: var(--od-surface);
      overflow: hidden;
    }

    .row {
      box-sizing: border-box;
      width: 100%;
      min-height: 56px;
      padding: 6px 24px 6px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      border: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }

    .label {
      flex: 1;
      min-width: 0;
      font-size: 16px;
    }

    .value {
      flex: none;
      font-size: 14px;
      color: var(--od-text-2);
      font-variant-numeric: tabular-nums;
    }

    .note {
      margin: 10px 20px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    /* The floating button must not hide the last row. */
    .bottom {
      height: 96px;
    }
  }
</style>
