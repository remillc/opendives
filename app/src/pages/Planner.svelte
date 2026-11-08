<script>
  // @ts-check
  // Dive planner (spec, section 4, "Planner"; mock-ups android-planificateur
  // and ios-planificateur). From a logbook dive (gas, cylinder, start pressure
  // and measured SAC taken from it) or a new dive. The plan, gas use, minimum
  // gas, CNS and OTU all come from the core (Subsurface's planner); nothing is
  // written to the logbook. An insufficient reserve is an ordinary row whose
  // value is in --od-alarm, with the gap spelled out.
  import { Page, Navbar, Link, List, ListItem, Popup, theme } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from '../components/Icon.svelte';
  import ProfileThumbnail from '../components/ProfileThumbnail.svelte';
  import TextField from '../components/TextField.svelte';
  import SelectField from '../components/SelectField.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { planner, loadSetup, planRequest, startFromDive, startNewDive } from '../lib/planner.svelte.js';
  import { waterBottomColor } from '../lib/water-column.js';
  import {
    formatCylinderSize,
    formatDateTime,
    formatGas,
    formatNumber,
    formatPressure,
    depthUnit,
    locale,
  } from '../lib/format.js';
  import { t } from '../lib/i18n.js';
  import { WATER_TYPES, waterTypeName, waterTypeOfSalinity } from '../lib/tools.js';

  /** @type {{ f7route: { params: { id: string } }, f7router: { navigate: (url: string) => void } }} */
  let { f7route, f7router } = $props();

  const uid = $props.id();
  const prefs = $derived(logbook.prefs);
  const feet = $derived(prefs.length === 'ft');

  let result = $state(/** @type {import('opendives-core').PlanResult|null} */ (null));
  let failed = $state(false);
  let ready = $state(false);
  let choosing = $state(false);

  /** Reads the shared settings again (they may have changed in Settings), then plans. */
  async function refresh() {
    try {
      await loadSetup();
      ready = true;
      planner.version++;
    } catch (e) {
      console.error('Planner setup', e);
      failed = true;
    }
  }

  /** @param {number} id */
  async function startFrom(id) {
    const summary = logbook.dives.find((d) => d.id === id);
    try {
      const dive = await OpenDivesCore.getDive({ id });
      startFromDive(
        dive,
        {
          id,
          date: dive.date,
          site: dive.site,
          maxDepthMm: dive.maxDepthMm,
          profile: summary?.profile ?? [],
        },
        feet,
      );
    } catch (e) {
      console.error('Planner source', e);
      failed = true;
    }
  }

  async function open() {
    const id = f7route.params.id;
    await refresh();
    if (id === 'new') {
      if (planner.source) startNewDive();
    } else if (planner.source?.id !== Number(id)) {
      await startFrom(Number(id));
    }
  }
  open();

  // The plan is computed again at each change of the dive or the settings.
  let run = 0;
  $effect(() => {
    planner.version;
    if (!ready) return;
    const request = planRequest();
    const mine = ++run;
    OpenDivesCore.planDive(request)
      .then((r) => {
        if (mine !== run) return;
        result = r;
        failed = false;
      })
      .catch((e) => {
        console.error('Plan', e);
        if (mine === run) failed = true;
      });
  });

  /** Whole metres or feet, as typed. @param {number} mm */
  function depthText(mm) {
    return `${formatNumber(feet ? mm / 304.8 : mm / 1000, 0)} ${depthUnit(prefs)}`;
  }

  /** Minutes rounded as Subsurface's plan table. @param {number} seconds */
  function minutes(seconds) {
    return `${formatNumber(Math.floor((seconds + 30) / 60), 0)} ${t('units.minutes')}`;
  }

  // --- The data of the plan, MD3 filled fields edited in place (task
  // 2026-11-08-06): the plan is computed again as soon as one changes.
  const MM_PER_FT = 304.8;
  const MBAR_PER_PSI = 68.947572932;
  const ML_PER_CUFT = 28316.8466;
  const psi = $derived(prefs.pressure === 'psi');
  const cuft = $derived(prefs.volume === 'cuft');

  /** A number as typed back: no thousands separator. @param {number} value @param {number} decimals */
  const show = (value, decimals = 0) =>
    new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: decimals }).format(value);
  /** "12,5" or "12.5" → 12.5; NaN when empty or not a number. @param {string} text */
  const parse = (text) => (text.trim() === '' ? NaN : Number(text.trim().replace(',', '.')));

  let depthField = $state('');
  let timeField = $state('');
  let pressureField = $state('');
  let sacField = $state('');
  /** @type {Record<string, boolean>} */
  let invalid = $state({});

  /** The fields from the plan: on opening, and when "Changer" brings another dive. */
  function fillFields() {
    depthField = show(feet ? planner.depthMm / MM_PER_FT : planner.depthMm / 1000);
    timeField = show(planner.bottomTimeSeconds / 60);
    pressureField = show(psi ? planner.startMbar / MBAR_PER_PSI : planner.startMbar / 1000);
    sacField = show(cuft ? planner.bottomSacMlMin / ML_PER_CUFT : planner.bottomSacMlMin / 1000, cuft ? 2 : 1);
    invalid = {};
  }
  $effect(() => {
    planner.source;
    ready;
    fillFields();
  });

  /**
   * A typed number into the plan, when it is within its range.
   * @param {string} key @param {string} text @param {number} min @param {number} max @param {(v: number) => void} set
   */
  function typed(key, text, min, max, set) {
    const v = parse(text);
    invalid[key] = !(v >= min && v <= max);
    if (invalid[key]) return;
    set(v);
    planner.version++;
  }

  /** The usual bottom gases, and the plan's own when it is another one. */
  const gasOptions = $derived.by(() => {
    const usual = [[209, 0], [280, 0], [320, 0], [360, 0], [400, 0], [210, 350], [180, 450], [150, 550], [120, 650]];
    const mine = [planner.o2Permille, planner.hePermille];
    const list = usual.some(([o, h]) => o === mine[0] && h === mine[1]) ? usual : [mine, ...usual];
    return list.map(([o, h]) => ({ value: `${o}/${h}`, label: formatGas(o, h) }));
  });
  let gasChoice = $state('');
  $effect(() => {
    gasChoice = `${planner.o2Permille}/${planner.hePermille}`;
  });
  $effect(() => {
    const [o2, he] = gasChoice.split('/').map(Number);
    if (!o2 || (o2 === planner.o2Permille && he === planner.hePermille)) return;
    planner.o2Permille = o2;
    planner.hePermille = he;
    planner.version++;
  });

  /** The cylinder types (Settings, Bouteilles), and the plan's own size when none matches. */
  let cylinderTypes = $state(/** @type {{ name: string, ml: number, workingPressureMbar: number }[]} */ ([]));
  OpenDivesCore.toolQuery({ kind: 'cylinders' })
    .then((/** @type {import('opendives-core').GasCylinderTypes} */ list) => (cylinderTypes = list.types.filter((c) => c.ml > 0)))
    .catch((/** @type {unknown} */ e) => console.error('Cylinder types', e));
  const cylinderOptions = $derived.by(() => {
    const own = { value: '', label: formatCylinderSize(planner.sizeMl, planner.startMbar, prefs) ?? '' };
    const types = cylinderTypes.map((c) => ({
      value: c.name,
      label: [c.name, formatCylinderSize(c.ml, c.workingPressureMbar, prefs)].filter(Boolean).join(', '),
    }));
    return types.some((c) => cylinderTypes.find((x) => x.name === c.value)?.ml === planner.sizeMl) ? types : [own, ...types];
  });
  let cylinderChoice = $state('');
  $effect(() => {
    cylinderChoice = cylinderTypes.find((c) => c.ml === planner.sizeMl)?.name ?? '';
  });
  $effect(() => {
    const type = cylinderTypes.find((c) => c.name === cylinderChoice);
    if (!type || type.ml === planner.sizeMl) return;
    planner.sizeMl = type.ml;
    planner.version++;
  });

  /** The water type: every depth to pressure conversion of the plan uses it. */
  let water = $state('');
  $effect(() => {
    water = waterTypeOfSalinity(planner.salinity);
  });
  $effect(() => {
    const salinity = WATER_TYPES.find((w) => w.id === water)?.salinity;
    if (!salinity || salinity === planner.salinity) return;
    planner.salinity = salinity;
    planner.version++;
  });
  const waterOptions = WATER_TYPES.map((w) => ({ value: w.id, label: waterTypeName(w.id) }));

  const errorText = $derived(result?.error ? t(`plan.errors.${result.error}`) : '');

  /** Profile of the plan, on the same water scale as the logbook. */
  const W = 358;
  const H = 88;
  const shape = $derived.by(() => {
    const points = result?.points ?? [];
    if (points.length < 2 || !result) return null;
    const tMax = points[points.length - 1][0] || 1;
    const dMax = result.maxDepthMm || 1;
    /** @param {number} s @param {number} mm */
    const xy = (s, mm) => `${((s / tMax) * W).toFixed(1)} ${(4 + (mm / dMax) * (H - 8)).toFixed(1)}`;
    const line = 'M' + points.map(([s, mm]) => xy(s, mm)).join(' L');
    // The decompression ceiling (task 2026-11-08-07): from the surface down
    // to the ceiling, on the same scales; none when the plan has no stop.
    const ceiling = result.stops?.length ? (result.ceiling ?? []).filter(([s]) => s <= tMax) : [];
    const deepest = Math.max(0, ...ceiling.map(([, mm]) => mm));
    const ceilingLine = deepest > 0 ? 'M' + ceiling.map(([s, mm]) => xy(s, mm)).join(' L') : '';
    const ceilingArea = ceilingLine ? `${ceilingLine} L${xy(ceiling[ceiling.length - 1][0], 0)} L${xy(ceiling[0][0], 0)} Z` : '';
    return { line, water: `${line} L${W} 0 L0 0 Z`, bottom: waterBottomColor(result.maxDepthMm), ceilingLine, ceilingArea, deepest };
  });

  const stops = $derived(
    (result?.stops ?? []).map((s) => ({
      depth: depthText(s.depthMm),
      duration: minutes(s.durationSeconds),
      runtime: minutes(s.runtimeSeconds),
      gas: s.gasChange && result ? formatGas(result.cylinders[s.cylinder].o2Permille, result.cylinders[s.cylinder].hePermille) : '',
    })),
  );

  const profileLabel = $derived(
    result
      ? t(stops.length ? 'plan.profileLabelStops' : 'plan.profileLabel', {
          depth: depthText(planner.depthMm),
          time: minutes(planner.bottomTimeSeconds),
          stops: (result.stops ?? []).map((s) => depthText(s.depthMm)).join(', '),
        }) + (shape?.deepest ? `, ${t('plan.ceilingLabel', { depth: depthText(shape.deepest) })}` : '')
      : '',
  );

  /** Gas, reserve and oxygen rows. */
  const gasRows = $derived.by(() => {
    if (!result) return [];
    /** @type {{ key: string, label: string, hint: string, value: string, alarm: boolean }[]} */
    const rows = [];
    result.cylinders.forEach((c, i) => {
      if (c.gasUsedMl <= 0) return;
      const name = formatGas(c.o2Permille, c.hePermille);
      const hasPressure = c.sizeMl > 0 && c.startMbar > 0;
      let hint = hasPressure
        ? t('plan.gasUse', { used: formatPressure(c.startMbar - c.endMbar, prefs), left: formatPressure(Math.max(0, c.endMbar), prefs) })
        : t('plan.gasUseVolume', { used: formatNumber(c.gasUsedMl / 1000, 0) });
      if (c.warning === 'MORE_THAN_AVAILABLE') hint = t('plan.warnings.MORE_THAN_AVAILABLE');
      if (c.warning === 'NO_RESERVE_FOR_SHARING') hint = t('plan.warnings.NO_RESERVE_FOR_SHARING');
      rows.push({
        key: `gas-${i}`,
        label: name,
        hint,
        value: hasPressure ? formatPressure(Math.max(0, c.endMbar), prefs) : `${formatNumber(c.gasUsedMl / 1000, 0)} ${t('units.liters')}`,
        alarm: c.warning === 'MORE_THAN_AVAILABLE' || c.warning === 'NO_RESERVE_FOR_SHARING',
      });
    });
    const m = result.minimumGas;
    if (m) {
      const short = m.deltaMbar < 0 || result.cylinders[m.cylinder]?.warning === 'NO_GAS_FOR_PROBLEM_SOLVING';
      rows.push({
        key: 'reserve',
        label: t('plan.minimumGas'),
        hint: t(short ? 'plan.reserveShort' : 'plan.reserveMargin', { gap: formatPressure(Math.abs(m.deltaMbar), prefs) }),
        value: formatPressure(m.pressureMbar, prefs),
        alarm: short,
      });
    }
    const bottom = result.cylinders[0];
    if (bottom && bottom.bottomModMm > 0 && planner.depthMm > bottom.bottomModMm) {
      rows.push({
        key: 'mod',
        label: t('plan.modTitle'),
        hint: t('plan.modText', {
          po2: formatNumber((result.setup.bottomPo2Mbar ?? 1400) / 1000, 1),
          depth: depthText(bottom.bottomModMm),
        }),
        value: depthText(bottom.bottomModMm),
        alarm: true,
      });
    }
    rows.push({
      key: 'oxygen',
      label: t('plan.oxygen'),
      hint: t('plan.oxygenHint'),
      value: t('plan.oxygenValue', { cns: result.cns, otu: result.otu }),
      alarm: false,
    });
    return rows;
  });

  /** Logbook dives to start from, newest first. */
  const choices = $derived([...logbook.dives].sort((a, b) => (a.date < b.date ? 1 : -1)));

  /** @param {number|null} id */
  async function choose(id) {
    choosing = false;
    if (id === null) startNewDive();
    else await startFrom(id);
  }

</script>

<Page onPageReinit={refresh}>
  <Navbar title={t('plan.title')}>
    {#snippet left()}
      <Link back iconOnly={!theme.ios}>
        <i class="icon icon-back"></i>
        {#if theme.ios}<span>{t('plan.back')}</span>{:else}<span class="od-sr-only">{t('plan.back')}</span>{/if}
      </Link>
    {/snippet}
    {#snippet right()}
      <!-- The planner's settings, a screen of their own (task 2026-11-08-01). -->
      <Link iconOnly href="/settings/planner">
        <Icon name="tune" /><span class="od-sr-only">{t('plannerSettings.open')}</span>
      </Link>
    {/snippet}
  </Navbar>

  {#if theme.ios}<h2 class="ios-header">{t('plan.fromLogbook')}</h2>{/if}
  <div class="inputs" class:ios={theme.ios}>
    <button type="button" class="source" onclick={() => (choosing = true)}>
      {#if planner.source}
        <ProfileThumbnail profile={planner.source.profile} maxDepthMm={planner.source.maxDepthMm} {prefs} />
        <span class="text">
          <span class="title">{t('plan.sourceTitle', { date: formatDateTime(planner.source.date) })}</span>
          <span class="sub">{t('plan.sourceText')}</span>
        </span>
      {:else}
        <span class="text">
          <span class="title">{t('plan.newDive')}</span>
          <span class="sub">{t('plan.newDiveText')}</span>
        </span>
      {/if}
      <span class="change">{t('plan.change')}</span>
    </button>

  </div>

  <!-- The data of the plan: two fields per line, 16 dp apart. -->
  <div class="fields">
    <div class="pair">
      <TextField label={t('plan.depth')} bind:value={depthField} inputmode="decimal" invalid={invalid.depth}
        oninput={() => typed('depth', depthField, 1, feet ? 980 : 300, (v) => (planner.depthMm = feet ? v * MM_PER_FT : v * 1000))}>
        {#snippet trailing()}<span class="unit">{depthUnit(prefs)}</span>{/snippet}
      </TextField>
      <TextField label={t('plan.bottomTime')} bind:value={timeField} inputmode="numeric" invalid={invalid.time}
        oninput={() => typed('time', timeField, 1, 360, (v) => (planner.bottomTimeSeconds = Math.round(v * 60)))}>
        {#snippet trailing()}<span class="unit">{t('units.minutes')}</span>{/snippet}
      </TextField>
    </div>
    <div class="pair">
      <SelectField label={t('plan.gas')} bind:value={gasChoice} options={gasOptions} />
      <SelectField label={t('plan.cylinder')} bind:value={cylinderChoice} options={cylinderOptions} />
    </div>
    <div class="pair">
      <TextField label={t('plan.startPressure')} bind:value={pressureField} inputmode="decimal" invalid={invalid.pressure}
        oninput={() => typed('pressure', pressureField, psi ? 150 : 10, psi ? 5000 : 350, (v) => (planner.startMbar = psi ? v * MBAR_PER_PSI : v * 1000))}>
        {#snippet trailing()}<span class="unit">{t(psi ? 'units.psi' : 'units.bar')}</span>{/snippet}
      </TextField>
      <TextField label={t('plan.sac')} bind:value={sacField} inputmode="decimal" invalid={invalid.sac}
        oninput={() => typed('sac', sacField, cuft ? 0.04 : 1, cuft ? 3.5 : 99, (v) => (planner.bottomSacMlMin = Math.round(cuft ? v * ML_PER_CUFT : v * 1000)))}>
        {#snippet trailing()}<span class="unit">{t(cuft ? 'units.cubicFeetPerMinute' : 'units.litersPerMinute')}</span>{/snippet}
      </TextField>
    </div>
    <SelectField label={t('plan.waterType')} bind:value={water} options={waterOptions} />
  </div>

  {#if failed}
    <p class="note">{t('plan.failed')}</p>
  {:else if result}
    <h2 class="section-title">{t('plan.result', { time: minutes(result.runtimeSeconds) })}</h2>
    <div class="plan">
      {#if errorText}<p class="error" role="alert">{errorText}</p>{/if}
      {#if shape}
        <svg class="profile" viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="img" aria-label={profileLabel}>
          <defs>
            <linearGradient id="plan-water-{uid}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style="stop-color: var(--od-water-top)" />
              <stop offset="1" style="stop-color: {shape.bottom}" />
            </linearGradient>
          </defs>
          <path d={shape.water} fill="url(#plan-water-{uid})" />
          <path d={shape.line} class="line" vector-effect="non-scaling-stroke" />
          {#if shape.ceilingArea}
            <path d={shape.ceilingArea} class="ceiling-area" />
            <path d={shape.ceilingLine} class="ceiling-line" vector-effect="non-scaling-stroke" />
          {/if}
        </svg>
        {#if shape.ceilingArea}
          <p class="legend"><span class="swatch" aria-hidden="true"></span>{t('plan.ceilingLegend')}</p>
        {/if}
      {/if}
      {#if stops.length}
        <table class="od-value">
          <thead>
            <tr>
              <th scope="col">{t('plan.stop')}</th>
              <th scope="col" class="num">{t('plan.duration')}</th>
              <th scope="col" class="num">{t('plan.runtime')}</th>
              <th scope="col">{t('plan.gasColumn')}</th>
            </tr>
          </thead>
          <tbody>
            {#each stops as stop, i (i)}
              <tr>
                <td class="depth">{stop.depth}</td>
                <td class="num">{stop.duration}</td>
                <td class="num">{stop.runtime}</td>
                <td>{stop.gas}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p class="no-stop">{t('plan.noStop')}</p>
      {/if}
    </div>

    {#if theme.ios}<h2 class="ios-header">{t('plan.gasAndOxygen')}</h2>{/if}
    <div class="results" class:ios={theme.ios}>
      {#each gasRows as row (row.key)}
        <div class="result">
          <span class="text"><span class="label">{row.label}</span><span class="hint">{row.hint}</span></span>
          <span class="value od-value" class:alarm={row.alarm}>{row.value}</span>
        </div>
      {/each}
    </div>
    <p class="note">{t(planner.source ? 'plan.noteFromDive' : 'plan.note')}</p>
  {:else}
    <div class="skeleton-block loading" aria-busy="true" aria-label={t('plan.computing')}></div>
  {/if}
  <div class="end" aria-hidden="true"></div>

  <Popup opened={choosing} onPopupClosed={() => (choosing = false)}>
    <Page>
      <Navbar title={t('plan.chooseTitle')}>
        {#snippet left()}
          <Link popupClose iconOnly>
            <Icon name="close" /><span class="od-sr-only">{t('plan.chooseClose')}</span>
          </Link>
        {/snippet}
      </Navbar>
      <List strongIos insetIos dividersIos>
        <ListItem link="#" title={t('plan.newDive')} footer={t('plan.newDiveText')} onClick={() => choose(null)} />
        {#each choices as dive (dive.id)}
          <ListItem
            link="#"
            title={dive.site || t('dive.siteNotSet')}
            footer={formatDateTime(dive.date)}
            onClick={() => choose(dive.id)}
          >
            {#snippet media()}<ProfileThumbnail profile={dive.profile} maxDepthMm={dive.maxDepthMm} {prefs} />{/snippet}
          </ListItem>
        {/each}
      </List>
    </Page>
  </Popup>
</Page>

<style>
  @layer od.components {
    /* Android: list items on the page background (MD3); iOS: an inset grouped list. */
    .inputs {
      display: flex;
      flex-direction: column;

      &.ios {
        margin: 0 16px;
        border-radius: 10px;
        background: var(--od-surface);
        overflow: hidden;
      }
    }

    .source {
      width: auto;
      margin: 0 16px;
      min-height: 72px;
      padding: 8px 16px;
      box-sizing: border-box;
      border: none;
      border-radius: 12px;
      background: var(--od-surface-2);
      color: var(--od-text);
      font: inherit;
      text-align: start;
      display: flex;
      align-items: center;
      gap: 16px;

      .text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }

      .title {
        font-size: 16px;
        line-height: 24px;
      }

      .sub {
        font-size: 14px;
        line-height: 20px;
        letter-spacing: 0.25px;
        color: var(--od-text-2);
      }

      .change {
        font-size: 14px;
        font-weight: 500;
      }

      .ios & {
        margin: 0;
        min-height: 60px;
        border-radius: 0;
        background: none;
        gap: 12px;
        border-bottom: 0.5px solid var(--od-separator);

        .title {
          font-size: 15px;
          line-height: 20px;
          font-weight: 600;
        }

        .sub {
          font-size: 13px;
          line-height: 18px;
          letter-spacing: 0;
        }

        .change {
          font-size: 15px;
          font-weight: 400;
        }
      }
    }

    .row {
      min-height: 56px;
      padding: 8px 24px 8px 16px;
      box-sizing: border-box;
      border: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      text-align: start;
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 16px;

      .label {
        flex: 1;
        min-width: 0;
        font-size: 16px;
        line-height: 24px;
        letter-spacing: 0.15px;
      }

      .value {
        font-size: 14px;
        color: var(--od-text-2);
        text-align: right;
      }

      .chevron {
        color: var(--od-text-2);
        transform: rotate(-90deg);
      }

      .ios & {
        min-height: 44px;
        padding: 0 16px;
        border-bottom: 0.5px solid var(--od-separator);

        &:last-child {
          border-bottom: none;
        }

        .label,
        .value {
          font-size: 17px;
          letter-spacing: 0;
        }

        .value {
          color: var(--od-text);
        }
      }
    }

    .section-title {
      margin: 4px 16px 0;
      min-height: 48px;
      display: flex;
      align-items: center;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.1px;
      color: var(--od-text);

      :global(.ios) & {
        margin: 14px 16px 6px 32px;
        min-height: 0;
        font-size: 13px;
        font-weight: 400;
        color: var(--od-text-2);
      }
    }

    .ios-header {
      margin: 14px 16px 6px 32px;
      font-size: 13px;
      font-weight: 400;
      color: var(--od-text-2);
    }

    .plan {
      margin: 0 16px;
      border-radius: 12px;
      background: var(--od-surface);
      overflow: hidden;

      :global(.ios) & {
        border-radius: 10px;
      }
    }

    .profile {
      display: block;
      width: 100%;
      height: 88px;

      .line {
        fill: none;
        stroke: var(--od-trace);
        stroke-width: 1.5;
        stroke-linejoin: round;
      }
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;

      th {
        padding: 8px 8px 4px;
        font-size: 12px;
        font-weight: 500;
        text-align: left;
        color: var(--od-text-2);

        &:first-child {
          padding-left: 16px;
        }
      }

      td {
        padding: 10px 8px;
        border-top: 1px solid var(--od-separator);

        &:first-child {
          padding-left: 16px;
        }

        &:last-child {
          padding-right: 16px;
        }
      }

      .num {
        text-align: right;
      }

      .depth {
        font-weight: 500;
      }

      :global(.ios) & {
        font-size: 15px;

        th {
          font-size: 13px;
          font-weight: 400;
        }

        td {
          border-top-width: 0.5px;
        }

        .depth {
          font-weight: 600;
        }
      }
    }

    .no-stop,
    .error {
      margin: 0;
      padding: 12px 16px;
      font-size: 14px;
    }

    .error {
      color: var(--od-alarm);
      font-weight: 500;
    }

    .results {
      margin-top: 8px;
      display: flex;
      flex-direction: column;

      &.ios {
        margin: 0 16px;
        border-radius: 10px;
        background: var(--od-surface);
        overflow: hidden;
      }
    }

    .result {
      min-height: 72px;
      padding: 8px 24px 8px 16px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 16px;

      .text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }

      .label {
        font-size: 16px;
        line-height: 24px;
        letter-spacing: 0.15px;
      }

      .hint {
        font-size: 14px;
        line-height: 20px;
        letter-spacing: 0.25px;
        color: var(--od-text-2);
      }

      .value {
        font-size: 16px;
        font-weight: 500;
        text-align: right;
        color: var(--od-text);

        &.alarm {
          color: var(--od-alarm);
        }
      }

      .ios & {
        min-height: 52px;
        padding: 6px 16px;
        border-bottom: 0.5px solid var(--od-separator);

        &:last-child {
          border-bottom: none;
        }

        .label,
        .value {
          font-size: 17px;
          letter-spacing: 0;
        }

        .value {
          font-weight: 600;
        }

        .hint {
          font-size: 13px;
          line-height: 18px;
          letter-spacing: 0;
        }
      }
    }

    .note {
      margin: 8px 16px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);

      :global(.ios) & {
        margin: 8px 32px 0;
      }
    }

    .loading {
      height: 200px;
      margin: 16px;
      border-radius: 12px;
    }

    .end {
      height: 32px;
    }

    /* The data of the plan: MD3 filled fields, two per line, 16 dp apart. */
    .fields {
      margin-top: 8px;
      display: flex;
      flex-direction: column;
    }

    .pair {
      display: flex;
      gap: 16px;
      margin: 0 16px;
      align-items: flex-start;

      :global(.field) {
        flex: 1;
        min-width: 0;
        margin-left: 0;
        margin-right: 0;
      }
    }

    .unit {
      display: block;
      padding: 24px 8px 0 0;
      font-size: 16px;
      line-height: 24px;
      color: var(--od-text-2);

      :global(.field:not(.floated)) & {
        visibility: hidden;
      }
    }
    /* The plan's decompression ceiling (task 2026-11-08-07): an exception to
       the rule that keeps --od-alarm for violations (spec, section 4). */
    .ceiling-area {
      fill: var(--od-alarm);
      fill-opacity: 0.35;
    }

    .ceiling-line {
      fill: none;
      stroke: var(--od-alarm);
      stroke-width: 1.5;
    }

    .legend {
      margin: 8px 0 0;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);
    }

    .swatch {
      flex: none;
      width: 16px;
      height: 12px;
      border-radius: 2px;
      background: color-mix(in srgb, var(--od-alarm) 35%, transparent);
      border: 1.5px solid var(--od-alarm);
      box-sizing: border-box;
    }  }
</style>
