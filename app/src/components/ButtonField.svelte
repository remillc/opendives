<script>
  // @ts-check
  import Icon from './Icon.svelte';
  import { ios } from '../lib/layout.svelte.js';
  // A value chosen in a dialog (date, time, site): drawn as the MD3 filled
  // field of SelectField, the label small above the value, a button that
  // opens the dialog. Without `onclick`, a read-only field (no arrow). A date field
  // ends with a calendar icon and a time field with a clock icon (Android, spec section 8),
  // never a chevron.

  /**
   * @type {{
   *   label: string,
   *   value: string,
   *   onclick?: () => void,
   *   supporting?: string,
   *   icon?: 'calendar'|'clock',
   * }}
   * icon: the trailing icon of a date or a time field (24 dp).
   */
  let { label, value, onclick, supporting = '', icon } = $props();
</script>

<div class="od-button-field od-button-field--field">
  {#if onclick}
    <button type="button" class="od-button-field--box" {onclick}>
      <span class="od-button-field--label">{label}</span>
      <span class="od-button-field--value">{value}</span>
      <span class="od-button-field--arrow"><Icon name={icon && !ios ? icon : ios ? 'expand' : 'chevron'} /></span>
    </button>
  {:else}
    <div class="od-button-field--box od-button-field--readonly">
      <span class="od-button-field--label">{label}</span>
      <span class="od-button-field--value">{value}</span>
    </div>
  {/if}
  {#if supporting}<p class="od-button-field--supporting">{supporting}</p>{/if}
</div>

<style>
  @layer od.components {
    .od-button-field--field {
      margin: 18px var(--od-field-margin, 16px) 0;
      min-width: 0;
    }

    .od-button-field--box {
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

      &.od-button-field--readonly {
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

    .od-button-field--label {
      position: absolute;
      left: 16px;
      top: 8px;
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);
    }

    .od-button-field--value {
      display: block;
      font-size: 16px;
      line-height: 24px;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* A compact field sets --od-button-field-arrow: none and a smaller --od-button-field-end. */
    .od-button-field--arrow {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      display: var(--od-button-field-arrow, flex);
      color: var(--od-text-2);
    }

    .od-button-field--supporting {
      margin: 4px 16px 0;
      font-size: 12px;
      line-height: 16px;
      letter-spacing: 0.4px;
      color: var(--od-text-2);
    }
  }
</style>
