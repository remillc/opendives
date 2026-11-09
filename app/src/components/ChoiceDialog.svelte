<script>
  // @ts-check
  // Single-choice dialog of Material 3 (spec, section 4, "Settings: what each
  // row does"; docs/mockups/reglages-choix-android.dc.html): a radio button at
  // the start of each 56 dp row, the label, then its example in secondary text
  // at the end of the row; only the radio button shows the selection (no tint,
  // no bold). "Cancel" and "OK" at the bottom right; OK applies the choice.
  import Md3Dialog from './Md3Dialog.svelte';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   title: string,
   *   options: { value: string, label: string, example?: string }[],
   *   value: string,
   *   onselect: (value: string) => void,
   *   oncancel: () => void,
   *   note?: string,
   * }}
   */
  let { title, options, value, onselect, oncancel, note = '' } = $props();

  // svelte-ignore state_referenced_locally
  let selected = $state(value);
  const name = `od-choice-${Math.random().toString(36).slice(2, 9)}`;
</script>

<Md3Dialog {title} {oncancel}>
  <div class="choices" role="radiogroup" aria-label={title}>
    {#each options as option (option.value)}
      <label class="choice">
        <input type="radio" {name} value={option.value} bind:group={selected} />
        <span class="radio" aria-hidden="true"></span>
        <span class="label">{option.label}</span>
        {#if option.example}<span class="example">{option.example}</span>{/if}
      </label>
    {/each}
  </div>
  {#if note}<p class="note">{note}</p>{/if}
  {#snippet actions()}
    <button type="button" onclick={oncancel}>{t('dialog.cancel')}</button>
    <button type="button" onclick={() => onselect(selected)}>{t('dialog.ok')}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer od.components {
    .choices {
      display: flex;
      flex-direction: column;
    }

    .note {
      margin: 8px 24px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .choice {
      position: relative;
      min-height: 56px;
      padding: 0 24px;
      display: flex;
      align-items: center;
      gap: 16px;
      cursor: pointer;
    }

    input {
      position: absolute;
      opacity: 0;
      width: 1px;
      height: 1px;
    }

    .radio {
      flex: none;
      box-sizing: border-box;
      width: 20px;
      height: 20px;
      border: 2px solid var(--od-text-2);
      border-radius: 10px;
      position: relative;
    }

    input:checked + .radio {
      border-color: var(--od-action);

      &::after {
        content: '';
        position: absolute;
        left: 3px;
        top: 3px;
        width: 10px;
        height: 10px;
        border-radius: 5px;
        background: var(--od-action);
      }
    }

    input:focus-visible + .radio {
      outline: 2px solid var(--od-action);
      outline-offset: 6px;
    }

    .label {
      flex: 1;
      min-width: 0;
      font-size: 16px;
      font-variant-numeric: tabular-nums;
    }

    .example {
      flex: none;
      font-size: 14px;
      color: var(--od-text-2);
      font-variant-numeric: tabular-nums;
    }
  }
</style>
