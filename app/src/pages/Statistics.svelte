<script>
  // @ts-check
  // Statistics section (spec, section 1, "Statistics"; Android
  // docs/mockups/android-stats.dc.html, iPhone ios-stats-tableau.dc.html):
  // "Free filter" in the top bar (the same filter as the Logbook: the figures
  // follow it); the three key figures; two ready-made charts on cards scrolled
  // sideways, dives per year and dive durations (no chart builder; the maximum
  // depth chart is only on the filtered screens); My statistics with "New
  // statistic"; By year, By mode, By suit, By buddy, accordions closed at first.
  // The charts are plain content; every row opens the list of its dives
  // (StatisticsDives.svelte). No totals by dive computer. Every figure comes from the core (lib/statistics.svelte.js).
  import { Page, Navbar, NavRight, Link, theme } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import MenuButton from '../components/MenuButton.svelte';
  import SectionBand from '../components/SectionBand.svelte';
  import BandBackdrop from '../components/BandBackdrop.svelte';
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
  import { formatTotalTime, formatLongDuration } from '../lib/format.js';
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
  /** The "By …" sections opened, by title: all closed at first. */
  let openSections = $state(/** @type {Record<string, boolean>} */ ({}));
  /** @param {MouseEvent} e */
  function select(e) {
    if (!layout.split) return;
    const link = /** @type {HTMLElement} */ (e.target).closest('a[data-reload-detail]');
    if (link) selected = link.getAttribute('href') ?? '';
  }

  const yearBars = $derived(
    [...(result?.yearly ?? [])].sort((a, b) => a.year - b.year).map((y) => ({ value: y.dives, label: String(y.year) })),
  );

  /**
   * Address of the list of a row's dives. The criteria are encoded twice: the
   * router decodes the query once, and decodeCriteria once more.
   * @param {string} section key of its section's title
   * @param {string} title
   * @param {import('../lib/statistics.svelte.js').Criterion[]} criteria
   */
  const rowHref = (section, title, criteria) =>
    `/statistics/dives/?section=${section}&title=${encodeURIComponent(title)}&c=${encodeURIComponent(encodeCriteria(criteria))}`;

  /** @typedef {{key: string, title: string, numeric?: boolean, support: string, after?: string, criteria: import('../lib/statistics.svelte.js').Criterion[]}} StatRow */

  /**
   * A row of By mode, By suit, By buddy: the number of dives, the total time on the right.
   * @param {string} field the criterion of the section
   * @param {string} key the value of the row
   * @param {string} title
   * @param {import('../lib/statistics.svelte.js').StatsFigures} figures
   * @returns {StatRow}
   */
  const totalRow = (field, key, title, figures) => ({
    key,
    title,
    support: t('trip.dives', { n: figures.dives }),
    after: formatTotalTime(figures.totalSeconds),
    criteria: [{ field, values: [key] }],
  });

  /** "9 plongées sur 6 années, de 2013 à 2026" (the band). */
  const bandSummary = $derived.by(() => {
    if (!logbook.dives.length) return '';
    const years = [...new Set(logbook.dives.map((d) => d.date.slice(0, 4)))].sort();
    return `${t('band.dives', { n: logbook.dives.length })} ${t('band.overYears', { n: years.length, from: years[0], to: years[years.length - 1] })}`;
  });
</script>

<Page class="od-statistics" onPageInit={keepInSvelteRange}>
  <Navbar large={theme.ios} class="od-band-bar{theme.ios ? '' : ' od-band-titled'}" title={t('stats.title')}>
    {#snippet left()}<MenuButton />{/snippet}
    <NavRight>
      {#if theme.ios}
        <Link href="/filter">{t('stats.filterShort')}</Link>
      {:else}
        <Link class="od-statistics--filter-button" href="/filter"><Icon name="filter" size={18} weight={2} />{t('stats.freeFilter')}</Link>
      {/if}
    </NavRight>
  </Navbar>

  {#if !theme.ios}<BandBackdrop short />{/if}
  <SectionBand bare={!theme.ios} title={t('stats.title')} summary={bandSummary} />

  {#if !logbook.loading && !logbook.dives.length}
    <div class="od-statistics--empty">
      <p class="od-state-title">{t('stats.emptyTitle')}</p>
      <p>{t('stats.emptyText')}</p>
    </div>
  {:else if !logbook.loading}
    {#if filter.ids}
      <ActiveFilter prefs={logbook.prefs} dives={logbook.dives} shown={result?.total.dives ?? filter.ids.size} />
    {/if}
    <KeyFigures figures={result?.total ?? null} prefs={logbook.prefs} />

    <div class="block-title">{t('stats.charts')}</div>
    <div class="od-statistics--charts">
      <section class="od-statistics--chart-card">
        <h3>{t('stats.chartYears')}</h3>
        <p>{result ? t('stats.chartYearsText', { dives: t('trip.dives', { n: result.total.dives }), n: yearBars.length }) : ''}</p>
        <BarChart bars={yearBars} tinted label={t('stats.chartYears')} />
      </section>
      <section class="od-statistics--chart-card">
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
            {@const href = rowHref('mine', s.name, s.criteria)}
            <li class:od-statistics--selected={layout.split && selected === href}>
              <a {href} data-reload-detail="true" class="item-link item-content" onclick={select}>
                <div class="item-inner">
                  <div class="item-title-row"><div class="item-title">{s.name}</div></div>
                  <div class="item-text od-value">{summaryLine(saved[s.id])}</div>
                </div>
              </a>
            </li>
          {/each}
          {#if theme.ios}
            <!-- iOS: the action is a row of the group (HIG), not a button. -->
            <li><a href="/statistics/new" class="item-content od-statistics--action-row"><div class="item-inner"><div class="item-title">{t('stats.newEllipsis')}</div></div></a></li>
          {/if}
        </ul>
      </div>
    {/if}
    {#if !myStatistics.list.length}<p class="od-statistics--note">{t('stats.mineEmpty')}</p>{/if}
    {#if !theme.ios}
      <div class="od-statistics--new">
        <a href="/statistics/new" class="od-tonal-button od-statistics--new-button"><Icon name="plus" size={18} weight={2} />{t('stats.new')}</a>
      </div>
    {/if}

    <!-- The "By …" sections: accordions, closed at first; each row opens its dives. -->
    {#snippet section(/** @type {string} */ key, /** @type {StatRow[]|null} */ rows)}
      {#if rows?.length}
        {@const title = t(`stats.${key}`)}
        {@const open = !!openSections[key]}
        <h2 class="od-statistics--heading">
          <button type="button" class="od-statistics--toggle" aria-expanded={open} onclick={() => (openSections[key] = !open)}>
            <span class="od-statistics--toggle-text">{title}</span>
            <span class="od-statistics--chevron" class:od-statistics--chevron-up={open}><Icon name="expand" size={24} /></span>
          </button>
        </h2>
        {#if open}
          <ul class="od-statistics--rows">
            {#each rows as row (row.key)}
              {@const href = rowHref(key, row.title, row.criteria)}
              <li class:od-statistics--selected={layout.split && selected === href}>
                <a {href} data-reload-detail="true" class="od-statistics--row ripple" onclick={select}>
                  <div class="od-statistics--text">
                    <span class="od-statistics--title" class:od-value={row.numeric}>{row.title}</span>
                    <span class="od-statistics--support od-value">{row.support}</span>
                  </div>
                  {#if row.after}<span class="od-statistics--after od-value">{row.after}</span>{/if}
                  <span class="od-statistics--row-chevron"><Icon name="chevron" size={20} /></span>
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    {/snippet}

    {@render section(
      'byYear',
      yearly.map((y) => ({
        key: String(y.year),
        title: String(y.year),
        numeric: true,
        support: summaryLine(y),
        criteria: [{ field: 'year', values: [String(y.year)] }],
      })),
    )}
    {@render section('byMode', result ? result.byMode.filter((m) => m.dives).map((m) => totalRow('mode', m.mode, t(`detail.modes.${m.mode}`), m)) : null)}
    {@render section('bySuit', result ? result.bySuit.map((v) => totalRow('suit', v.value, v.value || notSetLabel('suit'), v)) : null)}
    {@render section('byBuddy', result ? result.byBuddy.map((v) => totalRow('buddy', v.value, v.value || notSetLabel('buddy'), v)) : null)}
    <div class="od-statistics--end"></div>
  {/if}
</Page>

<style>
  @layer od.components {
    /* The section titles (mock-up android-stats). */
    .block-title {
      margin: 22px 16px 8px;
      color: var(--od-text-2);
    }

    /* The title of a "By …" section: a 48 dp button (mock-up android-stats). */
    .od-statistics--heading {
      margin: 14px 8px 0;
      font: inherit;
    }

    .od-statistics--toggle {
      width: 100%;
      min-height: 48px;
      padding: 0 12px 0 8px;
      border: none;
      background: none;
      color: var(--od-text-2);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      text-align: start;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }

    .od-statistics--toggle-text {
      flex: 1;
    }

    .od-statistics--chevron {
      display: flex;
      transition: transform 0.2s;
    }

    .od-statistics--chevron-up {
      transform: rotate(180deg);
    }

    /* The "By …" sections: a rounded card of plain rows (mock-up android-stats). */
    .od-statistics--rows {
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

    .od-statistics--rows li + li {
      border-top: 1px solid var(--od-separator);
    }

    .od-statistics--row {
      position: relative;
      overflow: hidden;
      display: flex;
      align-items: center;
      gap: 12px;
      box-sizing: border-box;
      min-height: 72px;
      padding: 8px 16px;
      color: var(--od-text);
      text-decoration: none;
    }

    .od-statistics--row-chevron {
      flex: none;
      display: flex;
      color: var(--od-text-2);
    }

    .od-statistics--text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-statistics--title {
      font-size: 16px;
      line-height: 24px;
    }

    .od-statistics--support,
    .od-statistics--after {
      font-size: 14px;
      line-height: 20px;
    }

    .od-statistics--support {
      color: var(--od-text-2);
    }

    /* Tablet: the row whose result is shown beside the list. */
    li.od-statistics--selected {
      background: var(--od-tint);
      color: var(--od-on-tint);
    }

    .od-statistics--empty {
      margin: 32px 20px;
      color: var(--od-text-2);
    }

    .od-statistics--note {
      margin: 8px 20px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    /* Top bar text button with its icon (MD3 text button, 12 dp side padding). */
    :global(.md .od-statistics--filter-button) {
      width: auto;
      white-space: nowrap;
      gap: 8px;
      padding: 0 12px;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.1px;
    }

    /* Ready-made charts: cards scrolled sideways, snapping to each card. */
    .od-statistics--charts {
      padding: 0 16px;
      display: flex;
      gap: 12px;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      scroll-padding: 0 16px;
      scrollbar-width: none;
    }

    .od-statistics--chart-card {
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
    .od-statistics--new {
      margin: 12px 16px 0;
      display: flex;
    }

    .od-statistics--new-button {
      padding: 0 24px 0 16px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
      font-weight: 500;
    }

    /* iOS: the action row of the My statistics group, in bold. */
    .od-statistics--action-row .item-title {
      font-weight: 600;
      color: var(--od-action);
    }

    .od-statistics--end {
      height: 32px;
    }
  }
</style>
