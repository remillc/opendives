<script>
  // @ts-check
  // 1 to 5 stars, as Subsurface rates a dive and its conditions (0 means not
  // filled in: the caller does not show it). Filled stars in the ink colour,
  // empty ones outlined; read as one image ("Visibility: 4 of 5").
  /** @type {{ value: number, label: string, size?: number }} */
  let { value, label, size = 16 } = $props();
  const STAR = 'M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8 6.8 19.5l1-5.8-4.2-4.1 5.8-.8z';
</script>

<span class="od-stars" role="img" aria-label={label}>
  {#each [1, 2, 3, 4, 5] as i (i)}
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={STAR} class:od-stars--filled={i <= value} />
    </svg>
  {/each}
</span>

<style>
  @layer od.components {
    .od-stars {
      display: inline-flex;
      gap: 2px;
      flex: none;
    }

    path {
      fill: none;
      stroke: var(--od-text);
      stroke-width: 1.6;
      stroke-linejoin: round;

      &.od-stars--filled {
        fill: var(--od-text);
      }
    }
  }
</style>
