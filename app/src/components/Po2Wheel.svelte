<script>
  // @ts-check
  // Maximum pO2 of the gas tools: an inline wheel from 1,0 to 1,6 bar by 0,1 on
  // a white surface, the label on the left, "bar" on the right (spec, section 1,
  // "Tools page and gas tools"; docs/mockups/outils-ead-mod-android.dc.html).
  import WheelPicker from './WheelPicker.svelte';
  import { formatNumber } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ value: number }} the pO2 in mbar */
  let { value = $bindable() } = $props();

  const values = Array.from({ length: 7 }, (_, i) => formatNumber(1 + i / 10, 1));
  // svelte-ignore state_referenced_locally
  let index = $state(Math.max(0, Math.min(6, Math.round((value - 1000) / 100))));
  $effect(() => {
    value = 1000 + index * 100;
  });
</script>

<div class="od-po2-wheel od-po2-wheel--po2">
  <span class="od-po2-wheel--texts">
    <span class="od-po2-wheel--title">{t('tools.maxPo2')}</span>
    <span class="od-po2-wheel--hint">{t('tools.wheelHint')}</span>
  </span>
  <WheelPicker inline label={t('tools.maxPo2')} {values} bind:index />
  <span class="od-po2-wheel--unit">{t('units.bar')}</span>
</div>

<style>
  @layer od.components {
    .od-po2-wheel--po2 {
      margin: 0 16px;
      padding: 0 16px;
      border-radius: 20px;
      background: var(--od-surface);
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .od-po2-wheel--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .od-po2-wheel--title {
      font-size: 16px;
      line-height: 24px;
    }

    .od-po2-wheel--hint {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-po2-wheel--unit {
      font-size: 16px;
      color: var(--od-text-2);
    }
  }
</style>
