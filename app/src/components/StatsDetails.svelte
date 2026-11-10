<script>
  // @ts-check
  // "In detail" block of a year or a filtered result: Subsurface's yearly
  // statistics (yearlystatisticsmodel.cpp), as the core computes them. The mean
  // duration is total / number of dives, as Subsurface shows it. A row without
  // a value is not shown; nothing while the core computes.
  import { formatDepth, formatHours, formatLongDuration, formatSac, formatTemperature, temperatureValue } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   figures: import('../lib/statistics.svelte.js').StatsFigures|null,
   *   prefs: import('opendives-core').Prefs,
   *   rows: ('total'|'mean'|'shortest'|'longest'|'meanDepth'|'maxDepth'|'meanMaxDepth'|'sac'|'waterMean'|'waterRange')[],
   * }}
   */
  let { figures, prefs, rows } = $props();

  /** @param {string} row @param {import('../lib/statistics.svelte.js').StatsFigures} f @returns {string|null} */
  function value(row, f) {
    switch (row) {
      case 'total': return formatHours(f.totalSeconds);
      case 'mean': return f.dives ? formatLongDuration(f.totalSeconds / f.dives) : null;
      case 'shortest': return f.shortestSeconds ? formatLongDuration(f.shortestSeconds) : null;
      case 'longest': return f.longestSeconds ? formatLongDuration(f.longestSeconds) : null;
      case 'meanDepth': return f.meanDepthMm ? formatDepth(f.meanDepthMm, prefs) : null;
      case 'maxDepth': return f.maxDepthMm ? formatDepth(f.maxDepthMm, prefs) : null;
      case 'meanMaxDepth': return f.meanMaxDepthMm ? formatDepth(f.meanMaxDepthMm, prefs) : null;
      case 'sac': return f.meanSacMlMin ? formatSac(f.meanSacMlMin, prefs) : null;
      case 'waterMean': return formatTemperature(f.meanTempMk, prefs);
      case 'waterRange':
        if (!f.minTempMk || !f.maxTempMk) return formatTemperature(f.minTempMk || f.maxTempMk, prefs);
        if (f.minTempMk === f.maxTempMk) return formatTemperature(f.minTempMk, prefs);
        return t('stats.tempRange', { min: temperatureValue(f.minTempMk, prefs), max: formatTemperature(f.maxTempMk, prefs) ?? '' });
      default: return null;
    }
  }

  const shown = $derived(
    figures ? rows.map((row) => ({ row, text: value(row, /** @type {any} */ (figures)) })).filter((r) => r.text) : [],
  );
</script>

{#if shown.length}
  <div class="od-stats-details block-title">{t('stats.details')}</div>
  <div class="od-stats-details list list-strong inset list-dividers">
    <ul>
      {#each shown as r (r.row)}
        <li class="item-content">
          <div class="item-inner">
            <div class="item-title">{t(`stats.detail.${r.row}`)}</div>
            <div class="item-after od-value">{r.text}</div>
          </div>
        </li>
      {/each}
    </ul>
  </div>
{/if}
