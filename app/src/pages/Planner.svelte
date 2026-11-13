<script>
  // @ts-check
  // Dive planner (spec, section 4, "Planner, redesigned"; mock-ups
  // android-planificateur, -menu and -nouveau): the same sections from a logbook
  // dive and for a new dive. The plan, gas volumes, reserve, CNS and OTU all
  // come from the core (Subsurface's planner). Saved, a plan is a planned dive
  // of the logbook, listed by "Plongées planifiées" only.
  import { untrack } from 'svelte';
  import { placeLevelLabels } from '../lib/chart-labels.js';
  import { Page, Navbar, Link, List, ListItem, Popup, Popover, f7, theme } from 'framework7-svelte';
  import { showSnackbar } from '../lib/snackbar.js';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from '../components/Icon.svelte';
  import MenuItem from '../components/MenuItem.svelte';
  import ProfileThumbnail from '../components/ProfileThumbnail.svelte';
  import TextField from '../components/TextField.svelte';
  import SelectField from '../components/SelectField.svelte';
  import ChoiceField from '../components/ChoiceField.svelte';
  import SacField from '../components/SacField.svelte';
  import AltitudeField from '../components/AltitudeField.svelte';
  import ButtonField from '../components/ButtonField.svelte';
  import WheelDialog from '../components/WheelDialog.svelte';
  import DatePickerDialog from '../components/DatePickerDialog.svelte';
  import TimePickerDialog from '../components/TimePickerDialog.svelte';
  import ShareSheet from '../components/ShareSheet.svelte';
  import PlanTitleDialog from '../components/PlanTitleDialog.svelte';
  import LeaveGuard from '../components/LeaveGuard.svelte';
  import { isDirty } from '../lib/leave-guard.js';
  import { cleanPlanTitle } from '../lib/plan-title.js';
  import { logbook, savePlan } from '../lib/logbook.svelte.js';
  import { planner, loadSetup, adoptUnitDefaults, planRequest, startFromDive, startNewDive, requestOfPlan, applyRequest, nextGas, planSettings, canSimplify, simplifyPlan, restorePlan } from '../lib/planner.svelte.js';
  import { simplifyProfile } from '../lib/profile-levels.js';
  import { planRows } from '../lib/plan-rows.js';
  import { waterBottomColor } from '../lib/water-column.js';
  import { formatDateTime, formatDuration, formatGasVolume, formatMixName, formatGasLong, formatNumber, formatPartialPressure, formatSac, formatTimeOfDay, decoSummary, depthUnit, locale } from '../lib/format.js';
  import { t } from '../lib/i18n.js';
  import { ios } from '../lib/layout.svelte.js';
  import { WATER_TYPES, altitudeToPressureMbar, formatHoursMinutes, pressureToAltitudeMm, waterTypeName, waterTypeOfSalinity } from '../lib/tools.js';
  import { sharePlanPdf, sharePlanSummary } from '../lib/share.js';
  import { planShareRows, sharePlanFile, sharePlanTableImage } from '../lib/slate-share.js';
  import PlanSlate from '../components/PlanSlate.svelte';
  import { settings } from '../lib/settings.svelte.js';
  import { bottomVolumeKey } from '../lib/reserve-factor.js';
  import { MM_PER_FT, ML_PER_CUFT, O2_CHOICES, HE_CHOICES, depthToMm, gasTotalMl, gasValid, modAlarm, mmToDepth, roundSacMl } from '../lib/planner-rules.js';

  /**
   * `reopen`: the route /plans/<id>, a saved plan; otherwise /plan/new or /plan/<dive id>.
   * @type {{ f7route: { params: { id: string } }, f7router: any, reopen?: boolean }}
   */
  let { f7route, f7router, reopen = false } = $props();

  const uid = $props.id();
  const menuId = `od-plan-menu-${uid}`;
  const prefs = $derived(logbook.prefs);
  const feet = $derived(prefs.length === 'ft');
  const cuft = $derived(prefs.volume === 'cuft');

  let result = $state(/** @type {import('opendives-core').PlanResult|null} */ (null));
  let failed = $state(false);
  let ready = $state(false);
  let started = $state(false);
  let choosing = $state(false);
  let sharing = $state(false);
  let slating = $state(false);
  let slateRequest = $state(/** @type {import('opendives-core').PlanRequest|null} */ (null));
  let saving = $state(false);
  let titling = $state(false);
  let decoOpen = $state(false);
  let dialog = $state(/** @type {null|'date'|'time'} */ (null));

  /** Reads the shared settings again (they may have changed in Settings), then plans. */
  async function refresh() {
    try {
      await loadSetup();
      await adoptUnitDefaults(prefs);
      ready = true;
      planner.version++;
    } catch (e) {
      console.error('Planner setup', e);
      failed = true;
    }
  }

  /** The card of the dive a plan starts from. @param {number} id */
  async function sourceOf(id) {
    const summary = logbook.dives.find((d) => d.id === id);
    const dive = await OpenDivesCore.getDive({ id });
    return {
      dive,
      source: {
        id,
        number: dive.number,
        durationSeconds: dive.durationSeconds,
        date: dive.date,
        site: dive.site,
        maxDepthMm: dive.maxDepthMm,
        profile: summary?.profile ?? [],
      },
    };
  }

  /** @param {number} id */
  async function startFrom(id) {
    try {
      const { dive, source } = await sourceOf(id);
      startFromDive(dive, source, prefs);
    } catch (e) {
      console.error('Planner source', e);
      failed = true;
    }
  }

  async function reopenPlan(/** @type {number} */ id) {
    try {
      const plans = await OpenDivesCore.listPlans();
      const plan = plans.find((p) => p.id === id);
      if (!plan) throw new Error('No such plan');
      const request = requestOfPlan(plan, prefs);
      const stillThere = request.sourceDiveId && logbook.dives.some((d) => d.id === request.sourceDiveId);
      if (request.sourceDiveId && !stillThere) {
        // The dive it started from is gone: the plan is what was saved.
        delete request.sourceDiveId;
        request.levels = plan.levels;
      }
      const source = stillThere ? (await sourceOf(/** @type {number} */ (request.sourceDiveId))).source : null;
      applyRequest(request, id, source, plan.title ?? '');
    } catch (e) {
      console.error('Reopening a plan', e);
      failed = true;
    }
  }

  async function open() {
    const id = f7route.params.id;
    await refresh();
    planner.planId = 0;
    planner.kept = null;
    if (reopen) await reopenPlan(Number(id));
    else if (id === 'new') startNewDive(prefs);
    else await startFrom(Number(id));
    started = true;
    keptHere = planner.kept;
  }
  // Leaving this plan: the screens of Settings show the device's own values.
  let keptHere = /** @type {typeof planner.kept} */ (null);
  $effect(() => () => {
    if (planner.kept === keptHere) planner.kept = null;
  });
  open();

  // The plan is computed again at each change of the dive or the settings,
  // once the plan to show is loaded.
  let run = 0;
  $effect(() => {
    planner.version;
    if (!ready || !started) return;
    const request = planRequest();
    const mine = ++run;
    OpenDivesCore.planDive(request)
      .then((r) => {
        if (mine !== run) return;
        result = r;
        failed = false;
        // The time the core chose for a new dive, shown from now on.
        if (!planner.when && !planner.source) planner.when = r.when;
      })
      .catch((e) => {
        console.error('Plan', e);
        if (mine === run) failed = true;
      });
  });

  /**
   * "Simplifier le profil": the measured profile of the starting dive becomes a
   * few levels, edited as in a new plan; "Annuler" brings the profile back.
   */
  async function simplify() {
    f7.popover.close(`#${menuId}`);
    const source = planner.source;
    if (!source || planner.simplified) return;
    try {
      const dive = await OpenDivesCore.getDive({ id: source.id });
      let levels = simplifyProfile(dive.samples);
      if (!levels.length) levels = [{ depthMm: source.maxDepthMm, durationSeconds: Math.max(60, Math.round(source.durationSeconds / 60) * 60) }];
      if (planner.source?.id !== source.id) return;
      const before = simplifyPlan(levels);
      showSnackbar(t('plan.simplified'), {
        action: t('edit.undo'),
        onAction: () => {
          // Only while the plan is still the one that was simplified.
          if (planner.simplified && planner.source?.id === source.id) restorePlan(before);
        },
      });
    } catch (e) {
      console.error('Simplifying the profile', e);
      showSnackbar(t('plan.simplifyFailed'));
    }
  }

  /** Whole metres or feet. @param {number} mm */
  function depthText(mm) {
    return `${formatNumber(mmToDepth(mm, feet), 0)} ${depthUnit(prefs)}`;
  }

  /** Minutes rounded as Subsurface's plan table. @param {number} seconds */
  function minutes(seconds) {
    return `${formatNumber(Math.floor((seconds + 30) / 60), 0)} ${t('units.minutes')}`;
  }

  /** The name of a gas: EAN32, Oxygène, (18/45). @param {number} o2 @param {number} he */
  const gasName = (o2, he) => (he === 0 && o2 >= 1000 ? formatGasLong(o2, he) : formatMixName(o2, he));

  // --- The fields, MD3 filled fields edited in place: the plan is computed
  // again as soon as one changes.

  /** A number as typed back: no thousands separator. @param {number} value @param {number} decimals */
  const show = (value, decimals = 0) => new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: decimals }).format(value);
  /** "12,5" or "12.5" → 12.5; NaN when empty or not a number. @param {string} text */
  const parse = (text) => (text.trim() === '' ? NaN : Number(text.trim().replace(',', '.')));

  let levelFields = $state(/** @type {{ key: number, depth: string, time: string }[]} */ ([]));
  let gasFields = $state(/** @type {{ key: number, o2: string, he: string }[]} */ ([]));
  let gfLowField = $state('');
  let gfHighField = $state('');
  /** @type {Record<string, boolean>} */
  let invalid = $state({});
  let nextKey = 0;

  /** The altitude of the plan: a whole foot or metre (read from a dive's surface pressure it has no useful decimal). */
  const altitude = $derived(Math.max(0, Math.round(mmToDepth(pressureToAltitudeMm(planner.surfacePressureMbar), feet))));

  /** The fields from the plan: on opening, and when "Changer" brings another dive. */
  function fillFields() {
    // A SAC measured on a dive is rounded to its step (two decimals in cuft/min) before it is shown or used.
    planner.bottomSacMlMin = roundSacMl(planner.bottomSacMlMin, cuft);
    planner.decoSacMlMin = roundSacMl(planner.decoSacMlMin, cuft);
    levelFields = planner.levels.map((l) => ({
      key: nextKey++,
      depth: show(mmToDepth(l.depthMm, feet)),
      time: show(l.durationSeconds / 60),
    }));
    gasFields = planner.gases.map((g) => ({
      key: nextKey++,
      o2: show(g.o2Permille / 10),
      he: show(g.hePermille / 10),
    }));
    gfLowField = show(planner.deco.gfLow);
    gfHighField = show(planner.deco.gfHigh);
    invalid = {};
  }
  // Only on opening and when another plan is loaded: fillFields reads the plan,
  // which typing changes, and rebuilding the fields under the finger replaced
  // the focused input and closed the keyboard (Christian, 13 November 2026).
  $effect(() => {
    planner.loaded;
    ready;
    untrack(fillFields);
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

  // --- Levels ---------------------------------------------------------------

  /** @param {number} i */
  function levelDepth(i) {
    typed(`depth-${levelFields[i].key}`, levelFields[i].depth, 1, feet ? 980 : 300, (v) => (planner.levels[i].depthMm = depthToMm(v, feet)));
  }

  /** @param {number} i */
  function levelTime(i) {
    typed(`time-${levelFields[i].key}`, levelFields[i].time, 1, 360, (v) => (planner.levels[i].durationSeconds = Math.round(v * 60)));
  }

  /** A new level, shallower than the last one. */
  function addLevel() {
    const last = planner.levels[planner.levels.length - 1];
    const step = feet ? MM_PER_FT : 1000;
    const depthMm = Math.max(step, Math.round((last.depthMm * 0.6) / step) * step);
    planner.levels.push({ depthMm, durationSeconds: 10 * 60 });
    levelFields.push({ key: nextKey++, depth: show(depthMm / step), time: show(10) });
    planner.version++;
  }

  /** @param {number} i */
  function removeLevel(i) {
    planner.levels.splice(i, 1);
    delete invalid[`depth-${levelFields[i].key}`];
    delete invalid[`time-${levelFields[i].key}`];
    levelFields.splice(i, 1);
    planner.version++;
  }

  // --- Gases ----------------------------------------------------------------

  /** Oxygen and helium: valid each, and 100 % at most together. @param {number} i */
  function gasChanged(i) {
    const f = gasFields[i];
    const o2 = parse(f.o2);
    const he = parse(f.he);
    const good = gasValid(o2, he);
    invalid[`gas-${f.key}`] = !good;
    if (!good) return;
    planner.gases[i].o2Permille = Math.round(o2 * 10);
    planner.gases[i].hePermille = Math.round(he * 10);
    planner.version++;
  }

  /** The last valid oxygen and helium of a gas, back in its fields. @param {number} i */
  function gasReverted(i) {
    const f = gasFields[i];
    f.o2 = show(planner.gases[i].o2Permille / 10);
    f.he = show(planner.gases[i].hePermille / 10);
    invalid[`gas-${f.key}`] = false;
  }

  function addGas() {
    const gas = nextGas();
    planner.gases.push(gas);
    gasFields.push({ key: nextKey++, o2: show(gas.o2Permille / 10), he: show(0) });
    planner.version++;
  }

  /** @param {number} i */
  function removeGas(i) {
    planner.gases.splice(i, 1);
    delete invalid[`gas-${gasFields[i].key}`];
    gasFields.splice(i, 1);
    planner.version++;
  }

  /** What a gas does: its name and its role. @param {number} i */
  function gasHelper(i) {
    const gas = planner.gases[i];
    if (!gas) return ''; // another plan was just loaded: the fields follow
    const name = gasName(gas.o2Permille, gas.hePermille);
    if (planner.source && gas.sourceCylinder !== undefined) return t('plan.gasFromDive', { name });
    if (i === 0) return t('plan.gasBottom', { name });
    const switchMm = result?.cylinders[i]?.switchDepthMm;
    return switchMm ? t('plan.gasSwitch', { name, depth: depthText(switchMm) }) : name;
  }

  /** A SAC for screen readers: the number and the unit in words. @param {number} ml */
  const sacSpoken = (ml) =>
    cuft
      ? t('units.cubicFeetPerMinuteLong', { n: Math.round((ml / ML_PER_CUFT) * 100) / 100, v: formatNumber(ml / ML_PER_CUFT, 2) })
      : t('units.litersPerMinuteLong', { n: Math.round(ml / 10) / 100, v: formatNumber(ml / 1000, 2) });
  const sacUnit = $derived(t(cuft ? 'units.cubicFeetPerMinute' : 'units.litersPerMinute'));
  // Two SACs (Subsurface's bottom SAC and deco SAC): at the bottom, and during the ascent and the stops.
  // Editable dropdowns (task 71): the field hands back a value in ml/min, clamped.
  /** @param {number} ml */
  function setBottomSac(ml) {
    planner.bottomSacMlMin = ml;
    planner.version++;
  }
  /** @param {number} ml */
  function setDecoSac(ml) {
    planner.decoSacMlMin = ml;
    planner.version++;
  }

  // --- Date, for a new dive --------------------------------------------------

  const whenDate = $derived(new Date((planner.when || 0) * 1000));
  const dateText = $derived(planner.when ? whenDate.toLocaleDateString(locale, { dateStyle: 'medium', timeZone: 'UTC' }) : '');
  const timeText = $derived(planner.when ? formatTimeOfDay(whenDate.toISOString().slice(0, 19)) : '');
  const two = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const thisYear = new Date().getFullYear();
  // The core reads dates up to 2029 only (utc_mktime).
  const years = Array.from({ length: Math.max(1, 2030 - thisYear) }, (_, i) => thisYear + i);
  const monthNames = Array.from({ length: 12 }, (_, m) => new Date(2000, m, 1).toLocaleDateString(locale, { month: 'short' }));
  const dateWheels = $derived([
    { label: t('newDive.day'), values: Array.from({ length: 31 }, (_, i) => String(i + 1)), index: whenDate.getUTCDate() - 1, defaultIndex: whenDate.getUTCDate() - 1 },
    { label: t('newDive.month'), values: monthNames, index: whenDate.getUTCMonth(), defaultIndex: whenDate.getUTCMonth() },
    { label: t('newDive.year'), values: years.map(String), index: Math.max(0, years.indexOf(whenDate.getUTCFullYear())), defaultIndex: 0 },
  ]);
  const timeWheels = $derived([
    { label: t('newDive.hour'), values: Array.from({ length: 24 }, (_, i) => two(i)), index: whenDate.getUTCHours(), defaultIndex: whenDate.getUTCHours() },
    { label: t('newDive.minute'), values: Array.from({ length: 60 }, (_, i) => two(i)), index: whenDate.getUTCMinutes(), defaultIndex: whenDate.getUTCMinutes() },
  ]);

  /** @param {number} year @param {number} month @param {number} day @param {number} hour @param {number} minute */
  function setWhen(year, month, day, hour, minute) {
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    planner.when = Date.UTC(year, month, Math.min(day, last), hour, minute) / 1000;
    planner.version++;
  }

  /** "3 h 20 après la plongée de 11:10, dont les tissus tiennent compte". */
  const intervalHelper = $derived.by(() => {
    if (!result || !planner.when) return '';
    const interval = result.surfaceIntervalSeconds;
    if (interval < 0) return t('plan.intervalOverlap');
    if (interval >= 48 * 3600) return t('plan.intervalNone');
    const end = new Date((planner.when - interval) * 1000).toISOString().slice(0, 19);
    return t('plan.interval', { interval: formatHoursMinutes(interval), time: formatTimeOfDay(end) });
  });

  // --- Conditions and decompression ------------------------------------------

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

  /** @param {number} v a whole foot or metre, already clamped by the field */
  function setAltitude(v) {
    planner.surfacePressureMbar = altitudeToPressureMbar(depthToMm(v, feet));
    planner.version++;
  }

  let modelChoice = $state('');
  $effect(() => {
    modelChoice = planner.deco.decoModel;
  });
  $effect(() => {
    const model = /** @type {'buehlmann'|'vpmb'} */ (modelChoice);
    if (!model || model === planner.deco.decoModel) return;
    planner.deco.decoModel = model;
    planner.version++;
  });
  const modelOptions = $derived([
    { value: 'buehlmann', label: t('settings.deco.buehlmann') },
    { value: 'vpmb', label: t('settings.deco.vpmb') },
  ]);
  let conservatismChoice = $state('');
  $effect(() => {
    conservatismChoice = String(planner.deco.vpmbConservatism);
  });
  $effect(() => {
    const value = Number(conservatismChoice);
    if (conservatismChoice === '' || value === planner.deco.vpmbConservatism) return;
    planner.deco.vpmbConservatism = value;
    planner.version++;
  });
  const conservatismOptions = [0, 1, 2, 3, 4].map((n) => ({ value: String(n), label: `+${n}` }));

  // --- The result -------------------------------------------------------------

  const errorText = $derived(result?.error ? t(`plan.errors.${result.error}`) : '');

  /** Profile of the plan, on the same water scale as the logbook. */
  const W = 358;
  const H = 120;
  const shape = $derived.by(() => {
    const points = result?.points ?? [];
    if (points.length < 2 || !result) return null;
    const tMax = points[points.length - 1][0] || 1;
    const dMax = result.maxDepthMm || 1;
    /** @param {number} s @param {number} mm */
    const xy = (s, mm) => `${((s / tMax) * W).toFixed(1)} ${(4 + (mm / dMax) * (H - 8)).toFixed(1)}`;
    const line = 'M' + points.map(([s, mm]) => xy(s, mm)).join(' L');
    // The decompression ceiling: from the surface down to the ceiling, on the
    // same scales; none when the plan has no stop.
    const ceiling = result.stops?.length ? (result.ceiling ?? []).filter(([s]) => s <= tMax) : [];
    const deepest = Math.max(0, ...ceiling.map(([, mm]) => mm));
    const ceilingLine = deepest > 0 ? 'M' + ceiling.map(([s, mm]) => xy(s, mm)).join(' L') : '';
    const ceilingArea = ceilingLine ? `${ceilingLine} L${xy(ceiling[ceiling.length - 1][0], 0)} L${xy(ceiling[0][0], 0)} Z` : '';
    // A label on each held level ("100 ft · 15 min"), a new dive only.
    /** @type {{ left: number, top: number, text: string, span: number }[]} */
    const levelMarks = [];
    if (!planner.source || planner.simplified) {
      const entered = (result.segments ?? []).filter((s) => s.entered);
      for (let i = 1; i < entered.length; i++) {
        const a = entered[i - 1];
        const b = entered[i];
        if (a.depthMm <= 0 || a.depthMm !== b.depthMm) continue;
        levelMarks.push({
          span: ((b.timeSeconds - a.timeSeconds) / tMax) * 100,
          left: (((a.timeSeconds + b.timeSeconds) / 2 / tMax) * 100),
          top: ((4 + (a.depthMm / dMax) * (H - 8)) / H) * 100,
          text: `${depthText(a.depthMm)} · ${minutes(b.timeSeconds - a.timeSeconds)}`,
        });
      }
    }
    const labels = placeLevelLabels(levelMarks);
    return { line, water: `${line} L${W} 0 L0 0 Z`, bottom: waterBottomColor(result.maxDepthMm), ceilingLine, ceilingArea, deepest, labels };
  });

  /** The glyph of each kind of row and the name read for it (task 73). */
  const ROW_KINDS = {
    descent: { glyph: '↓', label: 'plan.rowDescent' },
    level: { glyph: '→', label: 'plan.rowLevel' },
    ascent: { glyph: '↑', label: 'plan.rowAscent' },
    stop: { glyph: '–', label: 'plan.rowStop' },
  };

  /** A vertical speed in the planner's unit: "59 ft/min". @param {number} mmPerMin */
  function speedText(mmPerMin) {
    return `${formatNumber(mmToDepth(mmPerMin, feet), 0)} ${depthUnit(prefs)}/${t('units.minutes')}`;
  }

  /** Every row of the plan, from the core's waypoints. */
  const rows = $derived(
    result?.stops?.length
      ? planRows(result).map((r) => ({
          kind: r.kind,
          glyph: ROW_KINDS[r.kind].glyph,
          kindLabel: t(ROW_KINDS[r.kind].label),
          depth: r.surface ? t('plan.surface') : depthText(r.depthMm),
          surface: r.surface,
          speed: r.speedMmMin ? speedText(r.speedMmMin) : '',
          start: formatNumber(r.startMinutes, 0),
          duration: formatNumber(r.durationMinutes, 0),
          end: formatNumber(r.endMinutes, 0),
          gas: r.breathed ? gasName(r.breathed.o2Permille, r.breathed.hePermille) : '',
          gasChange: !!r.gas,
        }))
      : [],
  );

  const profileLabel = $derived(
    result
      ? t(result.stops?.length ? 'plan.profileLabelStops' : 'plan.profileLabel', {
          depth: depthText(result.maxDepthMm),
          time: minutes(result.runtimeSeconds),
          stops: (result.stops ?? []).map((s) => depthText(s.depthMm)).join(', '),
        }) + (shape?.deepest ? `, ${t('plan.ceilingLabel', { depth: depthText(shape.deepest) })}` : '')
      : '',
  );

  /** "Volume nécessaire par gaz": what is breathed plus the reserve. */
  const volumeRows = $derived.by(() => {
    if (!result) return [];
    const bottomIndex = result.minimumGas?.cylinder ?? 0;
    return result.cylinders.map((c, i) => {
      const used = formatGasVolume(c.gasUsedMl, prefs);
      const reserve = formatGasVolume(c.reserveMl, prefs);
      const total = gasTotalMl(c);
      const whole = c.gasUsedMl + c.reserveMl;
      return {
        key: i,
        label: gasName(c.o2Permille, c.hePermille),
        hint: t(i === bottomIndex ? bottomVolumeKey(settings.reserveDivers) : 'plan.volumeDeco', { used, reserve, divers: formatNumber(settings.reserveDivers, 0) }),
        value: formatGasVolume(total, prefs),
        usedPercent: whole > 0 ? (c.gasUsedMl / whole) * 100 : null,
        hasReserve: c.reserveMl > 0,
        barLabel: t('plan.volumeBar', { used, reserve }),
      };
    });
  });

  /** The bottom gas too rich for the deepest point at the ppO2 for the bottom. */
  const modRow = $derived.by(() => {
    const bottom = result?.cylinders[0];
    if (!result || !bottom || !modAlarm(result.maxDepthMm, bottom.bottomModMm)) return null;
    return {
      label: t('plan.modTitle'),
      hint: t('plan.modText', { po2: formatPartialPressure((result.setup.bottomPo2Mbar ?? 1400) / 1000, 1), depth: depthText(bottom.bottomModMm) }),
      value: depthText(bottom.bottomModMm),
    };
  });

  /** Logbook dives to start from, newest first. */
  const choices = $derived([...logbook.dives].sort((a, b) => (a.date < b.date ? 1 : -1)));

  /** @param {number|null} id */
  async function choose(id) {
    choosing = false;
    if (id === null) startNewDive(prefs);
    else await startFrom(id);
  }

  const canSave = $derived(!!result && !result.error && !failed && !saving && !Object.values(invalid).some(Boolean));

  /** Back to the list of planned dives, however the planner was opened. */
  function toList() {
    const history = f7router.history ?? [];
    if (history[history.length - 2]?.startsWith('/plans/')) f7router.back();
    else f7router.navigate('/plans/', { reloadCurrent: true });
  }

  // Leaving with changes asks first (components/LeaveGuard.svelte): the plan as
  // first computed, against the plan now.
  let guard = /** @type {LeaveGuard|undefined} */ (undefined);
  let opened = $state(/** @type {unknown} */ (null));
  $effect(() => {
    if (result && untrack(() => opened) === null) opened = planRequest();
  });
  const dirty = () => opened !== null && isDirty(opened, planRequest());

  /** "Enregistrer": a new plan asks for its title first, a reopened one keeps its own. */
  function save() {
    if (!canSave) return;
    if (planner.planId) saveWith(planner.title);
    else titling = true;
  }

  /** @param {string} wanted */
  async function saveWith(wanted) {
    titling = false;
    if (!canSave || !result) return;
    saving = true;
    try {
      planner.title = cleanPlanTitle(wanted);
      planner.justSaved = await savePlan({ ...planRequest(), ...planSettings(), when: result.when }, planner.planId, planner.title);
      toList();
    } catch (e) {
      console.error('Saving the plan', e);
      showSnackbar(t('plan.saveFailed'));
    } finally {
      saving = false;
    }
  }

  /** @param {'slate'|'pdf'|'image'|'ssrf'|'summary'} kind */
  async function share(kind) {
    sharing = false;
    if (!result) return;
    if (kind === 'slate') {
      slateRequest = planRequest(); // the plan as it is now, for the time the slate is open
      slating = true;
      return;
    }
    const title = planner.title || (planner.source ? planner.source.site || t('dive.siteNotSet') : t('plan.noStartDive'));
    try {
      if (kind === 'pdf') await sharePlanPdf(result, planRequest(), prefs, title);
      else if (kind === 'image') await sharePlanTableImage(result, planRequest(), prefs, title);
      else if (kind === 'ssrf') await sharePlanFile(planner.planId, title, result);
      else await sharePlanSummary(result, planRequest(), prefs, title);
    } catch (e) {
      console.error('Sharing the plan', e);
      showSnackbar(t('plan.shareFailed'));
    }
  }
</script>

<Page class="od-planner" onPageReinit={refresh}>
  <Navbar title={t('plan.title')}>
    {#snippet left()}
      <Link iconOnly={!theme.ios} onClick={() => guard?.attempt()}>
        <i class="icon icon-back"></i>
        {#if theme.ios}<span>{t('plan.back')}</span>{:else}<span class="od-sr-only">{t('plan.back')}</span>{/if}
      </Link>
    {/snippet}
    {#snippet right()}
      <Link class={canSave ? '' : 'disabled'} onClick={save}>{t('plan.save')}</Link>
      <Link iconOnly popoverOpen="#{menuId}">
        <Icon name="more" weight={4} /><span class="od-sr-only">{t('detail.moreOptions')}</span>
      </Link>
    {/snippet}
  </Navbar>
  <LeaveGuard bind:this={guard} noun="plan" {dirty} {save} leave={toList} canSave={() => canSave} />

  <Popover id={menuId} class="od-menu" backdrop={false}>
    <List noChevron>
      {#if canSimplify()}
        <MenuItem icon="simplifyProfile" text={t('plan.simplify')} onclick={simplify} />
      {/if}
      <MenuItem
        icon="share"
        text={t('plan.share')}
        onclick={() => {
          f7.popover.close(`#${menuId}`);
          sharing = true;
        }}
      />
      <!-- Opened by this page's router: the menu is moved to the app's root when it
           opens, where a plain link would open the settings in the main view
           (the Carnet), hidden behind the Tools section. -->
      <MenuItem icon="tune" text={t('plannerSettings.open')} onclick={() => f7router.navigate('/settings/planner')} />
    </List>
  </Popover>

  <!-- Tablet (wide pane): the data on the left, the profile and the result on the right. -->
  <div class="od-planner">
    <div class="od-planner--start">
      <button type="button" class="od-planner--source" onclick={() => (choosing = true)}>
        {#if planner.source}
          <ProfileThumbnail profile={planner.source.profile} maxDepthMm={planner.source.maxDepthMm} {prefs} />
          <span class="od-planner--text">
            <span class="od-planner--title">{planner.source.site || t('dive.siteNotSet')}</span>
            <span class="od-planner--sub"
              >{[
                planner.source.number ? t('detail.number', { number: String(planner.source.number) }) : '',
                formatDateTime(planner.source.date),
                planner.source.durationSeconds ? formatDuration(planner.source.durationSeconds) : '',
              ]
                .filter(Boolean)
                .join(' · ')}</span
            >
          </span>
        {:else}
          <span class="od-planner--empty-thumbnail" aria-hidden="true"
            ><svg width="44" height="24" viewBox="0 0 44 24"><path d="M2 3 L8 18 L30 18 L36 9 L42 3" /></svg></span
          >
          <span class="od-planner--text">
            <span class="od-planner--title">{t('plan.newDive')}</span>
          </span>
        {/if}
        <span class="od-planner--change">{t('plan.change')}</span>
      </button>
    </div>

    <div class="od-planner--chart">
      <h2 class="od-planner--section-title">{t(planner.source && !planner.simplified ? 'plan.profileOfDive' : 'plan.profilePlanned')}</h2>
      {#if shape}
        <div class="od-planner--profile-box">
          <svg class="od-planner--profile" viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="img" aria-label={profileLabel}>
            <defs>
              <linearGradient id="plan-water-{uid}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" style="stop-color: var(--od-water-top)" />
                <stop offset="1" style="stop-color: {shape.bottom}" />
              </linearGradient>
            </defs>
            <path d={shape.water} fill="url(#plan-water-{uid})" />
            <path d={shape.line} class="od-planner--line" vector-effect="non-scaling-stroke" />
            {#if shape.ceilingArea}
              <path d={shape.ceilingArea} class="od-planner--ceiling-area" />
              <path d={shape.ceilingLine} class="od-planner--ceiling-line" vector-effect="non-scaling-stroke" />
            {/if}
          </svg>
          {#each shape.labels as label, i (i)}
            <span class="od-planner--level-label" class:od-planner--above={label.top > 70} style="left: {label.left}%; top: {label.top}%" aria-hidden="true">{label.text}</span>
          {/each}
        </div>
        {#if shape.ceilingArea}
          <p class="od-planner--legend"><span class="od-planner--swatch" aria-hidden="true"></span>{t('plan.ceilingLegend')}</p>
        {/if}
      {:else if !failed}
        <div class="skeleton-block od-planner--loading" aria-busy="true" aria-label={t('plan.computing')}></div>
      {/if}
      {#if planner.source && !planner.simplified}<p class="od-planner--helper">{t('plan.fromDiveHelper')}</p>{/if}
    </div>

    <div class="od-planner--data">
      {#if !planner.source}
        <h2 class="od-planner--section-title">{t('plan.date')}</h2>
        <div class="od-planner--fields">
          <div class="od-planner--pair">
            <div class="od-planner--grow"><ButtonField label={t('edit.date')} value={dateText} icon="calendar" onclick={() => (dialog = 'date')} /></div>
            <div class="od-planner--grow"><ButtonField label={t('edit.time')} value={timeText} icon="clock" onclick={() => (dialog = 'time')} /></div>
          </div>
          {#if intervalHelper}<p class="od-planner--helper od-planner--inner">{intervalHelper}</p>{/if}
        </div>
      {/if}

      {#if !planner.source || planner.simplified}
        <h2 class="od-planner--section-title">{t('plan.levels')}</h2>
        <div class="od-planner--fields">
          {#each levelFields as level, i (level.key)}
            <div class="od-planner--pair od-planner--with-remove">
              <TextField label={t('plan.depth')} bind:value={level.depth} inputmode="decimal" invalid={invalid[`depth-${level.key}`]} oninput={() => levelDepth(i)}>
                {#snippet trailing()}<span class="od-planner--unit">{depthUnit(prefs)}</span>{/snippet}
              </TextField>
              <TextField label={t('plan.duration')} bind:value={level.time} inputmode="numeric" invalid={invalid[`time-${level.key}`]} oninput={() => levelTime(i)}>
                {#snippet trailing()}<span class="od-planner--unit">{t('units.minutes')}</span>{/snippet}
              </TextField>
              {#if i > 0}
                <button type="button" class="od-planner--remove" aria-label={t('plan.removeLevel')} onclick={() => removeLevel(i)}><Icon name="close" /></button>
              {:else}
                <span class="od-planner--remove" aria-hidden="true"></span>
              {/if}
            </div>
          {/each}
          {#if levelFields.length < 20}
            <button type="button" class="od-planner--add" onclick={addLevel}><Icon name="plus" size={18} />{t('plan.addLevel')}</button>
          {/if}
          <p class="od-planner--helper od-planner--inner">{t(planner.simplified ? 'plan.levelsFromDive' : 'plan.levelsHelper')}</p>
        </div>
      {/if}

      <h2 class="od-planner--section-title">{t('plan.gas')}</h2>
      <div class="od-planner--fields">
        {#each gasFields as gas, i (gas.key)}
          <div class="od-planner--gas">
            <div class="od-planner--pair od-planner--with-remove">
              <ChoiceField
                label={t('plan.oxygenPercent')}
                bind:value={gas.o2}
                presets={O2_CHOICES}
                unit="%"
                backLabel={t('plan.backToList')}
                ariaLabel={t('plan.gasOxygenLong', { n: String(i + 1), value: `${formatNumber(parse(gas.o2))} %` })}
                invalid={invalid[`gas-${gas.key}`]}
                oninput={() => gasChanged(i)}
                onrevert={() => gasReverted(i)}
              />
              <ChoiceField
                label={t('plan.heliumPercent')}
                bind:value={gas.he}
                presets={HE_CHOICES}
                unit="%"
                backLabel={t('plan.backToList')}
                ariaLabel={t('plan.gasHeliumLong', { n: String(i + 1), value: `${formatNumber(parse(gas.he))} %` })}
                invalid={invalid[`gas-${gas.key}`]}
                oninput={() => gasChanged(i)}
                onrevert={() => gasReverted(i)}
              />
              {#if i > 0}
                <button type="button" class="od-planner--remove" aria-label={t('plan.removeGas')} onclick={() => removeGas(i)}><Icon name="close" /></button>
              {:else}
                <span class="od-planner--remove" aria-hidden="true"></span>
              {/if}
            </div>
            <p class="od-planner--helper od-planner--inner">{gasHelper(i)}</p>
          </div>
        {/each}
        <button type="button" class="od-planner--add" onclick={addGas}><Icon name="plus" size={18} />{t('plan.addGas')}</button>
        <p class="od-planner--subhead">{t('plan.sac')}</p>
        <div class="od-planner--pair">
          <SacField label={t('plan.sacBottom')} value={planner.bottomSacMlMin} {cuft} unit={sacUnit} ariaLabel={t('plan.sacBottomLong', { value: sacSpoken(planner.bottomSacMlMin) })} helper={t('plan.sacHelper')} openLabel={t('plan.sacOpen')} onchange={setBottomSac} />
          <SacField label={t('plan.sacDeco')} value={planner.decoSacMlMin} {cuft} unit={sacUnit} ariaLabel={t('plan.sacDecoLong', { value: sacSpoken(planner.decoSacMlMin) })} helper={t('plan.sacHelper')} openLabel={t('plan.sacOpen')} onchange={setDecoSac} />
        </div>
        <p class="od-planner--helper od-planner--inner">{t(planner.source ? 'plan.sacFromDive' : 'plan.sacFromSettings')}</p>
      </div>

      <h2 class="od-planner--section-title">{t('plan.conditions')}</h2>
      <div class="od-planner--fields">
        <div class="od-planner--pair">
          <SelectField label={t('plan.waterType')} bind:value={water} options={waterOptions} />
          <AltitudeField label={t('plan.altitude')} value={altitude} {feet} unit={depthUnit(prefs)} ariaLabel={t('plan.altitudeLong', { value: `${formatNumber(altitude)} ${depthUnit(prefs)}` })} openLabel={t('plan.sacOpen')} onchange={setAltitude} />
        </div>
        <p class="od-planner--helper od-planner--inner">{t(planner.source ? 'plan.conditionsFromDive' : 'plan.conditionsDefault')}</p>
      </div>

      <button type="button" class="od-planner--accordion" aria-expanded={decoOpen} onclick={() => (decoOpen = !decoOpen)}>
        <span class="od-planner--text">
          <span class="od-planner--title">{t('plan.deco')}</span>
          <span class="od-planner--sub">{decoSummary(planner.deco)}</span>
        </span>
        <span class="od-planner--arrow" class:od-planner--open={decoOpen}><Icon name="expand" /></span>
      </button>
      {#if decoOpen}
        <div class="od-planner--fields">
          <SelectField label={t('plan.decoModel')} bind:value={modelChoice} options={modelOptions} />
          {#if planner.deco.decoModel === 'vpmb'}
            <SelectField label={t('settings.deco.vpmbConservatism')} bind:value={conservatismChoice} options={conservatismOptions} />
          {:else}
            <div class="od-planner--pair">
              <TextField label={t('settings.deco.gfLow')} bind:value={gfLowField} inputmode="numeric" invalid={invalid.gfLow}
                oninput={() => typed('gfLow', gfLowField, 10, 150, (v) => (planner.deco.gfLow = Math.round(v)))} />
              <TextField label={t('settings.deco.gfHigh')} bind:value={gfHighField} inputmode="numeric" invalid={invalid.gfHigh}
                oninput={() => typed('gfHigh', gfHighField, 40, 150, (v) => (planner.deco.gfHigh = Math.round(v)))} />
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <div class="od-planner--outcome">
      {#if failed}
        <p class="od-planner--note">{t('plan.failed')}</p>
      {:else if result}
        <h2 class="od-planner--section-title">{t('plan.result', { time: minutes(result.runtimeSeconds) })}</h2>
        <div class="od-planner--plan">
          {#if errorText}<p class="od-planner--error" role="alert">{errorText}</p>{/if}
          {#if rows.length}
            <table class="od-planner--rows od-value">
              <thead>
                <tr>
                  <th scope="col"><span class="od-planner--visually-hidden">{t('plan.rowType')}</span></th>
                  <th scope="col">{t('plan.stop')}</th>
                  <th scope="col" class="od-planner--num">{t('plan.start')}</th>
                  <th scope="col" class="od-planner--num">{t('plan.duration')}</th>
                  <th scope="col" class="od-planner--num">{t('plan.end')}</th>
                  <th scope="col">{t('plan.gasColumn')}</th>
                </tr>
              </thead>
              <tbody>
                {#each rows as row, i (i)}
                  <tr class="od-planner--row" class:od-planner--row-transit={row.kind === 'descent' || row.kind === 'ascent'} class:od-planner--row-surface={row.surface}>
                    <td class="od-planner--row-icon"><span role="img" aria-label={row.kindLabel}>{row.glyph}</span></td>
                    <td class="od-planner--depth">
                      {row.depth}
                      {#if row.speed}<span class="od-planner--row-speed">{row.speed}</span>{/if}
                    </td>
                    <td class="od-planner--num">{row.start}</td>
                    <td class="od-planner--num">{row.duration}</td>
                    <td class="od-planner--num od-planner--row-end">{row.end}</td>
                    <td>{#if row.gasChange}<span class="od-planner--gas-chip">{row.gas}</span>{:else}{row.gas}{/if}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
            <p class="od-planner--rows-note">{t('plan.rowsNote')}</p>
          {:else}
            <p class="od-planner--no-stop">{t('plan.noStop')}</p>
          {/if}
        </div>

        <h2 class="od-planner--section-title">{t('plan.volumes')}</h2>
        <div class="od-planner--results" class:ios={theme.ios}>
          {#each volumeRows as row (row.key)}
            <div class="od-planner--result">
              <span class="od-planner--text">
                <span class="od-planner--label">{row.label}</span>
                <span class="od-planner--hint">{row.hint}</span>
                {#if row.usedPercent !== null}
                  <span class="od-planner--bar" role="img" aria-label={row.barLabel}>
                    <span class="od-planner--fill" style:width="{row.usedPercent}%"></span>
                    {#if row.hasReserve}<span class="od-planner--gap"></span><span class="od-planner--reserve"></span>{/if}
                  </span>
                {/if}
              </span>
              <span class="od-planner--value od-value">{row.value}</span>
            </div>
          {/each}
          {#if modRow}
            <div class="od-planner--result">
              <span class="od-planner--text"><span class="od-planner--label">{modRow.label}</span><span class="od-planner--hint">{modRow.hint}</span></span>
              <span class="od-planner--value od-value od-planner--alarm">{modRow.value}</span>
            </div>
          {/if}
          <div class="od-planner--result od-planner--oxygen">
            <span class="od-planner--text">
              <span class="od-planner--label">{t('plan.oxygen')}</span>
              <span class="od-planner--bar" role="img" aria-label={t('plan.cnsBar', { cns: result.cns })}>
                <span class="od-planner--fill" style:width="{Math.min(result.cns, 100)}%"></span>
              </span>
              <span class="od-planner--caption">{t('plan.cnsLimit')}</span>
            </span>
            <span class="od-planner--value od-value">{t('plan.oxygenValue', { cns: result.cns, otu: result.otu })}</span>
          </div>
        </div>
        <p class="od-planner--note">{t(planner.source ? 'plan.noteFromDive' : 'plan.note')}</p>
      {:else}
        <div class="skeleton-block od-planner--loading" aria-busy="true" aria-label={t('plan.computing')}></div>
      {/if}
    </div>
  </div>
  <div class="od-planner--end" aria-hidden="true"></div>

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
        <ListItem link="#" title={t('plan.newDive')} onClick={() => choose(null)} />
        {#each choices as dive (dive.id)}
          <ListItem
            link="#"
            title={dive.site || t('dive.siteNotSet')}
            footer={[dive.number ? t('detail.number', { number: String(dive.number) }) : '', formatDateTime(dive.date), dive.durationSeconds ? formatDuration(dive.durationSeconds) : '']
              .filter(Boolean)
              .join(' · ')}
            onClick={() => choose(dive.id)}
          >
            {#snippet media()}<ProfileThumbnail profile={dive.profile} maxDepthMm={dive.maxDepthMm} {prefs} />{/snippet}
          </ListItem>
        {/each}
      </List>
    </Page>
  </Popup>
</Page>

{#if titling}
  <PlanTitleDialog title={planner.title} oncancel={() => (titling = false)} onsave={saveWith} />
{/if}

{#if sharing}
  <ShareSheet heading={t('plan.share')} rows={planShareRows(planner.planId > 0, share)} onclose={() => (sharing = false)} />
{/if}

{#if slating && result && slateRequest}
  <PlanSlate {result} request={slateRequest} {prefs} title={planner.title || (planner.source ? planner.source.site || t('dive.siteNotSet') : t('plan.noStartDive'))} onclose={() => (slating = false)} />
{/if}

{#if dialog === 'date' && !ios}
  <DatePickerDialog
    year={whenDate.getUTCFullYear()}
    month={whenDate.getUTCMonth()}
    day={whenDate.getUTCDate()}
    minYear={thisYear}
    maxYear={thisYear + Math.max(0, years.length - 1)}
    oncancel={() => (dialog = null)}
    onconfirm={(d) => {
      setWhen(d.year, d.month, d.day, whenDate.getUTCHours(), whenDate.getUTCMinutes());
      dialog = null;
    }}
  />
{:else if dialog === 'time' && !ios}
  <TimePickerDialog
    hour={whenDate.getUTCHours()}
    minute={whenDate.getUTCMinutes()}
    oncancel={() => (dialog = null)}
    onconfirm={(time) => {
      setWhen(whenDate.getUTCFullYear(), whenDate.getUTCMonth(), whenDate.getUTCDate(), time.hour, time.minute);
      dialog = null;
    }}
  />
{:else if dialog === 'date'}
  <WheelDialog
    title={t('edit.date')}
    wheels={dateWheels}
    oncancel={() => (dialog = null)}
    onconfirm={([d, m, y]) => {
      setWhen(years[y], m, d + 1, whenDate.getUTCHours(), whenDate.getUTCMinutes());
      dialog = null;
    }}
  />
{:else if dialog === 'time'}
  <WheelDialog
    title={t('edit.time')}
    wheels={timeWheels}
    oncancel={() => (dialog = null)}
    onconfirm={([h, m]) => {
      setWhen(whenDate.getUTCFullYear(), whenDate.getUTCMonth(), whenDate.getUTCDate(), h, m);
      dialog = null;
    }}
  />
{/if}

<style>
  @layer od.components {
    /* One column in the order of the spec; a wide pane puts the data on the
       left, the profile and the result on the right. */
    .od-planner,
    :global(.page.od-planner > .page-content) {
      container-type: inline-size;
    }

    @container (min-width: 680px) {
      .od-planner--start,
      .od-planner--data {
        grid-column: 1;
      }

      .od-planner--chart,
      .od-planner--outcome {
        grid-column: 2;
      }

      .od-planner > .od-planner--start {
        grid-row: 1;
      }

      .od-planner > .od-planner--chart {
        grid-row: 1 / span 2;
      }

      .od-planner > .od-planner--data {
        grid-row: 2 / span 2;
      }

      .od-planner > .od-planner--outcome {
        grid-row: 3;
      }
    }

    .od-planner:has(> .od-planner--start) {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      align-items: start;
    }

    /* Two columns when the pane is wide, not the screen: in portrait on a
       tablet the planner has only the pane beside the tools list. The page's
       content is the container this asks about. */
    @container (min-width: 680px) {
      .od-planner:has(> .od-planner--start) {
        grid-template-columns: minmax(280px, 380px) minmax(0, 1fr);
        column-gap: 8px;
      }
    }

    .od-planner--source {
      width: calc(100% - 32px);
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

      /* The empty thumbnail: the 56 x 36 slot of a starting dive's profile, with the dashed outline of a profile. */
      .od-planner--empty-thumbnail {
        flex: none;
        width: 56px;
        height: 36px;
        border-radius: 8px;
        background: var(--od-background);
        display: flex;
        align-items: center;
        justify-content: center;

        svg {
          fill: none;
          stroke: var(--od-outline);
          stroke-width: 1.5;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dasharray: 3 3;
        }
      }

      .od-planner--text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }

      .od-planner--title {
        font-size: 16px;
        line-height: 24px;
      }

      .od-planner--sub {
        font-size: 14px;
        line-height: 20px;
        letter-spacing: 0.25px;
        color: var(--od-text-2);
      }

      .od-planner--change {
        font-size: 14px;
        font-weight: 500;
      }
    }

    /* Vertical rhythm of the mock-up (android-planificateur-roulettes): a title is
       32 dp high, 24 dp under the block before it and 8 dp over its fields; the
       blocks of a section are 16 dp apart. */
    .od-planner--section-title {
      margin: 24px 16px 8px;
      height: 32px;
      display: flex;
      align-items: center;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.1px;
      color: var(--od-text);

      &:first-child {
        margin-top: 16px;
      }

      :global(.ios) & {
        margin: 14px 16px 6px 32px;
        height: auto;
        font-size: 13px;
        font-weight: 400;
        color: var(--od-text-2);
      }
    }

    .od-planner--profile-box {
      position: relative;
      margin: 0 16px;
      border-radius: 12px;
      background: var(--od-surface);
      overflow: hidden;
    }

    .od-planner--profile {
      display: block;
      width: 100%;
      height: 120px;

      .od-planner--line {
        fill: none;
        stroke: var(--od-trace);
        stroke-width: 1.5;
        stroke-linejoin: round;
      }

      .od-planner--ceiling-area {
        fill: var(--od-alarm);
        opacity: 0.25;
      }

      .od-planner--ceiling-line {
        fill: none;
        stroke: var(--od-alarm);
        stroke-width: 1;
      }
    }

    .od-planner--level-label {
      position: absolute;
      transform: translate(-50%, 4px);
      font-size: 11px;
      line-height: 14px;
      white-space: nowrap;
      color: var(--od-text);

      /* Near the bottom of the chart: over the line, in the water. */
      &.od-planner--above {
        transform: translate(-50%, calc(-100% - 4px));
      }
    }

    .od-planner--legend {
      margin: 8px 16px 0;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--od-text-2);

      .od-planner--swatch {
        width: 16px;
        height: 10px;
        background: color-mix(in srgb, var(--od-alarm) 35%, transparent);
        border: 1.5px solid var(--od-alarm);
        box-sizing: border-box;
      }
    }

    /* "Consommation (SAC)", over its two fields. */
    .od-planner--subhead {
      margin: 0 16px -8px;
      font-size: 12px;
      line-height: 16px;
      font-weight: 500;
      color: var(--od-text-2);
    }

    .od-planner--helper {
      margin: 8px 16px 0;
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);

      /* Under a field row: 4 dp below it (the blocks are 16 dp apart), text inset by 16 dp. */
      &.od-planner--inner {
        margin: -12px 32px 0;
      }

      .od-planner--add + &.od-planner--inner {
        margin-top: -16px;
      }
    }

    .od-planner--fields {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .od-planner--gas {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    /* Two fields side by side, 12 dp apart; the fields carry no margin of their own here. */
    .od-planner--pair {
      display: flex;
      gap: 12px;
      margin: 0 16px;
      align-items: flex-start;

      & > :global(*) {
        flex: 1;
        min-width: 0;
      }

      &.od-planner--pair > :global(*),
      & .od-planner--grow > :global(*) {
        margin: 0;
      }

      &.od-planner--with-remove {
        & > .od-planner--remove {
          flex: none;
          width: 48px;
          height: 56px;
          padding: 0;
          border: none;
          background: none;
          color: var(--od-text-2);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
      }
    }

    .od-planner--grow {
      flex: 1;
      min-width: 0;
    }

    .od-planner--unit {
      padding-inline-end: 12px;
      font-size: 14px;
      color: var(--od-text-2);
    }

    .od-planner--add {
      align-self: flex-start;
      width: auto;
      margin: -4px 0 0 12px;
      height: 40px;
      padding: 0 16px 0 12px;
      border: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }

    .od-planner--accordion {
      width: 100%;
      margin-top: 16px;
      min-height: 72px;
      padding: 8px 24px 8px 16px;
      box-sizing: border-box;
      border: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      text-align: start;
      display: flex;
      align-items: center;
      gap: 16px;
      cursor: pointer;

      .od-planner--text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }

      .od-planner--title {
        font-size: 16px;
        line-height: 24px;
      }

      .od-planner--sub {
        font-size: 14px;
        line-height: 20px;
        color: var(--od-text-2);
      }

      .od-planner--arrow {
        display: flex;
        transition: transform 0.2s;

        &.od-planner--open {
          transform: rotate(180deg);
        }
      }
    }

    .od-planner--plan {
      margin: 0 16px;
      border-radius: 12px;
      background: var(--od-surface);
      overflow: hidden;

      :global(.ios) & {
        border-radius: 10px;
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

      .od-planner--num {
        text-align: right;
      }

      .od-planner--depth {
        font-weight: 500;
      }
    }

    /* The plan table (task 73): a transit row is in the variant colour with its
       speed under the depth; the gas is a sand chip where it starts. */
    .od-planner--rows {
      .od-planner--row-icon {
        width: 18px;
        padding-right: 0;
        font-size: 18px;
        line-height: 18px;
        color: var(--od-text-2);
        text-align: center;
      }

      .od-planner--row-transit {
        color: var(--od-text-2);

        .od-planner--depth {
          font-weight: 400;
        }
      }

      .od-planner--row-speed {
        display: block;
        font-size: 12px;
        font-weight: 400;
        color: var(--od-text-2);
      }

      .od-planner--row-surface .od-planner--depth,
      .od-planner--row-surface .od-planner--row-end {
        font-weight: 600;
      }

      .od-planner--gas-chip {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 8px;
        background: var(--od-cylinder-breathed);
        color: var(--od-text);
        font-size: 13px;
        font-weight: 600;
        white-space: nowrap;
      }
    }

    .od-planner--rows-note {
      margin: 0;
      padding: 8px 16px 12px;
      border-top: 1px solid var(--od-separator);
      font-size: 12px;
      color: var(--od-text-2);
    }

    .od-planner--visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .od-planner--no-stop,
    .od-planner--error {
      margin: 0;
      padding: 12px 16px;
      font-size: 14px;
    }

    .od-planner--error {
      color: var(--od-alarm);
      font-weight: 500;
    }

    .od-planner--results {
      display: flex;
      flex-direction: column;

      &.ios {
        margin: 0 16px;
        border-radius: 10px;
        background: var(--od-surface);
        overflow: hidden;
      }
    }

    .od-planner--result {
      min-height: 72px;
      padding: 8px 24px 8px 16px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 16px;

      &.od-planner--oxygen {
        min-height: 56px;
        border-top: 1px solid var(--od-separator);
      }

      .od-planner--text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }

      .od-planner--label {
        font-size: 16px;
        line-height: 24px;
        letter-spacing: 0.15px;
      }

      .od-planner--hint {
        font-size: 14px;
        line-height: 20px;
        letter-spacing: 0.25px;
        color: var(--od-text-2);
      }

      .od-planner--value {
        font-size: 16px;
        font-weight: 600;
        text-align: right;
        color: var(--od-text);

        &.od-planner--alarm {
          color: var(--od-alarm);
        }
      }
    }

    .od-planner--bar {
      display: flex;
      height: 8px;
      margin-top: 8px;
      border-radius: 4px;
      overflow: hidden;
      background: var(--od-tertiary-container);

      .od-planner--fill {
        background: var(--od-tertiary);
      }

      .od-planner--gap {
        width: 2px;
        background: var(--od-surface);
      }

      .od-planner--reserve {
        flex: 1;
        background: repeating-linear-gradient(135deg, var(--od-tertiary-container) 0 4px, var(--od-tertiary-hatch) 4px 8px);
      }
    }

    .od-planner--caption {
      margin-top: 4px;
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);
    }

    .od-planner--note {
      margin: 8px 16px 0;
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);
    }

    .skeleton-block {
      margin: 8px 16px;
      height: 120px;
      border-radius: 12px;
    }

    .od-planner--end {
      height: 32px;
    }
  }
</style>
