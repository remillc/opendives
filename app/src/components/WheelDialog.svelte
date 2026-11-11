<script>
  // @ts-check
  // Number dialog of Settings (spec, section 4; docs/mockups/
  // reglages-nombre-android.dc.html): one wheel picker per value with its
  // default under it, then "Default values", "Cancel" and "OK".
  import Md3Dialog from './Md3Dialog.svelte';
  import WheelPicker from './WheelPicker.svelte';
  import SelectField from './SelectField.svelte';
  import { t } from '../lib/i18n.js';

  /** @typedef {{ label: string, values: string[], index: number, defaultIndex: number }} Wheel */

  /**
   * @type {{
   *   title: string,
   *   text?: string,
   *   wheels: Wheel[],
   *   onconfirm: (indexes: number[]) => void,
   *   oncancel: () => void,
   *   dropdowns?: boolean,
   * }}
   * dropdowns: each value is an exposed dropdown menu (Android, spec section 8)
   * instead of a wheel, side by side, with its default under it.
   */
  let { title, text = '', wheels, onconfirm, oncancel, dropdowns = false } = $props();

  // svelte-ignore state_referenced_locally
  let indexes = $state(wheels.map((w) => w.index));
</script>

<Md3Dialog class="od-wheel-dialog{dropdowns ? ' od-wheel-dialog--dropdowns' : ''}" {title} {text} {oncancel}>
  <div class="od-wheel-dialog--wheels">
    {#each wheels as wheel, i (i)}
      {#if dropdowns}
        <div class="od-wheel-dialog--dropdown">
          <SelectField
            label={wheel.label}
            value={String(indexes[i])}
            options={wheel.values.map((v, n) => ({ value: String(n), label: v }))}
            onchange={(v) => (indexes[i] = Number(v))}
            supporting={t('settings.defaultValue', { value: wheel.values[wheel.defaultIndex] })}
          />
        </div>
      {:else}
        <WheelPicker
          label={wheel.label}
          values={wheel.values}
          bind:index={indexes[i]}
          defaultText={t('settings.defaultValue', { value: wheel.values[wheel.defaultIndex] })}
        />
      {/if}
    {/each}
  </div>
  {#snippet actions()}
    <button type="button" class="od-md3-dialog--start" onclick={() => (indexes = wheels.map((w) => w.defaultIndex))}>
      {t('settings.defaults')}
    </button>
    <button type="button" onclick={oncancel}>{t('dialog.cancel')}</button>
    <button type="button" onclick={() => onconfirm(indexes)}>{t('dialog.ok')}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer od.components {
    .od-wheel-dialog--wheels {
      padding: 0 24px;
      display: flex;
      gap: 16px;
    }

    .od-wheel-dialog--dropdown {
      flex: 1;
      min-width: 0;
      --od-field-margin: 0px;
    }

  }
</style>
