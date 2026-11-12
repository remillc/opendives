<script>
  // @ts-check
  import { onMount, tick } from 'svelte';
  import Icon from './Icon.svelte';
  import { ios } from '../lib/layout.svelte.js';
  import { moveActive } from '../lib/select-menu.js';
  import { menuHeight, placeRowMenu } from '../lib/row-menu.js';
  // Menu on a Settings row (docs/system-design.md, section 8, "Settings choice menu";
  // docs/mockups/reglages-choix-android.dc.html): one value chosen in a short list.
  // Anchored to the touched row, which takes the selected tint while the menu is open.
  // No title, no intro, no Annuler/OK: a tap picks and closes, a tap outside, Escape or
  // the system Back key (lib/back-button.js sends "od-cancel") closes without change.
  // The menu is drawn in the page's root (position: fixed), so no card clips it.
  // iOS: same anchored menu in the look of a UIMenu (13 px corners, check at the start).

  /**
   * @type {{
   *   anchor: HTMLElement,
   *   label: string,
   *   options: { value: string, label: string, example?: string }[],
   *   value: string,
   *   onselect: (value: string) => void,
   *   onclose: () => void,
   * }}
   * anchor: the row that opened the menu. label: its accessible name (the row's label).
   */
  let { anchor, label, options, value, onselect, onclose } = $props();

  // svelte-ignore state_referenced_locally
  let place = $state(placeRowMenu(anchor.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, menuHeight(options)));
  // svelte-ignore state_referenced_locally
  let active = $state(Math.max(0, options.findIndex((o) => o.value === value)));
  /** @type {HTMLDivElement|undefined} */
  let menu = $state();
  const id = `od-row-menu-${Math.random().toString(36).slice(2, 9)}`;
  let closed = false;

  function position() {
    const height = menu?.scrollHeight ?? menuHeight(options);
    place = placeRowMenu(anchor.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, height);
  }

  /** The menu lives in the page's root. @param {HTMLElement} node */
  function portal(node) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  /** @param {boolean} [refocus] */
  function close(refocus = true) {
    if (closed) return;
    closed = true;
    onclose();
    if (refocus) anchor.focus();
  }

  /** @param {string} chosen */
  function pick(chosen) {
    if (closed) return;
    closed = true;
    // The choice is applied first: the page forgets the row when the menu closes.
    if (chosen !== value) onselect(chosen);
    onclose();
    anchor.focus();
  }

  function focusActive() {
    /** @type {HTMLElement|null|undefined} */ (menu?.querySelector(`#${id}-o${active}`))?.focus();
  }

  /** @param {KeyboardEvent} e */
  function keydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      close(false);
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      active = moveActive(active, e.key, options.length);
      focusActive();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (active >= 0) pick(options[active].value);
    }
  }

  onMount(() => {
    anchor.classList.add('od-row-menu--anchored');
    anchor.setAttribute('aria-expanded', 'true');
    tick().then(() => {
      position();
      focusActive();
    });
    const cancel = () => close();
    const el = menu;
    el?.addEventListener('od-cancel', cancel);
    const moved = () => position();
    window.addEventListener('resize', moved);
    return () => {
      anchor.classList.remove('od-row-menu--anchored');
      anchor.removeAttribute('aria-expanded');
      el?.removeEventListener('od-cancel', cancel);
      window.removeEventListener('resize', moved);
    };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="od-row-menu--scrim" use:portal onpointerdown={() => close()}></div>
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="od-row-menu"
  class:od-row-menu--ios={ios}
  class:od-row-menu--up={place.up}
  use:portal
  bind:this={menu}
  onkeydown={keydown}
  style:left="{place.left}px"
  style:width="{place.width}px"
  style:top={place.top === undefined ? 'auto' : place.top + 'px'}
  style:bottom={place.bottom === undefined ? 'auto' : place.bottom + 'px'}
  style:max-height="{place.maxHeight}px"
>
  <ul class="od-row-menu--options" role="listbox" aria-label={label}>
    {#each options as option, i (option.value)}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <li
        id="{id}-o{i}"
        role="option"
        tabindex={i === active ? 0 : -1}
        aria-selected={option.value === value}
        class="od-row-menu--option"
        class:od-row-menu--help={!!option.example}
        class:od-row-menu--selected={option.value === value}
        onclick={() => pick(option.value)}
      >
        {#if ios}<span class="od-row-menu--check">{#if option.value === value}<Icon name="check" size={18} />{/if}</span>{/if}
        <span class="od-row-menu--texts">
          <span class="od-row-menu--label">{option.label}</span>
          {#if option.example}<span class="od-row-menu--example">{option.example}</span>{/if}
        </span>
        {#if !ios && option.value === value}<span class="od-row-menu--check"><Icon name="check" size={24} /></span>{/if}
      </li>
    {/each}
  </ul>
</div>

<style>
  @layer od.components {
    /* The touched row while its menu is open: selected tint, 12 dp corners. */
    :global(.od-row-menu--anchored) {
      background: var(--od-surface-container-highest) !important;
      border-radius: 12px !important;
    }

    .od-row-menu--scrim {
      position: fixed;
      inset: 0;
      /* Under the menu, above the dialogs (13500). */
      z-index: 13990;
      background: transparent;
    }

    /* 16 dp corners, surface #F4F4F2 (the page background), elevation level 2. */
    .od-row-menu {
      position: fixed;
      z-index: 14000;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      border-radius: 16px;
      background: var(--od-background);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 2px 6px 2px rgba(0, 0, 0, 0.15);
      overflow: hidden;

      :global(html.dark) & {
        background: var(--od-surface-container-highest);
      }
    }

    .od-row-menu--options {
      margin: 0;
      padding: 8px 0;
      list-style: none;
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    .od-row-menu--option {
      min-height: 48px;
      padding: 0 16px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--od-text);
      cursor: pointer;
      outline: none;

      &.od-row-menu--help {
        min-height: 56px;
      }

      &:focus-visible {
        outline: 2px solid var(--od-text);
        outline-offset: -2px;
        border-radius: 8px;
      }

      &.od-row-menu--selected {
        background: var(--od-surface-container-highest);

        :global(html.dark) & {
          background: var(--od-surface-2);
        }
      }
    }

    .od-row-menu--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .od-row-menu--label {
      font-size: 16px;
      line-height: 24px;
      font-variant-numeric: tabular-nums;
    }

    .od-row-menu--selected .od-row-menu--label {
      font-weight: 600;
    }

    .od-row-menu--example {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
      font-variant-numeric: tabular-nums;
    }

    .od-row-menu--check {
      flex: none;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    /* iOS: the look of a UIMenu, check at the start, no tint on the current value. */
    .od-row-menu--ios {
      border-radius: 13px;
      background: var(--od-surface);

      .od-row-menu--options {
        padding: 0;
      }

      .od-row-menu--option {
        min-height: 44px;
        gap: 8px;
        padding: 0 14px 0 10px;
        border-bottom: 0.5px solid var(--od-separator);

        &:last-child {
          border-bottom: none;
        }

        &.od-row-menu--help {
          min-height: 52px;
        }

        &.od-row-menu--selected {
          background: none;
        }
      }

      .od-row-menu--check {
        width: 20px;
      }

      .od-row-menu--selected .od-row-menu--label {
        font-weight: 400;
      }
    }
  }
</style>
