<script>
  // @ts-check
  // One value chosen in a list, with the possibility to add one: MD3
  // editable exposed dropdown menu (the suit of a dive). A filled field with
  // a ▾ at the end; on focus, the values already in the logbook (the most
  // used first), filtered by what is typed, and "Add …" for a new one.
  import Icon from './Icon.svelte';
  import DropdownArrow from './DropdownArrow.svelte';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   label: string,
   *   value: string,
   *   options?: string[],
   *   supporting?: string,
   * }}
   */
  let { label, value = $bindable(), options = [], supporting = '' } = $props();

  let focused = $state(false);
  let open = $state(false);
  /** @type {HTMLInputElement|undefined} */
  let input = $state();
  const id = `od-combo-${Math.random().toString(36).slice(2, 9)}`;
  const floated = $derived(focused || value !== '');

  /** Lower case without accents, for matching ("Carrière" ~ "carriere"). @param {string} s */
  const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();

  /**
   * The values matching what is typed: those holding every typed word, in any
   * order, case and accents aside (a list of hundreds of sites is not read,
   * it is narrowed down); all of them when the field opens, until something
   * is typed (a typed name that is also a value still narrows the list).
   */
  let typed = $state(false);
  const proposals = $derived.by(() => {
    if (!open) return [];
    const words = typed ? fold(value.trim()).split(/\s+/).filter(Boolean) : [];
    // Each name once: several sites can share a name.
    return [...new Set(options)].filter((o) => o && words.every((w) => fold(o).includes(w))).slice(0, 50);
  });
  const isNew = $derived(open && value.trim() !== '' && !options.some((o) => fold(o) === fold(value.trim())));

  /** @param {string} choice */
  function choose(choice) {
    value = choice;
    open = false;
    input?.blur();
  }

  function onblur() {
    // Leave time for a tap on a proposal before closing the menu.
    setTimeout(() => {
      if (document.activeElement === input) return;
      value = value.trim();
      focused = false;
      open = false;
    }, 150);
  }

  /** @param {KeyboardEvent} e */
  function onkeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      choose(value.trim());
    } else if (e.key === 'Escape') {
      open = false;
    }
  }
</script>

<div class="od-combo-field od-combo-field--field" class:od-combo-field--focused={focused} class:od-combo-field--floated={floated} class:od-combo-field--menu-open={proposals.length || isNew}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="od-combo-field--box" onclick={() => input?.focus()}>
    <div class="od-combo-field--text">
      <label class="od-combo-field--label" for={id}>{label}</label>
      <input
        {id}
        bind:this={input}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        bind:value
        onfocus={() => {
          focused = true;
          open = true;
          typed = false;
          // The chosen value is selected: typing replaces it and filters the list.
          input?.select();
        }}
        oninput={() => {
          open = true;
          typed = true;
        }}
        {onblur}
        {onkeydown}
        autocomplete="off"
        enterkeyhint="done"
      />
    </div>
    <span class="od-combo-field--arrow" class:od-combo-field--up={open}><DropdownArrow /></span>
  </div>
  {#if proposals.length || isNew}
    <ul class="od-combo-field--menu" role="listbox" aria-label={label}>
      {#each proposals as o (o)}
        <li>
          <button type="button" role="option" aria-selected={o === value} onmousedown={(e) => e.preventDefault()} onclick={() => choose(o)}>
            {o}
            {#if o === value}<Icon name="check" size={20} />{/if}
          </button>
        </li>
      {/each}
      {#if isNew}
        <li><button type="button" class="od-combo-field--new" onmousedown={(e) => e.preventDefault()} onclick={() => choose(value.trim())}>{t('chips.add', { value: value.trim() })}</button></li>
      {/if}
    </ul>
  {/if}
  {#if supporting}<p class="od-combo-field--supporting">{supporting}</p>{/if}
</div>

<style>
  @layer od.components {
    .od-combo-field--field {
      position: relative;
      margin: 18px var(--od-field-margin, 16px) 0;

      /* The open menu passes over what follows. */
      &.od-combo-field--menu-open {
        z-index: 30;
      }
    }

    /* Framework7 gives each list its own stacking level: the list holding an
       open menu comes to the front, above the next cards. */
    :global(:is(.list, .od-form-surface):has(.od-combo-field--menu-open)) {
      position: relative;
      z-index: 30;
    }

    .od-combo-field--box {
      position: relative;
      min-height: 56px;
      padding: 8px 12px 8px 16px;
      box-sizing: border-box;
      border-radius: 4px 4px 0 0;
      background: var(--od-surface-2);
      display: flex;
      align-items: center;
      gap: 8px;
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

      .od-combo-field--focused &::after {
        height: 2px;
        background: var(--od-primary-action);
      }
    }

    .od-combo-field--text {
      position: relative;
      flex: 1;
      min-width: 0;
      padding-top: 16px;
    }

    .od-combo-field--label {
      position: absolute;
      left: 0;
      top: 8px;
      font-size: 16px;
      line-height: 24px;
      color: var(--od-text-2);
      pointer-events: none;
      transition:
        top 150ms,
        font-size 150ms,
        line-height 150ms;

      .od-combo-field--floated & {
        top: 0;
        font-size: 12px;
        line-height: 16px;
      }

      .od-combo-field--focused & {
        color: var(--od-primary-action);
      }
    }

    input {
      display: block;
      width: 100%;
      height: 24px;
      padding: 0;
      border: none;
      outline: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-size: 16px;
      line-height: 24px;
    }

    .od-combo-field--arrow {
      flex: none;
      display: flex;
      color: var(--od-text-2);
      transition: transform 150ms;

      &.od-combo-field--up {
        transform: rotate(180deg);
      }
    }

    .od-combo-field--menu {
      position: absolute;
      left: 0;
      right: 0;
      z-index: 20;
      margin: 0;
      padding: 8px 0;
      list-style: none;
      /* About five and a half rows, the rest scrolls. */
      max-height: 280px;
      overflow-y: auto;
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
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .od-combo-field--new {
        color: var(--od-text-2);
      }
    }

    .od-combo-field--supporting {
      margin: 4px 0 0;
      padding-left: 16px;
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);
    }
  }
</style>
