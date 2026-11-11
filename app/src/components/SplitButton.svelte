<script>
  // @ts-check
  // <SplitButton>: Material 3 Expressive split button (Android). A leading
  // button (the `lead` snippet, which brings its own button) and a trailing
  // chevron button, 2 dp apart. The inner corners are small, the outer ones
  // fully rounded. The chevron opens a menu (`menu` snippet: MenuItem rows in
  // a List) and turns upside down while it is open. On iOS it is only the
  // leading button, as before.
  import { Popover, List, f7, theme } from 'framework7-svelte';

  /**
   * `label`: accessible name of the chevron button.
   * @type {{ label: string, lead: import('svelte').Snippet, menu: import('svelte').Snippet }}
   */
  let { label, lead, menu } = $props();

  const id = `od-split-menu-${Math.random().toString(36).slice(2, 8)}`;
  let open = $state(false);
  /** @type {HTMLElement|undefined} */
  let trigger = $state();

  function toggle() {
    if (open) f7.popover.close(`#${id}`);
    else f7.popover.open(`#${id}`, trigger);
  }
</script>

{#if theme.ios}
  {@render lead()}
{:else}
  <div class="od-split-button" role="group">
    <div class="od-split-button--lead">{@render lead()}</div>
    <button
      type="button"
      bind:this={trigger}
      class="od-split-button--trailing"
      class:od-split-button--open={open}
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={open}
      onclick={toggle}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M7 10l5 5 5-5" /></svg>
    </button>
  </div>
  <Popover {id} class="od-menu od-split-button--menu" backdrop={false} onPopoverOpen={() => (open = true)} onPopoverClosed={() => (open = false)}>
    <List noChevron>{@render menu()}</List>
  </Popover>
{/if}

<style>
  @layer od.components {
    .od-split-button {
      display: inline-flex;
      gap: 2px;
    }

    /* The leading button: fully rounded outside, 4 dp inside. */
    .od-split-button--lead > :global(.od-tonal-button) {
      height: 40px;
      padding: 0 12px 0 16px;
      border-radius: 20px 4px 4px 20px;
    }

    .od-split-button--trailing {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 40px;
      padding: 0;
      border: none;
      border-radius: 4px 20px 20px 4px;
      background: var(--od-tint);
      color: var(--od-on-tint);
      cursor: pointer;

      svg {
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
        transition: transform 200ms cubic-bezier(0.2, 0, 0, 1);
      }

      /* Open: the chevron points up and the button is fully rounded, as the Expressive spec draws it. */
      &.od-split-button--open {
        border-radius: 20px;

        svg {
          transform: rotate(180deg);
        }
      }
    }

    /* Labels as long as "Switch to automatic sync" wrap inside the 280 dp of the menu instead of being cut. */
    :global(.od-split-button--menu .item-title) {
      white-space: normal;
      padding: 8px 0;
    }

    @media (prefers-reduced-motion: reduce) {
      .od-split-button--trailing svg {
        transition: none;
      }
    }
  }
</style>
