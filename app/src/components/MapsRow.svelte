<script>
  // @ts-check
  // One row of the offline maps screens (docs/mockups/android-cartes-*.dc.html):
  // a 40 dp rounded icon, the texts (given as the body), an optional trailing
  // control. Inside a rounded surface; rows are separated by a thin line.

  /**
   * @type {{
   *   icon: 'map'|'crop'|'download'|'pause'|'place',
   *   body: import('svelte').Snippet,
   *   trailing?: import('svelte').Snippet,
   * }}
   */
  let { icon, body, trailing } = $props();

  /** @type {Record<string, string>} */
  const paths = {
    map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z M9 4v14 M15 6v14',
    crop: 'M6 2v14a2 2 0 0 0 2 2h14 M2 6h14a2 2 0 0 1 2 2v14',
    download: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
    pause: 'M9 6v12 M15 6v12',
    place: 'M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  };
</script>

<div class="od-maps-row">
  <span class="od-maps-row--icon-box" aria-hidden="true">
    <svg width="24" height="24" viewBox="0 0 24 24"><path d={paths[icon]} /></svg>
  </span>
  <span class="od-maps-row--body">{@render body()}</span>
  {#if trailing}{@render trailing()}{/if}
</div>

<style>
  @layer od.components {
    .od-maps-row {
      box-sizing: border-box;
      min-height: 72px;
      padding: 12px 24px 12px 16px;
      display: flex;
      align-items: flex-start;
      gap: 16px;
      color: var(--od-text);
    }

    :global(.od-maps-row--surface > [role='listitem'] + [role='listitem']) .od-maps-row {
      border-top: 1px solid var(--od-separator);
    }

    /* The rounded surface of a group of rows, and the title above it (shared by the maps screens). */
    :global(.od-maps-row--surface) {
      margin: 0 16px;
      border-radius: 20px;
      background: var(--od-surface);
      overflow: hidden;
    }

    :global(.od-maps-row--maps-title) {
      margin: 0;
      padding: 20px 20px 8px;
      font-size: 18px;
      line-height: 24px;
      font-weight: 700;
      color: var(--od-text);
    }

    :global(.od-maps-row--maps-note) {
      margin: 8px 20px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-maps-row--icon-box {
      flex: none;
      width: 40px;
      height: 40px;
      margin-top: 2px;
      border-radius: 12px;
      background: var(--od-primary-container);
      display: flex;
      align-items: center;
      justify-content: center;

      svg {
        fill: none;
        stroke: var(--od-text);
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
    }

    .od-maps-row--body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 16px;
      line-height: 24px;
    }

    /* The lines the screens put in the body. */
    .od-maps-row--body :global(.od-maps-row--supporting) {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
      font-variant-numeric: tabular-nums;
    }

    .od-maps-row--body :global(.od-maps-row--note) {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-maps-row--body :global(.od-maps-row--status) {
      margin-top: 4px;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--od-secondary);
    }

    .od-maps-row--body :global(.od-maps-row--status svg) {
      flex: none;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .od-maps-row--body :global(.od-maps-row--status.od-maps-row--error) {
      color: var(--od-error);
    }

    .od-maps-row--body :global(.od-maps-row--status.od-maps-row--muted) {
      font-weight: 500;
      color: var(--od-text-2);
    }

    .od-maps-row--body :global(.od-maps-row--progress) {
      margin-top: 8px;
      height: 4px;
      border-radius: 2px;
      background: var(--od-primary-container);
      overflow: hidden;
    }

    .od-maps-row--body :global(.od-maps-row--wavy) {
      margin-top: 4px;
    }

    .od-maps-row--body :global(.od-maps-row--progress > span) {
      display: block;
      height: 100%;
      border-radius: 2px;
      background: var(--od-text);
    }

    /* Text buttons under the texts: Framework7 stretches buttons, these keep their width. */
    .od-maps-row--body :global(.od-maps-row--actions) {
      margin: 4px 0 -8px -12px;
      display: flex;
      flex-wrap: wrap;
      gap: 0;
    }

    .od-maps-row--body :global(.od-maps-row--actions button) {
      width: auto;
      flex: none;
      height: 40px;
      padding: 0 12px;
      border: none;
      border-radius: 20px;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.1px;
      cursor: pointer;
    }

    /* A 48 dp icon button at the end of the row (the ⋮ menu, the download icon, ✕). */
    :global(.od-maps-row--icon-button) {
      flex: none;
      width: 48px;
      height: 48px;
      margin-right: -12px;
      padding: 0;
      border: none;
      border-radius: 24px;
      background: none;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--od-text);
      cursor: pointer;

      &:disabled {
        opacity: 0.45;
        cursor: default;
      }

      svg {
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
    }
  }
</style>
