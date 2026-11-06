<script>
  // @ts-check
  // Statistics section (spec, section 1, "Statistics"; Android
  // docs/mockups/android-stats.dc.html, iPhone ios-stats-tableau.dc.html):
  // "Free filter" in the top bar; the three key figures; three ready-made
  // charts on cards scrolled sideways (no chart builder); My statistics with
  // "New statistic"; By year (opening the year), By mode, By suit, By buddy.
  // No totals by dive computer. Every figure comes from the core
  // (lib/statistics.svelte.js); the per-dive charts use each dive's own values.
  import { Page, Navbar, NavRight, Link, f7, theme } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import MenuButton from '../components/MenuButton.svelte';
  import KeyFigures from '../components/KeyFigures.svelte';
  import BarChart from '../components/BarChart.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import {
    FIGURES_PENDING,
    chronological,
    computeStatistics,
    encodeCriteria,
    myStatistics,
    notSetLabel,
    summaryLine,
    yearsOf,
  } from '../lib/statistics.svelte.js';
  import { formatDuration, formatHours, formatNumber } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  let result = $state(/** @type {import('../lib/statistics.svelte.js').StatsResult|null} */ (null));
  /** Figures of each saved statistic, by its id. */
  let saved = $state(/** @type {Record<string, import('../lib/statistics.svelte.js').StatsFigures|null>} */ ({}));

  $effect(() => {
    const dives = logbook.dives;
    const list = myStatistics.list;
    if (logbook.loading) return;
    void dives;
    computeStatistics([]).then((r) => (result = r));
    for (const s of list) computeStatistics(s.criteria).then((r) => (saved[s.id] = r?.total ?? null));
  });

  const dives = $derived(chronological(logbook.dives));
  const years = $derived(yearsOf(logbook.dives));
  const yearly = $derived(new Map((result?.yearly ?? []).map((y) => [y.year, y])));

  const depthBars = $derived(dives.map((d) => ({ value: d.maxDepthMm })));
  const durationBars = $derived(dives.map((d) => ({ value: d.durationSeconds })));
  const durations = $derived(dives.map((d) => d.durationSeconds).filter((s) => s > 0));
  const firstYear = $derived(years.length ? years[years.length - 1] : 0);
  const lastYear = $derived(years.length ? years[0] : 0);
  const perDive = $derived(
    firstYear === lastYear ? t('stats.perDiveIn', { year: String(firstYear) }) : t('stats.perDiveFrom', { from: String(firstYear), to: String(lastYear) }),
  );
  const durationRange = $derived(
    durations.length
      ? t('stats.perDiveRange', {
          min: formatNumber(Math.round(Math.min(...durations) / 60)),
          max: formatDuration(Math.max(...durations)),
        })
      : '',
  );
  const yearBars = $derived(
    [...(result?.yearly ?? [])].sort((a, b) => a.year - b.year).map((y) => ({ value: y.dives, label: String(y.year) })),
  );

  function freeFilter() {
    // The free filter (ios-filtre) is built with the Logbook additions (task 15).
    f7.toast.create({ text: t('stats.notAvailable'), closeTimeout: 2500, position: 'center' }).open();
  }

  /** @param {string} field @param {string} value */
  const resultHref = (field, value) => `/statistics/result/?c=${encodeCriteria([{ field, values: [value] }])}`;
</script>

<Page>
  <Navbar large={theme.ios} title={t('stats.title')}>
    {#snippet left()}<MenuButton />{/snippet}
    <NavRight>
      {#if theme.ios}
        <Link onClick={freeFilter}>{t('stats.filterShort')}</Link>
      {:else}
        <Link class="filter-button" onClick={freeFilter}><Icon name="filter" size={18} weight={2} />{t('stats.freeFilter')}</Link>
      {/if}
    </NavRight>
  </Navbar>

  {#if !logbook.loading && !logbook.dives.length}
    <div class="empty">
      <p class="od-state-title">{t('stats.emptyTitle')}</p>
      <p>{t('stats.emptyText')}</p>
    </div>
  {:else if !logbook.loading}
    <KeyFigures figures={result?.total ?? null} prefs={logbook.prefs} />
    {#if FIGURES_PENDING}<p class="note">{t('stats.pendingNote')}</p>{/if}

    <div class="block-title">{t('stats.charts')}</div>
    <div class="charts">
      <section class="chart-card">
        <h3>{t('stats.chartDepth')}</h3>
        <p>{perDive}</p>
        <BarChart bars={depthBars} depth label={t('stats.chartDepthLabel', { n: dives.length })} />
      </section>
      <section class="chart-card">
        <h3>{t('stats.chartYears')}</h3>
        {#if result}
          <p>{t('stats.chartYearsText', { dives: t('trip.dives', { n: result.total.dives }), n: yearBars.length })}</p>
          <BarChart bars={yearBars} label={t('stats.chartYears')} />
        {:else}
          <p>{t('stats.pending')}</p>
          <div class="chart-pending" aria-hidden="true"></div>
        {/if}
      </section>
      <section class="chart-card">
        <h3>{t('stats.chartDurations')}</h3>
        <p>{durationRange}</p>
        <BarChart bars={durationBars} label={t('stats.chartDurationsLabel', { n: dives.length })} />
      </section>
    </div>

    <div class="block-title">{t('stats.mine')}</div>
    {#if myStatistics.list.length || theme.ios}
      <div class="list list-strong inset list-dividers media-list chevron-center">
        <ul>
          {#each myStatistics.list as s (s.id)}
            <li>
              <a href="/statistics/result/?c={encodeCriteria(s.criteria)}&saved={s.id}" class="item-link item-content">
                <div class="item-inner">
                  <div class="item-title-row"><div class="item-title">{s.name}</div></div>
                  <div class="item-text od-value">{summaryLine(saved[s.id], logbook.prefs)}</div>
                </div>
              </a>
            </li>
          {/each}
          {#if theme.ios}
            <!-- iOS: the action is a row of the group (HIG), not a button. -->
            <li><a href="/statistics/new/" class="item-content action-row"><div class="item-inner"><div class="item-title">{t('stats.newEllipsis')}</div></div></a></li>
          {/if}
        </ul>
      </div>
    {/if}
    {#if !myStatistics.list.length}<p class="note">{t('stats.mineEmpty')}</p>{/if}
    {#if !theme.ios}
      <div class="new">
        <a href="/statistics/new/" class="od-tonal-button new-button"><Icon name="plus" size={18} weight={2} />{t('stats.new')}</a>
      </div>
    {/if}

    <div class="block-title">{t('stats.byYear')}</div>
    <div class="list list-strong inset list-dividers media-list chevron-center">
      <ul>
        {#each years as year (year)}
          <li>
            <a href="/statistics/year/{year}/" class="item-link item-content">
              <div class="item-inner">
                <div class="item-title-row"><div class="item-title od-value">{year}</div></div>
                <div class="item-text od-value">{summaryLine(yearly.get(year), logbook.prefs)}</div>
              </div>
            </a>
          </li>
        {/each}
      </ul>
    </div>

    {#snippet group(/** @type {string} */ title, /** @type {{key: string, label: string, figures: import('../lib/statistics.svelte.js').StatsFigures}[]|null} */ rows, /** @type {string} */ field)}
      <div class="block-title">{title}</div>
      {#if rows}
        <div class="list list-strong inset list-dividers media-list chevron-center">
          <ul>
            {#each rows as row (row.key)}
              <li>
                <a href={resultHref(field, row.key)} class="item-link item-content">
                  <div class="item-inner">
                    <div class="item-title-row">
                      <div class="item-title">{row.label}</div>
                      <div class="item-after od-value">{formatHours(row.figures.totalSeconds)}</div>
                    </div>
                    <div class="item-text od-value">{t('trip.dives', { n: row.figures.dives })}</div>
                  </div>
                </a>
              </li>
            {/each}
          </ul>
        </div>
      {:else}
        <p class="note">{t('stats.pending')}</p>
      {/if}
    {/snippet}

    {@render group(
      t('stats.byMode'),
      result ? result.byMode.filter((m) => m.dives).map((m) => ({ key: m.mode, label: t(`detail.modes.${m.mode}`), figures: m })) : null,
      'mode',
    )}
    {@render group(
      t('stats.bySuit'),
      result ? result.bySuit.map((s) => ({ key: s.value, label: s.value || notSetLabel('suit'), figures: s })) : null,
      'suit',
    )}
    {@render group(
      t('stats.byBuddy'),
      result ? result.byBuddy.map((b) => ({ key: b.value, label: b.value || notSetLabel('buddy'), figures: b })) : null,
      'buddy',
    )}
    <div class="end"></div>
  {/if}
</Page>

<style>
  @layer od.components {
    .empty {
      margin: 32px 20px;
      color: var(--od-text-2);
    }

    .note {
      margin: 8px 20px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    /* Top bar text button with its icon (MD3 text button, 12 dp side padding). */
    :global(.md .filter-button) {
      gap: 8px;
      padding: 0 12px;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.1px;
    }

    /* Ready-made charts: cards scrolled sideways, snapping to each card. */
    .charts {
      padding: 0 16px;
      display: flex;
      gap: 12px;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      scroll-padding: 0 16px;
      scrollbar-width: none;
    }

    .chart-card {
      flex: none;
      width: 272px;
      padding: 16px;
      box-sizing: border-box;
      border-radius: 12px;
      background: var(--od-surface);
      display: flex;
      flex-direction: column;
      gap: 4px;
      scroll-snap-align: start;

      :global(.ios) & {
        padding: 14px 16px;
        border-radius: 10px;
        gap: 2px;
      }

      h3 {
        margin: 0;
        font-size: 16px;
        line-height: 24px;
        font-weight: 500;

        :global(.ios) & {
          font-size: 17px;
          line-height: 22px;
          font-weight: 600;
        }
      }

      p {
        margin: 0 0 10px;
        font-size: 12px;
        line-height: 16px;
        color: var(--od-text-2);
        font-variant-numeric: tabular-nums;

        :global(.ios) & {
          font-size: 13px;
          line-height: 18px;
        }
      }
    }

    .chart-pending {
      height: 110px;
      border-radius: 4px;
      background: var(--od-tint);
    }

    /* Android: "New statistic" is a tonal button under the list (MD3). */
    .new {
      margin: 12px 16px 0;
      display: flex;
    }

    .new-button {
      padding: 0 24px 0 16px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
      font-weight: 500;
    }

    /* iOS: the action row of the My statistics group, in bold. */
    .action-row .item-title {
      font-weight: 600;
      color: var(--od-action);
    }

    .end {
      height: 32px;
    }
  }
</style>
