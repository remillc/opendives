<script>
  // @ts-check
  // Settings, modelled on Subsurface (docs/ui-specification.md, section 4,
  // "Settings, modelled on Subsurface" and "Settings: what each row does";
  // docs/mockups/android-reglages.dc.html and reglages-*-android.dc.html).
  // Four kinds of row: a switch, a value that opens a single-choice dialog, a
  // number that opens a wheel dialog, a chevron that opens a sub-screen. Each
  // value is the core's preference (core/pref.h), with Subsurface's default,
  // kept as a setting of this device (lib/settings.svelte.js); trip grouping is
  // the logbook's. The planner's own parameters stay in the planner.
  import { onMount } from 'svelte';
  import { Page, Navbar, Link, f7 } from 'framework7-svelte';
  import { showSnackbar } from '../lib/snackbar.js';
  import { OpenDivesCore } from 'opendives-core';
  import ChoiceDialog from '../components/ChoiceDialog.svelte';
  import MenuButton from '../components/MenuButton.svelte';
  import { layout } from '../lib/layout.svelte.js';
  import { navigation } from '../lib/navigation.svelte.js';
  import WheelDialog from '../components/WheelDialog.svelte';
  import RenumberDialog from '../components/RenumberDialog.svelte';
  import { t, deviceLanguage } from '../lib/i18n.js';
  import { logbook, setAutogroup } from '../lib/logbook.svelte.js';
  import {
    settings,
    setCorePrefs,
    setAppSetting,
    forgetDiveComputers,
    resetAllSettings,
    DATE_PATTERNS,
    TIME_PATTERNS,
  } from '../lib/settings.svelte.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { formatNumber, formatDuration, formatDateChoice, formatTimeChoice, formatDepth } from '../lib/format.js';
  import { regionUsesLetter } from '../lib/share.js';
  import { waterTypeName, downloadWaterName } from '../lib/tools.js';
  import { cylinderChoices } from '../lib/cylinder-choices.js';
  import { visibleRegions, updatesCount } from '../lib/offline-maps.svelte.js';

  /** @typedef {import('opendives-core').CorePrefValues} CorePrefValues */
  /** @typedef {{ value: string, label: string, example?: string }} Option */
  /**
   * @typedef {{ kind: 'switch', id: string, label: string, text?: string, checked: boolean, set: (v: boolean) => unknown, dimmed?: boolean }
   *   | { kind: 'choice', id: string, label: string, text?: string, value: string, title?: string, current: string,
   *       options: () => Option[] | Promise<Option[]>, set: (v: string) => unknown, dimmed?: boolean, note?: string }
   *   | { kind: 'number', id: string, label: string, text?: string, value: string, title?: string, dialogText?: string,
   *       wheels: () => {label: string, values: string[], index: number, defaultIndex: number}[], set: (indexes: number[]) => unknown, dimmed?: boolean }
   *   | { kind: 'link', id: string, label: string, text?: string, href?: string, action?: () => void, disabled?: boolean, value?: string, badge?: string }
   *   | { kind: 'info', id: string, label: string, value: string }} Row
   */

  onMount(async () => {
    try {
      logbook.prefs = await OpenDivesCore.getPrefs();
    } catch (e) {
      console.error('Reading the settings', e);
    }
  });

  /** The values shown: the core's, with Subsurface's defaults until they are read. */
  const p = $derived(/** @type {CorePrefValues} */ ({ ...(logbook.prefs.defaults ?? {}), ...logbook.prefs }));
  const defaults = $derived(/** @type {CorePrefValues} */ (logbook.prefs.defaults ?? p));

  let search = $state('');
  let renumbering = $state(false);
  const UNIT_SYSTEMS = /** @type {const} */ (['metric', 'imperial', 'personalize']);

  /** @type {{ kind: 'choice', row: Extract<Row, {kind: 'choice'}>, options: Option[] } | { kind: 'number', row: Extract<Row, {kind: 'number'}> } | null} */
  let dialog = $state(null);

  /** @param {unknown} e */
  function failed(e) {
    console.error('Changing a setting', e);
    showSnackbar(t('settings.error'));
  }

  /** @param {Partial<CorePrefValues>} changes */
  async function setCore(changes) {
    try {
      logbook.prefs = await setCorePrefs(changes);
    } catch (e) {
      failed(e);
    }
  }

  // --- Values and examples ---------------------------------------------------

  const today = (() => {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 14, 30));
  })();

  const deviceUses24h = (() => {
    const cycle = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle;
    return cycle === 'h23' || cycle === 'h24';
  })();

  /** @type {Record<string, string>} */
  const languageNames = { fr: 'Français', 'fr-CA': 'Français (Canada)', en: 'English' };

  /** @param {number} mbar @param {number} decimals */
  const bar = (mbar, decimals) => `${formatNumber(mbar / 1000, decimals)} ${t('units.bar')}`;

  /**
   * Values of a wheel: from `min` to `max` by `step` (integers in the core's unit).
   * @param {number} min @param {number} max @param {number} step
   */
  function range(min, max, step) {
    /** @type {number[]} */
    const out = [];
    for (let v = min; v <= max; v += step) out.push(v);
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
   * One wheel.
   * @param {string} label @param {number[]} list @param {number} value @param {number} def
   * @param {(v: number) => string} text
   */
  const wheel = (label, list, value, def, text) => ({
    label,
    values: list.map(text),
    index: nearest(list, value),
    defaultIndex: nearest(list, def),
  });

  /** A choice of units: label for each core value. @type {Record<string, Record<string, () => string>>} */
  const unitLabels = {
    length: { m: () => t('settings.meters'), ft: () => t('settings.feet') },
    pressure: { bar: () => t('units.bar'), psi: () => t('units.psi') },
    volume: { l: () => t('settings.liters'), cuft: () => t('settings.cubicFeet') },
    temperature: { C: () => t('units.celsius'), F: () => t('units.fahrenheit') },
    weight: { kg: () => t('units.kilograms'), lbs: () => t('units.pounds') },
  };

  /** @param {'length'|'pressure'|'volume'|'temperature'|'weight'} key @param {string} label @returns {Row} */
  function unitRow(key, label) {
    const labels = unitLabels[key];
    return {
      kind: 'choice',
      id: key,
      label,
      value: labels[p[key]]?.() ?? '',
      current: p[key],
      options: () => Object.entries(labels).map(([value, text]) => ({ value, label: text() })),
      set: (v) => setCore({ [key]: v }),
    };
  }

  /**
   * The cylinder added to a rebreather dive (OpenDives device settings).
   * @param {'defaultDiluent'|'defaultOxygen'} key @param {string} label @returns {Row}
   */
  function rebreatherRow(key, label) {
    return {
      kind: 'choice',
      id: key,
      label,
      value: settings[key] || t('settings.defaultCylinder.none'),
      current: settings[key],
      note: t('settings.defaultCylinder.listNote'),
      options: () => cylinderChoices(p),
      set: (v) => setAppSetting(key, v),
    };
  }

  /** Coordinates of the examples (Russell, New Zealand), in the three formats. */
  const coordinateExamples = {
    decimal: () => '-35.4485, 174.7317',
    minutes: () => `35° ${formatNumber(26.91, 1)}′ S, 174° ${formatNumber(43.9, 1)}′ E`,
    seconds: () => `35° 26′ ${formatNumber(54.6, 1)}″ S, 174° 43′ ${formatNumber(54.1, 1)}″ E`,
  };

  const depthPerMinute = $derived(p.length === 'ft' ? `${formatNumber(30)} ${t('units.feet')}/min` : `${formatNumber(9)} ${t('units.meters')}/min`);
  const depthPerSecond = $derived(
    p.length === 'ft' ? `${formatNumber(0.5, 1)} ${t('units.feet')}/s` : `${formatNumber(0.15, 2)} ${t('units.meters')}/s`,
  );

  /** @param {'mixed'|'minutes'|'hours'} mode */
  const durationExample = (mode) => `${formatDuration(2700, mode)}, ${formatDuration(4320, mode)}`;

  /** Depth wheel values (best-mix END), in mm: metre by metre, or 10 ft by 10 ft. */
  const depthWheel = $derived(p.length === 'ft' ? range(0, 330, 10).map((ft) => Math.round(ft * 304.8)) : range(0, 100, 1).map((m) => m * 1000));

  /** Altitude wheel values, in mm: 50 m by 50 m, or 100 ft by 100 ft. */
  const altitudeWheel = $derived(p.length === 'ft' ? range(0, 16000, 100).map((ft) => Math.round(ft * 304.8)) : range(0, 5000, 50).map((m) => m * 1000));

  const computers = $derived(logbook.prefs.diveComputers ?? []);

  // --- The rows ----------------------------------------------------------------

  /** @type {{ id: string, title: string, rows: Row[] }[]} */
  const groups = $derived([
    {
      id: 'language',
      title: t('settings.groups.language'),
      rows: [
        {
          kind: 'choice',
          id: 'appLanguage',
          label: t('settings.language.label'),
          text: settings.language === 'system' ? t('settings.language.systemText', { language: languageNames[deviceLanguage] }) : undefined,
          value: settings.language === 'system' ? t('settings.system') : languageNames[settings.language],
          current: settings.language,
          options: () => [
            { value: 'system', label: t('settings.system'), example: languageNames[deviceLanguage] },
            { value: 'fr', label: languageNames.fr },
            { value: 'fr-CA', label: languageNames['fr-CA'] },
            { value: 'en', label: languageNames.en },
          ],
          set: (v) => setAppSetting('language', /** @type {'system'|'fr'|'fr-CA'|'en'} */ (v)),
        },
        {
          kind: 'choice',
          id: 'dateFormat',
          label: t('settings.dateFormat.label'),
          value: formatDateChoice(today, settings.dateFormat),
          current: settings.dateFormat,
          // The dates themselves, the device's format first (spec).
          options: () => {
            const system = formatDateChoice(today, 'system');
            /** @type {Option[]} */
            const list = [{ value: 'system', label: system }];
            for (const choice of /** @type {const} */ (['iso', 'medium', 'dmy', 'mdy'])) {
              const label = formatDateChoice(today, choice);
              if (!list.some((o) => o.label === label)) list.push({ value: choice, label });
            }
            return list;
          },
          set: (v) => {
            const choice = /** @type {'system'|'iso'|'medium'|'dmy'|'mdy'} */ (v);
            setAppSetting('dateFormat', choice);
            return setCore(choice === 'system' ? { dateFormatOverride: false } : { dateFormat: DATE_PATTERNS[choice], dateFormatOverride: true });
          },
        },
        {
          kind: 'choice',
          id: 'timeFormat',
          label: t('settings.timeFormat.label'),
          text: settings.timeFormat === 'system'
            ? t('settings.timeFormat.text', { name: t(deviceUses24h ? 'settings.timeFormat.h24' : 'settings.timeFormat.h12'), example: formatTimeChoice(today, 'system') })
            : undefined,
          value: settings.timeFormat === 'system' ? t('settings.system') : t(settings.timeFormat === '24' ? 'settings.timeFormat.h24' : 'settings.timeFormat.h12'),
          current: settings.timeFormat,
          options: () => [
            { value: 'system', label: t('settings.system'), example: formatTimeChoice(today, 'system') },
            { value: '24', label: t('settings.timeFormat.h24'), example: formatTimeChoice(today, '24') },
            { value: '12', label: t('settings.timeFormat.h12'), example: formatTimeChoice(today, '12') },
          ],
          set: (v) => {
            const choice = /** @type {'system'|'24'|'12'} */ (v);
            setAppSetting('timeFormat', choice);
            return setCore(choice === 'system' ? { timeFormatOverride: false } : { timeFormat: TIME_PATTERNS[choice], timeFormatOverride: true });
          },
        },
        {
          kind: 'choice',
          id: 'paperSize',
          label: t('settings.paperSize.label'),
          text: settings.paperSize === 'system'
            ? t('settings.paperSize.text', { name: t(regionUsesLetter() ? 'settings.paperSize.letter' : 'settings.paperSize.a4') })
            : undefined,
          value: settings.paperSize === 'system' ? t('settings.system') : t(`settings.paperSize.${settings.paperSize}`),
          current: settings.paperSize,
          options: () => [
            { value: 'system', label: t('settings.system'), example: t(regionUsesLetter() ? 'settings.paperSize.letter' : 'settings.paperSize.a4') },
            { value: 'letter', label: t('settings.paperSize.letter') },
            { value: 'a4', label: t('settings.paperSize.a4') },
          ],
          set: (v) => setAppSetting('paperSize', /** @type {'system'|'letter'|'a4'} */ (v)),
        },
      ],
    },
    {
      id: 'units',
      title: t('settings.groups.units'),
      rows: [
        unitRow('length', t('settings.depth')),
        unitRow('pressure', t('settings.pressure')),
        unitRow('volume', t('settings.volume')),
        unitRow('temperature', t('settings.temperature')),
        unitRow('weight', t('settings.weight')),
      ],
    },
    {
      id: 'units2',
      title: '',
      rows: [
        {
          kind: 'choice',
          id: 'verticalSpeed',
          label: t('settings.verticalSpeed.label'),
          value: t(p.verticalSpeed === 's' ? 'settings.verticalSpeed.perSecondValue' : 'settings.verticalSpeed.perMinuteValue'),
          current: p.verticalSpeed,
          options: () => [
            { value: 'min', label: t('settings.verticalSpeed.perMinute'), example: depthPerMinute },
            { value: 's', label: t('settings.verticalSpeed.perSecond'), example: depthPerSecond },
          ],
          set: (v) => setCore({ verticalSpeed: /** @type {'min'|'s'} */ (v) }),
        },
        {
          kind: 'choice',
          id: 'duration',
          label: t('settings.duration.label'),
          text: t(`settings.duration.${p.duration}Text`),
          value: t(`settings.duration.${p.duration}`),
          current: p.duration,
          options: () =>
            /** @type {const} */ (['mixed', 'hours', 'minutes']).map((mode) => ({
              value: mode,
              label: t(`settings.duration.${mode}`),
              example: durationExample(mode),
            })),
          set: (v) => setCore({ duration: /** @type {'mixed'|'minutes'|'hours'} */ (v) }),
        },
        {
          kind: 'choice',
          id: 'coordinates',
          label: t('settings.coordinates.label'),
          text: coordinateExamples[settings.coordinatesFormat](),
          value: t(`settings.coordinates.${settings.coordinatesFormat}`),
          current: settings.coordinatesFormat,
          options: () =>
            /** @type {const} */ (['decimal', 'minutes', 'seconds']).map((format) => ({
              value: format,
              label: t(`settings.coordinates.${format}`),
              example: coordinateExamples[format]().split(', ')[0],
            })),
          set: (v) => setAppSetting('coordinatesFormat', /** @type {'decimal'|'minutes'|'seconds'} */ (v)),
        },
      ],
    },
    {
      id: 'conditions',
      title: t('settings.groups.conditions'),
      rows: [
        {
          kind: 'choice',
          id: 'defaultWater',
          label: t('settings.conditions.waterType'),
          value: waterTypeName(settings.defaultWater),
          current: settings.defaultWater,
          options: () => /** @type {const} */ (['fresh', 'salt', 'en13319']).map((id) => ({ value: id, label: waterTypeName(id) })),
          set: (v) => setAppSetting('defaultWater', /** @type {'fresh'|'salt'|'en13319'} */ (v)),
        },
        {
          kind: 'number',
          id: 'defaultAltitude',
          label: t('settings.conditions.altitude'),
          value: formatDepth(settings.defaultAltitudeMm, p),
          wheels: () => [wheel(t('settings.conditions.altitude'), altitudeWheel, settings.defaultAltitudeMm, 0, (mm) => formatDepth(mm, p))],
          set: ([i]) => setAppSetting('defaultAltitudeMm', altitudeWheel[i]),
        },
      ],
    },
    {
      id: 'logbook',
      title: t('settings.groups.logbook'),
      rows: [
        {
          kind: 'switch',
          id: 'autogroup',
          label: t('settings.autogroup.label'),
          checked: logbook.prefs.autogroup === true,
          set: async (v) => {
            try {
              await setAutogroup(v);
            } catch (e) {
              failed(e);
            }
          },
        },
        { kind: 'link', id: 'renumber', label: t('renumber.label'), text: t('renumber.text'), action: () => (renumbering = true) },
        { kind: 'switch', id: 'displayInvalidDives', label: t('settings.invalidDives.label'), text: t('settings.invalidDives.text'), checked: p.displayInvalidDives, set: async (v) => {
          await setCore({ displayInvalidDives: v });
          // The core's list leaves invalid dives out unless this is on.
          try {
            logbook.dives = await OpenDivesCore.listLoadedDives();
          } catch (e) {
            failed(e);
          }
        } },
        { kind: 'switch', id: 'extraEnvironmental', label: t('settings.extraConditions.label'), text: t('settings.extraConditions.text'), checked: p.extraEnvironmental, set: (v) => setCore({ extraEnvironmental: v }) },
        { kind: 'switch', id: 'salinityEdit', label: t('settings.salinity.label'), text: t('settings.salinity.text'), checked: p.salinityEdit, set: (v) => setCore({ salinityEdit: v }) },
        {
          kind: 'choice',
          id: 'downloadWater',
          label: t('settings.downloadWater.label'),
          text: t('settings.downloadWater.text'),
          value: downloadWaterName(settings.downloadWater),
          current: settings.downloadWater,
          note: t('settings.downloadWater.intro'),
          options: () => /** @type {const} */ (['none', 'fresh', 'salt', 'en13319']).map((id) => ({ value: id, label: downloadWaterName(id) })),
          set: (v) => setAppSetting('downloadWater', /** @type {'none'|'fresh'|'salt'|'en13319'} */ (v)),
        },
      ],
    },
    {
      id: 'equipment',
      title: t('settings.groups.equipment'),
      rows: [
        {
          kind: 'choice',
          id: 'defaultCylinder',
          label: t('settings.defaultCylinder.label'),
          text: t('settings.defaultCylinder.text'),
          value: p.defaultCylinder || t('settings.defaultCylinder.none'),
          current: p.defaultCylinder,
          note: t('settings.defaultCylinder.listNote'),
          options: () => cylinderChoices(p),
          set: (v) => setCore({ defaultCylinder: v }),
        },
        rebreatherRow('defaultDiluent', t('settings.defaultCylinder.diluent')),
        rebreatherRow('defaultOxygen', t('settings.defaultCylinder.oxygen')),
        {
          kind: 'link',
          id: 'defaultBailout',
          label: t('settings.defaultCylinder.bailout'),
          text: t('settings.defaultCylinder.bailoutText'),
          value: settings.defaultBailout.join(', ') || t('settings.defaultCylinder.none'),
          href: '/settings/bailout',
        },
        { kind: 'switch', id: 'includeUnusedTanks', label: t('settings.unusedTanks.label'), text: t('settings.unusedTanks.text'), checked: p.includeUnusedTanks, set: (v) => setCore({ includeUnusedTanks: v }) },
        { kind: 'switch', id: 'displayDefaultTankInfos', label: t('settings.standardSizes.label'), text: t('settings.standardSizes.text'), checked: p.displayDefaultTankInfos, set: (v) => setCore({ displayDefaultTankInfos: v }) },
        { kind: 'link', id: 'cylinderTypes', label: t('settings.cylinderTypes.label'), text: t('settings.cylinderTypes.text'), href: '/settings/cylinders/' },
      ],
    },
    {
      id: 'profile',
      title: t('settings.groups.profile'),
      rows: [
        { kind: 'switch', id: 'showAverageDepth', label: t('settings.averageDepth'), checked: p.showAverageDepth, set: (v) => setCore({ showAverageDepth: v }) },
        { kind: 'switch', id: 'dcCeiling', label: t('settings.dcCeiling'), text: t('settings.dcCeilingText'), checked: p.dcCeiling, set: (v) => setCore({ dcCeiling: v }) },
        { kind: 'switch', id: 'redCeiling', label: t('settings.redCeiling'), text: t('settings.redCeilingText'), checked: p.redCeiling, dimmed: !p.dcCeiling, set: (v) => setCore({ redCeiling: v }) },
        { kind: 'switch', id: 'calcCeiling', label: t('settings.calcCeiling.label'), text: t('settings.calcCeiling.text'), checked: p.calcCeiling, set: (v) => setCore({ calcCeiling: v }) },
        { kind: 'switch', id: 'tankbar', label: t('settings.tankbar.label'), text: t('settings.tankbar.text'), checked: p.tankbar, set: (v) => setCore({ tankbar: v }) },
      ],
    },
    {
      id: 'deco',
      title: t('settings.groups.deco'),
      rows: [
        {
          kind: 'choice',
          id: 'decoModel',
          label: t('settings.deco.model'),
          text: t(p.decoModel === 'vpmb' ? 'settings.deco.orBuehlmann' : 'settings.deco.orVpmb'),
          value: t(p.decoModel === 'vpmb' ? 'settings.deco.vpmb' : 'settings.deco.buehlmann'),
          current: p.decoModel,
          options: () => [
            { value: 'buehlmann', label: t('settings.deco.buehlmann') },
            { value: 'vpmb', label: t('settings.deco.vpmb') },
          ],
          // One setting for the profile and the planner: display_deco_mode and planner_deco_mode.
          set: (v) => setCore({ decoModel: /** @type {'buehlmann'|'vpmb'} */ (v) }),
        },
        {
          kind: 'number',
          id: 'gf',
          label: t('settings.deco.gf'),
          text: t('settings.deco.gfText'),
          value: `${formatNumber(p.gfLow)} / ${formatNumber(p.gfHigh)}`,
          dialogText: t('settings.deco.gfDialog'),
          dimmed: p.decoModel === 'vpmb',
          wheels: () => [
            wheel(t('settings.deco.gfLow'), range(10, 150, 1), p.gfLow, defaults.gfLow, (v) => formatNumber(v)),
            wheel(t('settings.deco.gfHigh'), range(40, 150, 1), p.gfHigh, defaults.gfHigh, (v) => formatNumber(v)),
          ],
          set: ([low, high]) => setCore({ gfLow: 10 + low, gfHigh: 40 + high }),
        },
        {
          kind: 'number',
          id: 'vpmbConservatism',
          label: t('settings.deco.vpmbConservatism'),
          text: t('settings.deco.vpmbText'),
          value: `+${p.vpmbConservatism}`,
          dialogText: t('settings.deco.vpmbDialog'),
          dimmed: p.decoModel !== 'vpmb',
          wheels: () => [wheel(t('settings.deco.vpmbConservatism'), range(0, 4, 1), p.vpmbConservatism, defaults.vpmbConservatism, (v) => `+${v}`)],
          set: ([i]) => setCore({ vpmbConservatism: i }),
        },
        { kind: 'switch', id: 'o2narcotic', label: t('settings.deco.o2narcotic'), text: t('settings.deco.o2narcoticText'), checked: p.o2narcotic, set: (v) => setCore({ o2narcotic: v }) },
        {
          kind: 'number',
          id: 'bestMixEnd',
          label: t('settings.deco.bestMixEnd'),
          value: formatDepth(p.bestMixEndMm, p),
          dialogText: t('settings.deco.bestMixEndDialog'),
          wheels: () => [wheel(t('settings.deco.bestMixEnd'), depthWheel, p.bestMixEndMm, defaults.bestMixEndMm, (mm) => formatDepth(mm, p))],
          set: ([i]) => setCore({ bestMixEndMm: depthWheel[i] }),
        },
      ],
    },
    {
      id: 'partialPressures',
      title: t('settings.groups.partialPressures'),
      rows: [
        {
          kind: 'number',
          id: 'po2',
          label: t('settings.pp.po2'),
          text: t('settings.pp.po2Text'),
          value: `${formatNumber(p.po2MinMbar / 1000, 2)} – ${bar(p.po2MaxMbar, 1)}`,
          dialogText: t('settings.pp.po2Dialog'),
          wheels: () => [
            wheel(t('settings.pp.minimum'), range(0, 1000, 10), p.po2MinMbar, defaults.po2MinMbar, (v) => formatNumber(v / 1000, 2)),
            wheel(t('settings.pp.maximum'), range(500, 3000, 100), p.po2MaxMbar, defaults.po2MaxMbar, (v) => formatNumber(v / 1000, 1)),
          ],
          set: ([min, max]) => setCore({ po2MinMbar: min * 10, po2MaxMbar: 500 + max * 100 }),
        },
        {
          kind: 'number',
          id: 'pn2',
          label: t('settings.pp.pn2'),
          value: bar(p.pn2Mbar, 1),
          dialogText: t('settings.pp.thresholdDialog'),
          wheels: () => [wheel(t('settings.pp.pn2'), range(0, 10000, 100), p.pn2Mbar, defaults.pn2Mbar, (v) => formatNumber(v / 1000, 1))],
          set: ([i]) => setCore({ pn2Mbar: i * 100 }),
        },
        {
          kind: 'number',
          id: 'phe',
          label: t('settings.pp.phe'),
          value: bar(p.pheMbar, 1),
          dialogText: t('settings.pp.thresholdDialog'),
          wheels: () => [wheel(t('settings.pp.phe'), range(0, 20000, 100), p.pheMbar, defaults.pheMbar, (v) => formatNumber(v / 1000, 1))],
          set: ([i]) => setCore({ pheMbar: i * 100 }),
        },
        {
          kind: 'number',
          id: 'modPo2',
          label: t('settings.pp.mod'),
          value: bar(p.modPo2Mbar, 1),
          dialogText: t('settings.pp.modDialog'),
          wheels: () => [wheel(t('settings.pp.mod'), range(500, 3000, 100), p.modPo2Mbar, defaults.modPo2Mbar, (v) => formatNumber(v / 1000, 1))],
          set: ([i]) => setCore({ modPo2Mbar: 500 + i * 100 }),
        },
      ],
    },
    {
      id: 'rebreather',
      title: t('settings.groups.rebreather'),
      rows: [
        {
          kind: 'number',
          id: 'setpoint',
          label: t('settings.rebreather.setpoint'),
          text: t('settings.rebreather.setpointText'),
          value: bar(p.setpointMbar, 1),
          dialogText: t('settings.rebreather.setpointDialog'),
          wheels: () => [wheel(t('settings.rebreather.setpoint'), range(0, 10000, 100), p.setpointMbar, defaults.setpointMbar, (v) => formatNumber(v / 1000, 1))],
          set: ([i]) => setCore({ setpointMbar: i * 100 }),
        },
        { kind: 'switch', id: 'showCcrSensors', label: t('settings.rebreather.sensors'), checked: p.showCcrSensors, set: (v) => setCore({ showCcrSensors: v }) },
        { kind: 'switch', id: 'showCcrSetpoint', label: t('settings.rebreather.setpoints'), checked: p.showCcrSetpoint, set: (v) => setCore({ showCcrSetpoint: v }) },
        { kind: 'switch', id: 'allowOcGasAsDiluent', label: t('settings.rebreather.ocDiluent'), checked: p.allowOcGasAsDiluent, set: (v) => setCore({ allowOcGasAsDiluent: v }) },
        {
          kind: 'number',
          id: 'o2consumption',
          label: t('settings.rebreather.o2consumption'),
          value: `${litres(p.o2ConsumptionMlMin)} ${t('units.litersPerMinute')}`,
          dialogText: t('settings.rebreather.o2consumptionDialog'),
          wheels: () => [wheel(t('settings.rebreather.o2consumption'), range(100, 3000, 10), p.o2ConsumptionMlMin, defaults.o2ConsumptionMlMin, (v) => formatNumber(v / 1000, 3))],
          set: ([i]) => setCore({ o2ConsumptionMlMin: 100 + i * 10 }),
        },
        {
          kind: 'number',
          id: 'pscrRatio',
          label: t('settings.rebreather.dilution'),
          value: `1:${formatNumber(Math.round(1000 / p.pscrRatio))}`,
          dialogText: t('settings.rebreather.dilutionDialog'),
          // The diver chooses N of 1:N; the core keeps 1000 / N (pscr_ratio).
          wheels: () => [wheel(t('settings.rebreather.dilution'), range(1, 100, 1), Math.round(1000 / p.pscrRatio), Math.round(1000 / defaults.pscrRatio), (n) => `1:${formatNumber(n)}`)],
          set: ([i]) => setCore({ pscrRatio: Math.round(1000 / (1 + i)) }),
        },
        { kind: 'switch', id: 'showScrOcPo2', label: t('settings.rebreather.ocPo2'), checked: p.showScrOcPo2, set: (v) => setCore({ showScrOcPo2: v }) },
      ],
    },
    {
      id: 'computers',
      title: t('settings.groups.computers'),
      rows: [
        { kind: 'link', id: 'logbookComputers', label: t('settings.logbookComputers.title'), text: t('settings.logbookComputers.rowText'), href: '/settings/computers/' },
        {
          kind: 'switch',
          id: 'showAllBluetooth',
          label: t('settings.computers.showAll'),
          text: t('settings.computers.showAllText'),
          checked: settings.showAllBluetooth,
          set: (v) => setAppSetting('showAllBluetooth', v),
        },
      ],
    },
    {
      id: 'display',
      title: t('settings.groups.display'),
      rows: [
        {
          kind: 'choice',
          id: 'theme',
          label: t('settings.display.theme'),
          text: settings.theme === 'system' ? t('settings.display.themeText') : undefined,
          value: settings.theme === 'system' ? t('settings.system') : t(`settings.display.${settings.theme}`),
          current: settings.theme,
          options: () => [
            { value: 'system', label: t('settings.system') },
            { value: 'light', label: t('settings.display.light') },
            { value: 'dark', label: t('settings.display.dark') },
          ],
          set: (v) => {
            const theme = /** @type {'system'|'light'|'dark'} */ (v);
            setAppSetting('theme', theme);
            applyTheme(theme);
          },
        },
        { kind: 'info', id: 'textSize', label: t('settings.display.textSize'), value: t('settings.display.textSizeValue') },
      ],
    },
    {
      id: 'maps',
      title: t('settings.groups.maps'),
      // Offline maps (/settings/maps/): the number of regions, and a badge when an update is waiting.
      rows: [
        {
          kind: 'link',
          id: 'regions',
          label: t('settings.maps.regions'),
          text: visibleRegions().length ? t('settings.maps.count', { n: visibleRegions().length }) : t('settings.maps.none'),
          href: '/settings/maps/',
          badge: updatesCount() ? t('settings.maps.updates', { n: updatesCount() }) : undefined,
        },
      ],
    },
  ]);

  /** @param {number} ml */
  function litres(ml) {
    return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(ml / 1000);
  }

  /** @param {'system'|'light'|'dark'} theme */
  function applyTheme(theme) {
    /** @type {any} */ (f7).setDarkMode?.(theme === 'system' ? 'auto' : theme === 'dark');
  }

  // --- Search -------------------------------------------------------------------

  /** @param {string} s */
  const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const query = $derived(fold(search.trim()));

  /** @param {{ label: string, text?: string, value?: string }} row @param {string} groupTitle */
  function matches(row, groupTitle) {
    if (!query) return true;
    return [row.label, row.text ?? '', row.value ?? '', groupTitle].some((s) => fold(s).includes(query));
  }

  /** The rows shown in each group while searching. */
  const shown = $derived(
    groups.map((group) => {
      const title = group.title || t('settings.groups.units');
      return { ...group, rows: group.rows.filter((row) => matches(row, title)) };
    }),
  );
  const unitsShown = $derived(!query || matches({ label: t('settings.unitSystem.label'), text: t('settings.unitSystem.note') }, t('settings.groups.units')));
  const computersShown = $derived(
    !query ||
      matches({ label: t('settings.computers.forgetAll') }, t('settings.groups.computers')) ||
      computers.some((c) => matches({ label: `${c.vendor} ${c.product}` }, t('settings.groups.computers'))),
  );
  const advancedShown = $derived(!query || matches({ label: t('settings.advanced.reset'), text: t('settings.advanced.resetText') }, t('settings.groups.advanced')));
  const decoWarningShown = $derived(shown.find((g) => g.id === 'deco')?.rows.length);
  const nothingShown = $derived(!shown.some((g) => g.rows.length) && !unitsShown && !computersShown && !advancedShown);

  /** @param {string} id */
  const group = (id) => /** @type {{ id: string, title: string, rows: Row[] }} */ (shown.find((g) => g.id === id));

  // --- Actions ------------------------------------------------------------------

  /** @param {Row} row */
  async function open(row) {
    if (row.kind === 'choice') {
      try {
        dialog = { kind: 'choice', row, options: await row.options() };
      } catch (e) {
        failed(e);
      }
    } else if (row.kind === 'number') {
      dialog = { kind: 'number', row };
    } else if (row.kind === 'link' && row.action && !row.disabled) {
      row.action();
    } else if (row.kind === 'link' && row.href && !row.disabled) {
      f7.views.current.router.navigate(row.href);
    }
  }

  /** @param {'metric'|'imperial'|'personalize'} system */
  function setUnitSystem(system) {
    if (system !== p.unitSystem) setCore({ unitSystem: system });
  }

  /** @param {KeyboardEvent} e @param {'metric'|'imperial'|'personalize'} system */
  function unitSystemKey(e, system) {
    const order = /** @type {const} */ (['metric', 'imperial', 'personalize']);
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = order[(order.indexOf(system) + step + order.length) % order.length];
    setUnitSystem(next);
    /** @type {HTMLElement|null} */ (document.querySelector(`.od-segmented [data-system="${next}"]`))?.focus();
  }

  /** @param {{ vendor: string, product: string }} c */
  const computerName = (c) => [c.vendor, c.product].filter(Boolean).join(' ');

  /**
   * The ⋮ menu of a remembered dive computer (reglages-menu-android.dc.html).
   * @param {MouseEvent} e
   * @param {{ slot: number, vendor: string, product: string }} computer
   */
  function computerMenu(e, computer) {
    const name = computerName(computer);
    // The shared menu style (theme.css, od-menu): Android, a 24 dp leading
    // icon (the "delete" one of Icon.svelte); iOS, the icon at the end.
    const icon = `<svg class="od-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${f7.theme === 'ios' ? 1.8 : 2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 13h9l1-13M9.5 7V4.5h5V7"/></svg>`;
    const item = (/** @type {string} */ action, /** @type {string} */ label) =>
      f7.theme === 'ios'
        ? `<li><a href="#" class="item-link item-content popover-close destructive" data-action="${action}"><div class="item-inner"><div class="item-title">${label}</div><div class="item-after">${icon}</div></div></a></li>`
        : `<li><a href="#" class="item-link item-content popover-close" data-action="${action}"><div class="item-media">${icon}</div><div class="item-inner"><div class="item-title">${label}</div></div></a></li>`;
    const popover = f7.popover.create({
      targetEl: /** @type {HTMLElement} */ (e.currentTarget),
      content: `<div class="popover od-menu od-computer-menu"><div class="popover-inner"><div class="list no-chevron"><ul>${item('forget', t('settings.computers.forgetOne'))}</ul></div></div></div>`,
      on: {
        opened(/** @type {any} */ p) {
          p.$el.find('[data-action]').on('click', (/** @type {Event} */ ev) => {
            ev.preventDefault();
            const action = /** @type {HTMLElement} */ (ev.currentTarget).dataset.action;
            // Only "Forget": a remembered computer has no serial number, so no
            // nickname to rename in the logbook (Christian's choice).
            if (action === 'forget')
              confirmAction({
                title: t('settings.computers.forgetOneTitle', { name }),
                text: t('settings.computers.forgetOneText'),
                action: t('settings.computers.forget'),
                onConfirm: () => forget(computer.slot),
              });
          });
        },
        closed: () => popover.destroy(),
      },
    });
    popover.open();
  }

  /** @param {number} slot 1 to 4, 0 for all */
  async function forget(slot) {
    try {
      logbook.prefs = await forgetDiveComputers(slot);
    } catch (e) {
      failed(e);
    }
  }

  function confirmForgetAll() {
    confirmAction({
      title: t('settings.computers.forgetAllTitle'),
      text: t('settings.computers.forgetAllText'),
      action: t('settings.computers.forget'),
      onConfirm: () => forget(0),
    });
  }

  function confirmReset() {
    confirmAction({
      title: t('settings.advanced.resetTitle'),
      text: t('settings.advanced.resetConfirm'),
      action: t('settings.advanced.resetAction'),
      onConfirm: async () => {
        try {
          logbook.prefs = await resetAllSettings(defaults);
          applyTheme('system');
          showSnackbar(t('settings.advanced.resetDone'));
        } catch (e) {
          failed(e);
        }
      },
    });
  }
</script>

{#snippet rowView(/** @type {Row} */ row)}
  {#if row.kind === 'switch'}
    <label class="row" class:dimmed={row.dimmed}>
      <span class="texts">
        <span class="label">{row.label}</span>
        {#if row.text}<span class="supporting">{row.text}</span>{/if}
      </span>
      <span class="toggle">
        <input type="checkbox" checked={row.checked} disabled={row.dimmed} onchange={(e) => row.set(e.currentTarget.checked)} />
        <span class="toggle-icon"></span>
      </span>
    </label>
  {:else if row.kind === 'info'}
    <div class="row">
      <span class="texts"><span class="label">{row.label}</span></span>
      <span class="value">{row.value}</span>
    </div>
  {:else}
    <button
      type="button"
      class="row"
      class:dimmed={'dimmed' in row && row.dimmed}
      disabled={row.kind === 'link' && row.disabled}
      aria-haspopup={row.kind === 'link' ? undefined : 'dialog'}
      onclick={() => open(row)}
    >
      <span class="texts">
        <span class="label">{row.label}</span>
        {#if row.text}<span class="supporting">{row.text}</span>{/if}
      </span>
      {#if row.kind === 'link' && row.badge}<span class="badge">{row.badge}</span>{/if}
      {#if row.kind !== 'link' || row.value}<span class="value">{row.value}</span>{/if}
      <svg class="chevron" class:large={row.kind === 'link'} viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"></path></svg>
    </button>
  {/if}
{/snippet}

{#snippet groupView(/** @type {string} */ id)}
  {@const g = group(id)}
  {#if g.rows.length}
    <h2 class="title">{g.title}</h2>
    <div class="surface" role="list">
      {#each g.rows as row (row.id)}<div role="listitem">{@render rowView(row)}</div>{/each}
    </div>
  {/if}
{/snippet}

<Page class="od-settings" onPageBeforeIn={() => (navigation.page = 'settings')} onPageBeforeOut={() => (navigation.page = '')}>
  <Navbar title={t('settings.title')}>
    {#snippet left()}
      {#if layout.phone}
        <MenuButton />
      {:else}
        <Link back iconOnly>
          <i class="icon icon-back"></i>
          <span class="od-sr-only">{t('detail.back')}</span>
        </Link>
      {/if}
    {/snippet}
  </Navbar>

  <div class="search">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"></circle><path d="M15 15l5 5"></path></svg>
    <input type="search" bind:value={search} placeholder={t('settings.search')} aria-label={t('settings.search')} />
  </div>

  {@render groupView('language')}

  <!-- Units: the system, the five units, then speeds, duration and coordinates. -->
  {#if unitsShown || group('units').rows.length || group('units2').rows.length}
    <h2 class="title">{t('settings.groups.units')}</h2>
    {#if unitsShown}
      <div class="od-segmented" role="radiogroup" aria-label={t('settings.unitSystem.label')}>
        {#each UNIT_SYSTEMS as system (system)}
          <button
            type="button"
            role="radio"
            data-system={system}
            aria-checked={p.unitSystem === system}
            tabindex={p.unitSystem === system ? 0 : -1}
            onclick={() => setUnitSystem(system)}
            onkeydown={(e) => unitSystemKey(e, system)}
          >
            {#if p.unitSystem === system}
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>
            {/if}
            {t(`settings.unitSystem.${system}`)}
          </button>
        {/each}
      </div>
    {/if}
    {#if group('units').rows.length}
      <div class="surface spaced" role="list">
        {#each group('units').rows as row (row.id)}<div role="listitem">{@render rowView(row)}</div>{/each}
      </div>
    {/if}
    {#if unitsShown}<p class="note">{t('settings.unitSystem.note')}</p>{/if}
    {#if group('units2').rows.length}
      <div class="surface spaced" role="list">
        {#each group('units2').rows as row (row.id)}<div role="listitem">{@render rowView(row)}</div>{/each}
      </div>
    {/if}
  {/if}

  {#if group('conditions').rows.length}
    {@render groupView('conditions')}
    <p class="note">{t('settings.conditions.note')}</p>
  {/if}

  {@render groupView('logbook')}
  {@render groupView('equipment')}
  {@render groupView('profile')}

  {#if decoWarningShown}
    <h2 class="title">{t('settings.groups.deco')}</h2>
    <div class="warning" role="note">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9.5 17h-19z M12 10v4.5 M12 17.5v.01"></path></svg>
      <span>{t('settings.deco.warning')}</span>
    </div>
    <div class="surface" role="list">
      {#each group('deco').rows as row (row.id)}<div role="listitem">{@render rowView(row)}</div>{/each}
    </div>
    <p class="note">{t('settings.deco.note')}</p>
  {/if}

  {@render groupView('partialPressures')}
  {@render groupView('rebreather')}

  {#if computersShown || group('computers').rows.length}
    <h2 class="title">{t('settings.groups.computers')}</h2>
    <div class="surface" role="list">
      {#each computers as computer (computer.slot)}
        <div role="listitem" class="row">
          <span class="texts">
            <span class="label">{computerName(computer)}</span>
            <span class="supporting">{computer.name || t('settings.computers.remembered')}</span>
          </span>
          <button type="button" class="more" aria-label={t('settings.computers.more', { name: computerName(computer) })} onclick={(e) => computerMenu(e, computer)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5.5" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="12" cy="18.5" r="2"></circle></svg>
          </button>
        </div>
      {:else}
        <div role="listitem" class="row"><span class="texts"><span class="supporting">{t('settings.computers.none')}</span></span></div>
      {/each}
      {#each group('computers').rows as row (row.id)}<div role="listitem">{@render rowView(row)}</div>{/each}
      <div class="action">
        <button type="button" class="od-outlined-button" disabled={!computers.length} onclick={confirmForgetAll}>{t('settings.computers.forgetAll')}</button>
      </div>
    </div>
  {/if}

  {@render groupView('display')}
  {@render groupView('maps')}

  {#if advancedShown}
    <h2 class="title">{t('settings.groups.advanced')}</h2>
    <div class="surface">
      <p class="action-text">{t('settings.advanced.resetText')}</p>
      <div class="action">
        <button type="button" class="od-outlined-button" onclick={confirmReset}>{t('settings.advanced.reset')}</button>
      </div>
    </div>
    <p class="note">{t('settings.advanced.note')}</p>
  {/if}

  {#if nothingShown}<p class="note empty">{t('settings.noResult', { text: search.trim() })}</p>{/if}
  <div class="bottom"></div>
</Page>

{#if renumbering}
  <RenumberDialog oncancel={() => (renumbering = false)} ondone={() => (renumbering = false)} />
{/if}

{#if dialog?.kind === 'choice'}
  {@const row = dialog.row}
  <ChoiceDialog
    title={row.title ?? row.label}
    options={dialog.options}
    value={row.current}
    note={row.note}
    oncancel={() => (dialog = null)}
    onselect={(v) => {
      const chosen = row; // read before the dialog closes: row comes from it
      dialog = null;
      if (v !== chosen.current) chosen.set(v);
    }}
  />
{:else if dialog?.kind === 'number'}
  {@const row = dialog.row}
  <WheelDialog
    title={row.title ?? row.label}
    text={row.dialogText}
    wheels={row.wheels()}
    oncancel={() => (dialog = null)}
    onconfirm={(indexes) => {
      const chosen = row; // read before the dialog closes: row comes from it
      dialog = null;
      chosen.set([...indexes]);
    }}
  />
{/if}

<style>
  @layer od.components {
    /* Spec, section 4, "Settings: what each row does", layout: titles on the
       page background, groups as rounded surfaces, no dividers, 48 px rows. */
    :global(.od-settings) {
      --od-settings-margin: 16px;
    }

    .search {
      margin: 4px var(--od-settings-margin);
      height: 56px;
      padding: 0 16px;
      border-radius: 28px;
      background: var(--od-surface-2);
      display: flex;
      align-items: center;
      gap: 16px;

      svg {
        flex: none;
        width: 24px;
        height: 24px;
        fill: none;
        stroke: var(--od-text);
        stroke-width: 2;
        stroke-linecap: round;
      }

      input {
        flex: 1;
        min-width: 0;
        border: none;
        background: none;
        font: inherit;
        font-size: 16px;
        color: var(--od-text);
        outline: none;
      }
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
      margin: 0 var(--od-settings-margin);
      border-radius: 20px;
      background: var(--od-surface);
      overflow: hidden;

      &.spaced {
        margin-top: 10px;
      }
    }

    .row {
      box-sizing: border-box;
      width: 100%;
      min-height: 56px;
      padding: 8px 24px 8px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      border: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      text-align: start;
      cursor: pointer;

      &:disabled {
        cursor: default;
        opacity: 0.45;
      }

      &.dimmed .texts,
      &.dimmed .value {
        opacity: 0.55;
      }
    }

    div.row {
      cursor: default;
    }

    /* MD3: two-line item, 72 dp. */
    :global(.md) .row:has(.supporting) {
      min-height: 72px;
    }

    :global(.md) .supporting {
      font-size: 14px;
      line-height: 20px;
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
      line-height: 22px;
    }

    .supporting {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .value {
      flex: none;
      max-width: 45%;
      font-size: 14px;
      color: var(--od-text-2);
      font-variant-numeric: tabular-nums;
      text-align: end;
    }

    /* Waiting updates: text in the secondary role, never the colour alone. */
    .badge {
      flex: none;
      padding: 2px 10px;
      border-radius: 12px;
      background: var(--od-secondary);
      color: var(--od-on-secondary);
      font-size: 12px;
      line-height: 18px;
      font-weight: 600;
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

      &.large {
        width: 20px;
        height: 20px;
      }
    }

    .toggle {
      flex: none;
    }

    .more {
      flex: none;
      width: 48px;
      height: 48px;
      margin-right: -12px;
      border: none;
      padding: 0;
      background: none;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;

      svg {
        width: 24px;
        height: 24px;
        fill: var(--od-text);
      }
    }

    .od-segmented {
      margin: 4px var(--od-settings-margin) 0;
      display: flex;
      border: 1px solid var(--od-text-2);
      border-radius: 20px;
      overflow: hidden;

      button {
        flex: 1;
        min-width: 0;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        border: none;
        background: none;
        color: var(--od-text);
        font: inherit;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;

        & + button {
          border-left: 1px solid var(--od-text-2);
        }

        &[aria-checked='true'] {
          background: var(--od-surface-2);
        }

        svg {
          flex: none;
          width: 18px;
          height: 18px;
          fill: none;
          stroke: currentColor;
          stroke-width: 2.4;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
      }
    }

    .note {
      margin: 8px 20px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);

      &.empty {
        margin-top: 24px;
        text-align: center;
      }
    }

    .warning {
      margin: 0 var(--od-settings-margin) 10px;
      padding: 12px 16px;
      border-radius: 12px;
      border: 1px solid var(--od-alarm);
      display: flex;
      gap: 12px;
      align-items: flex-start;
      font-size: 14px;
      line-height: 20px;

      svg {
        flex: none;
        width: 20px;
        height: 20px;
        fill: none;
        stroke: var(--od-alarm);
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
    }

    .action {
      padding: 12px 16px 14px;
      display: flex;
      justify-content: center;
    }

    .action-text {
      margin: 0;
      padding: 14px 16px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
      text-align: center;
    }

    .od-outlined-button:disabled {
      opacity: 0.45;
      cursor: default;
    }

    .bottom {
      height: 32px;
    }

    /* Tablets: a 600 px centred column (spec, section 3). */
    @media (min-width: 768px) {
      :global(.od-settings .page-content) {
        --od-settings-margin: max(16px, calc((100% - 600px) / 2));
      }

      .title,
      .note {
        padding-inline: max(20px, calc((100% - 600px) / 2 + 4px));
      }

      .note {
        margin-inline: 0;
      }
    }

    /* iOS: the same groups with the system's sizes. */
    :global(.ios) .row {
      min-height: 44px;
      padding-right: 16px;
    }

    :global(.ios) .label {
      font-size: 17px;
    }
  }
</style>
