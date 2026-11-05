<script>
  // @ts-check
  // OpenDives icons, drawn for the project (simple strokes on 24 × 24).
  // The Material Icons and Material Symbols sets are under Apache-2.0, which the
  // architecture rules out because of the GPLv2.
  // Decorative by default: the neighboring text carries the meaning.

  /** @type {{ name: 'logbook'|'sites'|'statistics'|'tools'|'plus'|'check'|'offline'|'device'|'expand'|'settings', size?: number }} */
  let { name, size = 24 } = $props();

  /** @type {Record<string, string>} */
  const paths = {
    logbook: 'M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5v13c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5zM12 6v13.5',
    sites: 'M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    statistics: 'M4 20h16M6.5 20v-6M11 20V8M15.5 20v-9M20 20V4',
    tools: 'M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5a4 4 0 0 0-5-5l2.5 2.5-1 2-2 1z',
    plus: 'M12 5v14M5 12h14',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    offline: 'M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.5 9 4.5 4.5 0 0 0 7 18zM4 4l16 16',
    device: 'M8 3h8a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 16 21H8a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 8 3zM11 18h2',
    expand: 'M6.5 9.5L12 15l5.5-5.5',
    settings:
      'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM10.6 3h2.8l.4 2.3 1.6.9 2.2-.8 1.4 2.4-1.8 1.5v1.8l1.8 1.5-1.4 2.4-2.2-.8-1.6.9-.4 2.3h-2.8l-.4-2.3-1.6-.9-2.2.8-1.4-2.4 1.8-1.5v-1.8L4.8 7.8l1.4-2.4 2.2.8 1.6-.9z',
  };
</script>

<svg
  class="od-icon"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  <path d={paths[name]} />
</svg>

<style>
  @layer od.components {
    .od-icon {
      display: block;
      flex-shrink: 0;
    }
  }
</style>
