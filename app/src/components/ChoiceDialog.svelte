<script>
  // @ts-check
  // Single-choice dialog of Material 3 (spec, section 4, "Settings: what each
  // row does"; docs/mockups/reglages-choix-android.dc.html): 56 dp rows, a
  // check at the start of the chosen one on the selected tint (no radio button,
  // see ChoiceRow), the label, then its example in secondary text at the end of
  // the row. "Cancel" and "OK" at the bottom right; OK applies the choice.
  import Md3Dialog from './Md3Dialog.svelte';
  import ChoiceRow from './ChoiceRow.svelte';
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

<Md3Dialog class="od-choice-dialog" {title} {oncancel}>
  <div class="od-choice-dialog--choices" role="radiogroup" aria-label={title}>
    {#each options as option (option.value)}
      <ChoiceRow class="od-choice-dialog--choice" {name} selected={selected === option.value} onselect={() => (selected = option.value)}>
        <span class="od-choice-dialog--label">{option.label}</span>
        {#if option.example}<span class="od-choice-dialog--example">{option.example}</span>{/if}
      </ChoiceRow>
    {/each}
  </div>
  {#if note}<p class="od-choice-dialog--note">{note}</p>{/if}
  {#snippet actions()}
    <button type="button" onclick={oncancel}>{t('dialog.cancel')}</button>
    <button type="button" onclick={() => onselect(selected)}>{t('dialog.ok')}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer od.components {
    .od-choice-dialog--choices {
      display: flex;
      flex-direction: column;
      padding: 0 12px;
    }

    .od-choice-dialog--note {
      margin: 8px 24px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    :global(.od-choice-dialog--choice) {
      min-height: 56px;
      padding: 0 12px;
    }

    .od-choice-dialog--label {
      flex: 1;
      min-width: 0;
      font-size: 16px;
      font-variant-numeric: tabular-nums;
    }

    .od-choice-dialog--example {
      flex: none;
      font-size: 14px;
      color: var(--od-text-2);
      font-variant-numeric: tabular-nums;
    }
  }
</style>
