<script>
  // @ts-check
  // 1 to 5 stars, as Subsurface rates a dive and its conditions (0 means not
  // filled in: the caller does not show it). Filled stars in the ink colour,
  // empty ones outlined; read as one image ("Visibility: 4 of 5"). A value
  // with a fraction (an average, 2.25) fills the last star by that fraction.
  import { starFill } from '../lib/conditions.js';

  /** @type {{ value: number, label: string, size?: number, decorative?: boolean }} */
  let { value, label, size = 16, decorative = false } = $props();
  const STAR = 'M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8 6.8 19.5l1-5.8-4.2-4.1 5.8-.8z';
  const uid = $props.id();
</script>

<span class="od-stars" role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : label} aria-hidden={decorative ? 'true' : undefined}>
  {#each [1, 2, 3, 4, 5] as i (i)}
    {@const fill = starFill(value, i)}
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {#if fill > 0 && fill < 1}
        <defs><clipPath id="od-stars-{uid}-{i}"><rect x="0" y="0" width={24 * fill} height="24" /></clipPath></defs>
        <path d={STAR} class="od-stars--part" clip-path="url(#od-stars-{uid}-{i})" />
      {/if}
      <path d={STAR} class:od-stars--filled={fill >= 1} />
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

      &.od-stars--filled,
      &.od-stars--part {
        fill: var(--od-text);
      }

      &.od-stars--part {
        stroke: none;
      }
    }
  }
</style>
