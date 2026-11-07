<script>
  // @ts-check
  // Desaturation (docs/ui-specification.md, section 1, "Tools";
  // docs/mockups/outils-desaturation-android.dc.html). The tissues come from
  // the core's model, loaded with the logbook dives before now (toolQuery
  // 'desaturation'); the wait before flying is OpenDives' own recommendation
  // (lib/tools.js), never a guarantee.
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from '../components/Icon.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { formatDateTime, formatDepth, formatDuration, formatFullDate } from '../lib/format.js';
  import { flightWait, formatHoursMinutes } from '../lib/tools.js';
  import { t } from '../lib/i18n.js';

  let desat = $state(/** @type {import('opendives-core').Desaturation|null} */ (null));
  let failed = $state(false);

  async function load() {
    try {
      desat = await OpenDivesCore.toolQuery({ kind: 'desaturation' });
      failed = false;
    } catch (e) {
      console.error('Desaturation', e);
      failed = true;
    }
  }

  // Read again when the logbook changes (a sync may bring a dive).
  $effect(() => {
    logbook.dives;
    if (!logbook.loading) load();
  });

  const wait = $derived(desat ? flightWait(desat.dives, desat.now) : null);

  // Chart geometry, as in the mock-up: 16 bars under the limit line (100 %).
  const WIDTH = 326;
  const HEIGHT = 140;
  const TOP = 16; // the limit line
  const BOTTOM = 116;
  const GAP = 4;
  const BAR = (WIDTH - 15 * GAP) / 16;
  const ALARM_PERCENT = 90;

  /** @param {number} percent */
  const barHeight = (percent) => (Math.max(0, Math.min(percent, 110)) / 100) * (BOTTOM - TOP);

  /** Water gradient by load (spec): --od-water-top at 0 %, --od-water-bottom at 100 %; alarm from 90 %. @param {number} percent */
  function barColor(percent) {
    if (percent >= ALARM_PERCENT) return 'var(--od-alarm)';
    const mix = Math.max(0, Math.min(100, percent));
    return `color-mix(in srgb, var(--od-water-bottom) ${mix}%, var(--od-water-top))`;
  }

  const chartLabel = $derived.by(() => {
    if (!desat) return '';
    const values = desat.tissues.map((tissue) => tissue.percent);
    const high = values.filter((v) => v >= ALARM_PERCENT).length;
    const label = t('desaturation.chartLabel', { min: Math.min(...values), max: Math.max(...values) });
    return high ? `${label} ${t('desaturation.chartLabelHigh', { n: high })}` : label;
  });

  const modelText = $derived.by(() => {
    if (!desat) return '';
    if (desat.model === 'vpmb') return t('desaturation.modelVpmb', { n: desat.vpmbConservatism });
    return t('desaturation.modelGf', { low: desat.gfLow, high: desat.gfHigh });
  });
</script>

<Page>
  <Navbar title={t('desaturation.title')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('common.back')}</span>
      </Link>
    {/snippet}
  </Navbar>

  {#if failed}
    <p class="lead">{t('desaturation.failed')}</p>
  {:else if desat}
    <p class="lead od-value">{t('desaturation.asOf', { date: formatFullDate(desat.now) })}</p>

    <div class="tiles">
      <div class="tile">
        <span class="tile-label">{t('desaturation.beforeFlying')}</span>
        <span class="tile-value od-value">
          {#if !wait}{t('desaturation.noWait')}
          {:else if wait.remainingSeconds === 0}{t('desaturation.waitOver')}
          {:else}{formatHoursMinutes(wait.remainingSeconds)}{/if}
        </span>
      </div>
      <div class="tile">
        <span class="tile-label">{t('desaturation.lastDive')}</span>
        <span class="tile-value od-value">
          {desat.surfaceSeconds < 0 ? t('desaturation.noRecentDive') : t('desaturation.ago', { time: formatHoursMinutes(desat.surfaceSeconds) })}
        </span>
      </div>
    </div>
    <p class="caption">
      {wait
        ? t(wait.several ? 'desaturation.ruleSeveral' : 'desaturation.ruleSingle', { hours: wait.hours })
        : t('desaturation.atRest')}
    </p>

    <h2 class="section">{t('desaturation.tissues')}</h2>
    <div class="card chart">
      <svg width="100%" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-label={chartLabel}>
        <path class="limit" d="M0 {TOP} H{WIDTH}" />
        <text class="axis" x={WIDTH} y="12" text-anchor="end">{t('desaturation.limit')}</text>
        {#each desat.tissues as tissue, i (i)}
          {@const h = barHeight(tissue.percent)}
          <rect x={i * (BAR + GAP)} y={BOTTOM - h} width={BAR} height={h} rx="2" style:fill={barColor(tissue.percent)} />
        {/each}
        <text class="axis" x="0" y="134">{t('desaturation.fast')}</text>
        <text class="axis" x={WIDTH} y="134" text-anchor="end">{t('desaturation.slow')}</text>
      </svg>
    </div>
    <div class="legend od-value" aria-hidden="true">
      <span>{t('desaturation.legendZero')}</span>
      <span class="gradient"></span>
      <span>{t('desaturation.legendFull')}</span>
      <span class="alarm-swatch"></span>
      <span>{t('desaturation.legendAlarm')}</span>
    </div>
    <p class="caption">{t('desaturation.chartText')} {modelText}</p>

    {#if desat.dives.length}
      <h2 class="section">{t('desaturation.usedDives')}</h2>
      <div class="list list-strong inset list-dividers media-list dives">
        <ul>
          {#each [...desat.dives].reverse() as dive (dive.id)}
            <li>
              <a href="/dives/{dive.id}/" class="item-link item-content">
                <div class="item-inner">
                  <div class="item-title od-value">{formatDateTime(dive.date)}</div>
                  <div class="item-text">
                    {dive.site || t('dive.siteNotSet')} · {formatDepth(dive.maxDepthMm, logbook.prefs)} · {formatDuration(dive.durationSeconds)}
                  </div>
                </div>
              </a>
            </li>
          {/each}
        </ul>
      </div>
    {:else}
      <p class="caption">{t('desaturation.noDives')}</p>
    {/if}

    <div class="note" role="note">
      <span class="note-icon"><Icon name="info" size={20} /></span>
      <span>{t('desaturation.note')}</span>
    </div>
    <p class="caption last">{t('desaturation.recommendation')}</p>
  {/if}
</Page>

<style>
  @layer od.components {
    .lead {
      margin: 8px 20px 0;
      font-size: 14px;
      color: var(--od-text-2);
    }

    .tiles {
      margin: 8px 16px 0;
      padding: 16px;
      border-radius: 12px;
      background: var(--od-surface);
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .tile {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .tile-label {
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);
    }

    .tile-value {
      font-size: 22px;
      line-height: 28px;

      :global(.ios) & {
        font-weight: 600;
      }
    }

    .section {
      margin: 22px 16px 8px;
      font-size: 14px;
      font-weight: 500;
      color: var(--od-text-2);

      :global(.ios) & {
        margin: 24px 20px 8px;
        font-size: 13px;
        font-weight: 400;
        text-transform: uppercase;
      }
    }

    .card {
      margin: 0 16px;
      padding: 16px;
      border-radius: 12px;
      background: var(--od-surface);
    }

    .chart svg {
      display: block;
    }

    .limit {
      stroke: var(--od-text-2);
      stroke-width: 1;
      stroke-dasharray: 4 4;
    }

    .axis {
      font-size: 10px;
      fill: var(--od-text-2);
    }

    .legend {
      margin: 8px 20px 0;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--od-text-2);
    }

    .gradient {
      flex: 1;
      height: 8px;
      border-radius: 4px;
      background: linear-gradient(90deg, var(--od-water-top), var(--od-water-bottom));
    }

    .alarm-swatch {
      flex: none;
      width: 12px;
      height: 8px;
      border-radius: 2px;
      background: var(--od-alarm);
    }

    .caption {
      margin: 8px 20px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);

      &.last {
        margin-bottom: 32px;
      }
    }

    .dives {
      margin-top: 0;
    }

    .note {
      margin: 18px 16px 0;
      padding: 12px 16px;
      border-radius: 12px;
      background: var(--od-surface-2);
      display: flex;
      gap: 12px;
      align-items: flex-start;
      font-size: 14px;
      line-height: 20px;
    }

    .note-icon {
      flex: none;
      display: flex;
    }
  }
</style>
