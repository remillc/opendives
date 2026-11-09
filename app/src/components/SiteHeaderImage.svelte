<script>
  // @ts-check
  // Map of the site behind the top bar and the header of a dive (detail3-android
  // mock-ups; spec, "Dive detail, site map behind the header"). Decorative: not
  // interactive, hidden from screen readers. Until the picture is there
  // (offline and never seen), nothing is shown.
  import { onDestroy } from 'svelte';
  import { DRAW_WIDTH, HALF_HEIGHT, loadSiteMap } from '../lib/site-image.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ latUdeg: number, lonUdeg: number, onshown: (shown: boolean) => void }} */
  let { latUdeg, lonUdeg, onshown } = $props();

  let src = $state('');

  $effect(() => {
    let stale = false;
    loadSiteMap(latUdeg, lonUdeg)
      .then((url) => {
        if (stale) {
          URL.revokeObjectURL(url);
          return;
        }
        if (src) URL.revokeObjectURL(src);
        src = url;
        onshown(true);
      })
      .catch((e) => {
        // Offline with no copy, or the map server is unavailable: the plain header.
        console.warn('Site map', e);
        if (!stale) onshown(false);
      });
    return () => {
      stale = true;
    };
  });

  onDestroy(() => {
    if (src) URL.revokeObjectURL(src);
  });
</script>

<div class="image" aria-hidden="true">
  {#if src}
    <img {src} alt="" style:width="{DRAW_WIDTH}px" style:height="{HALF_HEIGHT * 2}px" style:margin-left="{-DRAW_WIDTH / 2}px" style:margin-top="{-HALF_HEIGHT}px" />
    <svg class="pin" width="40" height="40" viewBox="-20 -20 40 40">
      <circle class="halo" r="14" />
      <path class="body" d="M0 4 C-2 -1 -8 -5 -8 -11 A8 8 0 1 1 8 -11 C8 -5 2 -1 0 4Z" />
      <circle class="eye" cy="-11" r="3" />
    </svg>
    <div class="fade"></div>
    <!-- Credits asked by OpenStreetMap's licence and the tile provider. -->
    <p class="credits">{t('sites.mapCredits')}</p>
  {/if}
</div>

<style>
  @layer od.components {
    /* From the top of the screen to just under the header. */
    .image {
      position: absolute;
      left: 0;
      right: 0;
      top: calc(-1 * (var(--f7-navbar-height) + var(--f7-safe-area-top)));
      bottom: -8px;
      overflow: hidden;
      pointer-events: none;
    }

    /* The site is under the pin, in the middle of the top bar. */
    img,
    .pin {
      position: absolute;
      left: 50%;
      top: calc(var(--f7-safe-area-top) + var(--f7-navbar-height) / 2);
    }

    img {
      max-width: none;

      :global(.dark) & {
        filter: brightness(0.6);
      }
    }

    .pin {
      transform: translate(-50%, -50%);
    }

    .halo {
      fill: var(--od-pin);
      fill-opacity: 0.14;
    }

    .body {
      fill: var(--od-pin);
      stroke: var(--od-on-pin);
      stroke-width: 1.5;
    }

    .eye {
      fill: var(--od-on-pin);
    }

    .fade {
      position: absolute;
      inset: 0;
      background: linear-gradient(
        to bottom,
        color-mix(in srgb, var(--od-background) 10%, transparent) 0%,
        color-mix(in srgb, var(--od-background) 45%, transparent) 60%,
        var(--od-background) 100%
      );
    }

    /* In the gap between the top bar and the date. */
    .credits {
      position: absolute;
      right: 8px;
      top: calc(var(--f7-safe-area-top) + var(--f7-navbar-height) + 2px);
      margin: 0;
      color: var(--od-text-2);
      font-size: 10px;
      line-height: 12px;
    }
  }
</style>
