<script>
  // @ts-check
  // Number dialog of Settings (spec, section 4; docs/mockups/
  // reglages-nombre-android.dc.html): one wheel picker per value with its
  // default under it, then "Default values", "Cancel" and "OK".
  import Md3Dialog from './Md3Dialog.svelte';
  import WheelPicker from './WheelPicker.svelte';
  import { t } from '../lib/i18n.js';

  /** @typedef {{ label: string, values: string[], index: number, defaultIndex: number }} Wheel */

  /**
   * @type {{
   *   title: string,
   *   text?: string,
   *   wheels: Wheel[],
   *   onconfirm: (indexes: number[]) => void,
   *   oncancel: () => void,
   * }}
   */
  let { title, text = '', wheels, onconfirm, oncancel } = $props();

  // svelte-ignore state_referenced_locally
  let indexes = $state(wheels.map((w) => w.index));
</script>

<Md3Dialog {title} {text} {oncancel}>
  <div class="wheels">
    {#each wheels as wheel, i (i)}
      <WheelPicker
        label={wheel.label}
        values={wheel.values}
        bind:index={indexes[i]}
        defaultText={t('settings.defaultValue', { value: wheel.values[wheel.defaultIndex] })}
      />
    {/each}
  </div>
  {#snippet actions()}
    <button type="button" class="start" onclick={() => (indexes = wheels.map((w) => w.defaultIndex))}>
      {t('settings.defaults')}
    </button>
    <button type="button" onclick={oncancel}>{t('dialog.cancel')}</button>
    <button type="button" onclick={() => onconfirm(indexes)}>{t('dialog.ok')}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer od.components {
    .wheels {
      padding: 0 24px;
      display: flex;
      gap: 16px;
    }
  }
</style>
