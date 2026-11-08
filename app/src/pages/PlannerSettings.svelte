<script>
  // @ts-check
  // Planner settings, a screen of their own (spec, section 4; docs/mockups/
  // reglages-planificateur-android.dc.html; tasks 2026-11-08-01, 03, 04):
  // opened from the planner's "tune" button, at /settings/planner. Four groups
  // as in Settings: value rows open the number (wheel) or choice dialogs,
  // switches change in place. The values are the core's planner preferences,
  // kept on this device, with Subsurface's defaults; one ascent rate is
  // written to Subsurface's four depth bands.
  import { Page, Navbar, Link, theme } from 'framework7-svelte';
  import ChoiceDialog from '../components/ChoiceDialog.svelte';
  import WheelDialog from '../components/WheelDialog.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { planner, loadSetup, setting, setSetting, ascentRate, setAscentRate, DEFAULT_ASCENT_MM_MIN } from '../lib/planner.svelte.js';
  import { formatNumber, depthUnit } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  loadSetup().catch((e) => console.error('Planner settings', e));

  const prefs = $derived(logbook.prefs);
  const feet = $derived(prefs.length === 'ft');
  const psi = $derived(prefs.pressure === 'psi');
  const cuft = $derived(prefs.volume === 'cuft');
  const MM_PER_FT = 304.8;
  const MBAR_PER_PSI = 68.947572932;
  const ML_PER_CUFT = 28316.8466;

  /** @param {number} min @param {number} max @param {number} step */
  function range(min, max, step) {
    /** @type {number[]} */
    const out = [];
    for (let v = min; v <= max + step / 1000; v += step) out.push(Math.round(v * 1000) / 1000);
    return out;
  }

  /** Index of the value closest to `value`. @param {number[]} list @param {number} value */
  function nearest(list, value) {
    let best = 0;
    list.forEach((v, i) => {
      if (Math.abs(v - value) < Math.abs(list[best] - value)) best = i;
    });
    return best;
  }

  /**
   * A number row: the stored value, its wheel in the user's unit, the
   * stored default.
   * @typedef {{ kind: 'number', id: string, label: string, text?: string, stored: number, def: number,
   *   wheel: number[], toUnit: (stored: number) => number, toStored: (v: number) => number,
   *   show: (v: number) => string, set: (stored: number) => unknown }} NumberRow
   * @typedef {{ kind: 'choice', id: string, label: string, value: string, current: string,
   *   options: { value: string, label: string }[], set: (v: string) => unknown }} ChoiceRow
   * @typedef {{ kind: 'switch', id: string, label: string, text?: string, checked: boolean, set: (v: boolean) => unknown }} SwitchRow
   * @typedef {NumberRow|ChoiceRow|SwitchRow} Row
   */

  const perMinute = $derived(`${depthUnit(prefs)}/${t('units.minutes')}`);
  const sacUnit = $derived(t(cuft ? 'units.cubicFeetPerMinute' : 'units.litersPerMinute'));

  /** A rate in m/min or ft/min. @returns {NumberRow} */
  const rateRow = (/** @type {string} */ id, /** @type {string} */ label, /** @type {number} */ stored, /** @type {number} */ def, /** @type {(v: number) => unknown} */ set) => ({
    kind: 'number',
    id,
    label,
    stored,
    def,
    wheel: feet ? range(3, 200, 1) : range(1, 60, 1),
    toUnit: (mm) => (feet ? mm / MM_PER_FT : mm / 1000),
    toStored: (v) => Math.round(feet ? v * MM_PER_FT : v * 1000),
    show: (v) => `${formatNumber(v, 0)} ${perMinute}`,
    set,
  });

  /** A SAC in L/min or cuft/min. @returns {NumberRow} */
  const sacRow = (/** @type {'bottomSacMlMin'|'decoSacMlMin'} */ key, /** @type {string} */ label, /** @type {number} */ def, /** @type {string} */ text = '') => ({
    kind: 'number',
    id: key,
    label,
    text,
    stored: Number(setting(key)),
    def,
    wheel: cuft ? range(0.2, 1.5, 0.01) : range(5, 40, 1),
    toUnit: (ml) => (cuft ? ml / ML_PER_CUFT : ml / 1000),
    toStored: (v) => Math.round(cuft ? v * ML_PER_CUFT : v * 1000),
    show: (v) => `${formatNumber(v, cuft ? 2 : 0)} ${sacUnit}`,
    set: (ml) => setSetting(key, ml),
  });

  /** A ppO₂, always in bar. @returns {NumberRow} */
  const po2Row = (/** @type {'bottomPo2Mbar'|'decoPo2Mbar'} */ key, /** @type {string} */ label, /** @type {number} */ def) => ({
    kind: 'number',
    id: key,
    label,
    stored: Number(setting(key)),
    def,
    wheel: range(1, 2, 0.1),
    toUnit: (mbar) => mbar / 1000,
    toStored: (v) => Math.round(v * 1000),
    show: (v) => `${formatNumber(v, 1)} ${t('units.bar')}`,
    set: (mbar) => setSetting(key, mbar),
  });

  /** @type {{ id: string, title: string, rows: Row[] }[]} */
  const groups = $derived.by(() => {
    planner.setup; // read again after each change
    const lastStopUnit = depthUnit(prefs);
    return [
      {
        id: 'rates',
        title: t('plannerSettings.groups.rates'),
        rows: [
          rateRow('ascent', t('plannerSettings.ascent'), ascentRate(), DEFAULT_ASCENT_MM_MIN, (mm) => setAscentRate(mm)),
          rateRow('descent', t('plannerSettings.descent'), Number(setting('descentMmMin')), 18000, (mm) => setSetting('descentMmMin', mm)),
        ],
      },
      {
        id: 'stops',
        title: t('plannerSettings.groups.stops'),
        rows: [
          {
            kind: 'choice',
            id: 'lastStop',
            label: t('plannerSettings.lastStop'),
            value: `${feet ? (setting('lastStop6m') ? 20 : 10) : setting('lastStop6m') ? 6 : 3} ${lastStopUnit}`,
            current: setting('lastStop6m') ? '6' : '3',
            options: [
              { value: '3', label: `${feet ? 10 : 3} ${lastStopUnit}` },
              { value: '6', label: `${feet ? 20 : 6} ${lastStopUnit}` },
            ],
            set: (v) => setSetting('lastStop6m', v === '6'),
          },
          { kind: 'switch', id: 'dropStone', label: t('plannerSettings.dropStone'), text: t('plannerSettings.dropStoneText'),
            checked: !!setting('dropStone'), set: (v) => setSetting('dropStone', v) },
          { kind: 'switch', id: 'o2Breaks', label: t('plannerSettings.o2Breaks'), text: t('plannerSettings.o2BreaksText'),
            checked: !!setting('o2Breaks'), set: (v) => setSetting('o2Breaks', v) },
          { kind: 'switch', id: 'switchAtStop', label: t('plannerSettings.switchAtStop'),
            checked: !!setting('switchAtRequiredStop'), set: (v) => setSetting('switchAtRequiredStop', v) },
          {
            kind: 'number',
            id: 'minSwitch',
            label: t('plannerSettings.minSwitch'),
            stored: Number(setting('minSwitchSeconds')),
            def: 60,
            wheel: range(0, 9, 1),
            toUnit: (s) => s / 60,
            toStored: (v) => Math.round(v * 60),
            show: (v) => `${formatNumber(v, 0)} ${t('units.minutes')}`,
            set: (s) => setSetting('minSwitchSeconds', s),
          },
        ],
      },
      {
        id: 'gas',
        title: t('plannerSettings.groups.gas'),
        rows: [
          sacRow('bottomSacMlMin', t('plannerSettings.bottomSac'), 20000, t('plannerSettings.bottomSacText')),
          sacRow('decoSacMlMin', t('plannerSettings.decoSac'), 17000),
          po2Row('bottomPo2Mbar', t('plannerSettings.bottomPo2'), 1400),
          po2Row('decoPo2Mbar', t('plannerSettings.decoPo2'), 1600),
        ],
      },
      {
        id: 'reserve',
        title: t('plannerSettings.groups.reserve'),
        rows: [
          {
            kind: 'number',
            id: 'reserve',
            label: t('plannerSettings.reserve'),
            stored: Number(setting('reserveMbar')),
            def: 40000,
            wheel: psi ? range(0, 1500, 10) : range(0, 100, 5),
            toUnit: (mbar) => (psi ? mbar / MBAR_PER_PSI : mbar / 1000),
            toStored: (v) => Math.round(psi ? v * MBAR_PER_PSI : v * 1000),
            show: (v) => `${formatNumber(v, 0)} ${t(psi ? 'units.psi' : 'units.bar')}`,
            set: (mbar) => setSetting('reserveMbar', mbar),
          },
          {
            kind: 'number',
            id: 'problem',
            label: t('plannerSettings.problemSolving'),
            stored: Number(setting('problemSolvingMinutes')),
            def: 4,
            wheel: range(0, 10, 1),
            toUnit: (m) => m,
            toStored: (v) => Math.round(v),
            show: (v) => `${formatNumber(v, 0)} ${t('units.minutes')}`,
            set: (m) => setSetting('problemSolvingMinutes', m),
          },
          {
            kind: 'number',
            id: 'sacFactor',
            label: t('plannerSettings.sacFactor'),
            stored: Number(setting('sacFactor')),
            def: 200,
            wheel: range(1, 5, 0.1),
            toUnit: (x) => x / 100,
            toStored: (v) => Math.round(v * 100),
            show: (v) => formatNumber(v, 1),
            set: (x) => setSetting('sacFactor', x),
          },
        ],
      },
    ];
  });

  /** The value shown on a number row: the stored value in the user's unit. @param {NumberRow} row */
  const shown = (row) => row.show(row.wheel[nearest(row.wheel, row.toUnit(row.stored))]);

  /** @type {null|{ kind: 'number', row: NumberRow }|{ kind: 'choice', row: ChoiceRow }} */
  let dialog = $state(null);

  /** @param {unknown} e */
  function failed(e) {
    console.error('Planner setting', e);
  }
</script>

{#snippet rowView(/** @type {Row} */ row)}
  {#if row.kind === 'switch'}
    <label class="row">
      <span class="texts">
        <span class="label">{row.label}</span>
        {#if row.text}<span class="supporting">{row.text}</span>{/if}
      </span>
      <span class="toggle">
        <input type="checkbox" checked={row.checked} onchange={(e) => Promise.resolve(row.set(e.currentTarget.checked)).catch(failed)} />
        <span class="toggle-icon"></span>
      </span>
    </label>
  {:else}
    <button type="button" class="row" aria-haspopup="dialog" onclick={() => (dialog = row.kind === 'number' ? { kind: 'number', row } : { kind: 'choice', row })}>
      <span class="texts">
        <span class="label">{row.label}</span>
        {#if row.kind === 'number' && row.text}<span class="supporting">{row.text}</span>{/if}
      </span>
      <span class="value od-value">{row.kind === 'number' ? shown(row) : row.value}</span>
      <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"></path></svg>
    </button>
  {/if}
{/snippet}

<Page class="od-planner-settings {theme.ios ? 'ios-list' : ''}">
  <Navbar title={t('plannerSettings.title')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('detail.back')}</span>
      </Link>
    {/snippet}
  </Navbar>

  <p class="intro">{t('plannerSettings.intro')}</p>

  {#if planner.setup}
    {#each groups as g (g.id)}
      <h2 class="title">{g.title}</h2>
      <div class="surface" role="list">
        {#each g.rows as row (row.id)}<div role="listitem">{@render rowView(row)}</div>{/each}
      </div>
    {/each}
  {/if}
  <div class="end" aria-hidden="true"></div>
</Page>

{#if dialog?.kind === 'choice'}
  {@const row = dialog.row}
  <ChoiceDialog
    title={row.label}
    options={row.options}
    value={row.current}
    oncancel={() => (dialog = null)}
    onselect={(v) => {
      const chosen = row;
      dialog = null;
      if (v !== chosen.current) Promise.resolve(chosen.set(v)).catch(failed);
    }}
  />
{:else if dialog?.kind === 'number'}
  {@const row = dialog.row}
  <WheelDialog
    title={row.label}
    wheels={[
      {
        label: row.label,
        values: row.wheel.map(row.show),
        index: nearest(row.wheel, row.toUnit(row.stored)),
        defaultIndex: nearest(row.wheel, row.toUnit(row.def)),
      },
    ]}
    oncancel={() => (dialog = null)}
    onconfirm={(indexes) => {
      const chosen = row;
      dialog = null;
      Promise.resolve(chosen.set(chosen.toStored(chosen.wheel[indexes[0]]))).catch(failed);
    }}
  />
{/if}

<style>
  @layer od.components {
    /* As Settings (spec, section 4, layout): titles on the page background,
       groups as rounded white surfaces, no dividers, 48 dp rows. */
    .intro {
      margin: 8px 20px 0;
      font-size: 16px;
      line-height: 24px;
      color: var(--od-text-2);
    }

    .title {
      margin: 0;
      padding: 22px 20px 8px;
      font-size: 18px;
      line-height: 24px;
      font-weight: 700;
      color: var(--od-text);
    }

    .surface {
      margin: 0 16px;
      border-radius: 20px;
      background: var(--od-surface);
      overflow: hidden;

      :global(.ios-list) & {
        border-radius: 10px;
      }
    }

    .row {
      box-sizing: border-box;
      width: 100%;
      min-height: 48px;
      padding: 10px 16px;
      border: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      text-align: start;
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
    }

    .texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .label {
      font-size: 16px;
      line-height: 24px;
    }

    .supporting {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .value {
      flex: none;
      font-size: 14px;
      color: var(--od-text-2);
      text-align: end;
    }

    .chevron {
      flex: none;
      width: 18px;
      height: 18px;
      fill: none;
      stroke: var(--od-text-2);
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    /* Framework7's switch, as in Settings. */
    .toggle {
      flex: none;
    }

    .end {
      height: 32px;
    }
  }
</style>
