// The app's side of the planner: what the diver types becomes the request sent
// to the core, what the core answers becomes what is shown, and the two alarms
// of the result. Node's built-in test runner, no dependency:
//   node --import ./tests/app/register.mjs --test tests/app/
// OD_JS_MUTATE=<name> loads a wrong version of the source (see loader.mjs): the
// tests must then fail.
import test from 'node:test';
import assert from 'node:assert/strict';

const root = '../../app/src/';
const rules = await import(root + 'lib/planner-rules.js');
const format = await import(root + 'lib/format.js');
const { planner, planRequest, plannerDefaults, startNewDive, requestOfPlan, applyRequest, planSettings, setting } = await import(root + 'lib/planner.svelte.js');
const tools = await import(root + 'lib/tools.js');
const { t } = await import(root + 'lib/i18n.js');

/** Whitespace of every kind (no-break, narrow no-break) as a plain space. @param {string} s */
const plain = (s) => s.replace(/\s/g, ' ');

const metric = { length: 'm', temperature: 'C', pressure: 'bar', volume: 'l', weight: 'kg' };
const imperial = { length: 'ft', temperature: 'F', pressure: 'psi', volume: 'cuft', weight: 'lb' };

test('depth: typed value to the core, in mm, and back', () => {
  assert.equal(rules.depthToMm(30, false), 30000);
  assert.equal(rules.depthToMm(100, true), 30480);
  assert.equal(rules.depthToMm(1, true), 305); // rounded to the mm, as the core takes integers
  assert.equal(rules.mmToDepth(30480, true), 100);
  assert.equal(rules.mmToDepth(30000, false), 30);
  for (const ft of [10, 33, 100, 130, 300]) assert.equal(Math.round(rules.mmToDepth(rules.depthToMm(ft, true), true)), ft);
});

test('volume: litres and cubic feet to ml', () => {
  assert.equal(rules.carriedToMl(12, false), 12000);
  assert.equal(rules.carriedToMl(7, true), 198218); // 7 x 28316.8466 ml
  assert.equal(rules.carriedToMl(80, true), 2265348);
  assert.equal(rules.mlToCarried(2265348, true).toFixed(2), '80.00');
  assert.equal(rules.mlToCarried(12000, false), 12);
});

test('pressure: bar and psi to mbar', () => {
  assert.equal(rules.pressureToMbar(40, false), 40000);
  assert.equal(rules.pressureToMbar(500, true), 34474); // the reserve of 500 psi
  assert.equal(rules.pressureToMbar(3000, true), 206843);
  assert.equal(rules.mbarToPressure(206843, true).toFixed(1), '3000.0');
  assert.equal(rules.mbarToPressure(200000, false), 200);
});

test('alarm "Volume transporté": only when given and below the total', () => {
  assert.equal(rules.gasTotalMl({ gasUsedMl: 1500000, reserveMl: 500000 }), 2000000);
  assert.equal(rules.isShort(0, 2000000), false, 'not given: no alarm');
  assert.equal(rules.isShort(1999999, 2000000), true, 'one ml short');
  assert.equal(rules.isShort(2000000, 2000000), false, 'exactly the total is enough');
  assert.equal(rules.isShort(2000001, 2000000), false);
  assert.equal(rules.isShort(1, 2000000), true);
  assert.equal(rules.isShort(-5, 2000000), false);
});

test('alarm of the bottom gas (MOD): only below the deepest point', () => {
  assert.equal(rules.modAlarm(40000, 30000), true);
  assert.equal(rules.modAlarm(30001, 30000), true);
  assert.equal(rules.modAlarm(30000, 30000), false, 'at the MOD is allowed');
  assert.equal(rules.modAlarm(20000, 30000), false);
  assert.equal(rules.modAlarm(40000, 0), false, 'no MOD known');
  assert.equal(rules.modAlarm(40000, -1000), false);
});

test('request: levels, gases and conditions as the core takes them', () => {
  planner.source = null;
  planner.when = 0;
  planner.levels = [
    { depthMm: rules.depthToMm(100, true), durationSeconds: 25 * 60 },
    { depthMm: rules.depthToMm(60, true), durationSeconds: 10 * 60 + 0.4 },
  ];
  planner.gases = [
    { o2Permille: 210, hePermille: 350, carriedMl: 0 },
    { o2Permille: 500, hePermille: 0, carriedMl: rules.carriedToMl(40, true) },
  ];
  planner.salinity = 10000;
  planner.surfacePressureMbar = tools.altitudeToPressureMbar(rules.depthToMm(5000, true));
  planner.bottomSacMlMin = 20000.4;
  planner.deco = { decoModel: 'vpmb', gfLow: 30, gfHigh: 75, vpmbConservatism: 2 };
  const request = planRequest();
  assert.deepEqual(request.levels, [
    { depthMm: 30480, durationSeconds: 1500 },
    { depthMm: 18288, durationSeconds: 600 },
  ]);
  assert.equal(request.salinity, 10000);
  assert.equal(request.surfacePressureMbar, 833); // 5000 ft
  assert.equal(request.bottomSacMlMin, 20000);
  assert.equal(request.decoModel, 1);
  assert.equal(request.vpmbConservatism, 2);
  assert.deepEqual(request.cylinders, [
    { o2Permille: 210, hePermille: 350 }, // no volume carried: not sent
    { o2Permille: 500, hePermille: 0, carriedMl: 1132674 },
  ]);
  planner.deco = { decoModel: 'buehlmann', gfLow: 45, gfHigh: 85, vpmbConservatism: 3 };
  const buehlmann = planRequest();
  assert.equal(buehlmann.decoModel, 0);
  assert.equal(buehlmann.gfLow, 45);
  assert.equal(buehlmann.gfHigh, 85);
});

test('request: a plan from a logbook dive sends the dive, not the levels', () => {
  planner.source = { id: 42, number: 7, durationSeconds: 3000, date: '2025-01-01T10:00:00', site: 'x', maxDepthMm: 20000, profile: [] };
  planner.levels = [{ depthMm: 99000, durationSeconds: 60 }];
  planner.gases = [{ o2Permille: 209, hePermille: 0, carriedMl: 0, sourceCylinder: 1 }];
  const request = planRequest();
  assert.equal(request.sourceDiveId, 42);
  assert.equal(request.levels, undefined);
  assert.equal(request.cylinders[0].sourceCylinder, 1);
  planner.source = null;
});

test('defaults in feet and psi are the round values of that system', () => {
  assert.deepEqual(plannerDefaults({ length: 'm', pressure: 'bar' }), { depthMm: 15000, ascentMmMin: 9000, descentMmMin: 18000, reserveMbar: 40000 });
  const d = plannerDefaults({ length: 'ft', pressure: 'psi' });
  assert.equal(d.depthMm, 13716); // 45 ft
  assert.equal(d.ascentMmMin, 9144); // 30 ft/min
  assert.equal(d.descentMmMin, 18288); // 60 ft/min
  assert.equal(d.reserveMbar, 34474); // 500 psi
  startNewDive({ length: 'ft', pressure: 'psi', decoModel: 'vpmb', gfLow: 40, gfHigh: 80, vpmbConservatism: 1 });
  assert.equal(planner.levels[0].depthMm, 13716);
  assert.equal(planner.deco.decoModel, 'vpmb');
  assert.equal(planRequest().levels[0].depthMm, 13716);
});

test('a saved plan is reopened with its own request', () => {
  const request = { levels: [{ depthMm: 30000, durationSeconds: 1200 }], cylinders: [{ o2Permille: 209, hePermille: 0 }], decoModel: 1, gfLow: 30, gfHigh: 75 };
  const plan = { request: JSON.stringify(request), levels: [{ depthMm: 30000, durationSeconds: 1230 }], gases: [], when: 0 };
  assert.deepEqual(requestOfPlan(plan, {}), request);
});

test('displayed depth', () => {
  assert.match(plain(format.formatDepth(30480, imperial)), /^100 /);
  assert.match(plain(format.formatDepth(30480, metric)), /^30[,.]5 /);
  assert.equal(plain(format.depthValue(rules.depthToMm(130, true), imperial)), '130');
  assert.equal(plain(format.depthUnit(imperial)), t('units.feet'));
  assert.equal(plain(format.depthUnit(metric)), t('units.meters'));
});

test('displayed pressure, volume and SAC', () => {
  assert.match(plain(format.formatPressure(206843, imperial)), /^3 ?000 /);
  assert.match(plain(format.formatPressure(34474, imperial)), /^500 /);
  assert.match(plain(format.formatPressure(200000, metric)), /^200 /);
  assert.match(plain(format.formatGasVolume(2265348, imperial)), /^80 /);
  assert.match(plain(format.formatGasVolume(2265348, metric)), /^2 ?265 /);
  assert.match(plain(format.formatSac(20000, imperial)), /^0[,.]71 /); // 20 L/min
  assert.match(plain(format.formatSac(20000, metric)), /^20[,.]0 /);
  assert.match(plain(format.formatCylinderSize(12000, 232000, metric)), /^12[,.]0 /);
  assert.match(plain(format.formatCylinderSize(12000, 232000, imperial)), /^97[,.]0 /); // 12 L at 232 bar: 2747 L at 1 atm = 97.0 cuft
});

test('altitude and water of a plan', () => {
  assert.equal(tools.altitudeToPressureMbar(0), 1013);
  assert.equal(tools.altitudeToPressureMbar(rules.depthToMm(1000, false)), 891);
  assert.equal(tools.altitudeToPressureMbar(rules.depthToMm(3000, true)), 901);
  assert.equal(tools.pressureToAltitudeMm(833) > 1500000, true);
  assert.equal(tools.salinityOfWaterType('fresh'), 10000);
  assert.equal(tools.salinityOfWaterType('salt'), 10300);
  assert.equal(tools.salinityOfWaterType(undefined), 10300);
});

test('the alarm texts name the missing volume in the diver\'s unit', () => {
  const total = 2000000;
  const carried = 1500000;
  const missing = rules.isShort(carried, total) ? t('plan.volumeShort', { missing: format.formatGasVolume(total - carried, imperial) }) : '';
  assert.match(plain(missing), /18 pi³/); // 500 000 ml = 17.66 cuft, shown as a whole number
  assert.match(plain(t('plan.modText', { po2: format.formatNumber(1.4, 1), depth: '56 m' })), /56 m/);
});

test('a saved plan keeps its settings, whatever Settings say when it is reopened', () => {
  planner.kept = null;
  planner.setup = { bottomSacMlMin: 20000, descentMmMin: 18000, ascent75MmMin: 9000, ascent50MmMin: 9000, ascentStopsMmMin: 9000, ascentLast6mMmMin: 9000, reserveMbar: 40000, lastStop6m: true, safetyStop: false, switchAtRequiredStop: false, minSwitchSeconds: 60, o2Breaks: false, dropStone: false, bottomPo2Mbar: 1400, decoPo2Mbar: 1600, problemSolvingMinutes: 4, sacFactor: 200, decoSacMlMin: 17000 };
  startNewDive({ ...metric });
  assert.equal(planRequest().descentMmMin, undefined, 'a new plan follows Settings');
  const saved = { ...planRequest(), ...planSettings() };
  assert.equal(saved.descentMmMin, 18000);
  assert.equal(saved.reserveMbar, 40000);
  assert.equal(saved.lastStop6m, 1, 'a number: the core reads numbers only');
  assert.equal('bottomSacMlMin' in planSettings(), false, 'the SAC stays the field of the plan');
  assert.equal('decoSacMlMin' in planSettings(), false, 'the deco SAC is a field of the plan too');

  planner.setup = { ...planner.setup, descentMmMin: 18288, reserveMbar: 34474 };
  applyRequest(saved, 7, null);
  const reopened = planRequest();
  assert.equal(reopened.descentMmMin, 18000, 'the plan, not the new Settings');
  assert.equal(reopened.reserveMbar, 40000);
  assert.equal(setting('descentMmMin'), 18000);

  const older = { ...saved };
  for (const k of Object.keys(planSettings())) delete older[k];
  applyRequest(older, 8, null);
  assert.equal(planner.kept, null, 'a plan saved before: the current Settings');
  assert.equal(planRequest().descentMmMin, undefined);
});

test('two SACs: the request carries the bottom SAC and the deco SAC, each its own', () => {
  planner.source = null;
  planner.bottomSacMlMin = 20000;
  planner.decoSacMlMin = 15000.4;
  const request = planRequest();
  assert.equal(request.bottomSacMlMin, 20000);
  assert.equal(request.decoSacMlMin, 15000);
  planner.kept = { decoSacMlMin: 99000 };
  assert.equal(planRequest().decoSacMlMin, 15000, 'the field of the plan wins over a kept setting');
  planner.kept = null;
});

// --- Wheel field rules --------------------------------------------------------

const wheel = await import(root + 'lib/wheel-rules.js');

test('wheel: decimals of a step and on-step detection', () => {
  assert.equal(wheel.decimalsOf(0.01), 2);
  assert.equal(wheel.decimalsOf(0.5), 1);
  assert.equal(wheel.decimalsOf(500), 0);
  assert.equal(wheel.isOnStep(0.36, 0.04, 0.01), true);
  assert.equal(wheel.isOnStep(0.355, 0.04, 0.01), false, '0.355 is between 0.35 and 0.36');
  assert.equal(wheel.isOnStep(17.0003, 1, 0.5), true, 'millilitre rounding stays on the step');
  assert.equal(wheel.isOnStep(33, 5, 1), true);
  assert.equal(wheel.isOnStep(33, 0, 5), false);
});

test('wheel: a turn steps, snaps to the nearest step from between steps, clamps', () => {
  assert.equal(wheel.turn(33, 1, 5, 100, 1), 34);
  assert.equal(wheel.turn(33, -1, 5, 100, 1), 32);
  assert.equal(wheel.turn(0.36, 1, 0.04, 3.5, 0.01), 0.37, 'no floating-point noise');
  assert.equal(wheel.turn(0.29, 1, 0.04, 3.5, 0.01), 0.3);
  assert.equal(wheel.turn(0.355, 1, 0.04, 3.5, 0.01), 0.36, 'between steps, up: the step above');
  assert.equal(wheel.turn(0.355, -1, 0.04, 3.5, 0.01), 0.35, 'between steps, down: the step below');
  assert.equal(wheel.turn(100, 1, 5, 100, 1), null, 'at the end: nowhere');
  assert.equal(wheel.turn(5, -1, 5, 100, 1), null);
  assert.equal(wheel.turn(0, -1, 0, 95, 5), null);
  assert.equal(wheel.turn(95, 1, 0, 95, 5), null);
  assert.equal(wheel.turn(3, -1, 5, 100, 1), 5, 'below the range: back to the range');
  assert.equal(wheel.turn(17, 1, 1, 99, 0.5), 17.5);
  assert.equal(wheel.turn(0, 1, 0, 16000, 500), 500);
  assert.equal(wheel.turn(1200, 1, 0, 16000, 500), 1500);
  assert.equal(wheel.turn(1200, -1, 0, 16000, 500), 1000);
});

test('wheel: neighbours shown above and below', () => {
  assert.deepEqual(wheel.neighbours(33, 5, 100, 1), { before: 32, after: 34 });
  assert.deepEqual(wheel.neighbours(0, 0, 95, 5), { before: null, after: 5 });
  assert.deepEqual(wheel.neighbours(95, 0, 95, 5), { before: 90, after: null });
  assert.deepEqual(wheel.neighbours(0.355, 0.04, 3.5, 0.01), { before: 0.35, after: 0.36 });
  assert.equal(wheel.clamp(120, 5, 100), 100);
});

test('wheel: drag and fling', () => {
  assert.equal(wheel.stepsOfDrag(-24, 24), 1, 'dragging up raises the value');
  assert.equal(wheel.stepsOfDrag(48, 24), -2);
  assert.equal(wheel.stepsOfDrag(10, 24), 0);
  assert.equal(wheel.flingSteps(0.2), 0);
  assert.equal(wheel.flingSteps(-1.2) > 0, true);
  assert.equal(wheel.flingSteps(1.2) < 0, true);
  assert.equal(Math.abs(wheel.flingSteps(-50)), 12, 'at most 12 steps');
});

test('gas validation: oxygen 1 to 100, helium 0 to 99, 100 % at most together', () => {
  assert.equal(rules.gasValid(21, 0), true);
  assert.equal(rules.gasValid(100, 0), true);
  assert.equal(rules.gasValid(50, 50), true);
  assert.equal(rules.gasValid(50, 55), false, 'oxygen plus helium above 100');
  assert.equal(rules.gasValid(80, 55), false);
  assert.equal(rules.gasValid(0, 0), false);
  assert.equal(rules.gasValid(101, 0), false);
  assert.equal(rules.gasValid(21, 100), false);
});
