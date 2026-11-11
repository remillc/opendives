<script>
  // @ts-check
  import { tick } from 'svelte';
  import SelectField from './SelectField.svelte';
  import TextField from './TextField.svelte';
  import Icon from './Icon.svelte';
  import { choiceValues, parseNumber } from '../lib/planner-rules.js';
  import { formatNumber } from '../lib/format.js';
  // A number chosen in a short list of usual values, or typed: an MD3 exposed
  // dropdown (<SelectField>) whose last choice, "Other value…", turns the same
  // field into a text field with the numeric keyboard, focused. The value is
  // kept as the text the page validates (`value`, `oninput`). Leaving the text
  // field with a valid value, Enter, or the button at its end goes back to the
  // menu; an invalid value stays in the text field with its error until it is
  // corrected or until the button (or Escape) brings back the last valid one
  // (`onrevert`). A value outside the usual ones shows in the field and heads
  // the list, checked.

  /**
   * @type {{
   *   label: string,
   *   value: string,
   *   presets: number[],
   *   unit: string,
   *   otherLabel?: string,
   *   backLabel: string,
   *   ariaLabel: string,
   *   invalid?: boolean,
   *   oninput: () => void,
   *   onrevert: () => void,
   * }}
   * unit: shown after the number ("%", "ft"). otherLabel: the "Other value…"
   * choice; without it the list holds every value and nothing is typed. ariaLabel: the accessible name of
   * the menu, with the value. backLabel: the accessible name of the button that
   * goes back to the menu.
   */
  let { label, value = $bindable(), presets, unit, otherLabel = '', backLabel, ariaLabel, invalid = false, oninput, onrevert } = $props();

  const OTHER = 'other';
  let editing = $state(false);
  /** The menu's own choice: the value, or OTHER for an instant. */
  let choice = $state('');
  /** @type {HTMLDivElement|undefined} */
  let root = $state();

  const current = $derived(parseNumber(value));
  const numbers = $derived(choiceValues(presets, current));
  const options = $derived([
    ...numbers.map((n) => ({ value: String(n), label: `${formatNumber(n)} ${unit}` })),
    ...(value !== '' && !Number.isFinite(current) ? [{ value, label: value }] : []),
    ...(otherLabel ? [{ value: OTHER, label: otherLabel }] : []),
  ]);
  $effect(() => {
    choice = Number.isFinite(current) ? String(current) : value;
  });

  /** @param {string} chosen */
  async function picked(chosen) {
    if (chosen === OTHER) {
      choice = Number.isFinite(current) ? String(current) : value;
      editing = true;
      await tick();
      const input = root?.querySelector('input');
      input?.focus();
      input?.select();
      return;
    }
    value = chosen;
    oninput();
  }

  function back() {
    editing = false;
  }

  function revert() {
    onrevert();
    editing = false;
  }

  /** Focus left the text field and its button: back to the menu when the value is good. @param {FocusEvent} e */
  function leave(e) {
    if (root?.contains(/** @type {Node|null} */ (e.relatedTarget))) return;
    if (!invalid) back();
  }

  /** @param {KeyboardEvent} e */
  function keydown(e) {
    if (e.key === 'Enter' && !invalid) {
      e.preventDefault();
      back();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      revert();
    }
  }
</script>

{#if editing}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="od-choice-field od-choice-field--field" bind:this={root} onfocusout={leave} onkeydown={keydown}>
    <TextField {label} bind:value inputmode="numeric" {invalid} {oninput} keepTrailing>
      {#snippet trailing()}
        <span class="od-choice-field--trailing">
          <span class="od-choice-field--unit">{unit}</span>
          <button type="button" class="od-choice-field--back" aria-label={backLabel} onclick={revert}><Icon name="expand" /></button>
        </span>
      {/snippet}
    </TextField>
  </div>
{:else}
  <SelectField {label} bind:value={choice} {options} {ariaLabel} {invalid} onchange={picked} />
{/if}

<style>
  @layer od.components {
    .od-choice-field--field {
      min-width: 0;
    }

    .od-choice-field--trailing {
      display: flex;
      align-items: center;
    }

    .od-choice-field--unit {
      padding-inline-end: 4px;
      font-size: 14px;
      color: var(--od-text-2);
    }

    .od-choice-field--back {
      width: 40px;
      height: 40px;
      flex: none;
      padding: 0;
      border: none;
      border-radius: 20px;
      background: none;
      color: var(--od-text-2);
      display: flex;
      align-items: center;
      justify-content: center;
    }
  }
</style>
