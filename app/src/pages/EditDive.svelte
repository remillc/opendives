<script>
  // @ts-check
  // Edit a dive (docs/mockups/android-edition.dc.html; spec, section 4, "Dive
  // editor, same fields as Subsurface desktop"): every field Subsurface's
  // desktop app edits for one dive (tabs Notes, Information and Equipment,
  // and "Mark invalid"), in white cards, always open. The number changes only
  // through "Renuméroter la plongée" (it shifts other dives); duration and
  // maximum depth are shown, measured by the dive computer. Only the fields
  // whose text changed are sent; Save applies one undoable step, saves
  // locally and closes; Undo is offered.
  import { onMount } from 'svelte';
  import { Page, Navbar, Link, Popup, View, f7 } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from '../components/Icon.svelte';
  import TextField from '../components/TextField.svelte';
  import SelectField from '../components/SelectField.svelte';
  import ButtonField from '../components/ButtonField.svelte';
  import ChipsField from '../components/ChipsField.svelte';
  import ComboField from '../components/ComboField.svelte';
  import StarsInput from '../components/StarsInput.svelte';
  import WheelDialog from '../components/WheelDialog.svelte';
  import { logbookValues } from '../lib/people.js';
  import { logbook, saveDiveChanges, tripChange } from '../lib/logbook.svelte.js';
  import { siteChange } from '../lib/sites.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { layout, ios, navWidth } from '../lib/layout.svelte.js';
  import { offerUndo } from '../lib/undo.js';
  import { parseNumber } from '../lib/filter.svelte.js';
  import { WATER_TYPES, waterTypeName, waterTypeOfSalinity } from '../lib/tools.js';
  import { formatDepth, formatFullDate, formatMinSec, formatNumber, formatWeight, locale } from '../lib/format.js';
  import { t, tIfExists } from '../lib/i18n.js';

  /** @type {{ f7route: { params: { id: string } }, f7router: any }} */
  let { f7route, f7router } = $props();

  // On a tablet the route opens this screen as a popup (App.svelte): an iPad
  // sheet of 780 px in two columns, or an Android pane beside the rail. The
  // fields and the behaviour are the same as full screen on a phone.
  const sheet = !layout.phone;
  const leave = () => (sheet ? f7.popup.close() : f7router.back());
  // iOS: 780 x 740 centred; Android: the content pane, 16 px from the edges.
  const sheetStyle = ios
    ? '--f7-popup-tablet-width: min(780px, calc(100vw - 48px)); --f7-popup-tablet-height: min(740px, calc(100vh - 48px));'
    : `--f7-popup-tablet-width: calc(100vw - ${navWidth}px - 32px); --f7-popup-tablet-height: calc(100vh - 32px); left: calc(50% + ${navWidth / 2}px);`;

  /** @type {import('opendives-core').DiveDetail|null} */
  let dive = $state(null);
  let failed = $state(false);
  let saving = $state(false);
  const prefs = $derived(logbook.prefs);

  const MBAR_PER_PSI = 68.9476;
  const ML_PER_CUFT = 28316.8466;
  const G_PER_LB = 453.59237;
  const MODES = ['OC', 'CCR', 'PSCR', 'Freedive'];
  const USES = ['OC-gas', 'diluent', 'oxygen', 'not used'];

  // --- Units: a stored value as the text of a field, and back ---------------
  const feet = $derived(prefs.length === 'ft');
  const psi = $derived(prefs.pressure === 'psi');
  const cuft = $derived(prefs.volume === 'cuft');
  const fahrenheit = $derived(prefs.temperature === 'F');
  const pounds = $derived(prefs.weight === 'lbs');
  /** A number as typed back: no thousands separator. @param {number} v @param {number} [decimals] */
  const show = (v, decimals = 0) => new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: decimals }).format(v);
  /** @param {number} mm */
  const depthText = (mm) => (mm ? show(feet ? mm / 304.8 : mm / 1000, feet ? 0 : 1) : '');
  /** @param {number} v */
  const depthMm = (v) => Math.round(feet ? v * 304.8 : v * 1000);
  /** @param {number} mbar */
  const pressureText = (mbar) => (mbar ? show(psi ? mbar / MBAR_PER_PSI : mbar / 1000) : '');
  /** @param {number} v */
  const pressureMbar = (v) => Math.round(psi ? v * MBAR_PER_PSI : v * 1000);
  /** @param {number} mk */
  const temperatureText = (mk) => {
    if (!mk) return '';
    const c = mk / 1000 - 273.15;
    return show(fahrenheit ? (c * 9) / 5 + 32 : c, 1);
  };
  /** @param {number} v */
  const temperatureMk = (v) => Math.round(((fahrenheit ? ((v - 32) * 5) / 9 : v) + 273.15) * 1000);
  /** @param {number} grams */
  const weightText = (grams) => (grams ? show(pounds ? grams / G_PER_LB : grams / 1000, 1) : '');
  /** @param {number} v */
  const weightGrams = (v) => Math.round(pounds ? v * G_PER_LB : v * 1000);
  /** Size: litres of water, or in cubic feet the gas at working pressure (Subsurface). @param {number} ml @param {number} wpMbar */
  const sizeText = (ml, wpMbar) => {
    if (!ml) return '';
    if (!cuft) return show(ml / 1000, 1);
    return show(wpMbar ? (ml * (wpMbar / 1000 / 1.01325)) / ML_PER_CUFT : ml / ML_PER_CUFT, 1);
  };
  /** @param {number} v @param {number} wpMbar */
  const sizeMl = (v, wpMbar) => Math.round(!cuft ? v * 1000 : wpMbar ? (v * ML_PER_CUFT) / (wpMbar / 1000 / 1.01325) : v * ML_PER_CUFT);

  const depthUnitText = $derived(feet ? t('units.feet') : t('units.meters'));
  const pressureUnitText = $derived(psi ? t('units.psi') : t('units.bar'));
  const volumeUnitText = $derived(cuft ? t('units.cubicFeet') : t('units.liters'));
  const temperatureUnitText = $derived(fahrenheit ? t('units.fahrenheit') : t('units.celsius'));
  const weightUnitText = $derived(pounds ? t('units.pounds') : t('units.kilograms'));

  // --- Edited values, as texts ------------------------------------------------
  /** @type {Record<string, string>} */
  let f = $state({});
  /** The texts as opened: a field is sent only when its text changed. */
  /** @type {Record<string, string>} */
  let initial = {};
  let date = $state({ year: 2000, month: 0, day: 1, hour: 0, minute: 0, second: 0 });
  let initialDate = '';
  /** @type {string[]} */
  let guides = $state([]);
  /** @type {string[]} */
  let buddies = $state([]);
  /** @type {string[]} */
  let tags = $state([]);
  /** Site and trip, as typed or chosen; a new name creates a site or a trip on Save. */
  let siteName = $state('');
  let tripName = $state('');
  /** @type {Record<string, number>} */
  let stars = $state({ rating: 0, visibility: 0, current: 0, wavesize: 0, surge: 0, chill: 0 });
  let invalid = $state(false);

  /**
   * One cylinder of the editor: its index in the dive (-1 for a new one), its
   * texts and those it opened with.
   * @typedef {{ index: number, protected: boolean, f: Record<string, string>, initial: Record<string, string> }} EditedCylinder
   */
  /** @type {EditedCylinder[]} */
  let cylinders = $state([]);
  /** Each weight: its location, its text, and the grams and text it opened with (kept exactly when the text is unchanged). @type {{ description: string, weight: string, grams0: number, text0: string }[]} */
  let weights = $state([]);
  let initialWeights = '';

  let known = $state({ guide: /** @type {string[]} */ ([]), buddy: /** @type {string[]} */ ([]), tag: /** @type {string[]} */ ([]), suit: /** @type {string[]} */ ([]) });
  /** @type {import('opendives-core').SiteSummary[]} */
  let sites = $state([]);
  /** Cylinder types (Settings, Bouteilles): name, size, working pressure. */
  let cylinderTypes = $state(/** @type {{ name: string, ml: number, workingPressureMbar: number }[]} */ ([]));
  /** Weight types, each with the weight last used for it (Subsurface's ws_info table). */
  let weightTypes = $state(/** @type {{ name: string, grams: number }[]} */ ([]));

  /** @type {'date'|'time'|null} */
  let dialog = $state(null);

  /** @param {import('opendives-core').Cylinder} c */
  function cylinderTexts(c) {
    return {
      description: c.description,
      use: c.use,
      size: sizeText(c.sizeMl, c.workingPressureMbar),
      workingPressure: pressureText(c.workingPressureMbar),
      start: pressureText(c.startMbar),
      end: pressureText(c.endMbar),
      o2: show(c.o2Permille ? c.o2Permille / 10 : 21, 1),
      he: show(c.hePermille / 10, 1),
      depth: depthText(c.depthMm),
    };
  }

  onMount(async () => {
    try {
      const d = await OpenDivesCore.getDive({ id: Number(f7route.params.id) });
      dive = d;
      const [y, mo, da, h, mi, se] = d.date.split(/[-T:]/).map(Number);
      date = { year: y, month: mo - 1, day: da, hour: h, minute: mi, second: se || 0 };
      initialDate = d.date.slice(0, 19);
      initial = {
        notes: d.notes,
        suit: d.suit,
        divemode: d.divemode,
        air: temperatureText(d.airTempMk),
        water: temperatureText(d.waterTempMk),
        waterType: d.userSalinity ? waterTypeOfSalinity(d.userSalinity) : '',
        atm: d.surfacePressureMbar ? String(d.surfacePressureMbar) : '',
      };
      f = { ...initial };
      siteName = d.site;
      tripName = d.trip?.location ?? '';
      guides = [...d.guides];
      buddies = [...d.buddies];
      tags = [...d.tags];
      stars = {
        rating: d.rating,
        visibility: d.visibility,
        current: d.conditions?.current ?? 0,
        wavesize: d.conditions?.wavesize ?? 0,
        surge: d.conditions?.surge ?? 0,
        chill: d.conditions?.chill ?? 0,
      };
      invalid = d.invalid;
      cylinders = d.cylinders.map((c, index) => {
        const texts = cylinderTexts(c);
        return { index, protected: c.protected, f: { ...texts }, initial: texts };
      });
      weights = d.weights.map((w) => ({ description: w.description, weight: weightText(w.grams), grams0: w.grams, text0: weightText(w.grams) }));
      initialWeights = JSON.stringify(weights);
      const [guide, buddy, tag, suitList] = await Promise.all([logbookValues('guide'), logbookValues('buddy'), logbookValues('tag'), logbookValues('suit')]);
      known = { guide, buddy, tag, suit: suitList };
    } catch (e) {
      console.error('Edit dive', e);
      failed = true;
    }
    OpenDivesCore.siteQuery({ kind: 'list' })
      .then((/** @type {import('opendives-core').SiteSummary[]} */ list) => {
        sites = list;
      })
      .catch((/** @type {unknown} */ e) => console.error('Sites', e));
    OpenDivesCore.toolQuery({ kind: 'cylinders' })
      .then((/** @type {import('opendives-core').GasCylinderTypes} */ list) => (cylinderTypes = list.types))
      .catch((/** @type {unknown} */ e) => console.error('Cylinder types', e));
    OpenDivesCore.toolQuery({ kind: 'weights' })
      .then((/** @type {{ types: { name: string, grams: number }[] }} */ list) => (weightTypes = list.types))
      .catch((/** @type {unknown} */ e) => console.error('Weight types', e));
  });

  // --- Date and time ---------------------------------------------------------
  const two = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const daysIn = (/** @type {number} */ y, /** @type {number} */ m) => new Date(y, m + 1, 0).getDate();
  const isoDate = $derived(
    `${date.year}-${two(date.month + 1)}-${two(Math.min(date.day, daysIn(date.year, date.month)))}T${two(date.hour)}:${two(date.minute)}:${two(date.second)}`,
  );
  const dateText = $derived(new Date(date.year, date.month, date.day).toLocaleDateString(locale, { dateStyle: 'medium' }));
  const timeText = $derived(new Date(2000, 0, 1, date.hour, date.minute).toLocaleTimeString(locale, { timeStyle: 'short' }));
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: thisYear + 2 - 1950 }, (_, i) => 1950 + i);
  const monthNames = Array.from({ length: 12 }, (_, m) => new Date(2000, m, 1).toLocaleDateString(locale, { month: 'short' }));
  const dateWheels = $derived([
    { label: t('newDive.day'), values: Array.from({ length: 31 }, (_, i) => String(i + 1)), index: date.day - 1, defaultIndex: date.day - 1 },
    { label: t('newDive.month'), values: monthNames, index: date.month, defaultIndex: date.month },
    { label: t('newDive.year'), values: years.map(String), index: Math.max(0, years.indexOf(date.year)), defaultIndex: Math.max(0, years.indexOf(date.year)) },
  ]);
  const timeWheels = $derived([
    { label: t('newDive.hour'), values: Array.from({ length: 24 }, (_, i) => two(i)), index: date.hour, defaultIndex: date.hour },
    { label: t('newDive.minute'), values: Array.from({ length: 60 }, (_, i) => two(i)), index: date.minute, defaultIndex: date.minute },
  ]);

  // --- Choices -------------------------------------------------------------------
  const modeOptions = MODES.map((m) => ({ value: m, label: tIfExists(`detail.modes.${m}`) ?? m }));
  const useOptions = USES.map((u) => ({ value: u, label: t(`edit.uses.${u}`) }));
  const waterOptions = $derived([{ value: '', label: t('edit.notSet') }, ...WATER_TYPES.map((w) => ({ value: w.id, label: waterTypeName(w.id) }))]);
  /** The cylinder types, with this cylinder's own when it is not among them. @param {string} own */
  const cylinderTypeOptions = (own) => {
    const list = cylinderTypes.map((c) => ({ value: c.name, label: c.name }));
    if (own && !list.some((o) => o.value === own)) list.unshift({ value: own, label: own });
    if (!own) list.unshift({ value: '', label: t('edit.noType') });
    return list;
  };
  /** A weight location's name, translated when it is one of Subsurface's. @param {string} name */
  const placeName = (name) => (name ? (tIfExists(`detail.weightPlaces.${name}`) ?? name) : t('detail.weightPlaces.unknown'));
  /** The weight locations, with this weight's own when it is not among them. @param {string} own */
  const placeOptions = (own) => {
    const list = weightTypes.map((w) => ({ value: w.name, label: placeName(w.name) }));
    if (!list.some((o) => o.value === own)) list.unshift({ value: own, label: placeName(own) });
    return list;
  };
  /** Site names, the most recently dived first. */
  const siteNames = $derived(
    [...sites].filter((s) => s.name).sort((a, b) => (b.lastDate || '').localeCompare(a.lastDate || '')).map((s) => s.name),
  );
  /** The logbook's trips, by location (the first one of each name). */
  const trips = $derived.by(() => {
    /** @type {Map<string, number>} */
    const byName = new Map();
    for (const d of logbook.dives) if (d.trip?.location && !byName.has(d.trip.location)) byName.set(d.trip.location, d.trip.id);
    return byName;
  });
  /** "Nouveau voyage" in the list of trips: its name is asked below. */
  const NEW_TRIP = '\u0000new';
  let newTripName = $state('');
  const tripOptions = $derived([
    { value: '', label: t('edit.tripNone') },
    ...[...trips.keys()].map((name) => ({ value: name, label: name })),
    { value: NEW_TRIP, label: t('edit.tripNew') },
  ]);

  /**
   * A weight location chosen: the weight last used for it fills the weight,
   * as Subsurface's WSInfoDelegate does (when one is known).
   * @param {number} i @param {string} name
   */
  function choosePlace(i, name) {
    weights[i].description = name;
    const grams = weightTypes.find((w) => w.name === name)?.grams ?? 0;
    if (grams > 0) weights[i].weight = weightText(grams);
  }

  /** A cylinder type chosen: its size and working pressure, as EditCylinder (TYPE). @param {EditedCylinder} c @param {string} name */
  function chooseCylinderType(c, name) {
    c.f.description = name;
    const type = cylinderTypes.find((x) => x.name === name);
    if (!type) return;
    c.f.workingPressure = pressureText(type.workingPressureMbar);
    c.f.size = sizeText(type.ml, type.workingPressureMbar);
  }

  /**
   * A cylinder of Settings for a rebreather dive, unless the dive already has it.
   * @param {string} use @param {string} name @param {number} o2
   */
  function addConfiguredCylinder(use, name, o2) {
    if (!name || cylinders.some((c) => c.f.use === use && c.f.description === name)) return;
    const texts = { description: name, use, size: '', workingPressure: '', start: '', end: '', o2: show(o2), he: show(0), depth: '' };
    cylinders.push({ index: -1, protected: false, f: { ...texts }, initial: texts });
    chooseCylinderType(cylinders[cylinders.length - 1], name);
  }

  /** The dive becomes a rebreather dive: its cylinders from Settings. @param {string} mode */
  function modeChanged(mode) {
    if (mode !== 'CCR' && mode !== 'PSCR') return;
    addConfiguredCylinder('diluent', settings.defaultDiluent, 21);
    addConfiguredCylinder('oxygen', settings.defaultOxygen, 100);
    for (const name of settings.defaultBailout) addConfiguredCylinder('OC-gas', name, 21);
  }

  function addCylinder() {
    const texts = { description: '', use: 'OC-gas', size: '', workingPressure: '', start: '', end: '', o2: show(21), he: show(0), depth: '' };
    cylinders.push({ index: -1, protected: false, f: { ...texts }, initial: texts });
  }

  /** MOD of a cylinder's mix at the bottom ppO₂ of 1.6 bar, in the dive's water. @param {EditedCylinder} c */
  function modText(c) {
    const o2 = parseNumber(c.f.o2);
    if (!(o2 > 0)) return '';
    const salinity = dive?.userSalinity || 10300;
    const surface = (dive?.surfacePressureMbar || 1013) / 1000;
    // Pressure difference in Pa over ρg (ρ in kg/m³: salinity / 10), in mm.
    const mm = ((1.6 / (o2 / 100) - surface) * 1e8) / ((salinity / 10) * 9.80665);
    if (!(mm > 0)) return '';
    return t('edit.mod', { depth: `${depthText(mm)} ${depthUnitText}`, po2: formatNumber(1.6, 1) });
  }

  // --- Checks and changes ------------------------------------------------------
  /** An optional number: empty, or within [min, max]. @param {string} text @param {number} min @param {number} max */
  const optionalOk = (text, min, max) => !text?.trim() || (parseNumber(text) >= min && parseNumber(text) <= max);
  const bad = $derived.by(() => {
    /** @type {Record<string, boolean>} */
    const b = {};
    b.air = !optionalOk(f.air, fahrenheit ? -40 : -40, fahrenheit ? 140 : 60);
    b.water = !optionalOk(f.water, fahrenheit ? 28 : -2, fahrenheit ? 110 : 45);
    b.atm = !optionalOk(f.atm, 500, 1100);
    return b;
  });
  /** @param {EditedCylinder} c */
  const cylinderBad = (c) => {
    const max = psi ? 7000 : 500;
    return {
      size: !optionalOk(c.f.size, 0, cuft ? 400 : 100),
      workingPressure: !optionalOk(c.f.workingPressure, 0, max),
      start: !optionalOk(c.f.start, 0, max),
      end: !optionalOk(c.f.end, 0, max),
      gas: !optionalOk(c.f.o2, 1, 100) || !optionalOk(c.f.he, 0, 99) || (parseNumber(c.f.o2) || 21) + (parseNumber(c.f.he) || 0) > 100,
      depth: !optionalOk(c.f.depth, 0, feet ? 1640 : 500),
    };
  };
  const anyBad = $derived(
    Object.values(bad).some(Boolean) ||
      cylinders.some((c) => Object.values(cylinderBad(c)).some(Boolean)) ||
      weights.some((w) => !optionalOk(w.weight, 0, pounds ? 400 : 200)),
  );

  /** A weight in grams: as opened while its text is unchanged. @param {{ weight: string, grams0: number, text0: string }} w */
  const gramsOf = (w) => (w.grams0 >= 0 && w.weight === w.text0 ? w.grams0 : w.weight.trim() ? weightGrams(parseNumber(w.weight)) : 0);
  const sameList = (/** @type {string[]} */ a, /** @type {string[]} */ b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const changed = (/** @type {string} */ key) => (f[key] ?? '') !== (initial[key] ?? '');

  /** The fields that changed, in the core's terms; empty when nothing did. */
  function changes() {
    if (!dive) return {};
    /** @type {Record<string, string|number|string[]>} */
    const out = {};
    if (isoDate !== initialDate) out.date = isoDate;
    if (!sameList(guides, dive.guides)) out.diveguide = [...guides];
    if (!sameList(buddies, dive.buddies)) out.buddies = [...buddies];
    if (!sameList(tags, dive.tags)) out.tags = [...tags];
    if (changed('notes')) out.notes = f.notes;
    if (changed('suit')) out.suit = f.suit;
    if (changed('divemode')) out.divemode = f.divemode;
    if (changed('air')) out.airTempMk = f.air.trim() ? temperatureMk(parseNumber(f.air)) : 0;
    if (changed('water')) out.waterTempMk = f.water.trim() ? temperatureMk(parseNumber(f.water)) : 0;
    if (changed('waterType')) out.userSalinity = WATER_TYPES.find((w) => w.id === f.waterType)?.salinity ?? 0;
    if (changed('atm')) out.surfacePressureMbar = f.atm.trim() ? Math.round(parseNumber(f.atm)) : 0;
    const old = { rating: dive.rating, visibility: dive.visibility, ...(dive.conditions ?? {}) };
    for (const key of Object.keys(stars)) if (stars[key] !== (/** @type {Record<string, number>} */ (old)[key] ?? 0)) out[key] = stars[key];
    if (invalid !== dive.invalid) out.invalid = invalid ? 1 : 0;

    if (JSON.stringify(weights) !== initialWeights)
      out.weights = weights.map((w) => JSON.stringify({ description: w.description, grams: gramsOf(w) }));

    const removed = dive.cylinders.length !== cylinders.filter((c) => c.index >= 0).length;
    const cylinderItems = cylinders.map((c) => {
      /** @type {Record<string, string|number>} */
      const item = { index: c.index };
      const all = c.index < 0;
      const ch = (/** @type {string} */ k) => all || (c.f[k] ?? '') !== (c.initial[k] ?? '');
      const wp = c.f.workingPressure.trim() ? pressureMbar(parseNumber(c.f.workingPressure)) : 0;
      if (ch('description')) item.description = c.f.description;
      if (ch('use')) item.use = c.f.use;
      if (ch('size') || ch('workingPressure')) {
        item.sizeMl = c.f.size.trim() ? sizeMl(parseNumber(c.f.size), wp) : 0;
        item.workingPressureMbar = wp;
      }
      if (ch('start')) item.startMbar = c.f.start.trim() ? pressureMbar(parseNumber(c.f.start)) : 0;
      if (ch('end')) item.endMbar = c.f.end.trim() ? pressureMbar(parseNumber(c.f.end)) : 0;
      if (ch('o2') || ch('he')) {
        item.o2Permille = Math.round((parseNumber(c.f.o2) || 21) * 10);
        item.hePermille = Math.round((parseNumber(c.f.he) || 0) * 10);
      }
      if (ch('depth')) item.depthMm = c.f.depth.trim() ? depthMm(parseNumber(c.f.depth)) : 0;
      return item;
    });
    if (removed || cylinderItems.some((item) => Object.keys(item).length > 1)) out.cylinders = cylinderItems.map((item) => JSON.stringify(item));
    return out;
  }

  /** @param {string} text */
  function toast(text) {
    f7.toast.create({ text, closeTimeout: 4000, position: 'center' }).open();
  }

  async function save() {
    if (!dive || saving) return;
    if (anyBad) {
      toast(t('edit.invalidValue'));
      return;
    }
    const all = changes();
    const siteText = siteName.trim();
    const oldTrip = dive.trip?.location ?? '';
    // A new trip without a name changes nothing.
    const tripText = tripName === NEW_TRIP ? newTripName.trim() || oldTrip : tripName.trim();
    saving = true;
    // Each change is one undoable step, as in Subsurface (a new site:
    // AddDiveSite; the trip: DivesToTrip or CreateTrip, then the location);
    // Undo in the message takes them all back.
    let steps = 0;
    try {
      if (siteText !== dive.site) {
        const same = sites.find((s) => s.name.toLocaleLowerCase() === siteText.toLocaleLowerCase());
        if (!siteText) all.site = 0;
        else if (same) all.site = same.uuid;
        else {
          const created = await siteChange({ action: 'create', value: siteText });
          steps++;
          all.site = created.site?.uuid ?? 0;
        }
      }
      if (Object.keys(all).length) {
        await saveDiveChanges(dive.id, all);
        steps++;
      }
      if (tripText !== oldTrip) {
        const existing = trips.get(tripText);
        if (!tripText) {
          if (dive.trip) {
            await tripChange({ action: 'remove', diveIds: [dive.id] });
            steps++;
          }
        } else if (existing !== undefined) {
          await tripChange({ action: 'add', tripId: existing, diveIds: [dive.id] });
          steps++;
        } else {
          const created = await tripChange({ action: 'create', diveIds: [dive.id] });
          steps++;
          const tripId = created.trip?.tripId;
          if (tripId) {
            await tripChange({ action: 'location', tripId, value: tripText });
            steps++;
          }
        }
      }
      leave();
      if (steps) offerUndo(t('edit.saved'), undefined, 6000, steps);
    } catch (e) {
      const code = String(/** @type {any} */ (e)?.message ?? '');
      console.error('Save dive', code);
      toast(
        code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : code.startsWith('CYLINDER_IN_USE') ? t('edit.cylinderInUse') : t('edit.failed'),
      );
    } finally {
      saving = false;
    }
  }

  const starFields = $derived(
    ['visibility', 'current', ...(settings.extraConditions ? ['wavesize', 'surge', 'chill'] : [])].map((key) => ({
      key,
      name: t(`detail.conditionNames.${key}`),
    })),
  );
</script>

{#snippet header(/** @type {string} */ title)}
  <span class="heading" role="heading" aria-level="2">{title}</span>
{/snippet}

{#snippet unit(/** @type {string} */ text)}<span class="unit">{text}</span>{/snippet}

{#snippet chrome()}
  <Navbar title={t('edit.title')}>
    {#snippet left()}
      {#if sheet}
        {#if ios}
          <Link onClick={leave}>{t('dialog.cancel')}</Link>
        {:else}
          <Link iconOnly onClick={leave}><Icon name="close" /><span class="od-sr-only">{t('dialog.cancel')}</span></Link>
        {/if}
      {:else}
        <Link back iconOnly>
          <i class="icon icon-back"></i>
          <span class="od-sr-only">{t('detail.back')}</span>
        </Link>
      {/if}
    {/snippet}
    {#snippet right()}
      <Link onClick={save} class={saving ? 'disabled' : ''}>{t('edit.save')}</Link>
    {/snippet}
  </Navbar>
{/snippet}

{#snippet content()}

  {#if failed}
    <div class="block"><p>{t('detail.errorText')}</p></div>
  {:else if dive}
    <div class="cards" class:two-columns={sheet}>
    <p class="subtitle od-value">
      {[dive.number ? t('detail.number', { number: String(dive.number) }) : '', dive.site, formatFullDate(dive.date)].filter(Boolean).join(' · ')}
    </p>

    <!-- La plongée -->
    <section class="card">
      {@render header(t('edit.diveGroup'))}
      <div class="row">
        <div class="grow"><ButtonField label={t('edit.date')} value={dateText} onclick={() => (dialog = 'date')} /></div>
        <div class="time"><ButtonField label={t('edit.time')} value={timeText} onclick={() => (dialog = 'time')} /></div>
      </div>
      <!-- Measured by the dive computer: plain text, not a field. -->
      <dl class="measured">
        <div><dt>{t('edit.duration')}</dt><dd class="od-value">{formatMinSec(dive.durationSeconds)}</dd></div>
        <div><dt>{t('edit.maxDepth')}</dt><dd class="od-value">{formatDepth(dive.maxDepthMm, prefs)}</dd></div>
      </dl>
      <ComboField label={t('edit.site')} bind:value={siteName} options={siteNames} supporting={t('edit.siteHint')} />
      <SelectField label={t('edit.trip')} bind:value={tripName} options={tripOptions} clearLabel={t('edit.tripClear')} />
      {#if tripName === NEW_TRIP}
        <TextField label={t('edit.tripNewName')} bind:value={newTripName} />
      {/if}
      <div class="stars-row">
        <span>{t('edit.rating')}</span>
        <StarsInput value={stars.rating} label={t('edit.rating')} onchange={(v) => (stars.rating = v)} />
      </div>
    </section>

    <!-- Personnes et notes -->
    <section class="card">
      {@render header(t('edit.peopleGroup'))}
      <ChipsField label={t('edit.guides')} bind:values={guides} suggestions={known.guide} supporting={t('edit.guidesHint')} />
      <ChipsField label={t('edit.buddies')} bind:values={buddies} suggestions={known.buddy} supporting={t('edit.buddiesHint')} />
      <ChipsField label={t('edit.tags')} bind:values={tags} suggestions={known.tag} supporting={t('edit.tagsHint')} />
      <TextField label={t('edit.notes')} bind:value={f.notes} multiline />
      <div class="end"></div>
    </section>

    <!-- Équipement -->
    <section class="card">
      {@render header(t('edit.equipmentGroup'))}
      <ComboField label={t('edit.suit')} bind:value={f.suit} options={known.suit} />
      <SelectField label={t('edit.divemode')} bind:value={f.divemode} options={modeOptions} onchange={modeChanged} />

      {#each cylinders as c, i (i)}
        {@const cb = cylinderBad(c)}
        <div class="cyl-head">
          <h4 class="cyl-title">{t('edit.cylinderTitle', { n: i + 1 })}{c.f.description ? ` · ${c.f.description}` : ''}</h4>
          {#if !c.protected}
            <button type="button" class="remove" onclick={() => cylinders.splice(i, 1)}>
              <Icon name="close" /><span class="od-sr-only">{t('edit.removeCylinder')}</span>
            </button>
          {/if}
        </div>
        <div class="row">
            <div class="grow">
              <SelectField
                label={t('edit.cylinderType')}
                value={c.f.description}
                options={cylinderTypeOptions(c.initial.description)}
                onchange={(v) => chooseCylinderType(c, v)}
              />
            </div>
            <div class="grow"><SelectField label={t('edit.use')} bind:value={c.f.use} options={useOptions} /></div>
          </div>
          <div class="row">
            <div class="grow">
              <TextField label={t('edit.size')} bind:value={c.f.size} inputmode="decimal" invalid={cb.size}>
                {#snippet trailing()}{@render unit(volumeUnitText)}{/snippet}
              </TextField>
            </div>
            <div class="grow">
              <TextField label={t('edit.workingPressure')} bind:value={c.f.workingPressure} inputmode="decimal" invalid={cb.workingPressure}>
                {#snippet trailing()}{@render unit(pressureUnitText)}{/snippet}
              </TextField>
            </div>
          </div>
          <div class="row">
            <div class="grow">
              <TextField label={t('edit.start')} bind:value={c.f.start} inputmode="decimal" invalid={cb.start}>
                {#snippet trailing()}{@render unit(pressureUnitText)}{/snippet}
              </TextField>
            </div>
            <div class="grow">
              <TextField label={t('edit.end')} bind:value={c.f.end} inputmode="decimal" invalid={cb.end}>
                {#snippet trailing()}{@render unit(pressureUnitText)}{/snippet}
              </TextField>
            </div>
          </div>
          <div class="row">
            <div class="grow">
              <TextField label={t('edit.o2')} bind:value={c.f.o2} inputmode="decimal" invalid={cb.gas}>
                {#snippet trailing()}{@render unit(t('units.percent'))}{/snippet}
              </TextField>
            </div>
            <div class="grow">
              <TextField label={t('edit.he')} bind:value={c.f.he} inputmode="decimal" invalid={cb.gas}>
                {#snippet trailing()}{@render unit(t('units.percent'))}{/snippet}
              </TextField>
            </div>
          </div>
          <TextField label={t('edit.switchDepth')} bind:value={c.f.depth} inputmode="decimal" invalid={cb.depth} supporting={modText(c)}>
            {#snippet trailing()}{@render unit(depthUnitText)}{/snippet}
          </TextField>
      {/each}
      <button type="button" class="add" onclick={addCylinder}><Icon name="plus" />{t('edit.addCylinder')}</button>

      <h3 class="sub">{t('edit.weightsTitle')}</h3>
      {#each weights as w, i (i)}
        <div class="row weight">
          <div class="grow">
            <SelectField label={t('edit.weightPlace')} value={w.description} options={placeOptions(w.description)} onchange={(v) => choosePlace(i, v)} />
          </div>
          <div class="weight-value">
            <TextField label={t('edit.weight')} bind:value={w.weight} inputmode="decimal" invalid={!optionalOk(w.weight, 0, pounds ? 400 : 200)}>
              {#snippet trailing()}{@render unit(weightUnitText)}{/snippet}
            </TextField>
          </div>
          <button type="button" class="remove inline" onclick={() => weights.splice(i, 1)}>
            <Icon name="close" /><span class="od-sr-only">{t('edit.removeWeight')}</span>
          </button>
        </div>
      {/each}
      <button type="button" class="add" onclick={() => weights.push({ description: weightTypes[0]?.name ?? 'integrated', weight: weightText(weightTypes[0]?.grams ?? 0), grams0: -1, text0: '' })}>
        <Icon name="plus" />{t('edit.addWeight')}
      </button>
    </section>

    <!-- Conditions -->
    <section class="card">
      {@render header(t('edit.conditionsGroup'))}
      {#each starFields as field (field.key)}
        <div class="stars-row">
          <span>{field.name}</span>
          <StarsInput value={stars[field.key]} label={field.name} onchange={(v) => (stars[field.key] = v)} />
        </div>
      {/each}
      <div class="row">
        <div class="grow">
          <TextField label={t('edit.air')} bind:value={f.air} inputmode="decimal" invalid={bad.air}>
            {#snippet trailing()}{@render unit(temperatureUnitText)}{/snippet}
          </TextField>
        </div>
        <div class="grow">
          <TextField label={t('edit.water')} bind:value={f.water} inputmode="decimal" invalid={bad.water}>
            {#snippet trailing()}{@render unit(temperatureUnitText)}{/snippet}
          </TextField>
        </div>
      </div>
      <div class="row">
        <div class="grow"><SelectField label={t('edit.waterType')} bind:value={f.waterType} options={waterOptions} /></div>
        <div class="grow">
          <TextField label={t('edit.atmPressure')} bind:value={f.atm} inputmode="numeric" invalid={bad.atm}>
            {#snippet trailing()}{@render unit('mbar')}{/snippet}
          </TextField>
        </div>
      </div>
      <div class="end"></div>
    </section>

    <!-- Ordinateurs -->
    {#if dive.diveComputers.length}
      <section class="card">
        {@render header(t('edit.computersGroup'))}
        <!-- Showing the main computer only: changing it needs a core command. -->
        <div class="computers" role="radiogroup" aria-label={t('edit.computersGroup')}>
          {#each dive.diveComputers as computer, i (i)}
            <label class="computer">
              <input type="radio" name="od-main-computer" checked={i === 0} disabled />
              <span class="texts">
                <span>{computer.model}</span>
                {#if i === 0}<span class="sub">{t('edit.mainComputer')}</span>{/if}
              </span>
            </label>
          {/each}
          <p class="helper">{t('edit.mainComputerHelp')}</p>
        </div>
      </section>
    {/if}

    <!-- Avancé -->
    <section class="card last">
      {@render header(t('edit.advancedGroup'))}
      <label class="switch-row">
        <span class="texts">
          <span class="label">{t('edit.invalid')}</span>
          <span class="helper-text">{t('edit.invalidText')}</span>
        </span>
        <span class="toggle">
          <input type="checkbox" bind:checked={invalid} />
          <span class="toggle-icon"></span>
        </span>
      </label>
    </section>
    </div>
  {/if}
{/snippet}

{#if sheet}
  <Popup class="od-edit-sheet" push={false} swipeToClose={ios} style={sheetStyle}>
    <View>
      <Page class="od-edit-dive">
        {@render chrome()}
        {@render content()}
      </Page>
    </View>
  </Popup>
{:else}
  <Page class="od-edit-dive">
    {@render chrome()}
    {@render content()}
  </Page>
{/if}

{#if dialog === 'date'}
  <WheelDialog
    title={t('edit.date')}
    wheels={dateWheels}
    oncancel={() => (dialog = null)}
    onconfirm={([d, m, y]) => {
      date = { ...date, year: years[y], month: m, day: Math.min(d + 1, daysIn(years[y], m)) };
      dialog = null;
    }}
  />
{:else if dialog === 'time'}
  <WheelDialog
    title={t('edit.time')}
    wheels={timeWheels}
    oncancel={() => (dialog = null)}
    onconfirm={([h, m]) => {
      date = { ...date, hour: h, minute: m };
      dialog = null;
    }}
  />
{/if}

<style>
  @layer od.components {
    :global(.od-edit-dive .page-content) {
      padding-bottom: 32px;
    }

    /* Tablet sheet: the cards in two columns (spec, section 3). */
    .cards.two-columns {
      columns: 2;
      column-gap: 8px;
      padding: 0 8px;

      .card {
        break-inside: avoid;
      }

      .subtitle {
        column-span: all;
      }
    }

    .subtitle {
      margin: 4px 20px 0;
      font-size: 15px;
      color: var(--od-text-2);
    }

    .card {
      margin: 12px 16px 0;
      border-radius: 16px;
      background: var(--od-surface);
      overflow: hidden;
      padding-bottom: 8px;

      &.last {
        margin-bottom: 24px;
      }
    }

    /* Plain section headings: the sections are always open. */
    .heading {
      min-height: 56px;
      padding: 0 16px;
      display: flex;
      align-items: center;
      font-size: 16px;
      font-weight: 600;
      color: var(--od-text);
    }

    /* Two or three fields on one line. */
    .row {
      display: flex;
      gap: 12px;
      padding: 0 16px;
      --od-field-margin: 0;

      .grow {
        flex: 1;
        min-width: 0;
      }


      .time {
        flex: 0 0 auto;
        min-width: 96px;
        /* No room for the arrow, as in the mock-up. */
        --od-button-field-end: 16px;
        --od-button-field-arrow: none;
      }

      .weight-value {
        flex: 0 0 112px;
        min-width: 0;
      }
    }

    .unit {
      color: var(--od-text-2);
    }

    /* Duration and maximum depth: plain text side by side, not fields. */
    .measured {
      display: flex;
      gap: 12px;
      margin: 14px 0 0;
      padding: 0 16px;

      div {
        flex: 1;
        min-width: 0;
      }

      dt {
        font-size: 12px;
        line-height: 16px;
        color: var(--od-text-2);
      }

      dd {
        margin: 0;
        font-size: 16px;
        line-height: 24px;
        color: var(--od-text);
        font-variant-numeric: tabular-nums;
      }
    }

    .stars-row {
      min-height: 56px;
      padding: 0 16px;
      margin-top: 6px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-size: 16px;
    }

    .end {
      height: 10px;
    }

    .cyl-head {
      display: flex;
      align-items: center;
      margin: 8px 4px 0 0;
    }

    .cyl-title {
      flex: 1;
      min-width: 0;
      margin: 0;
      padding: 14px 8px 14px 16px;
      color: var(--od-text);
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
    }

    .remove {
      flex: none;
      width: 48px;
      height: 48px;
      border: none;
      background: none;
      color: var(--od-text-2);
      display: flex;
      align-items: center;
      justify-content: center;

      &.inline {
        align-self: center;
        margin: 18px -8px 0 -4px;
      }
    }

    .add {
      width: auto;
      margin: 12px 16px 4px;
      min-height: 40px;
      padding: 0 16px 0 12px;
      border: 1px solid var(--od-row-divider);
      border-radius: 20px;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .sub {
      margin: 20px 16px 0;
      font-size: 14px;
      font-weight: 600;
    }

    .computers {
      padding: 0 16px 8px;
    }

    .computer {
      min-height: 64px;
      display: flex;
      align-items: center;
      gap: 16px;

      input {
        flex: none;
        appearance: none;
        width: 20px;
        height: 20px;
        margin: 0;
        border-radius: 10px;
        border: 2px solid var(--od-text-2);
        display: flex;
        align-items: center;
        justify-content: center;

        &:checked {
          border-color: var(--od-text);

          &::after {
            content: '';
            width: 10px;
            height: 10px;
            border-radius: 5px;
            background: var(--od-text);
          }
        }
      }

      .texts {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        font-size: 16px;
        color: var(--od-text);
      }

      .sub {
        font-size: 14px;
        line-height: 20px;
        color: var(--od-text-2);
      }
    }

    .helper {
      margin: 0 0 8px 36px;
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);
    }

    .switch-row {
      min-height: 72px;
      padding: 8px 16px;
      display: flex;
      align-items: center;
      gap: 16px;

      .texts {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .label {
        font-size: 16px;
      }

      .helper-text {
        font-size: 14px;
        line-height: 20px;
        color: var(--od-text-2);
      }
    }

    .toggle {
      flex: none;
    }
  }
</style>
