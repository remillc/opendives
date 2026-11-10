<script>
  // @ts-check
  // <MonthHeader>: one line that starts a month in the Carnet's list (spec,
  // "Carnet, month headers that stay on top"): the year in bold and the month,
  // the number of dives on the right. A row of the virtual list.
  import { locale } from '../lib/format.js';
  import { monthName, yearText } from '../lib/carnet-months.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{ year: number, month: number, count: number, index?: number, top?: number }}
   * `index` and `top`: position in the logbook's virtual list.
   */
  let { year, month, count, index = undefined, top = undefined } = $props();
</script>

<li class="month-header" data-virtual-list-index={index} style:top={top === undefined ? undefined : `${top}px`}>
  <div class="heading" role="heading" aria-level="2">
    <span class="year">{yearText(year, locale)}</span>
    <span class="month">{monthName(month, locale)}</span>
    <span class="count">{t('band.dives', { n: count })}</span>
  </div>
</li>

<style>
  @layer od.components {
    .month-header {
      height: 44px;
      box-sizing: border-box;
      list-style: none;
      background: var(--f7-page-bg-color);
      color: var(--od-text);
    }

    .heading {
      height: 100%;
      box-sizing: border-box;
      padding: 10px 24px 0 16px;
      display: flex;
      align-items: baseline;
      gap: 8px;
      font-size: 20px;
      line-height: 24px;
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

    .count {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
  }
</style>
