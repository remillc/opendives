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
  import { onMount, tick } from 'svelte';
  import { Page, Navbar, Link, Popup, View, f7 } from 'framework7-svelte';
  import { showSnackbar } from '../lib/snackbar.js';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from '../components/Icon.svelte';
  import TextField from '../components/TextField.svelte';
  import SelectField from '../components/SelectField.svelte';
  import ButtonField from '../components/ButtonField.svelte';
  import ChipsField from '../components/ChipsField.svelte';
  import ComboField from '../components/ComboField.svelte';
  import CylinderCard from '../components/CylinderCard.svelte';
  import StarsInput from '../components/StarsInput.svelte';
  import Stars from '../components/Stars.svelte';
  import { conditionsMean, roundHalfUp1 } from '../lib/conditions.js';
  import WheelDialog from '../components/WheelDialog.svelte';
  import DatePickerDialog from '../components/DatePickerDialog.svelte';
  import TimePickerDialog from '../components/TimePickerDialog.svelte';
  import { logbookValues } from '../lib/people.js';
  import { logbook, saveDiveChanges, tripChange } from '../lib/logbook.svelte.js';
  import { siteChange } from '../lib/sites.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { layout, ios, navWidth } from '../lib/layout.svelte.js';
  import { offerUndo } from '../lib/undo.js';
  import { parseNumber } from '../lib/filter.svelte.js';
  import { WATER_TYPES, waterTypeName, waterTypeOfSalinity } from '../lib/tools.js';
  import { formatCylinderSize, formatDepth, formatLongDate, formatMinSec, formatNumber, formatPressure, formatWeight, locale } from '../lib/format.js';
  import { canMove, dropIndex, gasName, moveItem, OTHER_TYPE, pressureUsed, typeHelper } from '../lib/cylinder-card.js';
  import { t, tIfExists } from '../lib/i18n.js';

  /** @type {{ f7route: { params: { id: string } }, f7router: any }} */
  let { f7route, f7router } = $props();

  // On a tablet the route opens this screen as a popup (App.svelte): an iPad
  // sheet of 780 px in two columns, or an Android pane beside the rail. The
  // fields and the behaviour are the same as full screen on a phone.
  const sheet = layout.rail;
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
   * texts and those it opened with; `key` identifies its card while the cards
   * are reordered, `custom` shows the Size and Working pressure fields (a
   * cylinder outside the table of types, "Other…").
   * @typedef {{ key: number, index: number, protected: boolean, custom: boolean, f: Record<string, string>, initial: Record<string, string> }} EditedCylinder
   */
  /** @type {EditedCylinder[]} */
  let cylinders = $state([]);
  let cylinderKeys = 0;
  /** @param {number} index @param {boolean} isProtected @param {Record<string, string>} texts @returns {EditedCylinder} */
  const editedCylinder = (index, isProtected, texts) => ({
    key: cylinderKeys++,
    index,
    protected: isProtected,
    custom: !texts.description && !!texts.size,
    f: { ...texts },
    initial: texts,
  });
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
      cylinders = d.cylinders.map((c, index) => editedCylinder(index, c.protected, cylinderTexts(c)));
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
    list.push({ value: OTHER_TYPE, label: t('edit.otherType') });
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
  /** "New site…": the field becomes a text field for the new name, created on Save. */
  let newSite = $state(false);
  let siteBefore = '';
  /** @type {HTMLDivElement|undefined} */
  let newSiteBox = $state();

  /** @param {string} typed what was searched in the menu, offered as the name */
  async function startNewSite(typed) {
    siteBefore = siteName;
    siteName = typed;
    newSite = true;
    await tick();
    newSiteBox?.querySelector('input')?.focus();
  }

  /** Back to the menu: with the name typed, or the previous site when it is empty. */
  function endNewSite() {
    siteName = siteName.trim() || siteBefore;
    newSite = false;
  }

  function cancelNewSite() {
    siteName = siteBefore;
    newSite = false;
  }

  /** @param {KeyboardEvent} e */
  function newSiteKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      endNewSite();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancelNewSite();
    }
  }

  /** @param {FocusEvent} e */
  function newSiteLeave(e) {
    if (!newSiteBox?.contains(/** @type {Node|null} */ (e.relatedTarget))) endNewSite();
  }

  /** Site names, the most recently dived first. */
  const siteNames = $derived(
    [...sites].filter((s) => s.name).sort((a, b) => (b.lastDate || '').localeCompare(a.lastDate || '')).map((s) => s.name),
  );
  /** The site names as menu choices (a name is listed once even when several sites share it). */
  const siteOptions = $derived([...new Set(siteNames)].map((n) => ({ value: n, label: n })));
  /** The logbook's trips, by location (the first one of each name). */
  const trips = $derived.by(() => {
    /** @type {Map<string, number>} */
    const byName = new Map();
    for (const d of logbook.dives) if (d.trip?.location && !byName.has(d.trip.location)) byName.set(d.trip.location, d.trip.id);
    return byName;
  });
  /** The computer chosen as the main one, by its place in the dive; 0: unchanged. */
  let mainComputer = $state(0);

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
    if (name === OTHER_TYPE) {
      // A cylinder outside the table: no type name, the size and pressure are typed.
      c.custom = true;
      c.f.description = '';
      return;
    }
    c.custom = false;
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
    cylinders.push(editedCylinder(-1, false, texts));
    chooseCylinderType(cylinders[cylinders.length - 1], name);
  }

  /** The dive becomes a rebreather dive: its cylinders from Settings. @param {string} mode */
  function modeChanged(mode) {
    if (mode !== 'CCR' && mode !== 'PSCR') return;
    addConfiguredCylinder('diluent', settings.defaultDiluent, 21);
    addConfiguredCylinder('oxygen', settings.defaultOxygen, 100);
    for (const name of settings.defaultBailout) addConfiguredCylinder('OC-gas', name, 21);
  }

  /** The starting mix of a use; the diver can still change it. @param {EditedCylinder} c @param {string} use */
  function useChanged(c, use) {
    if (use !== 'oxygen' && use !== 'diluent') return;
    c.f.o2 = show(use === 'oxygen' ? 100 : 21);
    c.f.he = show(0);
  }

  /** The switch depth only applies to open-circuit and bailout cylinders. @param {EditedCylinder} c */
  const hasSwitchDepth = (c) => !(f.divemode === 'CCR' && (c.f.use === 'diluent' || c.f.use === 'oxygen'));

  function addCylinder() {
    const texts = { description: '', use: 'OC-gas', size: '', workingPressure: '', start: '', end: '', o2: show(21), he: show(0), depth: '' };
    cylinders.push(editedCylinder(-1, false, texts));
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

  // --- Cylinder cards: values, gas name, reordering ---------------------------
  const gasWords = $derived({ air: t('edit.gasName.air'), oxygen: t('edit.gasName.oxygen'), nitrox: t('edit.gasName.nitrox'), trimix: t('edit.gasName.trimix') });

  /**
   * What a card shows, from its texts: the gas, the size and working pressure
   * (the type's, or the cylinder's own when they differ from it: never
   * overwritten), the pressure used.
   * @param {EditedCylinder} c
   */
  function cylinderValues(c) {
    const o2 = Math.round((parseNumber(c.f.o2) || 21) * 10);
    const he = Math.round((parseNumber(c.f.he) || 0) * 10);
    const workingPressureMbar = c.f.workingPressure.trim() ? pressureMbar(parseNumber(c.f.workingPressure)) : 0;
    const sizeMlValue = c.f.size.trim() ? sizeMl(parseNumber(c.f.size), workingPressureMbar) : 0;
    const start = c.f.start.trim() ? pressureMbar(parseNumber(c.f.start)) : 0;
    const end = c.f.end.trim() ? pressureMbar(parseNumber(c.f.end)) : 0;
    return { o2, he, sizeMl: sizeMlValue, workingPressureMbar, used: pressureUsed(start, end) };
  }

  /** What the screen reader says after a card moved. */
  let moved = $state('');

  /** The card elements, by key. @type {Record<number, HTMLElement>} */
  let cardEls = $state({});

  /** Moves a card one place (the buttons and the arrow keys). @param {number} from @param {-1|1} direction */
  function moveCylinder(from, direction) {
    const to = from + direction;
    if (!canMove(cylinders, from, to)) return;
    const key = cylinders[from].key;
    cylinders = moveItem(cylinders, from, to);
    moved = t('edit.cylinderMoved', { n: from + 1, to: to + 1 });
    // The focus stays on the handle of the card that moved.
    tick().then(() => /** @type {HTMLElement|null|undefined} */ (cardEls[key]?.querySelector('.od-cylinder-card--handle'))?.focus());
  }

  /**
   * A drag in progress: the dragged card, where it would land, how far the
   * finger moved (the page's scrolling included) and the geometry of the cards
   * when it began.
   * @type {{ key: number, from: number, to: number, dy: number, height: number, centers: number[], scroller: HTMLElement|null, startY: number, startScroll: number, lastY: number, frame: number } | null}
   */
  let drag = $state(null);

  /** The centre line of a card, in the scroller's content. @param {HTMLElement} card @param {HTMLElement|null} scroller */
  const centerOf = (card, scroller) => {
    const r = card.getBoundingClientRect();
    return r.top + r.height / 2 + (scroller?.scrollTop ?? 0);
  };

  /** @param {PointerEvent} event @param {number} from */
  function startDrag(event, from) {
    if (event.button > 0 || drag) return;
    const card = cardEls[cylinders[from].key];
    if (!card || cylinders.length < 2) return;
    event.preventDefault();
    const scroller = /** @type {HTMLElement|null} */ (card.closest('.page-content'));
    const handle = /** @type {HTMLElement} */ (event.currentTarget);
    handle.setPointerCapture(event.pointerId);
    drag = {
      key: cylinders[from].key,
      from,
      to: from,
      dy: 0,
      height: card.offsetHeight + 16,
      centers: cylinders.map((c) => centerOf(cardEls[c.key], scroller)),
      scroller,
      startY: event.clientY,
      startScroll: scroller?.scrollTop ?? 0,
      lastY: event.clientY,
      frame: 0,
    };
    const move = (/** @type {PointerEvent} */ e) => {
      if (drag) drag.lastY = e.clientY;
      follow();
    };
    const end = (/** @type {PointerEvent} */ e) => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
      finishDrag(e.type === 'pointerup');
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    scrollLoop();
  }

  /** The dragged card follows the finger and the others make room. */
  function follow() {
    if (!drag) return;
    const scrolled = (drag.scroller?.scrollTop ?? 0) - drag.startScroll;
    drag.dy = drag.lastY - drag.startY + scrolled;
    let to = dropIndex(drag.centers, drag.from, drag.centers[drag.from] + drag.dy);
    // Never past where the core allows (a new cylinder stays after the others).
    while (to !== drag.from && !canMove(cylinders, drag.from, to)) to += to > drag.from ? -1 : 1;
    drag.to = to;
  }

  /** The page scrolls while a card is held near its top or bottom edge. */
  function scrollLoop() {
    if (!drag) return;
    const scroller = drag.scroller;
    const area = scroller?.getBoundingClientRect();
    if (scroller && area) {
      const edge = 72;
      if (drag.lastY < area.top + edge) scroller.scrollTop -= 10;
      else if (drag.lastY > area.bottom - edge) scroller.scrollTop += 10;
      follow();
    }
    drag.frame = requestAnimationFrame(scrollLoop);
  }

  /** @param {boolean} drop */
  function finishDrag(drop) {
    if (!drag) return;
    cancelAnimationFrame(drag.frame);
    const { from, to } = drag;
    drag = null;
    if (drop && from !== to) {
      cylinders = moveItem(cylinders, from, to);
      moved = t('edit.cylinderMoved', { n: from + 1, to: to + 1 });
    }
  }

  /** The shift of a card while one is dragged. @param {number} i @param {number} key */
  function dragOffset(i, key) {
    if (!drag) return 0;
    if (key === drag.key) return drag.dy;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -drag.height;
    if (drag.to < drag.from && i >= drag.to && i < drag.from) return drag.height;
    return 0;
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
      depth: hasSwitchDepth(c) && !optionalOk(c.f.depth, 0, feet ? 1640 : 500),
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
      if (ch('depth') && hasSwitchDepth(c)) item.depthMm = c.f.depth.trim() ? depthMm(parseNumber(c.f.depth)) : 0;
      return item;
    });
    const reordered = cylinders.filter((c) => c.index >= 0).some((c, i, list) => i > 0 && list[i - 1].index > c.index);
    if (removed || reordered || cylinderItems.some((item) => Object.keys(item).length > 1)) out.cylinders = cylinderItems.map((item) => JSON.stringify(item));
    return out;
  }

  /** @param {string} text */
  function toast(text) {
    showSnackbar(text);
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
      // Subsurface's "Move dive computer to front": its own undoable step.
      if (mainComputer) {
        await saveDiveChanges(dive.id, { mainComputer });
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

  // "Conditions" collapsed by default (task 2026-11-11-44): its header sums it
  // up with the water temperature and the average of the ratings that are set.
  let conditionsOpen = $state(false);
  const conditionsAvg = $derived(conditionsMean(starFields.map((field) => stars[field.key] ?? 0)));
  const conditionsAvgText = $derived(conditionsAvg === null ? '–' : formatNumber(roundHalfUp1(conditionsAvg), 1));
  const conditionsWater = $derived(f.water.trim() && Number.isFinite(parseNumber(f.water)) ? `${f.water.trim()} ${temperatureUnitText}` : '');
  const conditionsLabel = $derived(
    [
      t('edit.conditionsGroup'),
      conditionsAvg === null ? t('edit.conditionsNoAverage') : t('edit.conditionsAverage', { average: conditionsAvgText }),
      ...(conditionsWater ? [t('edit.conditionsWaterLabel', { value: conditionsWater })] : []),
    ].join(', '),
  );
</script>

{#snippet header(/** @type {string} */ title)}
  <span class="od-edit-dive--heading" role="heading" aria-level="2">{title}</span>
{/snippet}

{#snippet unit(/** @type {string} */ text)}<span class="od-edit-dive--unit">{text}</span>{/snippet}

{#snippet chrome()}
  <Navbar title={t('edit.title')}>
    {#snippet left()}
      {#if sheet}
        {#if ios}
          <Link onClick={leave}>{t('dialog.cancel')}</Link>
        {:else}
          <Link iconOnly onClick={leave}><Icon name="close" /><span class="od-sr-only">{t('dialog.cancel')}</span></Link>
        {/if}
      {:else if layout.split}
        <!-- A task in the detail pane (tablet in portrait): ✕, never ←. -->
        <Link back iconOnly><Icon name="close" /><span class="od-sr-only">{t('dialog.cancel')}</span></Link>
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
    <div class="od-edit-dive--cards" class:od-edit-dive--two-columns={sheet}>
    <p class="od-edit-dive--subtitle od-value">
      {[dive.number ? t('detail.number', { number: String(dive.number) }) : '', dive.site, formatLongDate(dive.date)].filter(Boolean).join(' · ')}
    </p>

    <!-- La plongée -->
    <section class="card od-edit-dive--card">
      {@render header(t('edit.diveGroup'))}
      <div class="od-edit-dive--row">
        <div class="od-edit-dive--grow"><ButtonField label={t('edit.date')} value={dateText} icon="calendar" onclick={() => (dialog = 'date')} /></div>
        <div class="od-edit-dive--time"><ButtonField label={t('edit.time')} value={timeText} icon="clock" onclick={() => (dialog = 'time')} /></div>
      </div>
      <!-- Measured by the dive computer: plain text, not a field. -->
      <dl class="od-edit-dive--measured">
        <div><dt>{t('edit.duration')}</dt><dd class="od-value">{formatMinSec(dive.durationSeconds)}</dd></div>
        <div><dt>{t('edit.maxDepth')}</dt><dd class="od-value">{formatDepth(dive.maxDepthMm, prefs)}</dd></div>
      </dl>
      {#if ios}
        <ComboField label={t('edit.site')} bind:value={siteName} options={siteNames} supporting={t('edit.siteHint')} />
      {:else if newSite}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div bind:this={newSiteBox} onfocusout={newSiteLeave} onkeydown={newSiteKey}>
          <TextField label={t('edit.site')} bind:value={siteName} supporting={t('edit.siteNewHint')} keepTrailing>
            {#snippet trailing()}
              <button type="button" class="od-edit-dive--site-back" aria-label={t('edit.siteBack')} onclick={cancelNewSite}><Icon name="expand" /></button>
            {/snippet}
          </TextField>
        </div>
      {:else}
        <SelectField
          label={t('edit.site')}
          bind:value={siteName}
          options={siteOptions}
          supporting={t('edit.siteHint')}
          clearLabel={t('edit.siteClear')}
          searchLabel={t('edit.siteSearch')}
          noResultsLabel={t('edit.siteNone')}
          newLabel={t('edit.siteNew')}
          onnew={startNewSite}
        />
      {/if}
      <SelectField label={t('edit.trip')} bind:value={tripName} options={tripOptions} clearLabel={t('edit.tripClear')} />
      {#if tripName === NEW_TRIP}
        <TextField label={t('edit.tripNewName')} bind:value={newTripName} />
      {/if}
      <div class="od-edit-dive--stars-row">
        <span>{t('edit.rating')}</span>
        <StarsInput value={stars.rating} label={t('edit.rating')} onchange={(v) => (stars.rating = v)} />
      </div>
    </section>

    <!-- Personnes et notes -->
    <section class="card od-edit-dive--card">
      {@render header(t('edit.peopleGroup'))}
      <ChipsField label={t('edit.guides')} bind:values={guides} suggestions={known.guide} supporting={t('edit.guidesHint')} />
      <ChipsField label={t('edit.buddies')} bind:values={buddies} suggestions={known.buddy} supporting={t('edit.buddiesHint')} />
      <ChipsField label={t('edit.tags')} bind:values={tags} suggestions={known.tag} supporting={t('edit.tagsHint')} />
      <TextField label={t('edit.notes')} bind:value={f.notes} multiline />
      <div class="od-edit-dive--end"></div>
    </section>

    <!-- Équipement -->
    <section class="card od-edit-dive--card">
      {@render header(t('edit.equipmentGroup'))}
      <ComboField label={t('edit.suit')} bind:value={f.suit} options={known.suit} />
      <SelectField label={t('edit.divemode')} bind:value={f.divemode} options={modeOptions} onchange={modeChanged} />

      <div class="od-sr-only" aria-live="polite">{moved}</div>
      {#each cylinders as c, i (c.key)}
        {@const cb = cylinderBad(c)}
        {@const own = cylinderValues(c)}
        <CylinderCard
          n={i + 1}
          gas={gasName(own.o2, own.he, gasWords)}
          canUp={canMove(cylinders, i, i - 1)}
          canDown={canMove(cylinders, i, i + 1)}
          dragging={drag?.key === c.key}
          offset={dragOffset(i, c.key)}
          bind:el={cardEls[c.key]}
          onhandledown={(e) => startDrag(e, i)}
          onmove={(direction) => moveCylinder(i, direction)}
        >
          <SelectField
            label={t('edit.cylinderType')}
            value={c.custom ? OTHER_TYPE : c.f.description}
            options={cylinderTypeOptions(c.initial.description)}
            onchange={(v) => chooseCylinderType(c, v)}
            supporting={c.custom ? '' : typeHelper(formatCylinderSize(own.sizeMl, own.workingPressureMbar, prefs), own.workingPressureMbar)}
          />
          {#if c.custom}
            <div class="od-edit-dive--row od-edit-dive--card-row">
              <div class="od-edit-dive--grow">
                <TextField label={t('edit.size')} bind:value={c.f.size} inputmode="decimal" invalid={cb.size}>
                  {#snippet trailing()}{@render unit(volumeUnitText)}{/snippet}
                </TextField>
              </div>
              <div class="od-edit-dive--grow">
                <TextField label={t('edit.workingPressure')} bind:value={c.f.workingPressure} inputmode="decimal" invalid={cb.workingPressure}>
                  {#snippet trailing()}{@render unit(pressureUnitText)}{/snippet}
                </TextField>
              </div>
            </div>
          {/if}
          <SelectField label={t('edit.use')} bind:value={c.f.use} options={useOptions} onchange={(v) => useChanged(c, v)} />
          <div class="od-edit-dive--row od-edit-dive--card-row">
            <div class="od-edit-dive--grow">
              <TextField label={t('edit.o2')} bind:value={c.f.o2} inputmode="decimal" invalid={cb.gas}>
                {#snippet trailing()}{@render unit(t('units.percent'))}{/snippet}
              </TextField>
            </div>
            <div class="od-edit-dive--grow">
              <TextField label={t('edit.he')} bind:value={c.f.he} inputmode="decimal" invalid={cb.gas}>
                {#snippet trailing()}{@render unit(t('units.percent'))}{/snippet}
              </TextField>
            </div>
          </div>
          <div class="od-edit-dive--row od-edit-dive--card-row">
            <div class="od-edit-dive--grow">
              <TextField label={t('edit.start')} bind:value={c.f.start} inputmode="decimal" invalid={cb.start}>
                {#snippet trailing()}{@render unit(pressureUnitText)}{/snippet}
              </TextField>
            </div>
            <div class="od-edit-dive--grow">
              <TextField
                label={t('edit.end')}
                bind:value={c.f.end}
                inputmode="decimal"
                invalid={cb.end}
                supporting={own.used ? t('edit.consumed', { amount: formatPressure(own.used, prefs) }) : ''}
              >
                {#snippet trailing()}{@render unit(pressureUnitText)}{/snippet}
              </TextField>
            </div>
          </div>
          {#if hasSwitchDepth(c)}
            <TextField label={t('edit.switchDepth')} bind:value={c.f.depth} inputmode="decimal" invalid={cb.depth} supporting={modText(c)}>
              {#snippet trailing()}{@render unit(depthUnitText)}{/snippet}
            </TextField>
          {/if}
          {#snippet footer()}
            {#if !c.protected}
              <button type="button" class="od-edit-dive--remove-cylinder" onclick={() => cylinders.splice(i, 1)}>{t('edit.removeCylinder')}</button>
            {/if}
          {/snippet}
        </CylinderCard>
      {/each}
      <button type="button" class="od-edit-dive--add" onclick={addCylinder}><Icon name="plus" />{t('edit.addCylinder')}</button>

      <h3 class="od-edit-dive--sub">{t('edit.weightsTitle')}</h3>
      {#each weights as w, i (i)}
        <div class="od-edit-dive--row od-edit-dive--weight">
          <div class="od-edit-dive--grow">
            <SelectField label={t('edit.weightPlace')} value={w.description} options={placeOptions(w.description)} onchange={(v) => choosePlace(i, v)} />
          </div>
          <div class="od-edit-dive--weight-value">
            <TextField label={t('edit.weight')} bind:value={w.weight} inputmode="decimal" invalid={!optionalOk(w.weight, 0, pounds ? 400 : 200)}>
              {#snippet trailing()}{@render unit(weightUnitText)}{/snippet}
            </TextField>
          </div>
          <button type="button" class="od-edit-dive--remove od-edit-dive--inline" onclick={() => weights.splice(i, 1)}>
            <Icon name="close" /><span class="od-sr-only">{t('edit.removeWeight')}</span>
          </button>
        </div>
      {/each}
      <button type="button" class="od-edit-dive--add" onclick={() => weights.push({ description: weightTypes[0]?.name ?? 'integrated', weight: weightText(weightTypes[0]?.grams ?? 0), grams0: -1, text0: '' })}>
        <Icon name="plus" />{t('edit.addWeight')}
      </button>
    </section>

    <!-- Conditions -->
    <section class="card od-edit-dive--card">
      <button
        type="button"
        class="od-edit-dive--conditions-head"
        aria-expanded={conditionsOpen}
        aria-label={conditionsLabel}
        onclick={() => (conditionsOpen = !conditionsOpen)}
      >
        <span class="od-edit-dive--conditions-titles">
          <span class="od-edit-dive--conditions-title" role="heading" aria-level="2">{t('edit.conditionsGroup')}</span>
          {#if conditionsWater}<span class="od-edit-dive--conditions-water">{t('edit.conditionsWater', { value: conditionsWater })}</span>{/if}
        </span>
        <Stars value={conditionsAvg ?? 0} label="" size={20} decorative />
        <span class="od-edit-dive--conditions-average">{conditionsAvgText}</span>
        <span class="od-edit-dive--conditions-chevron" class:od-edit-dive--conditions-chevron-up={conditionsOpen}><Icon name="expand" /></span>
      </button>
      {#if conditionsOpen}
      {#each starFields as field (field.key)}
        <div class="od-edit-dive--stars-row">
          <span>{field.name}</span>
          <StarsInput value={stars[field.key]} label={field.name} onchange={(v) => (stars[field.key] = v)} />
        </div>
      {/each}
      <div class="od-edit-dive--row">
        <div class="od-edit-dive--grow">
          <TextField label={t('edit.air')} bind:value={f.air} inputmode="decimal" invalid={bad.air}>
            {#snippet trailing()}{@render unit(temperatureUnitText)}{/snippet}
          </TextField>
        </div>
        <div class="od-edit-dive--grow">
          <TextField label={t('edit.water')} bind:value={f.water} inputmode="decimal" invalid={bad.water}>
            {#snippet trailing()}{@render unit(temperatureUnitText)}{/snippet}
          </TextField>
        </div>
      </div>
      <div class="od-edit-dive--row">
        <div class="od-edit-dive--grow"><SelectField label={t('edit.waterType')} bind:value={f.waterType} options={waterOptions} /></div>
        <div class="od-edit-dive--grow">
          <TextField label={t('edit.atmPressure')} bind:value={f.atm} inputmode="numeric" invalid={bad.atm}>
            {#snippet trailing()}{@render unit('mbar')}{/snippet}
          </TextField>
        </div>
      </div>
      <div class="od-edit-dive--end"></div>
      {/if}
    </section>

    <!-- Ordinateurs -->
    {#if dive.diveComputers.length}
      <section class="card od-edit-dive--card">
        {@render header(t('edit.computersGroup'))}
        <div class="od-edit-dive--computers" role="radiogroup" aria-label={t('edit.computersGroup')}>
          {#each dive.diveComputers as computer, i (i)}
            <label class="od-edit-dive--computer">
              <input type="radio" name="od-main-computer" checked={i === mainComputer} onchange={() => (mainComputer = i)} />
              <span class="od-edit-dive--texts">
                <span>{computer.nickname || computer.model || t('edit.unnamedComputer')}</span>
                {#if i === mainComputer}<span class="od-edit-dive--role">{t('edit.mainComputer')}</span>{/if}
              </span>
            </label>
          {/each}
          <p class="od-edit-dive--helper">{t('edit.mainComputerHelp')}</p>
        </div>
      </section>
    {/if}

    <!-- Avancé -->
    <section class="card od-edit-dive--card od-edit-dive--last">
      {@render header(t('edit.advancedGroup'))}
      <label class="od-edit-dive--switch-row">
        <span class="od-edit-dive--texts">
          <span class="od-edit-dive--label">{t('edit.invalid')}</span>
          <span class="od-edit-dive--helper-text">{t('edit.invalidText')}</span>
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
  <Popup class="od-edit-dive od-edit-sheet" push={false} swipeToClose={ios} style={sheetStyle}>
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

{#if dialog === 'date' && !ios}
  <DatePickerDialog
    year={date.year}
    month={date.month}
    day={date.day}
    maxYear={thisYear + 1}
    oncancel={() => (dialog = null)}
    onconfirm={(d) => {
      date = { ...date, year: d.year, month: d.month, day: d.day };
      dialog = null;
    }}
  />
{:else if dialog === 'time' && !ios}
  <TimePickerDialog
    hour={date.hour}
    minute={date.minute}
    oncancel={() => (dialog = null)}
    onconfirm={(time) => {
      date = { ...date, hour: time.hour, minute: time.minute };
      dialog = null;
    }}
  />
{:else if dialog === 'date'}
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
    .od-edit-dive--cards.od-edit-dive--two-columns {
      columns: 2;
      column-gap: 8px;
      padding: 0 8px;

      .od-edit-dive--card {
        break-inside: avoid;
      }

      .od-edit-dive--subtitle {
        column-span: all;
      }
    }

    .od-edit-dive--subtitle {
      margin: 4px 20px 0;
      font-size: 15px;
      color: var(--od-text-2);
    }

    .od-edit-dive--card {
      margin: 12px 16px 0;
      border-radius: 16px;
      background: var(--od-surface);
      overflow: hidden;
      padding-bottom: 8px;

      &.od-edit-dive--last {
        margin-bottom: 24px;
      }
    }

    /* "Conditions": a header button that opens the section, with the water
       temperature, the average of the ratings as stars and its value. */
    .od-edit-dive--conditions-head {
      width: 100%;
      min-height: 56px;
      padding: 0 12px 0 16px;
      border: none;
      background: transparent;
      display: flex;
      align-items: center;
      gap: 8px;
      font: inherit;
      color: var(--od-text);
      text-align: start;
      cursor: pointer;
    }

    .od-edit-dive--conditions-titles {
      flex: 1;
      min-width: 0;
      padding: 8px 0;
      display: flex;
      flex-direction: column;
    }

    .od-edit-dive--conditions-title {
      font-size: 16px;
      font-weight: 600;
    }

    .od-edit-dive--conditions-water {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
      font-variant-numeric: tabular-nums;
    }

    .od-edit-dive--conditions-average {
      min-width: 28px;
      font-size: 14px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      text-align: end;
    }

    .od-edit-dive--conditions-chevron {
      display: flex;
      transition: transform 0.2s;

      &.od-edit-dive--conditions-chevron-up {
        transform: rotate(180deg);
      }
    }

    /* Plain section headings: the other sections are always open. */
    .od-edit-dive--heading {
      min-height: 56px;
      padding: 0 16px;
      display: flex;
      align-items: center;
      font-size: 16px;
      font-weight: 600;
      color: var(--od-text);
    }

    .od-edit-dive--site-back {
      width: 40px;
      height: 40px;
      flex: none;
      padding: 0;
      border: none;
      border-radius: 20px;
      background: none;
      color: var(--od-text-2);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Two or three fields on one line. */
    .od-edit-dive--row {
      display: flex;
      gap: 12px;
      padding: 0 16px;
      --od-field-margin: 0;

      .od-edit-dive--grow {
        flex: 1;
        min-width: 0;
      }


      .od-edit-dive--time {
        flex: 0 0 auto;
        /* At least 120 dp; grows for "12:44 PM" in the 12-hour format, the Date field takes the rest. */
        min-width: 120px;
        --od-button-field-end: 48px;
      }

      .od-edit-dive--weight-value {
        flex: 0 0 112px;
        min-width: 0;
      }
    }

    .od-edit-dive--unit {
      color: var(--od-text-2);
    }

    /* Duration and maximum depth: plain text side by side, not fields. */
    .od-edit-dive--measured {
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

    .od-edit-dive--stars-row {
      min-height: 56px;
      padding: 0 16px;
      margin-top: 6px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-size: 16px;
    }

    .od-edit-dive--end {
      height: 10px;
    }

    .od-edit-dive--remove {
      flex: none;
      width: 48px;
      height: 48px;
      border: none;
      background: none;
      color: var(--od-text-2);
      display: flex;
      align-items: center;
      justify-content: center;

      &.od-edit-dive--inline {
        align-self: center;
        margin: 18px -8px 0 -4px;
      }
    }

    /* In a cylinder card the rows have no side padding: the card has its own. */
    .od-edit-dive--row.od-edit-dive--card-row {
      padding: 0;
    }

    .od-edit-dive--remove-cylinder {
      margin: 12px 0 0 -12px;
      min-height: 40px;
      padding: 0 12px;
      border: none;
      border-radius: 20px;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-size: 14px;
      font-weight: 600;
    }

    .od-edit-dive--add {
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

    .od-edit-dive--sub {
      margin: 20px 16px 0;
      font-size: 14px;
      font-weight: 600;
    }

    /* The 8 px under the help text are those of the card. */
    .od-edit-dive--computers {
      padding: 0 16px;
    }

    .od-edit-dive--computer {
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

      .od-edit-dive--texts {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        font-size: 16px;
        color: var(--od-text);
      }

      .od-edit-dive--role {
        font-size: 14px;
        line-height: 20px;
        color: var(--od-text-2);
      }
    }

    .od-edit-dive--helper {
      margin: 0 0 8px 36px;
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);
    }

    .od-edit-dive--switch-row {
      min-height: 72px;
      padding: 8px 16px;
      display: flex;
      align-items: center;
      gap: 16px;

      .od-edit-dive--texts {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .od-edit-dive--label {
        font-size: 16px;
      }

      .od-edit-dive--helper-text {
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
