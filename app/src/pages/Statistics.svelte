<script>
  // @ts-check
  // Statistics section (spec, section 1, "Statistics"; Android
  // docs/mockups/android-stats.dc.html, iPhone ios-stats-tableau.dc.html):
  // "Free filter" in the top bar (the same filter as the Logbook: the figures
  // follow it); the three key figures; two ready-made charts on cards scrolled
  // sideways, dives per year and dive durations (no chart builder; the maximum
  // depth chart is only on the filtered screens); My statistics with "New
  // statistic"; By year, By mode, By suit, By buddy. The charts and the rows
  // of the always open "By …" sections are plain content: none has a detail view. No totals
  // by dive computer. Every figure comes from the core (lib/statistics.svelte.js).
  import { Page, Navbar, NavRight, Link, theme } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import MenuButton from '../components/MenuButton.svelte';
  import SectionBand from '../components/SectionBand.svelte';
  import KeyFigures from '../components/KeyFigures.svelte';
  import BarChart from '../components/BarChart.svelte';
  import ActiveFilter from '../components/ActiveFilter.svelte';
  import { filter } from '../lib/filter.svelte.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import {
    chronological,
    computeStatistics,
    encodeCriteria,
    myStatistics,
    notSetLabel,
    summaryLine,
  } from '../lib/statistics.svelte.js';
  import { formatHours, formatLongDuration } from '../lib/format.js';
  import { t } from '../lib/i18n.js';
  import { layout } from '../lib/layout.svelte.js';
  import { keepInSvelteRange } from '../lib/master-detail.js';

  let result = $state(/** @type {import('../lib/statistics.svelte.js').StatsResult|null} */ (null));
  /** Figures of each saved statistic, by its id. */
  let saved = $state(/** @type {Record<string, import('../lib/statistics.svelte.js').StatsFigures|null>} */ ({}));

  $effect(() => {
    const dives = logbook.dives;
    const list = myStatistics.list;
    const ids = filter.ids;
    if (logbook.loading) return;
    void dives;
    void ids;
    computeStatistics([]).then((r) => (result = r));
    for (const s of list) computeStatistics(s.criteria).then((r) => (saved[s.id] = r?.total ?? null));
  });

  /** The dives counted by the core (invalid dives and the free filter left out), the oldest first. */
  const dives = $derived.by(() => {
    const ids = new Set(result?.diveIds ?? []);
    return chronological(logbook.dives.filter((d) => ids.has(d.id)));
  });
  const yearly = $derived([...(result?.yearly ?? [])].sort((a, b) => b.year - a.year));

  const durationBars = $derived(dives.map((d) => ({ value: d.durationSeconds })));
  const durations = $derived(dives.map((d) => d.durationSeconds).filter((s) => s > 0));
  const durationRange = $derived(
    durations.length
      ? t('stats.perDiveRange', {
          min: formatLongDuration(Math.min(...durations)),
          max: formatLongDuration(Math.max(...durations)),
        })
      : '',
  );
  /** Tablet: the address of the row whose result is shown beside the list. */
  let selected = $state('');
  /** @param {MouseEvent} e */
  function select(e) {
    if (!layout.split) return;
    const link = /** @type {HTMLElement} */ (e.target).closest('a[data-reload-detail]');
    if (link) selected = link.getAttribute('href') ?? '';
  }

  const yearBars = $derived(
    [...(result?.yearly ?? [])].sort((a, b) => a.year - b.year).map((y) => ({ value: y.dives, label: String(y.year) })),
  );

  /** @typedef {{key: string, title: string, numeric?: boolean, support: string, after?: string}} StatRow */

  /**
   * A row of By mode, By suit, By buddy: the number of dives, the total time on the right.
   * @param {string} key @param {string} title
   * @param {import('../lib/statistics.svelte.js').StatsFigures} figures
   * @returns {StatRow}
   */
  const totalRow = (key, title, figures) => ({
    key,
    title,
    support: t('trip.dives', { n: figures.dives }),
    after: formatHours(figures.totalSeconds),
  });

  /** "9 plongées sur 6 années, de 2013 à 2026" (the band). */
  const bandSummary = $derived.by(() => {
    if (!logbook.dives.length) return '';
    const years = [...new Set(logbook.dives.map((d) => d.date.slice(0, 4)))].sort();
    return `${t('band.dives', { n: logbook.dives.length })} ${t('band.overYears', { n: years.length, from: years[0], to: years[years.length - 1] })}`;
  });
</script>

<Page onPageInit={keepInSvelteRange}>
  <Navbar large={theme.ios} class="od-band-bar" title={t('stats.title')}>
    {#snippet left()}<MenuButton />{/snippet}
    <NavRight>
      {#if theme.ios}
        <Link href="/filter">{t('stats.filterShort')}</Link>
      {:else}
        <Link class="filter-button" href="/filter"><Icon name="filter" size={18} weight={2} />{t('stats.freeFilter')}</Link>
      {/if}
    </NavRight>
  </Navbar>

  <SectionBand summary={bandSummary} />

  {#if !logbook.loading && !logbook.dives.length}
    <div class="empty">
      <p class="od-state-title">{t('stats.emptyTitle')}</p>
      <p>{t('stats.emptyText')}</p>
    </div>
  {:else if !logbook.loading}
    {#if filter.ids}
      <ActiveFilter prefs={logbook.prefs} dives={logbook.dives} shown={result?.total.dives ?? filter.ids.size} />
    {/if}
    <KeyFigures figures={result?.total ?? null} prefs={logbook.prefs} />

    <div class="block-title">{t('stats.charts')}</div>
    <div class="charts">
      <section class="chart-card">
        <h3>{t('stats.chartYears')}</h3>
        <p>{result ? t('stats.chartYearsText', { dives: t('trip.dives', { n: result.total.dives }), n: yearBars.length }) : ''}</p>
        <BarChart bars={yearBars} tinted label={t('stats.chartYears')} />
      </section>
      <section class="chart-card">
        <h3>{t('stats.chartDurations')}</h3>
        <p>{durationRange}</p>
        <BarChart bars={durationBars} tinted scale={60} unit={t('units.minutes')} label={t('stats.chartDurationsLabel', { n: dives.length })} />
      </section>
    </div>

    <div class="block-title">{t('stats.mine')}</div>
    {#if myStatistics.list.length || theme.ios}
      <div class="list list-strong inset list-dividers media-list chevron-center">
        <ul>
          {#each myStatistics.list as s (s.id)}
            <li class:selected={selected === `/statistics/result?c=${encodeCriteria(s.criteria)}&saved=${s.id}`}>
              <a href="/statistics/result?c={encodeCriteria(s.criteria)}&saved={s.id}" data-reload-detail="true" class="item-link item-content" onclick={select}>
                <div class="item-inner">
                  <div class="item-title-row"><div class="item-title">{s.name}</div></div>
                  <div class="item-text od-value">{summaryLine(saved[s.id])}</div>
                </div>
              </a>
            </li>
          {/each}
          {#if theme.ios}
            <!-- iOS: the action is a row of the group (HIG), not a button. -->
            <li><a href="/statistics/new" class="item-content action-row"><div class="item-inner"><div class="item-title">{t('stats.newEllipsis')}</div></div></a></li>
          {/if}
        </ul>
      </div>
    {/if}
    {#if !myStatistics.list.length}<p class="note">{t('stats.mineEmpty')}</p>{/if}
    {#if !theme.ios}
      <div class="new">
        <a href="/statistics/new" class="od-tonal-button new-button"><Icon name="plus" size={18} weight={2} />{t('stats.new')}</a>
      </div>
    {/if}

    <!-- The "By …" sections: always open, plain two-line rows (no detail view). -->
    {#snippet section(/** @type {string} */ title, /** @type {StatRow[]|null} */ rows)}
      {#if rows?.length}
        <div class="block-title">{title}</div>
        <ul class="od-stat-rows">
          {#each rows as row (row.key)}
            <li class="od-stat-row">
              <div class="od-stat-text">
                <span class="od-stat-title" class:od-value={row.numeric}>{row.title}</span>
                <span class="od-stat-support od-value">{row.support}</span>
              </div>
              {#if row.after}<span class="od-stat-after od-value">{row.after}</span>{/if}
            </li>
          {/each}
        </ul>
      {/if}
    {/snippet}

    {@render section(
      t('stats.byYear'),
      yearly.map((y) => ({ key: String(y.year), title: String(y.year), numeric: true, support: summaryLine(y) })),
    )}
    {@render section(t('stats.byMode'), result ? result.byMode.filter((m) => m.dives).map((m) => totalRow(m.mode, t(`detail.modes.${m.mode}`), m)) : null)}
    {@render section(t('stats.bySuit'), result ? result.bySuit.map((v) => totalRow(v.value, v.value || notSetLabel('suit'), v)) : null)}
    {@render section(t('stats.byBuddy'), result ? result.byBuddy.map((v) => totalRow(v.value, v.value || notSetLabel('buddy'), v)) : null)}
    <div class="end"></div>
  {/if}
</Page>

<style>
  @layer od.components {
    /* The section titles (mock-up android-stats). */
    .block-title {
      margin: 22px 16px 8px;
      color: var(--od-text-2);
    }

    /* The "By …" sections: a rounded card of plain rows (mock-up android-stats). */
    .od-stat-rows {
      margin: 0 16px;
      padding: 0;
      list-style: none;
      border-radius: 16px;
      background: var(--od-surface);
      overflow: hidden;

      :global(.ios) & {
        border-radius: 10px;
      }
    }

    .od-stat-row {
      display: flex;
      align-items: center;
      gap: 12px;
      box-sizing: border-box;
      min-height: 72px;
      padding: 8px 24px 8px 16px;

      & + & {
        border-top: 1px solid var(--od-separator);
      }
    }

    .od-stat-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-stat-title {
      font-size: 16px;
      line-height: 24px;
    }

    .od-stat-support,
    .od-stat-after {
      font-size: 14px;
      line-height: 20px;
    }

    .od-stat-support {
      color: var(--od-text-2);
    }

    /* Tablet: the row whose result is shown beside the list. */
    li.selected {
      background: var(--od-tint);
      color: var(--od-on-tint);
    }

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
      width: auto;
      white-space: nowrap;
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
