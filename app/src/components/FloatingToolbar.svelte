<script>
  // @ts-check
  // Material 3 Expressive vibrant floating toolbar (spec, section 8): the
  // actions of the dive detail and of the Logbook's selection mode, at the
  // bottom centre of the page. The first action is the primary pill (icon and
  // label), the others are 48 dp icon buttons; an action with `menu` opens a
  // Framework7 popover (the ⋮ menu). It hides while the page scrolls down and
  // comes back when it scrolls up. Android only: the caller does not draw it on iOS.
  // `clearFab`: the Logbook's "+" is on screen at the right (a tablet in portrait):
  // the toolbar stays on the left of it.
  import { f7 } from 'framework7-svelte';
  import Icon from './Icon.svelte';
  import { springEasing } from '../lib/spring.js';

  /**
   * `menu`: selector of the popover this action opens (the button is its target).
   * @type {{
   *   label: string,
   *   actions: {
   *     key: string,
   *     icon: import('svelte').ComponentProps<typeof Icon>['name'],
   *     label: string,
   *     text?: string,
   *     menu?: string,
   *     onclick?: () => void,
   *   }[],
   *   clearFab?: boolean,
   * }}
   */
  let { label, actions, clearFab = false } = $props();

  /** @type {HTMLElement|undefined} */
  let root = $state();
  let hidden = $state(false);
  let current = $state(0);

  // Expressive "fast spatial" spring, as the FAB menu.
  const spatial = springEasing(1400, 0.9);

  // The page's scroll area: down hides the toolbar, up shows it again.
  $effect(() => {
    const scroller = root?.closest('.page')?.querySelector('.page-content');
    if (!scroller) return;
    let last = scroller.scrollTop;
    const onScroll = () => {
      const top = scroller.scrollTop;
      const delta = top - last;
      if (Math.abs(delta) < 8) return;
      last = top;
      // Near the top, or at the very bottom (nothing more to scroll to), it shows.
      const atEnd = top + scroller.clientHeight >= scroller.scrollHeight - 2;
      hidden = delta > 0 && top > 48 && !atEnd;
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  });

  /** @returns {HTMLElement[]} */
  function buttons() {
    return root ? [.../** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll('button'))] : [];
  }

  // One tab stop; the arrow keys move inside (WAI-ARIA toolbar pattern).
  /** @param {KeyboardEvent} e */
  function key(e) {
    const list = buttons();
    const at = list.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (at < 0) return;
    let next = -1;
    if (e.key === 'ArrowRight') next = (at + 1) % list.length;
    else if (e.key === 'ArrowLeft') next = (at - 1 + list.length) % list.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    if (next < 0) return;
    e.preventDefault();
    current = next;
    list[next].focus();
  }

  /**
   * @param {{ menu?: string, onclick?: () => void }} action
   * @param {MouseEvent} e
   */
  function run(action, e) {
    if (action.menu) f7.popover.open(action.menu, /** @type {HTMLElement} */ (e.currentTarget));
    else action.onclick?.();
  }
</script>

<div
  class="od-floating-toolbar"
  class:od-floating-toolbar--hidden={hidden}
  class:od-floating-toolbar--clear-fab={clearFab}
  role="toolbar"
  aria-label={label}
  aria-orientation="horizontal"
  bind:this={root}
  onkeydown={key}
  inert={hidden}
  style:--od-toolbar-spatial={spatial.css}
  style:--od-toolbar-spatial-ms="{spatial.ms}ms"
>
  {#each actions as action, i (action.key)}
    <button
      type="button"
      class="od-floating-toolbar--button"
      class:od-floating-toolbar--primary={i === 0}
      aria-label={action.label}
      aria-haspopup={action.menu ? 'menu' : undefined}
      tabindex={i === current ? 0 : -1}
      onfocus={() => (current = i)}
      onclick={(e) => run(action, e)}
    >
      <Icon name={action.icon} size={i === 0 ? 22 : 24} weight={action.icon === 'more' ? 4 : 2} />
      {#if i === 0 && action.text}<span class="od-floating-toolbar--text">{action.text}</span>{/if}
    </button>
  {/each}
</div>

<style>
  @layer od.components {
    /* 64 dp high, 24 dp above the bottom edge; fixed to the page, centred. */
    .od-floating-toolbar {
      position: absolute;
      z-index: 50;
      left: 0;
      right: 0;
      bottom: calc(24px + var(--f7-safe-area-bottom, 0px));
      width: max-content;
      max-width: calc(100% - 16px);
      margin: 0 auto;
      height: 64px;
      padding: 0 8px;
      box-sizing: border-box;
      border-radius: 32px;
      display: flex;
      align-items: center;
      gap: 4px;
      background: var(--od-toolbar-container);
      color: var(--od-toolbar-on-container);
      box-shadow: 0 3px 8px rgb(0 0 0 / 0.25);
      transition:
        transform var(--od-toolbar-spatial-ms) var(--od-toolbar-spatial),
        opacity 150ms ease-out,
        visibility 0s;
    }

    /* The "+" is 56 dp wide, 24 dp from the edge: 8 dp between it and the toolbar. */
    .od-floating-toolbar--clear-fab {
      right: calc(88px + var(--f7-safe-area-right, 0px));
      max-width: calc(100% - 96px);
    }

    .od-floating-toolbar--hidden {
      transform: translateY(calc(100% + 24px + var(--f7-safe-area-bottom, 0px)));
      opacity: 0;
      visibility: hidden;
      transition:
        transform var(--od-toolbar-spatial-ms) var(--od-toolbar-spatial),
        opacity 150ms ease-out,
        visibility 0s linear var(--od-toolbar-spatial-ms);
    }

    .od-floating-toolbar--button {
      flex: none;
      /* Framework7 gives every button a width of 100 %. */
      width: auto;
      min-width: 48px;
      height: 48px;
      padding: 0;
      border: 0;
      border-radius: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      white-space: nowrap;
      -webkit-tap-highlight-color: transparent;
    }

    .od-floating-toolbar--primary {
      padding: 0 20px 0 16px;
      background: var(--od-toolbar-primary);
      color: var(--od-toolbar-on-primary);
    }

    .od-floating-toolbar--text {
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .od-floating-toolbar--button:focus-visible {
      outline: 2px solid var(--od-toolbar-on-container);
      outline-offset: 2px;
    }

    .od-floating-toolbar--primary:focus-visible {
      outline-offset: 3px;
    }

    /* The content never ends under the toolbar. */
    :global(.page:has(.od-floating-toolbar) .page-content) {
      padding-bottom: calc(104px + var(--f7-safe-area-bottom, 0px));
    }

    /* "Remove animations": it appears and disappears at once. */
    @media (prefers-reduced-motion: reduce) {
      .od-floating-toolbar,
      .od-floating-toolbar--hidden {
        transition: none;
      }
    }
  }
</style>
