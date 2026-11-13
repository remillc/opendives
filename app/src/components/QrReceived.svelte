<script>
  // @ts-check
  // "Plongée reçue" (docs/mockups/scanner-qr-recu-android.dc.html; inbox task 2026-11-13-102): the
  // dive or plan read from QR codes, before anything is added. A preview card (date and time, site,
  // country, depth, time, minimum temperature, the profile, gases, people, the profile's size), the
  // note, "Annuler" and "Ajouter au carnet" ("Ajouter aux plongées planifiées" for a plan). When a
  // dive at the same date and time is already in the logbook, it says so and the button reads
  // "Ajouter quand même". The state and the import are in lib/qr-receive.svelte.js.
  import { Popup, Page, Navbar, Link } from 'framework7-svelte';
  import Icon from './Icon.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { formatDepth, formatLongDateTime, formatMinutes, formatMixName, formatTemperature } from '../lib/format.js';
  import { t } from '../lib/i18n.js';
  import { addReceived, dismissReceived, received } from '../lib/qr-receive.svelte.js';

  const preview = $derived(received.preview);
  const prefs = $derived(logbook.prefs);
  const isPlan = $derived(received.kind === 'p');

  /** The profile as a closed area and its line, in a 326 x 90 box (depth down, 4 units of margin). */
  const shape = $derived.by(() => {
    const p = preview?.profile ?? [];
    if (p.length < 4) return null;
    const tMax = Math.max(...p.filter((_, i) => i % 2 === 0));
    const dMax = Math.max(...p.filter((_, i) => i % 2 === 1));
    if (!tMax || !dMax) return null;
    const points = [];
    for (let i = 0; i < p.length; i += 2) points.push(`${((p[i] / tMax) * 326).toFixed(1)} ${(4 + (p[i + 1] / dMax) * 78).toFixed(1)}`);
    return { line: `M${points.join(' L')}`, area: `M0 4 L${points.join(' L')} L326 4 Z` };
  });

  /** @type {[string, string][]} */
  const rows = $derived.by(() => {
    if (!preview) return [];
    /** @type {[string, string][]} */
    const out = [];
    if (preview.gases.length) out.push([t('qr.gases'), preview.gases.map((g) => formatMixName(g.o2Permille, g.hePermille)).join(', ')]);
    if (preview.people.length && !isPlan) out.push([t('qr.people'), preview.people.join(', ')]);
    if (preview.samples) out.push([t('qr.profile'), t('qr.profileFull', { n: String(preview.samples) })]);
    return out;
  });
</script>

{#if received.open && preview}
  <Popup opened onPopupClosed={dismissReceived} class="od-qr-received">
    <Page>
      <Navbar title={t(isPlan ? 'qr.receivedPlan' : 'qr.receivedDive')}>
        {#snippet left()}
          <Link popupClose iconOnly>
            <Icon name="close" /><span class="od-sr-only">{t('qr.close')}</span>
          </Link>
        {/snippet}
      </Navbar>

      {#if received.duplicate}
        <p class="od-qr-received--duplicate" role="status">
          <strong>{t('qr.duplicateTitle')}</strong>
          <span>{t('qr.duplicateText')}</span>
        </p>
      {/if}

      <div class="od-qr-received--card">
        <p class="od-qr-received--date">{formatLongDateTime(preview.date)}</p>
        <p class="od-qr-received--site">{preview.site || t('qr.noSite')}</p>
        {#if preview.country}<p class="od-qr-received--country">{preview.country}</p>{/if}
        <div class="od-qr-received--figures">
          {#if preview.maxDepthMm}
            <span><span class="od-qr-received--value">{formatDepth(preview.maxDepthMm, prefs)}</span><span class="od-qr-received--caption">{t('qr.deepest')}</span></span>
          {/if}
          {#if preview.durationSeconds}
            <span><span class="od-qr-received--value">{formatMinutes(preview.durationSeconds)}</span><span class="od-qr-received--caption">{t('qr.underwater')}</span></span>
          {/if}
          {#if preview.minTempMk !== null}
            <span><span class="od-qr-received--value">{formatTemperature(preview.minTempMk, prefs)}</span><span class="od-qr-received--caption">{t('qr.waterMin')}</span></span>
          {/if}
        </div>
        {#if shape}
          <svg class="od-qr-received--profile" viewBox="0 0 326 90" preserveAspectRatio="none" aria-hidden="true">
            <path class="od-qr-received--area" d={shape.area}></path>
            <path class="od-qr-received--line" d={shape.line}></path>
          </svg>
        {/if}
        {#if rows.length}
          <div class="od-qr-received--rows">
            {#each rows as [label, value]}
              <div class="od-qr-received--row"><span class="od-qr-received--label">{label}</span><span class="od-qr-received--text">{value}</span></div>
            {/each}
          </div>
        {/if}
      </div>

      <p class="od-qr-received--note">{t(isPlan ? 'qr.notePlan' : 'qr.noteDive')}</p>

      <div class="od-qr-received--actions">
        <Link popupClose class="od-qr-received--cancel">{t('qr.cancel')}</Link>
        <button type="button" class="od-qr-received--add" disabled={received.adding} onclick={addReceived}>
          {received.duplicate ? t('qr.addAnyway') : t(isPlan ? 'qr.addPlan' : 'qr.addDive')}
        </button>
      </div>
    </Page>
  </Popup>
{/if}

<style>
  @layer od.components {
    :global(.od-qr-received .page) {
      background: var(--od-background);
    }

    .od-qr-received--duplicate {
      margin: 8px 16px 0;
      padding: 12px 16px;
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      background: var(--od-surface-container-highest);
      color: var(--od-text);
      font-size: 15px;
    }

    .od-qr-received--card {
      margin: 8px 16px 0;
      padding: 16px;
      border-radius: 16px;
      background: var(--od-surface);
    }

    .od-qr-received--card p {
      margin: 0;
    }

    .od-qr-received--date,
    .od-qr-received--country {
      font-size: 14px;
      color: var(--od-text-2);
    }

    .od-qr-received--site {
      margin-top: 2px;
      font-size: 24px;
      line-height: 30px;
      font-weight: 700;
      color: var(--od-text);
    }

    .od-qr-received--figures {
      margin-top: 14px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }

    .od-qr-received--value {
      display: block;
      font-size: 22px;
      font-weight: 700;
      color: var(--od-text);
    }

    .od-qr-received--caption {
      font-size: 13px;
      color: var(--od-text-2);
    }

    .od-qr-received--profile {
      display: block;
      width: 100%;
      height: 90px;
      margin-top: 14px;
    }

    .od-qr-received--area {
      fill: var(--od-water-top);
    }

    .od-qr-received--line {
      fill: none;
      stroke: var(--od-action);
      stroke-width: 2;
      vector-effect: non-scaling-stroke;
    }

    .od-qr-received--rows {
      margin-top: 10px;
    }

    .od-qr-received--row {
      min-height: 44px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 15px;
    }

    .od-qr-received--row + .od-qr-received--row {
      border-top: 1px solid var(--od-separator);
    }

    .od-qr-received--label {
      flex: 1;
      color: var(--od-text-2);
    }

    .od-qr-received--text {
      color: var(--od-text);
      text-align: end;
      font-variant-numeric: tabular-nums;
    }

    .od-qr-received--note {
      margin: 16px 24px 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .od-qr-received--actions {
      margin: 24px 16px calc(24px + var(--f7-safe-area-bottom, 0px));
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }

    :global(.od-qr-received--cancel),
    .od-qr-received--add {
      height: 48px;
      padding: 0 24px;
      border-radius: 24px;
      font: inherit;
      font-size: 16px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
    }

    :global(.od-qr-received--cancel) {
      border: 1px solid var(--od-outline);
      color: var(--od-text);
    }

    .od-qr-received--add {
      border: none;
      background: var(--od-action);
      color: var(--od-on-action);
    }

    .od-qr-received--add:disabled {
      opacity: 0.5;
    }
  }
</style>
