<script>
  // @ts-check
  // Material 3 Expressive FAB menu (spec, section 8, "FAB menu (Android
  // tablet)"): the Logbook's "+" on an Android tablet. The button becomes a ✕,
  // the choices unfold above it as 56 dp pills, a light scrim covers the screen.
  // Sizes follow the Material library's FloatingActionButtonMenu (56 dp
  // button, 56 dp items with a 24 dp icon and 24 dp side padding); the gaps are
  // our own (16 dp between items, 24 dp above the close button).
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';
  import { springEasing } from '../lib/spring.js';

  /**
   * @type {{
   *   choices: { key: string, icon: 'download'|'file'|'edit', text: string }[],
   *   onchoose: (key: string) => void,
   * }}
   */
  let { choices, onchoose } = $props();

  let open = $state(false);
  /** @type {HTMLElement|undefined} */
  let root = $state();
  /** @type {HTMLButtonElement|undefined} */
  let button = $state();

  // Expressive motion scheme: the "fast spatial" spring (stiffness 1400,
  // damping ratio 0.9) for the shapes and the choices, the "fast effects"
  // spring (stiffness 3800, damping ratio 1) for the colours and the fades.
  const spatial = springEasing(1400, 0.9);
  const effects = springEasing(3800, 1);

  /** Pause between two choices, in ms. */
  const STAGGER = 50;
  const CLOSE_STAGGER = 25;

  /** @param {boolean} next */
  function setOpen(next) {
    if (next === open) return;
    open = next;
    if (next) {
      // The first choice takes the focus once it is visible.
      queueMicrotask(() => items()[0]?.focus({ preventScroll: true }));
    } else if (root?.contains(document.activeElement)) {
      button?.focus({ preventScroll: true });
    }
  }

  /** @returns {HTMLElement[]} */
  function items() {
    return root ? [.../** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll('[role="menuitem"]'))] : [];
  }

  /** @param {KeyboardEvent} e */
  function key(e) {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return;
    }
    // The choices are drawn from the bottom up: Up goes to the next, Down to the previous.
    const list = items();
    const at = list.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const step = e.key === 'ArrowUp' ? 1 : -1;
      list[(at + step + list.length) % list.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      list[e.key === 'Home' ? 0 : list.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      // The menu keeps the focus until it closes.
      e.preventDefault();
      const next = e.shiftKey ? at - 1 : at + 1;
      if (next < 0 || next >= list.length) setOpen(false);
      else list[next].focus();
    }
  }

  /** @param {string} choice */
  function pick(choice) {
    setOpen(false);
    onchoose(choice);
  }

  function close() {
    setOpen(false);
  }

  // The Android Back key (lib/back-button.js) asks for the close with od-cancel.
  $effect(() => {
    const el = root;
    el?.addEventListener('od-cancel', close);
    return () => el?.removeEventListener('od-cancel', close);
  });
</script>

<div
  class="od-fab-menu"
  class:od-fab-menu--open={open}
  bind:this={root}
  onkeydown={key}
  role="presentation"
  style:--od-fab-spatial={spatial.css}
  style:--od-fab-spatial-ms="{spatial.ms}ms"
  style:--od-fab-effects={effects.css}
  style:--od-fab-effects-ms="{effects.ms}ms"
>
  <!-- A tap outside closes the menu; the keyboard has the close button and Escape. -->
  <div class="od-fab-menu--scrim" onclick={() => setOpen(false)} role="presentation"></div>
  <div class="od-fab-menu--items" id="od-fab-menu-items" role="menu" aria-label={t('logbook.add')}>
    {#each choices as choice, i (choice.key)}
      <button
        type="button"
        role="menuitem"
        class="od-fab-menu--item"
        class:od-fab-menu--primary={i === 0}
        style:--od-fab-open-delay="{i * STAGGER}ms"
        style:--od-fab-close-delay="{(choices.length - 1 - i) * CLOSE_STAGGER}ms"
        tabindex={open ? 0 : -1}
        onclick={() => pick(choice.key)}
      >
        <Icon name={choice.icon} size={24} />
        <span class="od-fab-menu--label">{choice.text}</span>
      </button>
    {/each}
  </div>
  <button
    type="button"
    class="od-fab-menu--button"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-controls="od-fab-menu-items"
    bind:this={button}
    onclick={() => setOpen(!open)}
  >
    <span class="od-fab-menu--icon"><Icon name="plus" size={24} /></span>
    <span class="od-sr-only">{t('logbook.add')}</span>
  </button>
</div>

<style>
  @layer od.components {
    .od-fab-menu {
      --od-fab-edge: 24px;
      --od-fab-size: 56px;
    }

    /* Over the whole screen, under the button and the choices. */
    .od-fab-menu--scrim {
      position: fixed;
      inset: 0;
      z-index: 6500;
      background: var(--od-fab-scrim);
      opacity: 0;
      visibility: hidden;
      transition:
        opacity var(--od-fab-effects-ms) var(--od-fab-effects),
        visibility 0s linear var(--od-fab-effects-ms);
    }

    .od-fab-menu--open .od-fab-menu--scrim {
      opacity: 1;
      visibility: visible;
      transition-delay: 0s;
    }

    /* Right edge of the button; the choices rise from it, from the bottom up. */
    .od-fab-menu--items {
      position: fixed;
      z-index: 6501;
      right: calc(var(--od-fab-edge) + var(--f7-safe-area-right, 0px));
      /* 24 dp above the button, itself 24 dp above the bottom edge. */
      bottom: calc(var(--od-fab-edge) + var(--od-fab-size) + 24px + var(--f7-safe-area-bottom, 0px));
      display: flex;
      flex-direction: column-reverse;
      align-items: flex-end;
      gap: 16px;
      visibility: hidden;
      transition: visibility 0s linear calc(var(--od-fab-spatial-ms) + 100ms);
    }

    .od-fab-menu--open .od-fab-menu--items {
      visibility: visible;
      transition-delay: 0s;
    }

    /* The navigation rail is outside the page: it gets its own veil. */
    :global(.od-nav-rail--rail)::after {
      content: '';
      position: absolute;
      inset: 0;
      background: var(--od-fab-scrim);
      opacity: 0;
      pointer-events: none;
      transition: opacity var(--od-fab-effects-ms, 150ms) ease-out;
    }

    :global(html:has(.od-fab-menu--open) .od-nav-rail--rail)::after {
      opacity: 1;
    }

    .od-fab-menu--item {
      width: max-content;
      height: 56px;
      padding: 0 24px;
      box-sizing: border-box;
      border: 0;
      border-radius: 28px;
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--od-fab-tonal);
      color: var(--od-text);
      font: inherit;
      font-size: 16px;
      font-weight: 500;
      line-height: 24px;
      white-space: nowrap;
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.3), 0 4px 8px 3px rgb(0 0 0 / 0.15);
      /* Closed: small, at the button, faded; it grows from the right edge. */
      opacity: 0;
      transform: translateY(24px) scale(0.5);
      transform-origin: right bottom;
      transition:
        transform var(--od-fab-spatial-ms) var(--od-fab-spatial) var(--od-fab-close-delay),
        opacity var(--od-fab-effects-ms) var(--od-fab-effects) var(--od-fab-close-delay);
    }

    .od-fab-menu--primary {
      background: var(--od-text);
      color: var(--od-background);
    }

    .od-fab-menu--open .od-fab-menu--item {
      opacity: 1;
      transform: none;
      transition-delay: var(--od-fab-open-delay);
    }

    .od-fab-menu--item:focus-visible,
    .od-fab-menu--button:focus-visible {
      outline: 2px solid var(--od-text);
      outline-offset: 3px;
    }

    .od-fab-menu--primary:focus-visible {
      outline-color: var(--od-text);
      outline-offset: 3px;
    }

    /* The "+" button: a rounded square, a circle in ink once open. */
    .od-fab-menu--button {
      position: fixed;
      z-index: 6502;
      right: calc(var(--od-fab-edge) + var(--f7-safe-area-right, 0px));
      bottom: calc(var(--od-fab-edge) + var(--f7-safe-area-bottom, 0px));
      width: var(--od-fab-size);
      height: var(--od-fab-size);
      padding: 0;
      border: 0;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-primary-container);
      color: var(--od-on-primary-container);
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.3), 0 4px 8px 3px rgb(0 0 0 / 0.15);
      transition:
        border-radius var(--od-fab-spatial-ms) var(--od-fab-spatial),
        background-color var(--od-fab-effects-ms) var(--od-fab-effects),
        color var(--od-fab-effects-ms) var(--od-fab-effects);
    }

    .od-fab-menu--open .od-fab-menu--button {
      border-radius: 28px;
      background: var(--od-text);
      color: var(--od-background);
    }

    .od-fab-menu--icon {
      display: flex;
      transition: transform var(--od-fab-spatial-ms) var(--od-fab-spatial);
    }

    /* The + turned 45 degrees is a ✕. */
    .od-fab-menu--open .od-fab-menu--icon {
      transform: rotate(45deg);
    }

    /* "Remove animations": it appears and disappears at once. */
    @media (prefers-reduced-motion: reduce) {
      :global(.od-nav-rail--rail)::after,
      .od-fab-menu--scrim,
      .od-fab-menu--items,
      .od-fab-menu--item,
      .od-fab-menu--button,
      .od-fab-menu--icon {
        transition: none;
      }
    }
  }
</style>
