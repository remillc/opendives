// End-to-end scenarios of the planner in the real, compiled app, on the emulator.
//
// The app's WebView is driven over the Chrome DevTools Protocol (tests/e2e/cdp.mjs):
// the fields are typed into with real input events, the screen is read, and what
// is shown is compared with a reference: the request typed in is rebuilt here with
// its own arithmetic (ft, cuft, psi...), sent to the core directly, and the core's
// answer is formatted with the app's display rules, written again here.
//
// Rules: only the emulator (emulator-5554); the account must be the test account
// (the page shows roger.bourdieu) or nothing is run; every plan saved is deleted.
//
// usage: node tests/e2e/planner-e2e.mjs        (the app installed and started on the emulator)
import { readFileSync } from 'node:fs';
import { connect, adb, sleep } from './cdp.mjs';

const en = JSON.parse(readFileSync(new URL('../../app/src/i18n/en.json', import.meta.url), 'utf8'));
/** The English text of a key, with {name} replaced. */
const T = (key, params = {}) => {
  let v = key.split('.').reduce((o, k) => o?.[k], en);
  if (typeof v !== 'string') throw new Error(`no text ${key}`);
  for (const [k, x] of Object.entries(params)) v = v.replaceAll(`{${k}}`, x);
  return v;
};

const MM_PER_FT = 304.8;
const ML_PER_CUFT = 28316.8466;
const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- ' + detail}`);
};
/** A check: records one line per comparison. */
const same = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  record(name, a === e, `got ${a}, expected ${e}`);
};
const yes = (name, ok, detail = '') => record(name, !!ok, detail);

const p = await connect();
const q = (s) => JSON.stringify(s);

// --- the account: abort unless it is the test account -----------------------------
const accountText = await p.eval(`document.querySelector('#view-account')?.textContent ?? ''`);
if (!accountText.includes('roger.bourdieu')) {
  console.error('ABORT: the emulator is not on the test account; nothing was run.');
  process.exit(2);
}

// --- hooks in the page ------------------------------------------------------------
async function inject() {
  await p.eval(`(() => {
    const cap = window.Capacitor;
    window.__odCalls = window.__odCalls || [];
    if (!cap.__odHooked) {
      const orig = cap.toNative;
      cap.toNative = function (plugin, method, options) {
        if (plugin === 'OpenDivesCore') window.__odCalls.push({ method, options });
        return orig.apply(this, arguments);
      };
      cap.__odHooked = true;
    }
    window.__od = {
      root() { const all = [...document.querySelectorAll('.planner')].filter((e) => e.offsetParent !== null); return all[all.length - 1] || null; },
      field(text, n = 0) {
        const r = this.root();
        const l = r && [...r.querySelectorAll('label.label')].filter((x) => x.textContent.trim() === text)[n];
        return l ? document.getElementById(l.htmlFor) : null;
      },
      visible(sel, text) {
        return [...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null && (text === undefined || e.textContent.replace(/\\s+/g, ' ').trim() === text));
      },
    };
  })()`);
}
await inject();

const core = async (method, options = {}) => JSON.parse(await p.eval(`Capacitor.Plugins.OpenDivesCore.${method}(${q(options)}).then((r) => r.json)`));
const planCore = (request) => core('planDive', { request });
const planCalls = () => p.eval(`window.__odCalls.filter((c) => c.method === 'planDive').length`);
const lastRequest = () => p.eval(`(() => { const c = window.__odCalls.filter((c) => c.method === 'planDive'); return c.length ? c[c.length - 1].options.request : null; })()`);
const go = async (path) => {
  await p.eval(`(document.querySelector('.view-main').f7View.router.navigate(${q(path)}), 0)`);
  await sleep(400);
};
const click = async (sel, text) => {
  const ok = await p.eval(`(() => { const e = __od.visible(${q(sel)}, ${text === undefined ? 'undefined' : q(text)})[0]; if (!e) return false; e.click(); return true; })()`);
  if (!ok) throw new Error(`nothing to tap: ${sel} ${text ?? ''}`);
  await sleep(250);
};

/** Types into the field with this label (the nth one): real key input, replacing what is there. */
async function type(label, n, text) {
  const ok = await p.eval(`(() => { const e = __od.field(${q(label)}, ${n}); if (!e) return false; e.scrollIntoView({ block: 'center' }); e.focus(); if (e.select) e.select(); return true; })()`);
  if (!ok) throw new Error(`no field ${label} #${n}`);
  if (text === '') {
    for (const type of ['rawKeyDown', 'keyUp']) await p.send('Input.dispatchKeyEvent', { type, key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  } else {
    await p.send('Input.insertText', { text });
  }
  const shown = await p.eval(`__od.field(${q(label)}, ${n}).value`);
  if (shown !== text) throw new Error(`typed ${text} in ${label}, the field shows ${shown}`);
  await sleep(120);
}
/** Chooses an option of a select. */
async function choose(label, n, value) {
  const ok = await p.eval(`(() => { const e = __od.field(${q(label)}, ${n}); if (!e) return false; e.value = ${q(value)}; e.dispatchEvent(new Event('change', { bubbles: true })); return e.value === ${q(value)}; })()`);
  if (!ok) throw new Error(`cannot choose ${value} in ${label}`);
  await sleep(120);
}
/** Waits until the plan has been calculated again and shown (no new calculation for a moment). */
async function settle() {
  let last = -1;
  let stable = 0;
  for (let i = 0; i < 120; i++) {
    const n = await planCalls();
    const busy = await p.eval(`!!__od.root()?.querySelector('.skeleton-block')`);
    stable = n === last && !busy ? stable + 1 : 0;
    last = n;
    if (stable >= 4) return;
    await sleep(150);
  }
  throw new Error('the plan did not settle');
}
/** What the planner screen shows. */
const read = () =>
  p.eval(`(() => {
    const r = __od.root();
    const o = r.querySelector('.outcome');
    const text = (e) => e.textContent.replace(/\\s+/g, ' ').trim();
    const rows = [...o.querySelectorAll('.results .result')].filter((e) => !e.classList.contains('oxygen')).map((e) => ({
      label: text(e.querySelector('.label')), hint: text(e.querySelector('.hint')), value: text(e.querySelector('.value')), alarm: !!e.querySelector('.value.alarm'),
    }));
    const oxygen = o.querySelector('.result.oxygen .value');
    return {
      title: o.querySelector('h2.section-title') ? text(o.querySelector('h2.section-title')) : '',
      error: o.querySelector('p.error') ? text(o.querySelector('p.error')) : '',
      failed: [...o.querySelectorAll('p.note')].map(text).includes(${q(T('plan.failed'))}),
      noStop: !!o.querySelector('.no-stop'),
      stops: [...o.querySelectorAll('table tbody tr')].map((tr) => [...tr.children].map(text)),
      rows,
      oxygen: oxygen ? text(oxygen) : '',
      helpers: [...r.querySelectorAll('.gas .helper')].map(text),
      saveDisabled: !!r.closest('.page')?.querySelector('.navbar .right a.disabled'),
      invalid: [...r.querySelectorAll('.field.invalid label')].map(text),
    };
  })()`);

// --- display rules, written again here --------------------------------------------
const number = (s) => Number(String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/)[0]);
const numbers = (s) => [...String(s).replace(/,/g, '').matchAll(/-?\d+(\.\d+)?/g)].map((m) => Number(m[0]));
const minutes = (s) => Math.floor((s + 30) / 60);
const depthShown = (mm, sys) => Math.round(sys === 'metric' ? mm / 1000 : mm / MM_PER_FT);
const volumeShown = (ml, sys) => Math.round(sys === 'metric' ? ml / 1000 : ml / ML_PER_CUFT);

/** Compares the screen with the core's answer to the request typed in (rebuilt here). */
async function check(name, sys, expected, { alarms } = {}) {
  await settle();
  const sent = await lastRequest();
  const request = { ...expected, when: sent.when };
  for (const key of Object.keys(expected)) same(`${name}: request ${key}`, sent[key], expected[key]);
  const ref = await planCore(request);
  const ui = await read();
  yes(`${name}: the core answered without error`, ref.error === '' && !ui.error && !ui.failed, `${ref.error} ${ui.error}`);
  same(`${name}: total time`, number(ui.title), minutes(ref.runtimeSeconds));
  same(`${name}: number of stops`, ui.stops.length, ref.stops.length);
  ref.stops.forEach((s, i) => {
    const row = ui.stops[i] ?? [];
    same(`${name}: stop ${i + 1} (${depthShown(s.depthMm, sys)})`, [number(row[0]), number(row[1]), number(row[2])], [depthShown(s.depthMm, sys), minutes(s.durationSeconds), minutes(s.runtimeSeconds)]);
    same(`${name}: stop ${i + 1} gas`, row[3], ui.rows[s.cylinder]?.label);
  });
  ref.cylinders.forEach((c, i) => {
    const row = ui.rows[i];
    const [used, reserve] = numbers(row?.hint ?? '');
    same(`${name}: gas ${i + 1} used, reserve, total`, [used, reserve, number(row?.value ?? '')], [volumeShown(c.gasUsedMl, sys), volumeShown(c.reserveMl, sys), volumeShown(c.gasUsedMl + c.reserveMl, sys)]);
  });
  same(`${name}: CNS and OTU`, numbers(ui.oxygen), [ref.cns, ref.otu]);
  if (alarms) {
    ref.cylinders.forEach((c, i) => {
      const carried = expected.cylinders[i].carriedMl ?? 0;
      const total = c.gasUsedMl + c.reserveMl;
      same(`${name}: gas ${i + 1} short alarm`, ui.rows[i].alarm, carried > 0 && carried < total);
    });
  }
  return { ref, ui, sent };
}

// --- units: through the Settings screen --------------------------------------------
async function useUnits(sys) {
  const want = sys === 'metric' ? 'm' : 'ft';
  const prefs = await core('getPrefs');
  if (prefs.length === want && prefs.volume === (sys === 'metric' ? 'l' : 'cuft') && prefs.pressure === (sys === 'metric' ? 'bar' : 'psi')) return;
  await go('/settings/');
  await sleep(600);
  await click('[role=radio]', T(`settings.unitSystem.${sys}`));
  await sleep(500);
  const after = await core('getPrefs');
  yes(`units: ${sys}`, after.length === want, JSON.stringify(after));
}

async function openNew() {
  await go('/plan/new');
  await p.waitFor(`!!__od.root()?.querySelector('.outcome')`, 'the planner');
  await settle();
}

// --- state to restore ----------------------------------------------------------------
const startPlans = (await core('listPlans')).map((x) => x.id);
const startLocal = await p.eval(`localStorage.getItem('od.corePrefs')`);
const startPrefs = await core('getPrefs');
const startSetup = await core('plannerSetup');
console.log(`start: ${startPlans.length} plans, units ${startPrefs.length}/${startPrefs.pressure}/${startPrefs.volume}`);

const air = (extra = {}) => ({ o2Permille: 209, hePermille: 0, ...extra });
let created = [];

async function run() {
  // 1. A new dive, one level, metric ---------------------------------------------------
  await useUnits('metric');
  await openNew();
  const sac = (await lastRequest()).bottomSacMlMin;
  const base = { salinity: 10300, surfacePressureMbar: 1013, decoModel: 0, gfLow: 30, gfHigh: 75, vpmbConservatism: 3, bottomSacMlMin: sac };
  await type(T('plan.depth'), 0, '30');
  await type(T('plan.duration'), 0, '20');
  await check('1 one level, metric', 'metric', { ...base, levels: [{ depthMm: 30000, durationSeconds: 1200 }], cylinders: [air()] });

  // 2. Several levels -------------------------------------------------------------------
  await click('button.add', T('plan.addLevel'));
  await type(T('plan.depth'), 1, '20');
  await type(T('plan.duration'), 1, '12');
  await click('button.add', T('plan.addLevel'));
  await type(T('plan.depth'), 2, '10');
  await type(T('plan.duration'), 2, '8');
  await check('2 three levels', 'metric', {
    ...base,
    levels: [{ depthMm: 30000, durationSeconds: 1200 }, { depthMm: 20000, durationSeconds: 720 }, { depthMm: 10000, durationSeconds: 480 }],
    cylinders: [air()],
  });

  // 3. Several gases with switches --------------------------------------------------------
  await openNew();
  await type(T('plan.depth'), 0, '45');
  await type(T('plan.duration'), 0, '25');
  await type(T('plan.oxygenPercent'), 0, '21');
  await type(T('plan.heliumPercent'), 0, '35');
  await click('button.add', T('plan.addGas'));
  await click('button.add', T('plan.addGas'));
  const three = await check('3 three gases, 21/35 EAN50 O2', 'metric', {
    ...base,
    levels: [{ depthMm: 45000, durationSeconds: 1500 }],
    cylinders: [{ o2Permille: 210, hePermille: 350 }, { o2Permille: 500, hePermille: 0 }, { o2Permille: 1000, hePermille: 0 }],
  });
  yes('3 gas switches: the screen names the switch depths', three.ui.helpers.some((h) => h.includes('switch at 21 m')) && three.ui.helpers.some((h) => h.includes('switch at 6 m')), JSON.stringify(three.ui.helpers));
  yes('3 gas switches: the stops change gas', three.ref.stops.some((s) => s.gasChange && s.cylinder === 1) && three.ref.stops.some((s) => s.gasChange && s.cylinder === 2), 'no switch in the reference');

  // 4. A plan from a logbook dive ----------------------------------------------------------
  const dives = await core('listLoadedDives');
  const dive = dives.filter((d) => d.maxDepthMm > 12000 && d.durationSeconds > 1200).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  await go(`/plan/${dive.id}`);
  await p.waitFor(`!!__od.root()?.querySelector('.outcome .plan')`, 'the plan from a dive');
  await settle();
  const fromDive = await lastRequest();
  same('4 from a dive: the request names the dive', [fromDive.sourceDiveId, fromDive.levels], [dive.id, undefined]);
  const uiDive = await read();
  const refDive = await planCore(fromDive);
  same('4 from a dive: total time', number(uiDive.title), minutes(refDive.runtimeSeconds));
  same('4 from a dive: number of stops', uiDive.stops.length, refDive.stops.length);
  yes('4 from a dive: the dive\'s own profile is the reference (max depth)', Math.abs(refDive.maxDepthMm - dive.maxDepthMm) <= 3000, `${refDive.maxDepthMm} vs ${dive.maxDepthMm}`);
  yes('4 from a dive: the date and level fields are not offered', !(await p.eval(`__od.field(${q(T('plan.duration'))}, 0)`)), 'level fields present');

  // 5. Bühlmann, VPM-B, the plan\'s own gradient factors ------------------------------------------
  await openNew();
  await type(T('plan.depth'), 0, '40');
  await type(T('plan.duration'), 0, '30');
  await click('button.accordion');
  await sleep(300);
  const gfBefore = (await core('getPrefs')).gfHigh;
  await type(T('settings.deco.gfLow'), 0, '40');
  await type(T('settings.deco.gfHigh'), 0, '85');
  await check('5a Bühlmann with its own GF 40/85', 'metric', { ...base, gfLow: 40, gfHigh: 85, levels: [{ depthMm: 40000, durationSeconds: 1800 }], cylinders: [air()] });
  same('5a the settings of the logbook are not changed', (await core('getPrefs')).gfHigh, gfBefore);
  await choose(T('plan.decoModel'), 0, 'vpmb');
  await choose(T('settings.deco.vpmbConservatism'), 0, '2');
  await check('5b VPM-B +2', 'metric', { ...base, decoModel: 1, vpmbConservatism: 2, gfLow: 40, gfHigh: 85, levels: [{ depthMm: 40000, durationSeconds: 1800 }], cylinders: [air()] });

  // 6. Water type and altitude -----------------------------------------------------------------
  await openNew();
  await type(T('plan.depth'), 0, '35');
  await type(T('plan.duration'), 0, '25');
  await choose(T('plan.waterType'), 0, 'fresh');
  await type(T('plan.altitude'), 0, '1500');
  await check('6 fresh water, 1500 m', 'metric', {
    ...base,
    salinity: 10000,
    surfacePressureMbar: Math.round(1013 * Math.exp(-1500000 / 7800000)),
    levels: [{ depthMm: 35000, durationSeconds: 1500 }],
    cylinders: [air()],
  });

  // 7. Imperial -------------------------------------------------------------------------------------
  await useUnits('imperial');
  await openNew();
  await type(T('plan.depth'), 0, '100');
  await type(T('plan.duration'), 0, '25');
  await click('button.add', T('plan.addGas'));
  const imp = await check('7 imperial: 100 ft, air + EAN50', 'imperial', {
    ...base,
    levels: [{ depthMm: 30480, durationSeconds: 1500 }],
    cylinders: [air(), { o2Permille: 500, hePermille: 0 }],
  });
  yes('7 imperial: depths in feet on the screen', imp.ui.helpers.some((h) => / ft/.test(h)), JSON.stringify(imp.ui.helpers));
  await type(T('plan.altitude'), 0, '5000');
  await check('7 imperial: 5000 ft altitude', 'imperial', {
    ...base,
    surfacePressureMbar: Math.round(1013 * Math.exp(-(5000 * MM_PER_FT) / 7800000)),
    levels: [{ depthMm: 30480, durationSeconds: 1500 }],
    cylinders: [air(), { o2Permille: 500, hePermille: 0 }],
  });

  // 8. The "Volume transporté" alarm (volume carried) -------------------------------------------------
  await openNew();
  await type(T('plan.depth'), 0, '100');
  await type(T('plan.duration'), 0, '20');
  await settle();
  const total = (() => 0)();
  let probe = await read();
  const totalCuft = number(probe.rows[0].value);
  await type(T('plan.carried'), 0, String(totalCuft - 5));
  const shortReq = { ...base, levels: [{ depthMm: 30480, durationSeconds: 1200 }], cylinders: [air({ carriedMl: Math.round((totalCuft - 5) * ML_PER_CUFT) })] };
  const shortRun = await check('8a carried below the total', 'imperial', shortReq, { alarms: true });
  yes('8a the alarm is on, with the missing volume', shortRun.ui.rows[0].alarm && /short/.test(shortRun.ui.rows[0].hint), JSON.stringify(shortRun.ui.rows[0]));
  await type(T('plan.carried'), 0, String(totalCuft + 20));
  const enough = await check('8b carried above the total', 'imperial', { ...shortReq, cylinders: [air({ carriedMl: Math.round((totalCuft + 20) * ML_PER_CUFT) })] }, { alarms: true });
  yes('8b no alarm', !enough.ui.rows[0].alarm, JSON.stringify(enough.ui.rows[0]));
  await type(T('plan.carried'), 0, '');
  const none = await check('8c nothing carried', 'imperial', { ...base, levels: [{ depthMm: 30480, durationSeconds: 1200 }], cylinders: [air()] }, { alarms: true });
  yes('8c no alarm when the volume is not given', !none.ui.rows[0].alarm, JSON.stringify(none.ui.rows[0]));
  // exactly the total: not short (the rule is strict)
  const exact = Math.ceil(totalCuft + 0.5);
  await type(T('plan.carried'), 0, String(exact));
  const atTotal = await settle().then(read);
  yes('8d a carried volume of at least the total shows no alarm', !atTotal.rows[0].alarm, JSON.stringify(atTotal.rows[0]));

  // 9. The bottom gas MOD alarm ---------------------------------------------------------------------------
  await useUnits('metric');
  await openNew();
  await type(T('plan.depth'), 0, '45');
  await type(T('plan.duration'), 0, '20');
  await type(T('plan.oxygenPercent'), 0, '36');
  const mod = await check('9a EAN36 at 45 m', 'metric', { ...base, levels: [{ depthMm: 45000, durationSeconds: 1200 }], cylinders: [{ o2Permille: 360, hePermille: 0 }] });
  const modRow = mod.ui.rows.find((r) => r.label === T('plan.modTitle'));
  const modMm = mod.ref.cylinders[0].bottomModMm;
  yes('9a the MOD alarm is shown, in the alarm colour, with the usable depth', modRow?.alarm && number(modRow.value) === depthShown(modMm, 'metric') && modRow.hint.includes(`${depthShown(modMm, 'metric')} m`), JSON.stringify(modRow));
  await type(T('plan.depth'), 0, '25');
  const noMod = await check('9b EAN36 at 25 m', 'metric', { ...base, levels: [{ depthMm: 25000, durationSeconds: 1200 }], cylinders: [{ o2Permille: 360, hePermille: 0 }] });
  yes('9b no MOD alarm above the MOD', !noMod.ui.rows.some((r) => r.label === T('plan.modTitle')), JSON.stringify(noMod.ui.rows.map((r) => r.label)));
  const atMod = Math.floor(modMm / 1000);
  await type(T('plan.depth'), 0, String(atMod));
  await settle();
  yes('9c no MOD alarm at the MOD itself', !(await read()).rows.some((r) => r.label === T('plan.modTitle')), `depth ${atMod} m, MOD ${modMm} mm`);

  // 10. Planner settings: last stop, ascent rate, reserve factor ---------------------------------------------
  // Set through the core's preferences, as the Settings screen does (setPrefs); the planner reads them again.
  const setPlanner = async (changes) => {
    await core('setPrefs', { changes });
    await go('/settings/planner');
    await sleep(500);
  };
  const deco40 = { ...base, levels: [{ depthMm: 40000, durationSeconds: 1800 }], cylinders: [air(), { o2Permille: 500, hePermille: 0 }] };
  const show = async (label) => {
    await openNew();
    await type(T('plan.depth'), 0, '40');
    await type(T('plan.duration'), 0, '30');
    await click('button.add', T('plan.addGas'));
    return check(label, 'metric', deco40);
  };
  const before = await show('10a default planner settings');
  await setPlanner({ lastStop6m: true });
  const last6 = await show('10b last stop at 6 m');
  yes('10b the last stop is at 6 m', last6.ref.stops[last6.ref.stops.length - 1].depthMm === 6000 && before.ref.stops[before.ref.stops.length - 1].depthMm === 3000, `${last6.ref.stops.at(-1)?.depthMm} / ${before.ref.stops.at(-1)?.depthMm}`);
  await setPlanner({ lastStop6m: false, ascent75MmMin: 18000, ascent50MmMin: 18000, ascentStopsMmMin: 18000, ascentLast6mMmMin: 18000 });
  const fast = await show('10c ascent at 18 m/min');
  yes('10c a faster ascent changes the plan', fast.ref.runtimeSeconds !== before.ref.runtimeSeconds, `${fast.ref.runtimeSeconds} vs ${before.ref.runtimeSeconds}`);
  await setPlanner({ ascent75MmMin: 9000, ascent50MmMin: 9000, ascentStopsMmMin: 9000, ascentLast6mMmMin: 9000, sacFactor: 300 });
  const stress = await show('10d reserve factor 3.0');
  yes('10d a larger factor under stress asks for a larger reserve', stress.ref.cylinders[0].reserveMl > before.ref.cylinders[0].reserveMl, `${stress.ref.cylinders[0].reserveMl} vs ${before.ref.cylinders[0].reserveMl}`);
  await setPlanner({
    lastStop6m: startSetup.lastStop6m,
    ascent75MmMin: startSetup.ascent75MmMin,
    ascent50MmMin: startSetup.ascent50MmMin,
    ascentStopsMmMin: startSetup.ascentStopsMmMin,
    ascentLast6mMmMin: startSetup.ascentLast6mMmMin,
    sacFactor: startSetup.sacFactor,
  });

  // 11. A refused plan and an error plan -------------------------------------------------------------------------
  await openNew();
  await type(T('plan.depth'), 0, '400');
  let r = await read();
  yes('11a a depth of 400 m is refused in the field', r.invalid.includes(T('plan.depth')) && r.saveDisabled, JSON.stringify({ invalid: r.invalid, save: r.saveDisabled }));
  await type(T('plan.depth'), 0, '30');
  await type(T('plan.oxygenPercent'), 0, '80');
  await type(T('plan.heliumPercent'), 0, '40');
  r = await read();
  yes('11b oxygen + helium above 100 % is refused', r.invalid.includes(T('plan.oxygenPercent')) && r.saveDisabled, JSON.stringify(r.invalid));
  await openNew();
  await type(T('plan.depth'), 0, '30');
  await type(T('plan.duration'), 0, '300');
  await click('button.add', T('plan.addLevel'));
  await type(T('plan.duration'), 1, '120');
  await settle();
  r = await read();
  yes('11c a plan the core refuses (over 6 h) says it could not be calculated, and cannot be saved', r.failed && r.saveDisabled, JSON.stringify({ failed: r.failed, save: r.saveDisabled }));
  const refused = await core('planDive', { request: (await lastRequest()) }).then(() => 'planned', (e) => String(e.message ?? e));
  yes('11c the core refuses it (BAD_REQUEST)', /BAD_REQUEST/.test(refused), refused);
  // The planner errors of the core (TIMEOUT, INAPPROPRIATE_GAS, ...) belong to modes the app does not offer
  // (closed circuit, recreational): not reachable here.

  // 12. Saving, reopening after a reload, duplicating, sharing, deleting ---------------------------------------------
  await useUnits('metric');
  await openNew();
  await type(T('plan.depth'), 0, '45');
  await type(T('plan.duration'), 0, '25');
  await type(T('plan.oxygenPercent'), 0, '21');
  await type(T('plan.heliumPercent'), 0, '35');
  await click('button.add', T('plan.addGas'));
  await click('button.add', T('plan.addGas'));
  await type(T('plan.carried'), 1, '12');
  const saved = await check('12 the plan to save', 'metric', {
    ...base,
    levels: [{ depthMm: 45000, durationSeconds: 1500 }],
    cylinders: [{ o2Permille: 210, hePermille: 350 }, { o2Permille: 500, hePermille: 0, carriedMl: 12000 }, { o2Permille: 1000, hePermille: 0 }],
  }, { alarms: true });
  yes('12 the save is allowed', !(await read()).saveDisabled);
  const account = await p.eval(`document.querySelector('#view-account')?.textContent ?? ''`);
  if (!account.includes('roger.bourdieu')) throw new Error('not the test account: no save');
  await click('.page-current .navbar .right a, .navbar .right a', T('plan.save'));
  await p.waitFor(`document.querySelectorAll('.list .row').length >= 1`, 'the list of plans');
  let plans = await core('listPlans');
  created = plans.map((x) => x.id).filter((id) => !startPlans.includes(id));
  same('12 saved: one new plan in the list', created.length, 1);
  const stored = plans.find((x) => x.id === created[0]);
  same('12 saved: depth and duration', [stored.maxDepthMm, minutes(stored.durationSeconds)], [saved.ref.maxDepthMm, minutes(saved.ref.runtimeSeconds)]);
  same('12 saved: the gases', stored.gases.map((g) => [g.o2Permille, g.hePermille]), [[210, 350], [500, 0], [1000, 0]]);
  const rowText = await p.eval(`__od.visible('.list .row')[0]?.textContent.replace(/\\s+/g, ' ')`);
  yes('12 the list shows the plan', /45/.test(rowText ?? '') , rowText);

  // reopen after an app reload
  await p.send('Page.reload').catch(() => {});
  await sleep(500);
  await p.waitFor(`document.readyState === 'complete' && !!window.Capacitor`, 'the reload', 60000);
  await sleep(2500);
  await inject();
  await p.waitFor(`!!document.querySelector('.view-main')?.f7View`, 'the app view', 60000);
  await p.waitFor(`document.querySelector('#view-account')?.textContent.includes('roger.bourdieu')`, 'the account after the reload', 90000);
  await go('/plans/');
  await p.waitFor(`__od.visible('.list .row').length >= 1`, 'the plans after the reload');
  await click('.list .row a.open');
  await p.waitFor(`!!__od.root()?.querySelector('.outcome .plan')`, 'the reopened plan');
  await settle();
  const reopened = await read();
  same('12 reopened after a reload: fields', await p.eval(`[__od.field(${q(T('plan.depth'))}, 0).value, __od.field(${q(T('plan.duration'))}, 0).value, __od.field(${q(T('plan.oxygenPercent'))}, 1).value, __od.field(${q(T('plan.carried'))}, 1).value]`), ['45', '25', '50', '12']);
  same('12 reopened after a reload: the same result', [number(reopened.title), reopened.stops.length, reopened.oxygen], [minutes(saved.ref.runtimeSeconds), saved.ref.stops.length, saved.ui.oxygen]);
  same('12 reopened: the alarm is the same', reopened.rows.map((x) => x.alarm), saved.ui.rows.map((x) => x.alarm));

  // duplicate, share, delete from the list
  await go('/plans/');
  await p.waitFor(`__od.visible('.list .row').length >= 1`, 'the plans');
  await click('.list .row .more');
  await click('.popover .item-link, .popover a, .popover button, .popover li', T('plans.duplicate'));
  await p.waitFor(`__od.visible('.list .row').length === 2`, 'the duplicate');
  plans = await core('listPlans');
  created = plans.map((x) => x.id).filter((id) => !startPlans.includes(id));
  same('12 duplicated: two plans, same depth and gases', [created.length, plans.filter((x) => created.includes(x.id)).every((x) => x.maxDepthMm === stored.maxDepthMm)], [2, true]);
  await click('.list .row .more');
  await click('.popover .item-link, .popover a, .popover button, .popover li', T('plans.share'));
  await p.waitFor(`__od.visible('.od-share-sheet').length > 0 || __od.visible('.sheet-modal').length > 0`, 'the share sheet');
  yes('12 the share sheet opens with both choices', (await p.eval(`__od.visible('.od-share-sheet .row').length`)) === 2);
  await click('.od-share-sheet .row', T('plan.shareSummary') + ' ' + T('plan.shareSummaryText'));
  await sleep(2500);
  const focus = adb(['shell', 'dumpsys window | grep -E "mCurrentFocus|mFocusedApp"']);
  yes('12 the system share sheet opens', /Chooser|Resolver|sharesheet|intentresolver/i.test(focus), focus.trim().slice(0, 200));
  adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
  await sleep(1200);

  for (let i = 0; i < 2; i++) {
    await go('/plans/');
    await p.waitFor(`__od.visible('.list .row').length >= 1`, 'the plans to delete');
    await click('.list .row .more');
    await click('.popover .item-link, .popover a, .popover button, .popover li', T('plans.delete'));
    await click('.dialog-button', T('plans.delete'));
    await sleep(1500);
  }
  plans = await core('listPlans');
  same('12 deleted: back to the plans there were', plans.map((x) => x.id).sort(), [...startPlans].sort());
  created = [];
}

try {
  await run();
} catch (e) {
  record('scenario aborted', false, e.stack ?? e.message);
} finally {
  // Every plan created is deleted; the settings are put back.
  try {
    const now = (await core('listPlans')).map((x) => x.id).filter((id) => !startPlans.includes(id));
    if (now.length) {
      await core('deleteDives', { ids: now });
      console.log(`cleanup: deleted ${now.length} plan(s) left by the scenarios`);
    }
    const restore = {};
    for (const k of ['length', 'temperature', 'pressure', 'volume', 'weight', 'unitSystem']) restore[k] = startPrefs[k];
    await core('setPrefs', { changes: restore });
    await core('setPrefs', { changes: { lastStop6m: startSetup.lastStop6m, ascent75MmMin: startSetup.ascent75MmMin, ascent50MmMin: startSetup.ascent50MmMin, ascentStopsMmMin: startSetup.ascentStopsMmMin, ascentLast6mMmMin: startSetup.ascentLast6mMmMin, sacFactor: startSetup.sacFactor } });
    if (startLocal !== null) await p.eval(`localStorage.setItem('od.corePrefs', ${q(startLocal)})`);
    await go('/');
  } catch (e) {
    console.log('cleanup problem:', e.message);
  }
  const failed = results.filter((x) => !x.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  p.close();
  process.exit(failed.length ? 1 : 0);
}
