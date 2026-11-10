<script>
  // @ts-check
  // The decorative dive profile of first launch and of the editorial pages
  // (docs/system-design.md, section 8): a 1.5 dp line over the water
  // gradient, stretched across the width it is given. Decoration only: hidden
  // from screen readers.

  /** @type {{ class?: string }} */
  let { class: extraClass = '' } = $props();

  // The profile of a dive (time in s, depth in m), as in the mock-ups.
  const POINTS = [
    [0, 0], [170, 24], [390, 46.4], [610, 57.3], [830, 59.6], [1050, 55.5], [1160, 52.9], [1380, 32.4],
    [1553, 20.7], [1632, 20.6], [1676, 21.1], [1750, 22.4], [1970, 20.7], [2190, 22.3], [2410, 24], [2630, 22.6],
    [2850, 18.2], [3070, 16.5], [3290, 16.5], [3510, 14.3], [3730, 16.2], [3950, 13.3], [4170, 10], [4390, 10.9],
    [4610, 10.5], [4830, 9.9], [5050, 7.5], [5270, 6.1], [5490, 7.6], [5710, 6.3], [5930, 4.5], [6150, 5], [6240, 0],
  ];
  const WIDTH = 390;
  const HEIGHT = 190;
  const line = 'M' + POINTS.map(([s, d]) => `${((s / 6240) * WIDTH).toFixed(1)} ${(8 + (d / 60.2) * 174).toFixed(1)}`).join(' L');
  // Several profiles can be in the page at once (first launch over a section).
  const gradient = `od-decorative-profile-${Math.random().toString(36).slice(2, 9)}`;
</script>

<svg class="od-decorative-profile {extraClass}" viewBox="0 0 {WIDTH} {HEIGHT}" preserveAspectRatio="none" aria-hidden="true">
  <defs>
    <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" class="od-decorative-profile--water-top"></stop>
      <stop offset="1" class="od-decorative-profile--water-bottom"></stop>
    </linearGradient>
  </defs>
  <path class="od-decorative-profile--water" d="{line} Z" fill="url(#{gradient})"></path>
  <path class="od-decorative-profile--line" d={line}></path>
</svg>

<style>
  @layer od.components {
    .od-decorative-profile {
      display: block;
      width: 100%;
    }

    .od-decorative-profile--water-top {
      stop-color: var(--od-water-top);
    }

    .od-decorative-profile--water-bottom {
      stop-color: var(--od-water-bottom);
    }

    .od-decorative-profile--water {
      opacity: 0.9;
    }

    .od-decorative-profile--line {
      fill: none;
      stroke: var(--od-text);
      stroke-width: 1.5;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
    }
  }
</style>
