<script>
  // @ts-check
  // People and tags field (spec, section 4, "People and tags in dive
  // editing"; docs/mockups/android-edition.dc.html): an MD3 filled field
  // whose values are input chips (32 dp, 8 dp corners, outlined, with a
  // remove ×). Typing proposes the values already in the logbook, or adds a
  // new one with Enter or a comma. Several values are allowed.
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   label: string,
   *   values: string[],
   *   suggestions?: string[],
   *   supporting?: string,
   * }}
   */
  let { label, values = $bindable(), suggestions = [], supporting = '' } = $props();

  let typed = $state('');
  let focused = $state(false);
  /** @type {HTMLInputElement|undefined} */
  let input = $state();
  const id = `od-chips-${Math.random().toString(36).slice(2, 9)}`;
  const floated = $derived(focused || values.length > 0 || typed !== '');

  /** The logbook's values that match what is typed, not chosen yet. */
  const proposals = $derived.by(() => {
    const q = typed.trim().toLocaleLowerCase();
    if (!focused) return [];
    const chosen = new Set(values.map((v) => v.toLocaleLowerCase()));
    return suggestions
      .filter((s) => s && !chosen.has(s.toLocaleLowerCase()) && (!q || s.toLocaleLowerCase().includes(q)))
      .slice(0, 6);
  });
  const isNew = $derived(
    typed.trim() !== '' && !suggestions.some((s) => s.toLocaleLowerCase() === typed.trim().toLocaleLowerCase()),
  );

  /** @param {string} value */
  function add(value) {
    const v = value.trim();
    if (v && !values.some((x) => x.toLocaleLowerCase() === v.toLocaleLowerCase())) values = [...values, v];
    typed = '';
    input?.focus();
  }

  /** @param {number} index */
  function remove(index) {
    values = values.filter((_, i) => i !== index);
    input?.focus();
  }

  /** @param {KeyboardEvent} e */
  function onkeydown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (typed.trim()) add(typed);
    } else if (e.key === 'Backspace' && typed === '' && values.length) {
      remove(values.length - 1);
    }
  }

  /** A comma typed or pasted adds the values before it. */
  function oninput() {
    if (!typed.includes(',')) return;
    const parts = typed.split(',');
    typed = parts.pop() ?? '';
    for (const p of parts) add(p);
  }

  function onblur() {
    // Leave time for a tap on a proposal before closing the list.
    setTimeout(() => {
      if (document.activeElement === input) return;
      if (typed.trim()) add(typed);
      focused = false;
    }, 150);
  }
</script>

<div class="od-chips-field od-chips-field--field" class:od-chips-field--focused={focused} class:od-chips-field--floated={floated} class:od-chips-field--menu-open={proposals.length || isNew}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="od-chips-field--box" onclick={() => input?.focus()}>
    <label class="od-chips-field--label" for={id}>{label}</label>
    <div class="od-chips-field--chips">
      {#each values as value, i (value)}
        <span class="chip od-chips-field--chip">
          {value}
          <button type="button" class="od-chips-field--remove" onclick={(e) => { e.stopPropagation(); remove(i); }}>
            <Icon name="close" size={18} weight={2} />
            <span class="od-sr-only">{t('chips.remove', { value })}</span>
          </button>
        </span>
      {/each}
      <input
        {id}
        bind:this={input}
        type="text"
        bind:value={typed}
        {onkeydown}
        {oninput}
        onfocus={() => (focused = true)}
        {onblur}
        autocomplete="off"
        enterkeyhint="done"
      />
    </div>
  </div>
  {#if proposals.length || isNew}
    <ul class="od-chips-field--proposals" role="listbox" aria-label={label}>
      {#each proposals as p (p)}
        <li><button type="button" onmousedown={(e) => e.preventDefault()} onclick={() => add(p)}>{p}</button></li>
      {/each}
      {#if isNew}
        <li><button type="button" class="od-chips-field--new" onmousedown={(e) => e.preventDefault()} onclick={() => add(typed)}>{t('chips.add', { value: typed.trim() })}</button></li>
      {/if}
    </ul>
  {/if}
  {#if supporting}<p class="od-chips-field--supporting">{supporting}</p>{/if}
</div>

<style>
  @layer od.components {
    .od-chips-field--field {
      position: relative;
      margin: 18px var(--od-field-margin, 16px) 0;

      /* The open menu passes over what follows. */
      &.od-chips-field--menu-open {
        z-index: 30;
      }
    }

    /* Framework7 gives each list its own stacking level: the list holding an
       open menu comes to the front, above the next cards. */
    :global(:is(.list, .od-form-surface):has(.od-chips-field--menu-open)) {
      position: relative;
      z-index: 30;
    }

    .od-chips-field--box {
      position: relative;
      min-height: 56px;
      padding: 8px 12px 8px 16px;
      box-sizing: border-box;
      border-radius: 4px 4px 0 0;
      background: var(--od-surface-2);
      cursor: text;

      &::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 1px;
        background: var(--od-text-2);
      }

      .od-chips-field--focused &::after {
        height: 2px;
        background: var(--od-primary-action);
      }
    }

    .od-chips-field--label {
      display: block;
      font-size: 16px;
      line-height: 24px;
      color: var(--od-text-2);
      transform: translateY(8px);
      transition:
        transform 150ms,
        font-size 150ms,
        line-height 150ms;
      pointer-events: none;

      .od-chips-field--floated & {
        transform: none;
        font-size: 12px;
        line-height: 16px;
      }

      .od-chips-field--focused & {
        color: var(--od-primary-action);
      }
    }

    .od-chips-field--chips {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      padding: 4px 0 0;

      /* At rest and empty, the label sits on the input line. */
      .od-chips-field--field:not(.od-chips-field--floated) & {
        margin-top: -24px;
      }
    }

    /* MD3 input chip: 32 dp, 8 dp corners, outlined, with a remove ×. */
    .od-chips-field--chip {
      height: 32px;
      padding: 0 4px 0 12px;
      box-sizing: border-box;
      border: 1px solid var(--od-text-2);
      border-radius: 8px;
      background: var(--od-surface);
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 14px;
      font-weight: 500;
      color: var(--od-text);
    }

    .od-chips-field--remove {
      position: relative;
      width: 24px;
      height: 24px;
      padding: 0;
      border: none;
      background: none;
      color: var(--od-text);
      display: flex;
      align-items: center;
      justify-content: center;

      /* 48 dp touch target around the 24 dp button. */
      &::before {
        content: '';
        position: absolute;
        inset: -12px;
      }
    }

    input {
      flex: 1;
      min-width: 96px;
      height: 32px;
      padding: 0;
      border: none;
      outline: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-size: 16px;
    }

    .od-chips-field--proposals {
      position: absolute;
      left: 0;
      right: 0;
      z-index: 20;
      margin: 0;
      padding: 8px 0;
      list-style: none;
      border-radius: 4px;
      background: var(--od-surface);
      box-shadow: 0 2px 6px rgb(0 0 0 / 0.2);

      button {
        width: 100%;
        min-height: 48px;
        padding: 0 16px;
        border: none;
        background: none;
        color: var(--od-text);
        font: inherit;
        font-size: 16px;
        text-align: start;
      }

      .od-chips-field--new {
        color: var(--od-text-2);
      }
    }

    .od-chips-field--supporting {
      margin: 4px 0 0;
      padding-left: 16px;
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);
    }
  }
</style>
