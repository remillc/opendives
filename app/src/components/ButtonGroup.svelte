<script>
  // @ts-check
  // An exclusive choice among a few short options: Material 3 Expressive
  // connected button group on Android (2 dp gaps, 40 dp high; unselected tonal
  // with 8 dp inner corners and fully rounded outer ends; selected filled with
  // the ink and fully rounded; no check mark), iOS segmented control on iOS.
  // Accessibility: a radio group, roving tabindex, arrow keys move the choice.

  /**
   * @type {{
   *   options: { value: string, label: string }[],
   *   value: string,
   *   onchange: (value: string) => void,
   *   ariaLabel?: string,
   *   ariaLabelledby?: string,
   *   class?: string,
   * }}
   */
  let { options, value, onchange, ariaLabel, ariaLabelledby, class: extra = '' } = $props();

  /** @type {HTMLDivElement|undefined} */
  let group = $state();

  /** @param {KeyboardEvent} e @param {number} index */
  function key(e, index) {
    const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    const backward = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
    if (!forward && !backward) return;
    e.preventDefault();
    const next = (index + (forward ? 1 : -1) + options.length) % options.length;
    if (options[next].value !== value) onchange(options[next].value);
    /** @type {HTMLElement|undefined} */ (/** @type {any} */ (group?.children[next]))?.focus();
  }
</script>

<div bind:this={group} class="od-button-group {extra}" role="radiogroup" aria-label={ariaLabel} aria-labelledby={ariaLabelledby}>
  {#each options as option, i (option.value)}
    <button
      type="button"
      role="radio"
      class="od-button-group--button"
      class:od-button-group--selected={value === option.value}
      aria-checked={value === option.value}
      tabindex={value === option.value || (!options.some((o) => o.value === value) && i === 0) ? 0 : -1}
      onclick={() => value !== option.value && onchange(option.value)}
      onkeydown={(e) => key(e, i)}
    >
      {option.label}
    </button>
  {/each}
</div>

<style>
  @layer od.components {
    .od-button-group {
      display: flex;
      gap: 2px;
    }

    .od-button-group--button {
      flex: 1 1 0;
      min-width: 0;
      min-height: 40px;
      padding: 4px 12px;
      box-sizing: border-box;
      border: none;
      border-radius: 8px;
      background: var(--od-surface-container-high);
      color: var(--od-text);
      font: inherit;
      font-size: 14px;
      line-height: 20px;
      font-weight: 500;
      letter-spacing: 0.1px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      cursor: pointer;

      &:first-child {
        border-start-start-radius: 20px;
        border-end-start-radius: 20px;
      }

      &:last-child {
        border-start-end-radius: 20px;
        border-end-end-radius: 20px;
      }

      &.od-button-group--selected {
        border-radius: 20px;
        background: var(--od-primary-action);
        color: var(--od-on-primary-action);
      }

      &:focus-visible {
        outline: 2px solid var(--od-primary-action);
        outline-offset: 2px;
      }
    }

    /* iOS: a segmented control. */
    :global(.ios) .od-button-group {
      gap: 2px;
      padding: 2px;
      border-radius: 9px;
      background: var(--od-surface-2);

      .od-button-group--button {
        min-height: 32px;
        border-radius: 7px;
        background: none;
        font-size: 14px;
        font-weight: 400;
        letter-spacing: 0;

        &.od-button-group--selected {
          border-radius: 7px;
          background: var(--od-surface);
          color: var(--od-text);
          font-weight: 600;
          box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
        }
      }
    }
  }
</style>
