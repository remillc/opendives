<script>
  // @ts-check
  // Star rating input, 0 to 5 as in Subsurface (0: not filled in). Tapping the
  // current value again clears it. A radio group for screen readers.
  /** @type {{ value: number, label: string, onchange: (value: number) => void }} */
  let { value, label, onchange } = $props();
  const STAR = 'M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8 6.8 19.5l1-5.8-4.2-4.1 5.8-.8z';
</script>

<span class="stars-input" role="radiogroup" aria-label={label}>
  {#each [1, 2, 3, 4, 5] as i (i)}
    <button
      type="button"
      role="radio"
      aria-checked={value === i}
      aria-label={String(i)}
      onclick={() => onchange(value === i ? 0 : i)}
    >
      <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d={STAR} class:filled={i <= value} />
      </svg>
    </button>
  {/each}
</span>

<style>
  @layer od.components {
    .stars-input {
      display: inline-flex;
      gap: 0;
    }

    /* 44 px touch targets around 26 px stars. */
    button {
      width: 44px;
      height: 44px;
      padding: 0;
      border: none;
      background: none;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Android: 48 dp touch targets (MD3). */
    :global(.md) button {
      width: 48px;
      height: 48px;
    }

    path {
      fill: none;
      stroke: var(--od-text);
      stroke-width: 1.6;
      stroke-linejoin: round;

      &.filled {
        fill: var(--od-text);
      }
    }
  }
</style>
