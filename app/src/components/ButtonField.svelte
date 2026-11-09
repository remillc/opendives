<script>
  // @ts-check
  import Icon from './Icon.svelte';
  import { ios } from '../lib/layout.svelte.js';
  // A value chosen in a dialog (date, time, site): drawn as the MD3 filled
  // field of SelectField, the label small above the value, a button that
  // opens the dialog. Without `onclick`, a read-only field (no arrow).

  /**
   * @type {{
   *   label: string,
   *   value: string,
   *   onclick?: () => void,
   *   supporting?: string,
   * }}
   */
  let { label, value, onclick, supporting = '' } = $props();
</script>

<div class="field">
  {#if onclick}
    <button type="button" class="box" {onclick}>
      <span class="label">{label}</span>
      <span class="value">{value}</span>
      <span class="arrow"><Icon name={ios ? 'expand' : 'chevron'} /></span>
    </button>
  {:else}
    <div class="box readonly">
      <span class="label">{label}</span>
      <span class="value">{value}</span>
    </div>
  {/if}
  {#if supporting}<p class="supporting">{supporting}</p>{/if}
</div>

<style>
  @layer od.components {
    .field {
      margin: 18px var(--od-field-margin, 16px) 0;
      min-width: 0;
    }

    .box {
      position: relative;
      display: block;
      width: 100%;
      height: 56px;
      box-sizing: border-box;
      padding: 24px var(--od-button-field-end, 48px) 6px 16px;
      border: none;
      border-radius: 4px 4px 0 0;
      background: var(--od-surface-2);
      color: var(--od-text);
      font: inherit;
      text-align: start;

      &::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 1px;
        background: var(--od-text-2);
      }

      &:focus-visible::after {
        height: 2px;
        background: var(--od-primary-action);
      }

      &.readonly {
        padding-right: 16px;
        color: var(--od-text-2);
      }

      :global(.ios) & {
        border-radius: 10px;
        background: var(--od-surface);

        &::after {
          display: none;
        }
      }
    }

    .label {
      position: absolute;
      left: 16px;
      top: 8px;
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);
    }

    .value {
      display: block;
      font-size: 16px;
      line-height: 24px;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* A compact field sets --od-button-field-arrow: none and a smaller --od-button-field-end. */
    .arrow {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      display: var(--od-button-field-arrow, flex);
      color: var(--od-text-2);
    }

    .supporting {
      margin: 4px 16px 0;
      font-size: 12px;
      line-height: 16px;
      letter-spacing: 0.4px;
      color: var(--od-text-2);
    }
  }
</style>
