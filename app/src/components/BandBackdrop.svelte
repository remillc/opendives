<script>
  // @ts-check
  // <BandBackdrop>: the Carnet's header band as one piece on Android. The
  // gradient, the faint profile and the wave are a single layer that stays at
  // the top of the scrolling area: it rises with the list, then stops under the
  // title with the month on it. The list passes under its wave. There is only
  // ever one wave, so nothing swaps while scrolling. The texts of the band stay
  // in <SectionBand bare>, above this layer, and fade as they leave.
  import { onMount } from 'svelte';
  import { locale } from '../lib/format.js';
  import { monthYearLabel } from '../lib/carnet-months.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{ pill?: boolean, short?: boolean, group?: { year: number, month: number, count: number } }}
   * `pill`: the taller band (a sync pill), its gradient is longer.
   * `short`: the plain band of Statistics and Tools (no search bar): its gradient is the top bar's.
   * `group`: the month at the top of the list, once the list has passed the band.
   */
  let { pill = false, short = false, group } = $props();

  const PROFILE = 'M0 30 L20 38 L45 70 L70 92 L95 96 L120 88 L140 94 L165 80 L185 62 L210 58 L235 50 L255 46 L275 40 L300 36';
  /** Height of the band once collapsed, wave included: room for the month (Carnet), or the wave alone. */
  const COLLAPSED = $derived(short ? 18 : 64);
  /** Over how many px the texts fade out and the month fades in. */
  const FADE = 40;
  /** Scroll over which the summary line alone fades out. */
  const SUMMARY = 24;

  /** @type {HTMLElement|undefined} */
  let holder = $state();
  /** @type {HTMLElement|undefined} */
  let panel = $state();

  onMount(() => {
    const content = holder?.closest('.page-content');
    if (!content || !panel) return;
    const band = /** @type {HTMLElement|null} */ (content.querySelector('.od-section-band--band'));
    const page = /** @type {HTMLElement|null} */ (content.closest('.page'));
    let frame = 0;
    const update = () => {
      frame = 0;
      const height = band?.offsetHeight ?? COLLAPSED;
      const travel = Math.max(0, height - COLLAPSED);
      const top = Math.max(0, content.scrollTop);
      const rise = Math.min(top, travel);
      panel?.style.setProperty('--od-band-height', `${height}px`);
      panel?.style.setProperty('--od-band-rise', `${rise}px`);
      // The month appears while the last of the band's texts leaves.
      panel?.style.setProperty('--od-band-month-opacity', String(Math.min(1, Math.max(0, (top - travel + FADE / 2) / FADE))));
      // The summary alone (Statistics, Tools) leaves in its own height; with the month, the texts leave as it arrives.
      const shown = short ? 1 - top / SUMMARY : (travel + FADE / 2 - top) / FADE;
      if (band) band.style.opacity = String(Math.min(1, Math.max(0, shown)));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    content.addEventListener('scroll', schedule, { passive: true });
    const sizes = new ResizeObserver(schedule);
    if (band) sizes.observe(band);
    update();
    return () => {
      content.removeEventListener('scroll', schedule);
      sizes.disconnect();
      cancelAnimationFrame(frame);
      if (band) band.style.opacity = '';
    };
  });
</script>

<div class="od-band-backdrop od-band-backdrop--holder" bind:this={holder}>
  <div class="od-band-backdrop--layer" class:od-band-backdrop--layer-pill={pill} class:od-band-backdrop--layer-short={short} bind:this={panel}>
    <div class="od-band-backdrop--fill"></div>
    <svg class="od-band-backdrop--profile" viewBox="0 0 300 140" preserveAspectRatio="none" aria-hidden="true">
      <path d="{PROFILE} V140 H0 Z" class="od-band-backdrop--area" />
      <path d={PROFILE} class="od-band-backdrop--line" vector-effect="non-scaling-stroke" />
    </svg>
    {#if group}
      <div class="od-band-backdrop--heading" role="heading" aria-level="2">
        <span class="od-band-backdrop--month">{monthYearLabel(group.year, group.month, locale)}</span>
        <span class="od-band-backdrop--count">{t('band.dives', { n: group.count })}</span>
      </div>
    {/if}
  </div>
</div>

<style>
  @layer od.components {
    /* Stays at the top of the scrolling area, under the title; takes no room. */
    .od-band-backdrop--holder {
      position: sticky;
      /* The browser counts from inside the padding of .page-content, already under the title. */
      top: 0;
      /* Above Framework7's lists (z-index 1): the rows pass under the wave. */
      z-index: 10;
      height: 0;
      pointer-events: none;
    }

    .od-band-backdrop--layer {
      --od-band-bar: calc(var(--f7-navbar-height) + var(--f7-safe-area-top));
      --od-band-h: calc(var(--f7-safe-area-top) + 190px);
      position: absolute;
      top: calc(-1 * var(--od-band-bar));
      left: 0;
      right: 0;
      height: calc(var(--od-band-bar) + var(--od-band-height, 0px));
      overflow: hidden;
      transform: translate3d(0, calc(-1 * var(--od-band-rise, 0px)), 0);
      color: var(--od-on-band);
      /* The wave of the band, as a cut: what is under the band shows below the curve. */
      mask:
        linear-gradient(#000, #000) top / 100% calc(100% - 17px) no-repeat,
        url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20viewBox%3D%270%200%20300%2018%27%20preserveAspectRatio%3D%27none%27%3E%3Cpath%20d%3D%27M0%200%20H300%20V11%20Q262.5%2020%20225%2011%20T150%2011%20T75%2011%20T0%2011%20Z%27%20fill%3D%27black%27/%3E%3C/svg%3E") bottom / 100% 18px no-repeat;

      &.od-band-backdrop--layer-pill {
        --od-band-h: calc(var(--f7-safe-area-top) + 242px);
      }

      &.od-band-backdrop--layer-short {
        --od-band-h: calc(var(--f7-safe-area-top) + 120px);
      }
    }

    /* The gradient stays still on the screen: the title's colours continue into it. */
    .od-band-backdrop--fill {
      position: absolute;
      inset: 0;
      background-image: var(--od-band-grain), var(--od-band-gradient);
      /* At least the layer: on a tablet the status bar is outside the app and the band is taller than its phone height. */
      background-size: 256px 256px, 100% max(var(--od-band-h), 100%);
      background-repeat: repeat, no-repeat;
      transform: translate3d(0, var(--od-band-rise, 0px), 0);
    }

    .od-band-backdrop--profile {
      position: absolute;
      left: 0;
      bottom: 2px;
      width: 100%;
      height: 34px;

      .od-band-backdrop--area {
        fill: var(--od-band-profile-area);
      }

      .od-band-backdrop--line {
        fill: none;
        stroke: var(--od-band-profile-line);
        stroke-width: 1.5;
        stroke-linejoin: round;
      }
    }

    .od-band-backdrop--heading {
      position: absolute;
      left: 16px;
      right: 24px;
      /* Clear of the faint profile, which rises 36 px from the bottom. */
      bottom: 38px;
      display: flex;
      align-items: baseline;
      gap: 8px;
      font-size: 14px;
      line-height: 20px;
      opacity: var(--od-band-month-opacity, 0);
    }

    .od-band-backdrop--month {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .od-band-backdrop--count {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
  }
</style>
