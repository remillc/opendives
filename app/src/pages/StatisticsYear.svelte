<script>
  // @ts-check
  // One year of the Statistics section (docs/mockups/stats-annee-android.dc.html,
  // ios-stats-annee.dc.html): key figures, maximum depth per dive, rows by
  // month (opening the filtered result) and by trip (opening the trip), then
  // the details of Subsurface's yearly statistics. Figures from the core.
  import { Page, Navbar, Link, theme } from 'framework7-svelte';
  import KeyFigures from '../components/KeyFigures.svelte';
  import BarChart from '../components/BarChart.svelte';
  import StatsDetails from '../components/StatsDetails.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { filter } from '../lib/filter.svelte.js';
  import {
    chronological,
    computeStatistics,
    encodeCriteria,
    monthName,
    summaryLine,
    tripName,
    tripsOf,
  } from '../lib/statistics.svelte.js';
  import { depthValue, formatDepth, formatLongDate, formatTimeOfDay, locale, depthUnit } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7route: { params: { year: string } } }} */
  let { f7route } = $props();
  const year = $derived(Number(f7route.params.year));

  let result = $state(/** @type {import('../lib/statistics.svelte.js').StatsResult|null} */ (null));

  $effect(() => {
    void logbook.dives;
    void filter.ids;
    computeStatistics([{ field: 'year', values: [String(year)] }]).then((r) => (result = r));
  });

  /** The dives counted by the core (invalid dives and the free filter left out), the oldest first. */
  const dives = $derived.by(() => {
    const ids = new Set(result?.diveIds ?? []);
    return chronological(logbook.dives.filter((d) => ids.has(d.id)));
  });
  const months = $derived((result?.monthly ?? []).filter((m) => m.year === year));
  /** Trips of the year, with the identifier of the load to open them (never stored). */
  const trips = $derived.by(() => {
    const ids = new Map(tripsOf(logbook.dives).map((tr) => [tr.start, tr.id]));
    return (result?.byTrip ?? []).map((tr) => ({ ...tr, id: ids.get(tr.start) ?? 0 }));
  });

  // Labels under the bars: the time when all the dives are on one day, else the day.
  const dayFormat = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const oneDay = $derived(new Set(dives.map((d) => d.date.slice(0, 10))).size === 1);
  const bars = $derived(
    dives.map((d) => ({
      value: d.maxDepthMm,
      label: oneDay ? formatTimeOfDay(d.date) : dayFormat.format(new Date(`${d.date}Z`)),
    })),
  );
  const depths = $derived(dives.map((d) => d.maxDepthMm).filter((mm) => mm > 0));
  const chartLabel = $derived(
    depths.length
      ? t('stats.chartYearLabel', {
          n: dives.length,
          year: String(year),
          min: depthValue(Math.min(...depths), logbook.prefs),
          max: formatDepth(Math.max(...depths), logbook.prefs),
        })
      : t('stats.chartDepth'),
  );

  /** @param {number} month */
  const monthHref = (month) =>
    `/statistics/result?c=${encodeCriteria([{ field: 'month', values: [`${year}-${String(month).padStart(2, '0')}`] }])}`;
</script>

<Page>
  <Navbar large={theme.ios} title={String(year)}>
    {#snippet left()}
      <Link back iconOnly={!theme.ios}>
        <i class="icon icon-back"></i>
        {#if theme.ios}<span>{t('stats.title')}</span>{:else}<span class="od-sr-only">{t('common.back')}</span>{/if}
      </Link>
    {/snippet}
  </Navbar>

  <KeyFigures figures={result?.total ?? null} prefs={logbook.prefs} />

  <div class="block-title">{t('stats.depthPerDive')}</div>
  <div class="chart-block">
    <BarChart {bars} depth height={120} scale={logbook.prefs.length === 'ft' ? 304.8 : 1000} unit={depthUnit(logbook.prefs)} label={chartLabel} />
  </div>

  <div class="block-title">{t('stats.byMonth')}</div>
  <div class="list list-strong inset list-dividers media-list chevron-center">
    <ul>
      {#each months as m (m.month)}
        <li>
          <a href={monthHref(m.month)} data-reload-detail="true" class="item-link item-content">
            <div class="item-inner">
              <div class="item-title-row"><div class="item-title">{monthName(m.month)}</div></div>
              <div class="item-text od-value">{summaryLine(m, logbook.prefs)}</div>
            </div>
          </a>
        </li>
      {/each}
    </ul>
  </div>

  {#if trips.length}
    <div class="block-title">{t('stats.byTrip')}</div>
    <div class="list list-strong inset list-dividers media-list chevron-center">
      <ul>
        {#each trips as trip (trip.start)}
          <li>
            <a href="/trips/{trip.id}" class="item-link item-content">
              <div class="item-inner">
                <div class="item-title-row"><div class="item-title">{tripName(trip)}</div></div>
                <div class="item-text od-value">
                  {t('stats.tripLine', {
                    dives: t('trip.dives', { n: trip.dives }),
                    place: trip.location ? formatLongDate(trip.start) : t('stats.placeToSpecify'),
                  })}
                </div>
              </div>
            </a>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <StatsDetails
    figures={result?.total ?? null}
    prefs={logbook.prefs}
    rows={['total', 'mean', 'shortest', 'longest', 'meanDepth', 'maxDepth', 'meanMaxDepth', 'sac', 'waterMean']}
  />
  <div class="end"></div>
</Page>

<style>
  @layer od.components {
    .chart-block {
      margin: 0 16px;
      padding: 16px;
      border-radius: 12px;
      background: var(--od-surface);

      :global(.ios) & {
        padding: 14px 16px;
        border-radius: 10px;
      }
    }

    .end {
      height: 32px;
    }
  }
</style>
