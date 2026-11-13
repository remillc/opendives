<script>
  // @ts-check
  // OpenDives icons, drawn for the project (simple strokes on 24 × 24).
  // The Material Icons and Material Symbols sets are under Apache-2.0, which the
  // architecture rules out because of the GPLv2.
  // Decorative by default: the neighboring text carries the meaning.

  /**
   * @type {{
   *   name: 'logbook'|'sites'|'statistics'|'tools'|'plus'|'copy'|'check'|'checkCircle'|'offline'|'device'|'computer'|'expand'|'settings'|'edit'|'more'|'moreCircle'|'plan'|'menu'|'sync'|'close'|'download'|'file'|'account'|'cloud'|'warning'|'lock'|'blank'|'locate'|'fullscreen'|'exitFullscreen'|'place'|'search'|'git'|'openInNew'|'filter'|'info'|'error'|'visibility'|'visibilityOff'|'refresh'|'delete'|'chevron'|'bluetooth'|'bluetoothOff'|'merge'|'split'|'ungroup'|'remove'|'arrowRight'|'arrowBack'|'arrowUp'|'arrowDown'|'undo'|'redo'|'renumber'|'tripRemove'|'mail'|'desaturation'|'depthGauge'|'bestMix'|'blender'|'tune'|'simplifyProfile'|'share'|'image'|'document'|'map'|'calendar'|'clock'|'keyboard'|'camera'|'link'|'lightbulb'|'plane'|'qr',
   *   size?: number,
   *   weight?: number,
   * }}
   */
  let { name, size = 24, weight = 1.8 } = $props();

  /** @type {Record<string, string>} */
  const paths = {
    // A bound notebook, as the mock-ups draw it; its spine is an accent (see `accents`).
    logbook: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z',
    sites: 'M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10zM14 11a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
    statistics: 'M5 20V11M12 20V5M19 20v-7',
    tools: 'M4 7h10M18 7h2M4 17h4M12 17h8M18 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM12 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
    plus: 'M12 5v14M5 12h14',
    // Sharing and scanning by QR code: the three finder squares and the data blocks.
    qr: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h2v2h-2z M18 18h2v2h-2z M18 14v2 M14 20v-2',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
    filter: 'M4 6h16M7 12h10M10 18h4',
    delete: 'M4.5 7h15M10 11v6M14 11v6M6.5 7l1 13h9l1-13M9.5 7V4.5h5V7',
    chevron: 'M9 5l7 7-7 7',
    // An aeroplane seen from above, nose up (the wait before flying).
    plane: 'M12 2.8c1 0 1.6.8 1.6 1.8v4.6l7.4 4.4v2.1l-7.4-2.1v4.3l1.8 1.4v1.5L12 19.6l-3.4.9V19l1.8-1.4v-4.3L3 15.4v-2.1l7.4-4.4V4.6c0-1 .6-1.8 1.6-1.8z',
    calendar: 'M5 5.5h14v14H5zM5 10h14M8.5 3.5v4M15.5 3.5v4',
    keyboard: 'M3.5 6.5h17v11h-17zM7 10h.01M10 10h.01M14 10h.01M17 10h.01M7 14h.01M17 14h.01M9.5 14h5',
    clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18M12 7.5V12l3 2',
    bluetooth: 'M7 7l10 10-5 4V3l5 4L7 17',
    // The same, crossed out: no Bluetooth connection (download failed).
    bluetoothOff: 'M4 4l16 16M7 7l3.5 3.5M12 10V3l5 4-3 3M12 14v7l5-4-3.5-3.5M7 17l3-3',
    merge: 'M6 3v4c0 3 6 5 6 8v6M18 3v4c0 3-6 5-6 8',
    split: 'M12 3v6c0 3-6 5-6 8v4M12 9c0 3 6 5 6 8v4',
    ungroup: 'M4 4h6v6H4zM14 14h6v6h-6z',
    remove: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12h8',
    arrowRight: 'M5 12h14M13 6l6 6-6 6',
    arrowBack: 'M19 12H5M11 6l-6 6 6 6',
    arrowUp: 'M12 19V5M6 11l6-6 6 6',
    arrowDown: 'M12 5v14M6 13l6 6 6-6',
    undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
    mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
    redo: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
    computer: 'M9 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM10 7h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM10 17h4',
    tripRemove: 'M4 7h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM5.5 7V4.5h5V7M6 11v8M10 11v8M17 13h5',
    renumber: 'M10 6h10M10 12h10M10 18h10M4 4.5h1.5V9M3.5 11h2.5l-2.5 3h2.5M3.5 16h2.5v4.5h-2.5M4 18.2h2',
    menu: 'M4 7h16M4 12h16M4 17h16',
    account: 'M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 20c1-3.6 3.8-5.5 7-5.5s6 1.9 7 5.5',
    warning: 'M12 4l9 16H3zM12 10v4M12 17h.01',
    lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v2',
    blank: '',
    cloud: 'M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 9.5 4.25 4.25 0 0 0 7 18z',
    close: 'M6 6l12 12M18 6L6 18',
    locate: 'M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 1 0 0-7M12 5a7 7 0 1 0 0 14 7 7 0 1 0 0-14',
    fullscreen: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
    exitFullscreen: 'M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5',
    place: 'M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10zM12 9.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3',
    search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L20 20',
    git: 'M7 4a2 2 0 1 0 0 4 2 2 0 1 0 0-4M7 16a2 2 0 1 0 0 4 2 2 0 1 0 0-4M17 6a2 2 0 1 0 0 4 2 2 0 1 0 0-4M7 8v8M17 10c0 4-10 2-10 6',
    openInNew: 'M13 4h7v7M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
    download: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14',
    file: 'M7 3h7l5 5v13H7zM14 3v5h5',
    sync: 'M19.5 12a7.5 7.5 0 0 1-13.4 4.6M4.5 12a7.5 7.5 0 0 1 13.4-4.6M18.5 3.5v4h-4M5.5 20.5v-4h4',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    lightbulb: 'M12 3a8 8 0 0 0-4.5 14.6V20h9v-2.4A8 8 0 0 0 12 3zM9.5 22h5',
    checkCircle: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18M8 12.5l3 3 5-6',
    offline: 'M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.5 9 4.5 4.5 0 0 0 7 18zM4 4l16 16',
    device: 'M8 3h8a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 16 21H8a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 8 3zM11 18h2',
    expand: 'M6.5 9.5L12 15l5.5-5.5',
    refresh: 'M20 12a8 8 0 1 1-2.34-5.66M20 4v4.5h-4.5',
    error: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18M12 7.5v5.5M12 16.5h.01',
    visibility: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6',
    visibilityOff: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6M4 4l16 16',
    info: 'M12 8v.01M11 12h1v5h1M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18',
    edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
    more: 'M12 5.5h.01M12 12h.01M12 18.5h.01',
    moreCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12h.01M12 12h.01M16 12h.01',
    desaturation: 'M12 5a8 8 0 1 0 0 16 8 8 0 1 0 0-16M12 9v4l3 2M9 2h6',
    depthGauge: 'M12 3v14M7 12l5 5 5-5M4 21h16',
    bestMix: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8M12 12h.01',
    blender: 'M9 3h6M10 3v3M14 3v3M8 8a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2zM8 12h8',
    plan: 'M3 5h4l3 10h4l2-4h5M3 19h18',
    // A chain link: "Link" in the share sheets.
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
    // A folded map: "Open in Maps".
    map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
    image: 'M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4',
    camera: 'M4 8h3l1.5-2h7L17 8h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
    // A page with lines of text: the PDF sheet.
    document: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
    // Two sliders: the planner's settings.
    tune: 'M4 7h9M17 7h3M15 5v4M4 17h3M11 17h9M9 15v4',
    simplifyProfile: 'M3 5l4 12h10l4-12',
    settings: 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1',
  };

  // Lines drawn over the shape: when a filled icon is wanted (the active drawer row), the
  // shape is filled and these stay visible in the background colour.
  /** @type {Record<string, string>} */
  const accents = {
    logbook: 'M5 17a3 3 0 0 1 3-3h11',
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
  {#if accents[name]}<path class="od-icon--accent" d={accents[name]} />{/if}
</svg>

<style>
  @layer od.components {
    .od-icon {
      display: block;
      flex-shrink: 0;
    }
  }
</style>
