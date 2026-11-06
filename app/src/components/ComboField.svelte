<script>
  // @ts-check
  // One value chosen in a list, with the possibility to add one: MD3
  // editable exposed dropdown menu (the suit of a dive). A filled field with
  // a ▾ at the end; on focus, the values already in the logbook (the most
  // used first), filtered by what is typed, and "Add …" for a new one.
  import Icon from './Icon.svelte';
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

  /** The values matching what is typed; all of them while it is the chosen value. */
  const proposals = $derived.by(() => {
    if (!open) return [];
    const q = value.trim().toLocaleLowerCase();
    const exact = options.some((o) => o.toLocaleLowerCase() === q);
    return options.filter((o) => o && (exact || !q || o.toLocaleLowerCase().includes(q))).slice(0, 8);
  });
  const isNew = $derived(open && value.trim() !== '' && !options.some((o) => o.toLocaleLowerCase() === value.trim().toLocaleLowerCase()));

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

<div class="field" class:focused class:floated class:menu-open={proposals.length || isNew}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="box" onclick={() => input?.focus()}>
    <div class="text">
      <label class="label" for={id}>{label}</label>
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
        }}
        oninput={() => (open = true)}
        {onblur}
        {onkeydown}
        autocomplete="off"
        enterkeyhint="done"
      />
    </div>
    <span class="arrow" class:up={open}><Icon name="expand" /></span>
  </div>
  {#if proposals.length || isNew}
    <ul class="menu" role="listbox" aria-label={label}>
      {#each proposals as o (o)}
        <li>
          <button type="button" role="option" aria-selected={o === value} onmousedown={(e) => e.preventDefault()} onclick={() => choose(o)}>
            {o}
            {#if o === value}<Icon name="check" size={20} />{/if}
          </button>
        </li>
      {/each}
      {#if isNew}
        <li><button type="button" class="new" onmousedown={(e) => e.preventDefault()} onclick={() => choose(value.trim())}>{t('chips.add', { value: value.trim() })}</button></li>
      {/if}
    </ul>
  {/if}
  {#if supporting}<p class="supporting">{supporting}</p>{/if}
</div>

<style>
  @layer od.components {
    .field {
      position: relative;
      margin: 18px var(--od-field-margin, 16px) 0;

      /* The open menu passes over what follows. */
      &.menu-open {
        z-index: 30;
      }
    }

    /* Framework7 gives each list its own stacking level: the list holding an
       open menu comes to the front, above the next cards. */
    :global(:is(.list, .od-form-surface):has(.menu-open)) {
      position: relative;
      z-index: 30;
    }

    .box {
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

      .focused &::after {
        height: 2px;
        background: var(--od-primary-action);
      }
    }

    .text {
      position: relative;
      flex: 1;
      min-width: 0;
      padding-top: 16px;
    }

    .label {
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

      .floated & {
        top: 0;
        font-size: 12px;
        line-height: 16px;
      }

      .focused & {
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

    .arrow {
      flex: none;
      display: flex;
      color: var(--od-text-2);
      transition: transform 150ms;

      &.up {
        transform: rotate(180deg);
      }
    }

    .menu {
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
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .new {
        color: var(--od-text-2);
      }
    }

    .supporting {
      margin: 4px 0 0;
      padding-left: 16px;
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);
    }
  }
</style>
