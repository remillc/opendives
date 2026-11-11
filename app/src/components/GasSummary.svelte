<script>
  // @ts-check
  // The graphic summary of the "Gas" group of "Edit dive"
  // (docs/mockups/android-edition.dc.html): one drawn cylinder per cylinder with
  // its gas in plain words and its end pressure under it. A tap on a cylinder
  // opens that cylinder's sheet; a tap anywhere else, or on the chevron, opens
  // the Gas page with every cylinder and the gas changes.
  import Icon from './Icon.svelte';
  import CylinderDrawing from './CylinderDrawing.svelte';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   items: { key: number, n: number, gas: string, pressure: string, ratio: number }[],
   *   onopen: () => void,
   *   onedit: (key: number) => void,
   * }}
   * pressure: the end pressure as shown ("1 885 psi"), empty when unknown.
   */
  let { items, onopen, onedit } = $props();

  /** @param {MouseEvent} event */
  function click(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    const cylinder = target.closest('[data-key]');
    if (cylinder) onedit(Number(cylinder.getAttribute('data-key')));
    else onopen();
  }
</script>

<!-- A tap on the card opens the Gas page; each cylinder and the chevron are real buttons for the keyboard and TalkBack. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="od-gas-summary" onclick={click}>
  <div class="od-gas-summary--cylinders">
    {#each items as item (item.key)}
      <button type="button" class="od-gas-summary--cylinder" data-key={item.key} aria-label={t('edit.cylinderOpen', { n: item.n, gas: item.gas })}>
        <CylinderDrawing ratio={item.ratio} />
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

<style>
  @layer od.components {
    .od-gas-summary {
      position: relative;
      margin: 0 16px 16px;
      padding: 16px 8px 12px;
      border-radius: 16px;
      background: var(--od-background);
      cursor: pointer;
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
