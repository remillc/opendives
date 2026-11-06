<script>
  // @ts-check
  // OpenDives icons, drawn for the project (simple strokes on 24 × 24).
  // The Material Icons and Material Symbols sets are under Apache-2.0, which the
  // architecture rules out because of the GPLv2.
  // Decorative by default: the neighboring text carries the meaning.

  /**
   * @type {{
   *   name: 'logbook'|'sites'|'statistics'|'tools'|'plus'|'check'|'offline'|'device'|'expand'|'settings'|'edit'|'more'|'moreCircle'|'plan'|'menu'|'sync'|'close'|'download'|'file'|'account'|'cloud'|'warning'|'locate'|'fullscreen'|'exitFullscreen'|'place',
   *   size?: number,
   *   weight?: number,
   * }}
   */
  let { name, size = 24, weight = 1.8 } = $props();

  /** @type {Record<string, string>} */
  const paths = {
    logbook: 'M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5v13c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5zM12 6v13.5',
    sites: 'M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    statistics: 'M4 20h16M6.5 20v-6M11 20V8M15.5 20v-9M20 20V4',
    tools: 'M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5a4 4 0 0 0-5-5l2.5 2.5-1 2-2 1z',
    plus: 'M12 5v14M5 12h14',
    menu: 'M4 7h16M4 12h16M4 17h16',
    account: 'M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 20c1-3.6 3.8-5.5 7-5.5s6 1.9 7 5.5',
    warning: 'M12 4l9 16H3zM12 10v4M12 17h.01',
    cloud: 'M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 9.5 4.25 4.25 0 0 0 7 18z',
    close: 'M6 6l12 12M18 6L6 18',
    locate: 'M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 1 0 0-7M12 5a7 7 0 1 0 0 14 7 7 0 1 0 0-14',
    fullscreen: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
    exitFullscreen: 'M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5',
    place: 'M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10zM12 9.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3',
    download: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14',
    file: 'M7 3h7l5 5v13H7zM14 3v5h5',
    sync: 'M19.5 12a7.5 7.5 0 0 1-13.4 4.6M4.5 12a7.5 7.5 0 0 1 13.4-4.6M18.5 3.5v4h-4M5.5 20.5v-4h4',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    offline: 'M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.5 9 4.5 4.5 0 0 0 7 18zM4 4l16 16',
    device: 'M8 3h8a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 16 21H8a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 8 3zM11 18h2',
    expand: 'M6.5 9.5L12 15l5.5-5.5',
    edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
    more: 'M12 5.5h.01M12 12h.01M12 18.5h.01',
    moreCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12h.01M12 12h.01M16 12h.01',
    plan: 'M4 6h10M4 12h7M4 18h5M15 13l3 3 3-3M18 8v8',
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
  stroke-width={weight}
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
