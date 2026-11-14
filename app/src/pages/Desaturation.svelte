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
  import { settings } from '../lib/settings.svelte.js';
  import { setFlightNotify } from '../lib/flight-reminder.svelte.js';
  import {
    formatDateTime,
    formatDepth,
    formatDayAt,
    formatDuration,
    formatFullDate,
    formatLongDuration,
    formatRelativeDateTime,
    formatTimeAgo,
  } from '../lib/format.js';
  import { flightWait, formatHoursMinutes } from '../lib/tools.js';
  import { t } from '../lib/i18n.js';
  import { ALARM_PERCENT, tissueColor as barColor } from '../lib/tissues.js';
  import { overlapStart, surfaceSeconds } from '../lib/desaturation.js';

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

  // Read again when the app comes back to the screen (to-do #61): the tool was left open,
  // the phone slept or another app was used; its « Au … », wait and tissues are then stale.
  $effect(() => {
    /** Reloads the calculation once the page is visible again. */
    const comeBack = () => {
      if (document.visibilityState === 'visible' && !logbook.loading) load();
    };
    document.addEventListener('visibilitychange', comeBack);
    return () => document.removeEventListener('visibilitychange', comeBack);
  });

  const wait = $derived(desat ? flightWait(desat.dives, desat.now, settings.flightWait) : null);

  /** Seconds since the end of the last dive, from the dives' own times (lib/desaturation.js). */
  const sinceLastDive = $derived(desat ? surfaceSeconds(desat.dives, desat.now) : -1);
  /** Where two dives overlap and the core stopped loading the tissues, or null. */
  const overlapAt = $derived(desat ? overlapStart(desat.dives) : null);

  /** The last dive of the logbook before now, used or not by the calculation. */
  const lastDive = $derived.by(() => {
    const now = desat?.now;
    if (!now) return null;
    let last = null;
    for (const d of logbook.dives) if (d.date <= now && (!last || d.date > last.date)) last = d;
    return last;
  });

  /** "Sortie de l'eau il y a 55 min"; in days, months or years after 48 hours. */
  const surfaced = $derived.by(() => {
    if (!desat || !lastDive) return '';
    const end = Date.parse(`${lastDive.date}Z`) + lastDive.durationSeconds * 1000;
    const seconds = Math.max(0, Math.round((Date.parse(`${desat.now}Z`) - end) / 1000));
    if (seconds <= 48 * 3600) return t('desaturation.surfacedAgo', { time: formatLongDuration(seconds) });
    return t('desaturation.surfacedLong', { ago: formatTimeAgo(new Date(end).toISOString().slice(0, 19)) });
  });

  // Chart geometry, as in the mock-up: 16 bars under the limit line (100 %).
  const WIDTH = 326;
  const HEIGHT = 140;
  const TOP = 16; // the limit line
  const BOTTOM = 116;
  const GAP = 4;
  const BAR = (WIDTH - 15 * GAP) / 16;

  /**
   * A compartment's load on the Desaturation scale (task 2026-11-13-115): its surface gradient
   * factor, 0 % at rest (desaturated) to 100 % at the limit, clamped to 0..110. Not the core's
   * `percent` (Subsurface's profile scale, about 37 % at rest), which the dive profile keeps.
   * @param {{ surfaceGf: number }} tissue
   */
  const restLoad = (tissue) => Math.round(Math.max(0, Math.min(tissue.surfaceGf, 110)));

  /** A bar at rest is still drawn: a 2 dp line on the baseline. @param {number} value */
  const barHeight = (value) => Math.max(2, (value / 100) * (BOTTOM - TOP));

  const chartLabel = $derived.by(() => {
    if (!desat) return '';
    const values = desat.tissues.map(restLoad);
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

<Page class="od-desaturation">
  <Navbar title={t('desaturation.title')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('common.back')}</span>
      </Link>
    {/snippet}
  </Navbar>

  {#if failed}
    <p class="od-desaturation--lead">{t('desaturation.failed')}</p>
  {:else if desat}
    <p class="od-desaturation--lead od-value">{t('desaturation.asOf', { date: formatFullDate(desat.now) })}</p>

    {#if wait && wait.remainingSeconds === 0}
      <!-- The wait is over (docs/mockups/outils-desaturation-terminee-android.dc.html). -->
      <div class="od-desaturation--over">
        <span class="od-desaturation--over-icon"><Icon name="checkCircle" size={24} weight={2.2} /></span>
        <span class="od-desaturation--over-text">
          <span class="od-desaturation--over-title">{t('desaturation.canFly')}</span>
          <span class="od-desaturation--over-when od-value">{t('desaturation.waitOverAt', { when: formatRelativeDateTime(wait.endsAt, desat.now, false) })}</span>
        </span>
      </div>
    {:else}
      <div class="od-desaturation--tiles">
        <div class="od-desaturation--tile">
          <span class="od-desaturation--tile-label">{t('desaturation.beforeFlying')}</span>
          <span class="od-desaturation--tile-value od-value" class:od-desaturation--flight={!!wait}>
            {#if !wait}{t('desaturation.noWait')}{:else}{formatHoursMinutes(wait.remainingSeconds)}{/if}
          </span>
        </div>
        <div class="od-desaturation--tile">
          <span class="od-desaturation--tile-label">{t('desaturation.lastDive')}</span>
          <span class="od-desaturation--tile-value od-value">
            {sinceLastDive < 0 ? t('desaturation.noRecentDive') : t('desaturation.ago', { time: formatHoursMinutes(sinceLastDive) })}
          </span>
        </div>
      </div>
      {#if wait}
        <!-- The reminder (task 2026-11-13-98): the same setting as in Settings. -->
        <label class="od-desaturation--notify">
          <span class="od-desaturation--notify-text">
            <span class="od-desaturation--notify-label">{t('settings.flight.notify')}</span>
            {#if settings.flightNotify}
              <span class="od-desaturation--notify-when">{t('desaturation.notifyAt', { when: formatDayAt(wait.endsAt, desat.now) })}</span>
            {/if}
          </span>
          <span class="toggle">
            <input type="checkbox" checked={settings.flightNotify} onchange={(e) => setFlightNotify(e.currentTarget.checked)} />
            <span class="toggle-icon"></span>
          </span>
        </label>
      {/if}
    {/if}
    <p class="od-desaturation--caption">
      {wait
        ? settings.flightWait !== 'auto'
          ? t('desaturation.ruleFixed', { hours: wait.hours })
          : t(wait.several ? 'desaturation.ruleSeveral' : 'desaturation.ruleSingle', { hours: wait.hours })
        : t('desaturation.atRest')}
    </p>

    {#if lastDive}
      <h2 class="od-desaturation--section">{t('desaturation.lastDive')}</h2>
      <div class="od-desaturation--last-card">
        <a href="/dives/{lastDive.id}" class="od-desaturation--last-dive ripple">
          <span class="od-desaturation--last-text">
            <span class="od-desaturation--last-date od-value">{formatRelativeDateTime(lastDive.date, desat.now)}</span>
            <span class="od-desaturation--last-line">
              {lastDive.site || t('dive.siteNotSet')} · {formatDepth(lastDive.maxDepthMm, logbook.prefs)} · {formatDuration(lastDive.durationSeconds)}
            </span>
            <span class="od-desaturation--last-line od-value">{surfaced}</span>
          </span>
          <span class="od-desaturation--last-chevron"><Icon name="chevron" size={20} /></span>
        </a>
      </div>
    {/if}

    <h2 class="od-desaturation--section">{t('desaturation.tissues')}</h2>
    <div class="card od-desaturation--card od-desaturation--chart">
      <svg width="100%" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-label={chartLabel}>
        <path class="od-desaturation--limit" d="M0 {TOP} H{WIDTH}" />
        <text class="od-desaturation--axis" x={WIDTH} y="12" text-anchor="end">{t('desaturation.limit')}</text>
        {#each desat.tissues as tissue, i (i)}
          {@const h = barHeight(restLoad(tissue))}
          <rect x={i * (BAR + GAP)} y={BOTTOM - h} width={BAR} height={h} rx="1" style:fill={barColor(restLoad(tissue))} />
        {/each}
        <text class="od-desaturation--axis" x="0" y="134">{t('desaturation.fastToSlow')}</text>
        <text class="od-desaturation--axis" x={WIDTH} y="134" text-anchor="end">{t('desaturation.restZero')}</text>
      </svg>
    </div>
    <div class="od-desaturation--legend od-value" aria-hidden="true">
      <span class="od-desaturation--alarm-swatch"></span>
      <span>{t('desaturation.legendAlarm')}</span>
    </div>
    <p class="od-desaturation--caption">{t('desaturation.chartText')} {modelText}</p>
    {#if overlapAt}
      <!-- Two dives overlap: the core stopped loading the tissues there (13 November 2026). -->
      <div class="od-desaturation--note" role="note">
        <span class="od-desaturation--note-icon"><Icon name="info" size={20} /></span>
        <span>{t('desaturation.overlap', { date: formatDateTime(overlapAt) })}</span>
      </div>
    {/if}

    {#if desat.dives.length}
      <h2 class="od-desaturation--section">{t('desaturation.usedDives')}</h2>
      <div class="list list-strong inset list-dividers media-list od-dive-list">
        <ul>
          {#each [...desat.dives].reverse() as dive (dive.id)}
            <li>
              <a href="/dives/{dive.id}" class="item-link item-content">
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
      <p class="od-desaturation--caption">{t('desaturation.noDives')}</p>
    {/if}

    <div class="od-desaturation--note" role="note">
      <span class="od-desaturation--note-icon"><Icon name="info" size={20} /></span>
      <span>{t('desaturation.note')}</span>
    </div>
    <p class="od-desaturation--caption od-desaturation--last">{t('desaturation.recommendation')}</p>
  {/if}
</Page>

<style>
  @layer od.components {
    .od-desaturation--lead {
      margin: 8px 20px 0;
      font-size: 14px;
      color: var(--od-text-2);
    }

    .od-desaturation--tiles {
      margin: 8px 16px 0;
      padding: 16px;
      border-radius: 12px;
      background: var(--od-surface);
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .od-desaturation--over {
      margin: 8px 16px 0;
      padding: 16px;
      border-radius: 12px;
      background: var(--od-surface);
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }

    .od-desaturation--over-icon {
      flex: none;
      display: flex;
      color: var(--od-text);
    }

    .od-desaturation--over-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-desaturation--over-title {
      font-size: 22px;
      line-height: 28px;
    }

    .od-desaturation--over-when {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .od-desaturation--last-card {
      margin: 0 16px;
      border-radius: 16px;
      background: var(--od-surface);
      overflow: hidden;
    }

    .od-desaturation--last-dive {
      position: relative;
      overflow: hidden;
      min-height: 72px;
      padding: 8px 20px 8px 16px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--od-text);
      text-decoration: none;
    }

    .od-desaturation--last-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-desaturation--last-date {
      font-size: 16px;
      line-height: 24px;
    }

    .od-desaturation--last-line {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .od-desaturation--last-chevron {
      flex: none;
      display: flex;
      color: var(--od-text-2);
    }

    .od-desaturation--tile {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-desaturation--tile-label {
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);
    }

    .od-desaturation--tile-value {
      font-size: 22px;
      line-height: 28px;

      :global(.ios) & {
        font-weight: 600;
      }
    }

    /* What waits for the diver: the tertiary role (docs/system-design.md). */
    .od-desaturation--flight {
      font-weight: 600;
      color: var(--od-tertiary);
    }

    .od-desaturation--notify {
      margin: 12px 16px 0;
      padding: 12px 16px;
      border-radius: 20px;
      background: var(--od-surface);
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .od-desaturation--notify-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-desaturation--notify-label {
      font-size: 16px;
      line-height: 24px;
    }

    .od-desaturation--notify-when {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-desaturation--section {
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

    .od-desaturation--card {
      margin: 0 16px;
      padding: 16px;
      border-radius: 12px;
      background: var(--od-surface);
    }

    .od-desaturation--chart svg {
      display: block;
    }

    .od-desaturation--limit {
      stroke: var(--od-text-2);
      stroke-width: 1;
      stroke-dasharray: 4 4;
    }

    .od-desaturation--axis {
      font-size: 10px;
      fill: var(--od-text-2);
    }

    .od-desaturation--legend {
      margin: 8px 20px 0;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--od-text-2);
    }


    .od-desaturation--alarm-swatch {
      flex: none;
      width: 12px;
      height: 8px;
      border-radius: 2px;
      background: var(--od-alarm);
    }

    .od-desaturation--caption {
      margin: 8px 20px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);

      &.od-desaturation--last {
        margin-bottom: 32px;
      }
    }

    .od-dive-list {
      margin-top: 0;
    }

    .od-desaturation--note {
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

    .od-desaturation--note-icon {
      flex: none;
      display: flex;
    }
  }
</style>
