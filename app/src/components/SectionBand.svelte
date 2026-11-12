<script>
  // @ts-check
  // Header band of the four sections (spec, "Side menu and section headers,
  // identity"): under the top bar, the same gradient, a faint dive profile,
  // the one-line summary, and a wave that joins the content. `tall` when a
  // search bar follows the summary. `overMap`, on Sites, whose map runs under
  // the band: the wave cuts the band, so the map shows under the curve.
  // `title` (Android, with `bare`): the expanded title of the flexible app bar,
  // 28 sp over the summary; it fades while the top bar's own 22 sp title fades in
  // (BandBackdrop sets --od-title-expanded from the scroll).

  /** @type {{ summary?: string, title?: string, tall?: boolean, overMap?: boolean, pill?: boolean, chip?: boolean, bare?: boolean, summaryKey?: unknown, children?: import('svelte').Snippet }} */
  let { summary = '', title = '', tall = false, overMap = false, pill = false, chip = false, bare = false, summaryKey = undefined, children } = $props();

  const PROFILE = 'M0 30 L20 38 L45 70 L70 92 L95 96 L120 88 L140 94 L165 80 L185 62 L210 58 L235 50 L255 46 L275 40 L300 36';
</script>

<div class="od-section-band od-section-band--band" class:od-section-band--tall={tall} class:od-section-band--over-map={overMap} class:od-section-band--pill={pill} class:od-section-band--with-chip={chip} class:od-section-band--bare={bare}>
  {#if !bare}
    <svg class="od-section-band--profile" viewBox="0 0 300 140" preserveAspectRatio="none" aria-hidden="true">
      <path d="{PROFILE} V140 H0 Z" class="od-section-band--area" />
      <path d={PROFILE} class="od-section-band--line" vector-effect="non-scaling-stroke" />
    </svg>
  {/if}
  {#if !overMap && !bare}
    <svg class="od-section-band--wave" viewBox="0 0 300 18" preserveAspectRatio="none" aria-hidden="true"><path d="M0 11 Q37.5 2 75 11 T150 11 T225 11 T300 11 V18 H0 Z" /></svg>
  {/if}
  {#if bare && title}<div class="od-section-band--title od-title-font" aria-hidden="true">{title}</div>{/if}
  <!-- A new summaryKey cross-fades to the new summary (Sites: the search count). -->
  {#key summaryKey}
    {#if summary}<p class="od-section-band--summary od-value">{summary}</p>{/if}
  {/key}
  {@render children?.()}
</div>

<style>
  @layer od.components {
    .od-section-band--band {
      --od-band-h: calc(var(--f7-safe-area-top) + 120px);
      position: relative;
      overflow: hidden;
      padding: 0 16px 32px;
      background-image: var(--od-band-gradient);
      /* At least down to the band's bottom: on a tablet the status bar is outside the app. */
      background-size: 100% max(var(--od-band-h), calc(100% + var(--f7-navbar-height) + var(--f7-safe-area-top)));
      background-position: 0 calc(-1 * (var(--f7-navbar-height) + var(--f7-safe-area-top)));
      background-repeat: no-repeat;
      color: var(--od-on-band);

      &.od-section-band--tall {
        --od-band-h: calc(var(--f7-safe-area-top) + 190px);
      }

      &.od-section-band--pill {
        --od-band-h: calc(var(--f7-safe-area-top) + 242px);
      }

      /* A small status chip under the summary (Sites, offline). */
      &.od-section-band--with-chip {
        --od-band-h: calc(var(--f7-safe-area-top) + 154px);
      }

      /* Only the texts: <BandBackdrop> draws the band under them. */
      &.od-section-band--bare {
        z-index: 11;
        overflow: visible;
        background: none;
      }

      /* Only the wave's height runs over the map: its pins stay in view. */
      &.od-section-band--over-map {
        z-index: 3;
        margin-bottom: -18px;
        mask:
          linear-gradient(#000, #000) top / 100% calc(100% - 17px) no-repeat,
          url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20viewBox%3D%270%200%20300%2018%27%20preserveAspectRatio%3D%27none%27%3E%3Cpath%20d%3D%27M0%200%20H300%20V11%20Q262.5%2020%20225%2011%20T150%2011%20T75%2011%20T0%2011%20Z%27%20fill%3D%27black%27/%3E%3C/svg%3E") bottom / 100% 18px no-repeat;
      }
    }

    .od-section-band--profile {
      position: absolute;
      left: 0;
      bottom: 2px;
      width: 100%;
      height: 34px;

      .od-section-band--area {
        fill: var(--od-band-profile-area);
      }

      .od-section-band--line {
        fill: none;
        stroke: var(--od-band-profile-line);
        stroke-width: 1.5;
        stroke-linejoin: round;
      }
    }

    .od-section-band--wave {
      position: absolute;
      left: 0;
      bottom: -2px;
      width: 100%;
      height: 20px;
      display: block;

      path {
        fill: var(--f7-page-bg-color);
      }
    }

    /* M3 Headline Medium, 28/36; the weight is the app's title weight (500), as the 22 sp bar title. */
    .od-section-band--title {
      position: relative;
      margin: 0;
      font-size: 28px;
      line-height: 36px;
      font-weight: 500;
      opacity: var(--od-title-expanded, 1);
      color: var(--od-on-band);
    }

    @keyframes od-summary-in {
      from {
        opacity: 0;
      }
    }

    .od-section-band--summary {
      position: relative;
      animation: od-summary-in 150ms linear;
      margin: 0;
      font-size: 14px;
      line-height: 20px;
      letter-spacing: 0.25px;
      color: var(--od-on-band-2);
    }
  }
</style>
