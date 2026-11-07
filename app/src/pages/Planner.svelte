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
  import { logbook } from '../lib/logbook.svelte.js';
  import { planner, loadSetup, planRequest, startFromDive, startNewDive } from '../lib/planner.svelte.js';
  import { waterBottomColor } from '../lib/water-column.js';
  import {
    formatCylinderSize,
    formatDateTime,
    formatGas,
    formatNumber,
    formatPressure,
    formatSac,
    depthUnit,
  } from '../lib/format.js';
  import { t } from '../lib/i18n.js';
  import { waterTypeName, waterTypeOfSalinity } from '../lib/tools.js';

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

  const gasName = $derived(formatGas(planner.o2Permille, planner.hePermille));

  /** The rows of the dive to plan; each opens the planner's settings. */
  const inputs = $derived([
    { key: 'depth', label: t('plan.depth'), value: depthText(planner.depthMm) },
    { key: 'time', label: t('plan.bottomTime'), value: minutes(planner.bottomTimeSeconds) },
    {
      key: 'gas',
      label: t('plan.gas'),
      value: [gasName, formatCylinderSize(planner.sizeMl, planner.startMbar, prefs), formatPressure(planner.startMbar, prefs)]
        .filter(Boolean)
        .join(', '),
    },
    {
      key: 'deco',
      label: t('plan.decoGases'),
      // Each gas and its switch depth, as the core set it (the MOD at the ppO2 for deco by default).
      value: planner.decoGases.length
        ? planner.decoGases
            .map((g, i) => {
              const depth = g.switchDepthMm || result?.cylinders[i + 1]?.switchDepthMm || 0;
              const name = formatGas(g.o2Permille, g.hePermille);
              return depth ? t('plan.decoGasAt', { gas: name, depth: depthText(depth) }) : name;
            })
            .join(', ')
        : t('plan.decoGasesNone'),
    },
    { key: 'sac', label: t('plan.sac'), value: formatSac(planner.bottomSacMlMin, prefs) },
    { key: 'water', label: t('plan.waterType'), value: waterTypeName(waterTypeOfSalinity(planner.salinity)) },
  ]);

  /** The shared deco settings, read from the core's preferences; set in Settings. */
  const deco = $derived.by(() => {
    const s = result?.setup ?? planner.setup;
    if (!s) return null;
    if (s.model === 'vpmb') return { label: t('plan.vpmb'), value: t('plan.vpmbValue', { n: s.vpmbConservatism }) };
    return {
      label: s.model === 'recreational' ? t('plan.recreational') : t('plan.gradientFactors'),
      value: `${s.gfLow}/${s.gfHigh}`,
    };
  });

  const errorText = $derived(result?.error ? t(`plan.errors.${result.error}`) : '');

  /** Profile of the plan, on the same water scale as the logbook. */
  const W = 358;
  const H = 88;
  const shape = $derived.by(() => {
    const points = result?.points ?? [];
    if (points.length < 2 || !result) return null;
    const tMax = points[points.length - 1][0] || 1;
    const dMax = result.maxDepthMm || 1;
    const line = 'M' + points.map(([s, mm]) => `${((s / tMax) * W).toFixed(1)} ${(4 + (mm / dMax) * (H - 8)).toFixed(1)}`).join(' L');
    return { line, water: `${line} L${W} 0 L0 0 Z`, bottom: waterBottomColor(result.maxDepthMm) };
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
        })
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

  function openSetup() {
    f7router.navigate('/plan/setup/');
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

    {#each inputs as input (input.key)}
      <button type="button" class="row" onclick={openSetup}>
        <span class="label">{input.label}</span>
        <span class="value od-value">{input.value}</span>
      </button>
    {/each}
    {#if deco}
      <!-- Shared with the profile, the desaturation and the gas calculator: set in Settings. -->
      <a class="row" href="/settings/">
        <span class="label">{deco.label}</span>
        <span class="value od-value">{deco.value}</span>
      </a>
    {/if}
    <button type="button" class="row" onclick={openSetup}>
      <span class="label">{t('plan.settings')}</span>
      <span class="chevron"><Icon name="expand" size={20} /></span>
    </button>
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
        </svg>
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
  }
</style>
