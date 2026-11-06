<script>
  // @ts-check
  // The dive to plan and the planner-only settings (spec, section 4,
  // "Settings, modelled on Subsurface": rates, reserve, SAC, ppO2 at the
  // bottom and at deco, last stop, gas switches stay in the planner, as
  // Subsurface-mobile's "Dive planner setup"). The deco model, gradient
  // factors and VPM-B conservatism are only shown: they are set in Settings.
  // A change applies at once; the plan is computed again on return.
  import { Page, Navbar, Link } from 'framework7-svelte';
  import TextField from '../components/TextField.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { planner, setting, setSetting, resetSettings } from '../lib/planner.svelte.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { formatNumber, depthUnit } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  const prefs = $derived(logbook.prefs);
  const feet = prefs.length === 'ft';
  const psi = prefs.pressure === 'psi';
  const cuft = prefs.volume === 'cuft';
  const MM_PER_UNIT = feet ? 304.8 : 1000;
  const MBAR_PER_UNIT = psi ? 68.947572932 : 1000;
  const ML_PER_CUFT = 28316.8466;

  const depthU = depthUnit(prefs);
  const pressureU = t(psi ? 'units.psi' : 'units.bar');
  const sacU = t(cuft ? 'units.cubicFeetPerMinute' : 'units.litersPerMinute');
  const rateU = `${depthU}/${t('units.minutes')}`;

  /** "12,5" or "12.5" → 12.5; NaN when not a number. @param {string} text */
  function parse(text) {
    const value = Number(String(text).trim().replace(',', '.'));
    return text.trim() === '' ? NaN : value;
  }

  /** @param {number} value @param {number} decimals */
  function show(value, decimals = 0) {
    return formatNumber(value, decimals).replace(/\s/g, '');
  }

  /**
   * One numeric field: its value in the field's unit, and how it is stored.
   * @typedef {{ key: string, label: string, unit: string, decimals?: number, min: number, max: number,
   *   get: () => number, set: (v: number) => void }} Field
   */

  /** @type {Field[]} */
  const diveFields = [
    { key: 'depth', label: t('plan.depth'), unit: depthU, min: 1, max: feet ? 980 : 300,
      get: () => planner.depthMm / MM_PER_UNIT, set: (v) => (planner.depthMm = v * MM_PER_UNIT) },
    { key: 'time', label: t('plan.bottomTime'), unit: t('units.minutes'), min: 1, max: 360,
      get: () => planner.bottomTimeSeconds / 60, set: (v) => (planner.bottomTimeSeconds = Math.round(v * 60)) },
  ];

  /** @type {Field[]} */
  const gasFields = [
    { key: 'o2', label: t('plan.oxygenPercent'), unit: t('units.percent'), min: 1, max: 100,
      get: () => planner.o2Permille / 10, set: (v) => {
        planner.o2Permille = Math.round(v * 10);
        planner.hePermille = Math.min(planner.hePermille, 1000 - planner.o2Permille);
      } },
    { key: 'he', label: t('plan.heliumPercent'), unit: t('units.percent'), min: 0, max: 99,
      get: () => planner.hePermille / 10, set: (v) => (planner.hePermille = Math.min(Math.round(v * 10), 1000 - planner.o2Permille)) },
    // In cubic feet, the gas volume at the start pressure, as Subsurface shows it.
    { key: 'size', label: t('plan.cylinderSize'), unit: t(cuft ? 'units.cubicFeet' : 'units.liters'), decimals: 1, min: 0.1, max: cuft ? 600 : 100,
      get: () => (cuft ? (planner.sizeMl / ML_PER_CUFT) * (planner.startMbar / 1013.25) : planner.sizeMl / 1000),
      set: (v) => (planner.sizeMl = cuft ? (v * ML_PER_CUFT) / (planner.startMbar / 1013.25) : v * 1000) },
    { key: 'pressure', label: t('plan.startPressure'), unit: pressureU, min: 10 / (MBAR_PER_UNIT / 1000), max: 350000 / MBAR_PER_UNIT,
      get: () => planner.startMbar / MBAR_PER_UNIT, set: (v) => (planner.startMbar = v * MBAR_PER_UNIT) },
  ];

  /** @param {number} mlMin */
  const sacValue = (mlMin) => (cuft ? mlMin / ML_PER_CUFT : mlMin / 1000);
  /** @param {number} v */
  const sacStored = (v) => Math.round(cuft ? v * ML_PER_CUFT : v * 1000);

  /** @type {Field[]} */
  const sacFields = [
    { key: 'bottomSac', label: t('plan.bottomSac'), unit: sacU, decimals: cuft ? 2 : 1, min: 0.01, max: 100,
      get: () => sacValue(planner.bottomSacMlMin), set: (v) => (planner.bottomSacMlMin = sacStored(v)) },
    { key: 'decoSac', label: t('plan.decoSac'), unit: sacU, decimals: cuft ? 2 : 1, min: 0.01, max: 100,
      get: () => sacValue(Number(setting('decoSacMlMin'))), set: (v) => setSetting('decoSacMlMin', sacStored(v)) },
  ];

  /**
   * A rate setting, in metres or feet per minute.
   * @param {'descentMmMin'|'ascent75MmMin'|'ascent50MmMin'|'ascentStopsMmMin'|'ascentLast6mMmMin'} key
   * @param {string} label
   * @returns {Field}
   */
  const rate = (key, label) => ({ key, label, unit: rateU, min: 1, max: feet ? 330 : 100,
    get: () => Number(setting(key)) / MM_PER_UNIT, set: (v) => setSetting(key, Math.round(v * MM_PER_UNIT)) });

  /** @type {Field[]} */
  const rateFields = [
    rate('descentMmMin', t('plan.descent')),
    rate('ascent75MmMin', t('plan.ascent75')),
    rate('ascent50MmMin', t('plan.ascent50')),
    rate('ascentStopsMmMin', t('plan.ascentStops')),
    rate('ascentLast6mMmMin', feet ? t('plan.ascentLast20ft') : t('plan.ascentLast6m')),
  ];

  /** @type {Field[]} */
  const gasSettingFields = [
    { key: 'bottomPo2', label: t('plan.bottomPo2'), unit: t('units.bar'), decimals: 2, min: 0.16, max: 2,
      get: () => Number(setting('bottomPo2Mbar')) / 1000, set: (v) => setSetting('bottomPo2Mbar', Math.round(v * 1000)) },
    { key: 'decoPo2', label: t('plan.decoPo2'), unit: t('units.bar'), decimals: 2, min: 0.16, max: 2,
      get: () => Number(setting('decoPo2Mbar')) / 1000, set: (v) => setSetting('decoPo2Mbar', Math.round(v * 1000)) },
    { key: 'minSwitch', label: t('plan.minSwitch'), unit: t('units.minutes'), min: 0, max: 10,
      get: () => Number(setting('minSwitchSeconds')) / 60, set: (v) => setSetting('minSwitchSeconds', Math.round(v * 60)) },
  ];

  /** @type {Field[]} */
  const reserveFields = [
    { key: 'problem', label: t('plan.problemSolving'), unit: t('units.minutes'), min: 0, max: 10,
      get: () => Number(setting('problemSolvingMinutes')), set: (v) => setSetting('problemSolvingMinutes', Math.round(v)) },
    { key: 'sacFactor', label: t('plan.sacFactor'), unit: t('plan.timesUnit'), decimals: 1, min: 1, max: 10,
      get: () => Number(setting('sacFactor')) / 100, set: (v) => setSetting('sacFactor', Math.round(v * 100)) },
    { key: 'reserve', label: t('plan.reserveRecreational'), unit: pressureU, min: 0, max: 300000 / MBAR_PER_UNIT,
      get: () => Number(setting('reserveMbar')) / MBAR_PER_UNIT, set: (v) => setSetting('reserveMbar', Math.round(v * MBAR_PER_UNIT)) },
  ];

  const all = [...diveFields, ...gasFields, ...sacFields, ...rateFields, ...gasSettingFields, ...reserveFields];

  /** The text of each field, as typed. @type {Record<string, string>} */
  let texts = $state({});
  /** @type {Record<string, boolean>} */
  let invalid = $state({});

  function fill() {
    for (const f of all) texts[f.key] = show(f.get(), f.decimals ?? 0);
    invalid = {};
  }
  fill();

  /** @param {Field} f */
  function commit(f) {
    const v = parse(texts[f.key]);
    if (Number.isNaN(v) || v < f.min || v > f.max) {
      invalid[f.key] = true;
      return;
    }
    invalid[f.key] = false;
    f.set(v);
    planner.version++;
  }

  /** @type {{ key: 'lastStop6m'|'safetyStop'|'switchAtRequiredStop'|'o2Breaks', label: string, text?: string }[]} */
  const switches = [
    { key: 'lastStop6m', label: feet ? t('plan.lastStop20ft') : t('plan.lastStop6m') },
    { key: 'safetyStop', label: t('plan.safetyStop'), text: t('plan.safetyStopText') },
    { key: 'switchAtRequiredStop', label: t('plan.switchAtRequiredStop') },
    { key: 'o2Breaks', label: t('plan.o2Breaks') },
  ];

  /** The shared deco settings, shown only. */
  const deco = $derived.by(() => {
    const s = planner.setup;
    if (!s) return '';
    if (s.model === 'vpmb') return t('plan.decoVpmb', { n: s.vpmbConservatism });
    return t(s.model === 'recreational' ? 'plan.decoRecreational' : 'plan.decoBuehlmann', { low: s.gfLow, high: s.gfHigh });
  });

  function reset() {
    confirmAction({
      title: t('plan.resetTitle'),
      text: t('plan.resetText'),
      action: t('plan.resetAction'),
      onConfirm: () => {
        resetSettings();
        fill();
      },
    });
  }
</script>

{#snippet fields(/** @type {Field[]} */ list)}
  {#each list as f (f.key)}
    <TextField
      label={`${f.label} (${f.unit})`}
      bind:value={texts[f.key]}
      inputmode="decimal"
      invalid={invalid[f.key]}
      supporting={invalid[f.key] ? t('plan.outOfRange', { min: show(f.min, f.decimals ?? 0), max: show(f.max, f.decimals ?? 0) }) : ''}
      onchange={() => commit(f)}
    />
  {/each}
{/snippet}

<Page>
  <Navbar title={t('plan.setupTitle')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('plan.backToPlan')}</span>
      </Link>
    {/snippet}
  </Navbar>

  <div class="block-title">{t('plan.groupDive')}</div>
  <div class="od-form-surface">{@render fields(diveFields)}</div>

  <div class="block-title">{t('plan.groupGas')}</div>
  <div class="od-form-surface">{@render fields(gasFields)}</div>

  <div class="block-title">{t('plan.groupSac')}</div>
  <div class="od-form-surface">{@render fields(sacFields)}</div>

  <div class="block-title">{t('plan.groupRates')}</div>
  <div class="od-form-surface">{@render fields(rateFields)}</div>

  <div class="block-title">{t('plan.groupStops')}</div>
  <div class="od-form-surface">
    {@render fields(gasSettingFields)}
    <ul class="switches">
      {#each switches as s (s.key)}
        <li>
          <label class="switch-row">
            <span class="text">
              <span>{s.label}</span>
              {#if s.text}<span class="sub">{s.text}</span>{/if}
            </span>
            <span class="toggle">
              <input type="checkbox" checked={!!setting(s.key)} onchange={(e) => setSetting(s.key, e.currentTarget.checked)} />
              <span class="toggle-icon"></span>
            </span>
          </label>
        </li>
      {/each}
    </ul>
  </div>

  <div class="block-title">{t('plan.groupReserve')}</div>
  <div class="od-form-surface">{@render fields(reserveFields)}</div>

  <div class="block-title">{t('plan.groupDeco')}</div>
  <div class="list list-strong inset list-dividers">
    <ul>
      <li>
        <a class="item-link item-content" href="/settings/">
          <div class="item-inner">
            <div class="item-title">
              {deco}
              <div class="item-footer" style:white-space="normal">{t('plan.decoNote')}</div>
            </div>
          </div>
        </a>
      </li>
    </ul>
  </div>

  <div class="actions">
    <button type="button" class="od-outlined-button" onclick={reset}>{t('plan.reset')}</button>
  </div>
  <div class="end" aria-hidden="true"></div>
</Page>

<style>
  @layer od.components {
    .switches {
      list-style: none;
      margin: 8px 0 0;
      padding: 0;
    }

    .switch-row {
      min-height: 56px;
      padding: 8px 24px 8px 16px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 16px;
      font-size: 16px;
      color: var(--od-text);

      .text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }

      .sub {
        font-size: 14px;
        line-height: 20px;
        color: var(--od-text-2);
      }

      .toggle {
        flex: none;
      }
    }

    .actions {
      margin: 24px 16px 0;
      display: flex;
      justify-content: center;
    }

    .end {
      height: 32px;
    }
  }
</style>
