<script>
  // @ts-check
  // The graphic summary of the "Gas" group of "Edit dive"
  // (docs/mockups/android-edition.dc.html): one drawn cylinder per cylinder with
  // its gas in plain words and its end pressure under it. A tap on a cylinder
  // opens that cylinder's sheet; a tap anywhere else, or on the chevron, opens
  // the Gas page with every cylinder and the gas changes.
  // A rebreather dive (task 2026-11-13-86, docs/mockups/android-edition-gaz-ccr.dc.html)
  // shows the dive detail's rebreather drawing instead, with one column per gas
  // under it; the whole card then opens the Gas page.
  import Icon from './Icon.svelte';
  import CylinderDrawing from './CylinderDrawing.svelte';
  import RebreatherDrawing from './RebreatherDrawing.svelte';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   items: { key: number, n: number, gas: string, pressure: string, ratio: number, startRatio: number|null, hatched?: boolean }[],
   *   rebreather?: { diluent: number, oxygen: number, others: number[], marks: { diluent: string, oxygen: string, bailout: string }, label: string }|null,
   *   onopen: () => void,
   *   onedit: (key: number) => void,
   * }}
   * pressure: the end pressure as shown ("1 885 psi"), empty when unknown. ratio and startRatio:
   * the end and start levels drawn (lib/gas-summary.js fillLevels). rebreather: indices into items
   * (lib/rebreather-gas.js rebreatherLayout), the marks and the card's accessible name.
   */
  let { items, rebreather = null, onopen, onedit } = $props();

  /** In the rebreather view: diluent, oxygen, then the others, each present one a column. */
  const columns = $derived(rebreather ? [rebreather.diluent, ...(rebreather.oxygen === rebreather.diluent ? [] : [rebreather.oxygen]), ...rebreather.others].filter((i) => i >= 0) : []);

  /** @param {MouseEvent} event */
  function click(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    const cylinder = target.closest('[data-key]');
    if (cylinder) onedit(Number(cylinder.getAttribute('data-key')));
    else onopen();
  }
</script>

{#if rebreather}
  <!-- A rebreather dive: the whole card is one button that opens the Gas page. -->
  <button type="button" class="od-gas-summary od-gas-summary--rebreather" aria-label={rebreather.label} onclick={onopen}>
    <div class="od-gas-summary--drawing">
      <RebreatherDrawing
        diluent={rebreather.diluent >= 0 ? items[rebreather.diluent] : null}
        oxygen={rebreather.oxygen >= 0 ? items[rebreather.oxygen] : null}
        others={rebreather.others.map((i) => items[i])}
        marks={rebreather.marks}
      />
      <div class="od-gas-summary--columns" style:grid-template-columns="repeat({columns.length}, 1fr)">
        {#each columns as i (i)}
          <div class="od-gas-summary--column">
            <span class="od-gas-summary--gas">{items[i].gas}</span>
            {#if items[i].pressure}<span class="od-gas-summary--pressure od-value">{items[i].pressure}</span>{/if}
          </div>
        {/each}
      </div>
    </div>
    <span class="od-gas-summary--chevron" aria-hidden="true"><Icon name="chevron" /></span>
    <p class="od-gas-summary--helper">{t('edit.gasHelper')}</p>
  </button>
{:else}
<!-- A tap on the card opens the Gas page; each cylinder and the chevron are real buttons for the keyboard and TalkBack. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="od-gas-summary" onclick={click}>
  <div class="od-gas-summary--cylinders">
    {#each items as item (item.key)}
      <button type="button" class="od-gas-summary--cylinder" data-key={item.key} aria-label={t('edit.cylinderOpen', { n: item.n, gas: item.gas })}>
        <CylinderDrawing ratio={item.ratio} startRatio={item.startRatio} hatched={item.hatched} />
        <span class="od-gas-summary--gas">{item.gas}</span>
        {#if item.pressure}<span class="od-gas-summary--pressure od-value">{item.pressure}</span>{/if}
      </button>
    {/each}
    {#if !items.length}<span class="od-gas-summary--none">{t('edit.noCylinders')}</span>{/if}
  </div>
  <button type="button" class="od-gas-summary--chevron" aria-label={t('edit.gasOpen')}>
    <Icon name="chevron" />
  </button>
  <p class="od-gas-summary--helper">{t('edit.gasHelper')}</p>
</div>
{/if}

<style>
  @layer od.components {
    .od-gas-summary {
      position: relative;
      margin: 16px 16px 16px;
      padding: 16px 8px 12px;
      border-radius: 16px;
      background: var(--od-background);
      cursor: pointer;
    }

    /* The rebreather view is a button: it keeps the card's look. */
    .od-gas-summary--rebreather {
      display: block;
      width: calc(100% - 32px);
      border: none;
      color: var(--od-text);
      font: inherit;
      text-align: left;
    }

    /* As wide as the drawing, so that each column stays under its cylinder on a wide pane. */
    .od-gas-summary--drawing {
      max-width: 360px;
      margin: 0 auto;
      padding-right: 28px;
    }

    .od-gas-summary--columns {
      display: grid;
      column-gap: 4px;
      margin-top: 6px;
    }

    .od-gas-summary--column {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      text-align: center;
      min-width: 0;
    }

    .od-gas-summary--cylinders {
      display: flex;
      align-items: flex-end;
      gap: 4px;
      padding-right: 28px;
      min-height: 48px;
    }

    .od-gas-summary--cylinder {
      flex: 1;
      min-width: 0;
      padding: 4px 0;
      border: none;
      border-radius: 12px;
      background: none;
      color: var(--od-text);
      font: inherit;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      cursor: pointer;
    }

    .od-gas-summary--gas {
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
    }

    .od-gas-summary--pressure {
      font-size: 12px;
      color: var(--od-text-2);
      white-space: nowrap;
    }

    .od-gas-summary--none {
      padding: 8px;
      font-size: 14px;
      color: var(--od-text-2);
    }

    .od-gas-summary--chevron {
      position: absolute;
      right: 0;
      top: 50%;
      width: 48px;
      height: 48px;
      margin-top: -36px;
      padding: 0;
      border: none;
      background: none;
      color: var(--od-text);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .od-gas-summary--helper {
      margin: 10px 8px 0;
      font-size: 13px;
      color: var(--od-text-2);
    }
  }
</style>
