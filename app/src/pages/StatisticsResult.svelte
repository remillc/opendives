<script>
  // @ts-check
  // Filtered result of the Statistics section (docs/mockups/stats-filtre-android.dc.html,
  // ios-stats.dc.html): the criteria as removable input chips with "6 dives out
  // of 9", the key figures, maximum depth per dive, details, and "Compare by
  // suit". Criteria arrive in the URL (?c=…), from "New statistic" or a saved
  // statistic (&saved=<id>). Figures from the core.
  import { untrack } from 'svelte';
  import { Page, Navbar, Link, theme } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import KeyFigures from '../components/KeyFigures.svelte';
  import BarChart from '../components/BarChart.svelte';
  import StatsDetails from '../components/StatsDetails.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { filter } from '../lib/filter.svelte.js';
  import {
    chronological,
    computeStatistics,
    criteriaName,
    decodeCriteria,
    myStatistics,
    notSetLabel,
    valueLabel,
  } from '../lib/statistics.svelte.js';
  import { formatHours } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7route: { query: { c?: string, saved?: string } } }} */
  let { f7route } = $props();

  // The route of a page does not change: its criteria are read once, then edited here.
  const query = untrack(() => f7route.query);
  let criteria = $state(decodeCriteria(query.c));
  const savedName = myStatistics.list.find((s) => s.id === query.saved)?.name ?? '';

  let result = $state(/** @type {import('../lib/statistics.svelte.js').StatsResult|null} */ (null));
  let compare = $state(false);
  /** A criterion was removed: the saved name no longer describes the result. */
  let changed = $state(false);

  $effect(() => {
    void logbook.dives;
    void filter.ids;
    computeStatistics($state.snapshot(criteria)).then((r) => (result = r));
  });

  const single = $derived(criteria.length === 1 && criteria[0].values.length === 1 ? criteria[0] : null);
  const title = $derived(
    (!changed && savedName) ||
      (single ? valueLabel(single.field, single.values[0], logbook.dives) : criteriaName(criteria, logbook.dives)) ||
      t('stats.allDives'),
  );

  /** The dives counted by the core (invalid dives and the free filter left out), the oldest first. */
  const dives = $derived.by(() => {
    const ids = new Set(result?.diveIds ?? []);
    return chronological(logbook.dives.filter((d) => ids.has(d.id)));
  });
  const bars = $derived(dives.map((d) => ({ value: d.maxDepthMm, label: d.date.slice(0, 4) })));

  /** @param {number} index */
  function removeCriterion(index) {
    criteria = criteria.filter((_, i) => i !== index);
    changed = true;
  }
</script>

<Page class="od-statistics-result">
  <Navbar large={theme.ios} {title}>
    {#snippet left()}
      <Link back iconOnly={!theme.ios}>
        <i class="icon icon-back"></i>
        {#if theme.ios}<span>{t('stats.title')}</span>{:else}<span class="od-sr-only">{t('common.back')}</span>{/if}
      </Link>
    {/snippet}
  </Navbar>

  <div class="od-statistics-result--chips">
    {#each criteria as c, i (c.field)}
      <span class="od-statistics-result--chip-input">
        {t('stats.criterionValue', {
          criterion: t(`stats.criteria.${c.field}`),
          value: c.values.map((v) => valueLabel(c.field, v, logbook.dives)).join(', '),
        })}
        <button type="button" class="od-statistics-result--remove" onclick={() => removeCriterion(i)}>
          <Icon name="close" size={18} weight={2} /><span class="od-sr-only">{t('stats.removeCriterion')}</span>
        </button>
      </span>
    {/each}
    <span class="od-statistics-result--count od-value" role="status">
      {result ? t('stats.outOf', { n: result.total.dives, total: result.logDives }) : ''}
    </span>
  </div>

  <KeyFigures figures={result?.total ?? null} prefs={logbook.prefs} />

  <!-- As stats-filtre-android.dc.html: one bar per dive in the water colour
       of its depth, the year under each, no axis (task 2026-11-07-24). -->
  <h2 class="od-statistics-result--chart-title">{t('stats.depthPerDive')}</h2>
  <div class="od-statistics-result--chart-block">
    <BarChart {bars} depth axis={false} labelSize={12} height={120} label={`${t('stats.chartDepthLabel', { n: dives.length })}, ${title}`} />
  </div>

  <StatsDetails
    figures={result?.total ?? null}
    prefs={logbook.prefs}
    rows={['maxDepth', 'meanMaxDepth', 'mean', 'sac', 'waterRange']}
  />

  {#if !compare}
    <div class="od-statistics-result--compare">
      <button type="button" class="od-statistics-result--text-button" onclick={() => (compare = true)}>
        {t('stats.compareBySuit')}<Icon name="expand" size={18} weight={2} />
      </button>
    </div>
  {:else}
    <div class="block-title">{t('stats.bySuit')}</div>
    {#if result}
      <div class="list list-strong inset list-dividers media-list">
        <ul>
          {#each result.bySuit as s (s.value)}
            <li class="item-content">
              <div class="item-inner">
                <div class="item-title-row">
                  <div class="item-title">{s.value || notSetLabel('suit')}</div>
                  <div class="item-after od-value">{formatHours(s.totalSeconds)}</div>
                </div>
                <div class="item-text od-value">{t('trip.dives', { n: s.dives })}</div>
              </div>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {/if}
  <div class="od-statistics-result--end"></div>
</Page>

<style>
  @layer od.components {
    .od-statistics-result--chips {
      margin: 4px 16px 0;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;

      :global(.ios) & {
        margin-top: 10px;
        gap: 10px;
      }
    }

    /* MD3 input chip: 32 dp, 8 dp corners; iOS: a pill. */
    .od-statistics-result--chip-input {
      height: 32px;
      padding: 0 4px 0 12px;
      border-radius: 8px;
      background: var(--od-tint);
      color: var(--od-on-tint);
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 14px;
      font-weight: 500;

      :global(.ios) & {
        border-radius: 16px;
        font-size: 15px;
        font-weight: 400;
      }
    }

    /* 48 dp touch target around the 18 dp icon, without growing the chip. */
    .od-statistics-result--remove {
      width: 32px;
      height: 32px;
      margin: -8px 0;
      padding: 0;
      border: none;
      background: none;
      color: inherit;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;

      &::after {
        content: '';
        position: absolute;
        inset: -8px;
      }
    }

    .od-statistics-result--count {
      font-size: 14px;
      color: var(--od-text-2);

      :global(.ios) & {
        font-size: 15px;
      }
    }

    .od-statistics-result--chart-title {
      margin: 22px 16px 8px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 500;
      color: var(--od-text-2);
    }

    .od-statistics-result--chart-block {
      margin: 0 16px;
      padding: 16px;
      border-radius: 12px;
      background: var(--od-surface);

      :global(.ios) & {
        padding: 14px 16px;
        border-radius: 10px;
      }
    }


    /* MD3 text button (40 dp, 12 dp side padding); a plain text button on iOS. */
    .od-statistics-result--compare {
      margin: 12px 8px 0;
    }

    .od-statistics-result--text-button {
      height: 40px;
      padding: 0 12px;
      border: none;
      border-radius: 20px;
      background: none;
      color: var(--od-action);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.1px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;

      :global(.ios) & {
        height: 44px;
        font-size: 17px;
        letter-spacing: 0;
      }
    }

    .od-statistics-result--end {
      height: 32px;
    }
  }
</style>
