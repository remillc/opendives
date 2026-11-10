<script>
  // @ts-check
  // <MonthSticky>: the header of the month at the top of the Carnet's list,
  // kept under the top bar while the list scrolls (spec, "Carnet, month
  // headers that stay on top"). It is outside the scrolling area: a virtual
  // list cannot hold a sticky row, so the logbook reads which month is at the
  // top and moves this element (`el`, its `transform`) as the next header
  // comes up. The band's gradient continues in it, a wave closes it. Hidden
  // from screen readers: the real headings are in the list.
  import { locale } from '../lib/format.js';
  import { monthName, yearText } from '../lib/carnet-months.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{ year: number, month: number, count: number, pill?: boolean, el?: HTMLElement }}
   * `pill`: the band is the taller one (a sync pill), its gradient is longer.
   */
  let { year, month, count, pill = false, el = $bindable() } = $props();
</script>

<div class="sticky" class:pill bind:this={el} aria-hidden="true">
  <svg class="wave" viewBox="0 0 300 18" preserveAspectRatio="none"><path d="M0 11 Q37.5 2 75 11 T150 11 T225 11 T300 11 V18 H0 Z" /></svg>
  <div class="heading">
    <span class="year">{yearText(year, locale)}</span>
    <span class="month">{monthName(month, locale)}</span>
    <span class="count">{t('band.dives', { n: count })}</span>
  </div>
</div>

<style>
  @layer od.components {
    .sticky {
      --od-band-h: calc(var(--f7-safe-area-top) + 190px);
      position: absolute;
      top: calc(var(--f7-navbar-height) + var(--f7-safe-area-top));
      left: 0;
      right: 0;
      /* The title row is above (z-index 600): the header slides under it. */
      z-index: 500;
      height: 50px;
      overflow: hidden;
      pointer-events: none;
      background-image: var(--od-band-gradient);
      background-size: 100% var(--od-band-h);
      background-position: 0 calc(-1 * (var(--f7-navbar-height) + var(--f7-safe-area-top)));
      background-repeat: no-repeat;
      color: var(--od-on-band);
      will-change: transform;

      &.pill {
        --od-band-h: calc(var(--f7-safe-area-top) + 242px);
      }
    }

    .wave {
      position: absolute;
      left: 0;
      bottom: -1px;
      width: 100%;
      height: 18px;
      display: block;

      path {
        fill: var(--f7-page-bg-color);
      }
    }

    .heading {
      position: relative;
      padding: 0 24px 0 16px;
      display: flex;
      align-items: baseline;
      gap: 8px;
      font-size: 20px;
      line-height: 28px;
    }

    .year {
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    .month {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* The ink colour of the band: the contrast the dark end of the gradient needs. */
    .count {
      font-size: 14px;
      color: var(--od-on-band);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
  }
</style>
