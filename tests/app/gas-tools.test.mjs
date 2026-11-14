// SPDX-License-Identifier: GPL-2.0
// The Tools gas math in JavaScript (app/src/lib/gas-calculator.js and gas-blend.js): the gas
// calculator (MOD, EAD, END, best mix) against values worked out by hand from Subsurface's
// formulas, the gas blender against hand calculations and against an exact real-gas reference,
// and the compressibility factor against values printed by Subsurface's own
// gas_compressibility_factor().
//
// These checks moved from tests/tools_test.cpp (when the gas math moved from the C++ façade to
// JavaScript) with the same inputs, the same expected values and the same tolerances.
// OD_TOOLS_MUTATE=<calc|blend> sends a wrong input to the code under test only (the references
// keep the true one): the run must then fail. The release check (tests/release-check.sh,
// "mutations") runs each of them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gasCalculator } from '../../app/src/lib/gas-calculator.js';
import { gasBlend, compressibilityFactor } from '../../app/src/lib/gas-blend.js';

const mutated = (name) => process.env.OD_TOOLS_MUTATE === name;

// Tolerances of the references, set just above the differences measured (the reasons are given
// where they are used).
// Blender, added pressure of a step: the code rounds to 1 mbar and evaluates Z with the mix rounded
// to a permille of each gas (an error of up to 5e-4 in a fraction, i.e. about 7e-5 of the pressure
// at 220 bar); measured at most 4.4 mbar.
const TOL_BLEND_MBAR = 5.0;
// Blender, volume of a gas: rounded to 1 ml; measured at most 0.5 ml.
const TOL_BLEND_ML = 1.0;

// The core's defaults: oxygen narcotic, best-mix END 30 m.
const PREFS = { o2narcotic: true, bestMixEndMm: 30000 };
const calc = (o2, he, po2, depth, end = -1, salinity = 10300) => gasCalculator(o2, he, po2, depth, PREFS, end, salinity);

// ---------------------------------------------------------------------------
// Gas calculator, by hand
// ---------------------------------------------------------------------------
// EAN32 at 1.4 bar, sea water, 1013 mbar. MOD: 1400 * 1000 / 320 = 4375 mbar,
// (4375 - 1013) / 0.101043 = 33273 mm, rounded to 33 m. At 33 m: 4347 mbar =
// 4.291214 atm (the core's atm is 1013 mbar). EAD: 4.291214 * 0.680 / 0.79
// = 3.693704 atm, 26.937 m. END (O2 narcotic, the default): 3.291214 atm
// above the surface, 32.912 m.
// Best mix at 30 m (4044 mbar): (1400 * 100 / 4044) * 10 = 340, no helium
// since the planned depth is the best-mix END (30 m).
const ean32 = calc(320, 0, mutated('calc') ? 1500 : 1400, 30000);
test('EAN32 MOD', () => assert.equal(ean32.modMm, 33000));
test('EAN32 EAD at MOD', () => assert.equal(ean32.eadMm, 26937));
test('EAN32 END at MOD', () => assert.equal(ean32.endMm, 32912));
test('best O2 at 30 m', () => assert.equal(ean32.bestO2, 340));
test('best He at 30 m', () => assert.equal(ean32.bestHe, 0));

// Air at 1.4: 1400 * 1000 / 210 = 6666 mbar, 55946 mm, 56 m. Best mix at
// 50 m (6065 mbar): O2 (140000 / 6065 = 23) * 10 = 230; He (100 - 404400 /
// 6065 = 66) * 10 = 340.
const air = calc(210, 0, 1400, 50000);
test('air MOD', () => assert.equal(air.modMm, 56000));
test('best O2 at 50 m', () => assert.equal(air.bestO2, 230));
test('best He at 50 m', () => assert.equal(air.bestHe, 340));
test('bad gas refused', () => assert.throws(() => calc(800, 300, 1400, 30000), /^Error: BAD_REQUEST/));

// Fresh water (10000 kg per 10000 l): 3362 mbar above the surface at 9.80665 kPa
// per metre of 1000 kg/m3 = 34.28 m, rounded to 34 m (sea water: 33 m).
const fresh = calc(320, 0, 1400, 30000, -1, 10000);
test('EAN32 MOD in fresh water', () => assert.equal(fresh.modMm, 34000));
// Best mix at 30 m in fresh water: 30 m is 3943 mbar, 140000 / 3943 = 35.5 -> 350.
test('best O2 at 30 m in fresh water', () => assert.equal(fresh.bestO2, 350));
// EAD and END at the planned depth: EAN32 at 30 m, O2 narcotic: END = 30 m.
test('END at the planned depth about 30 m', () => assert.ok(Math.abs(ean32.endPlannedMm - 30000) < 100));
test('EAD at the planned depth about 24 m', () => assert.ok(ean32.eadPlannedMm > 23500 && ean32.eadPlannedMm < 25000));
// Best nitrox alone at 30 m is EAN34, narcotic fraction 100 %: END = 30 m.
test('END of the best nitrox about 30 m', () => assert.ok(Math.abs(ean32.nitroxEndMm - 30000) < 100));
// END of 30 m for the best mix is the default Settings limit; here limited to 20 m.
const limited = calc(210, 0, 1400, 50000, 20000);
test('best mix END override', () => assert.equal(limited.bestMixEndMm, 20000));
test('best mix END override: more helium than at 30 m', () => assert.ok(limited.bestHe > 340));
test('best mix END back to the preference', () => assert.equal(calc(210, 0, 1400, 50000).bestHe, 340));
test('bad salinity refused', () => assert.throws(() => calc(210, 0, 1400, 30000, -1, 5000), /^Error: BAD_REQUEST/));

// ---------------------------------------------------------------------------
// Gas blender (real gases), by hand
// ---------------------------------------------------------------------------
// Amounts are checked against an ideal-gas hand calculation, within a few percent (the
// compressibility of helium and oxygen at 200 bar is 1 to 4 %), and the fill is checked for
// coherence: pressures rise, the last is the wanted final pressure.
const near = (got, expected, tol) => Math.abs(got - expected) <= tol * expected;
const blend = (...args) => gasBlend(...args);

// EAN32 from empty, 200 bar, 12 L, filled with air. No helium. Ideal: oxygen
// to 0.32 * 200 - 0.21 * 120 ... N2 0.68 * 200 = 136 bar from air, so air
// 172.2 bar (O2 36.2), oxygen added 64 - 36.2 = 27.8 bar, pressure after
// oxygen 27.8 bar.
test('nitrox: blend accepted', () => assert.doesNotThrow(() => blend(320, 0, 200000, 12000, 0, 0, 0, 210)));
const nitrox = blend(320, 0, 200000, 12000, 0, 0, 0, 210);
test('nitrox: feasible', () => assert.equal(nitrox.feasible, true));
test('nitrox: no helium added', () => assert.equal(nitrox.steps[0].addedMbar, 0));
test('nitrox: oxygen about 27.8 bar', () => assert.ok(near(nitrox.steps[1].addedMbar, 27800, 0.06)));
test('nitrox: oxygen volume about 27.8 bar x 12 L', () => assert.ok(near(nitrox.steps[1].volumeMl, 27.8 * 12000, 0.06)));
test('nitrox: ends at the wanted pressure', () => assert.equal(nitrox.steps[2].toMbar, 200000));
test('nitrox: pressures rise', () =>
  assert.ok(nitrox.steps[1].toMbar >= nitrox.steps[0].toMbar && nitrox.steps[2].toMbar > nitrox.steps[1].toMbar));

// Trimix 21/35 to 220 bar from empty, air top-up. Ideal: helium 77 bar; air
// 0.44 * 220 / 0.79 = 122.5 bar (O2 25.7); oxygen 46.2 - 25.7 = 20.5 bar.
const trimix = blend(210, 350, 220000, 12000, 0, 0, 0, 210);
test('trimix: feasible', () => assert.equal(trimix.feasible, true));
test('trimix: helium about 77 bar', () => assert.ok(near(trimix.steps[0].addedMbar, 77000, 0.08)));
test('trimix: oxygen about 20.5 bar', () => assert.ok(near(trimix.steps[1].addedMbar, 20500, 0.1)));
test('trimix: air about 122.5 bar', () => assert.ok(near(trimix.steps[2].addedMbar, 122500, 0.08)));
test('trimix: ends at the wanted pressure', () => assert.equal(trimix.steps[2].toMbar, 220000));
test('trimix: helium volume', () => assert.ok(near(trimix.steps[0].volumeMl, 77.0 * 12000, 0.08)));

// Oxygen first: the same amounts, read in the other order; the top-up is last.
const oxygenFirst = blend(210, 350, 220000, 12000, 0, 0, 0, 210, true);
test('oxygen first: oxygen step before helium', () => assert.deepEqual(oxygenFirst.steps.map((s) => s.gas), ['o2', 'he', 'topup']));
test('oxygen first: oxygen about 20.5 bar', () => assert.ok(near(oxygenFirst.steps[0].addedMbar, 20500, 0.1)));
test('oxygen first: helium within 3 % of helium first', () =>
  assert.ok(near(oxygenFirst.steps[1].addedMbar, trimix.steps[0].addedMbar, 0.03)));
test('oxygen first: ends at the wanted pressure', () => assert.equal(oxygenFirst.steps[2].toMbar, 220000));
test('oxygen first: pressures rise', () =>
  assert.ok(oxygenFirst.steps[0].toMbar < oxygenFirst.steps[1].toMbar && oxygenFirst.steps[1].toMbar < oxygenFirst.steps[2].toMbar));

// Partly filled: 50 bar of 21/35 in the cylinder, same wanted mix. Ideal:
// helium 0.35 * (220 - 50) = 59.5 bar; air 0.44 * 170 / 0.79 = 94.7 bar
// (O2 19.9); oxygen 0.21 * 170 - 19.9 = 15.8 bar.
const partly = blend(210, 350, 220000, 12000, 50000, 210, 350, 210);
test('partly filled, same mix: feasible', () => assert.equal(partly.feasible, true));
test('partly filled, same mix: helium about 59.5 bar', () => assert.ok(near(partly.steps[0].addedMbar, 59500, 0.1)));
test('partly filled, same mix: oxygen about 15.8 bar', () => assert.ok(near(partly.steps[1].addedMbar, 15800, 0.1)));
test('partly filled, same mix: ends at the wanted pressure', () => assert.equal(partly.steps[2].toMbar, 220000));

// Partly filled with air (50 bar), EAN32 wanted at 200 bar: the residual air
// brings oxygen, so less is added than from an empty cylinder (27.7 bar).
const airResidual = blend(320, 0, 200000, 12000, 50000, 210, 0, 210);
test('air residual: feasible', () => assert.equal(airResidual.feasible, true));
test('air residual: oxygen added between 20 and 27 bar', () =>
  assert.ok(airResidual.steps[1].addedMbar > 20000 && airResidual.steps[1].addedMbar < 27000));
test('air residual: oxygen starts after the residual', () =>
  assert.equal(airResidual.steps[1].toMbar - airResidual.steps[1].addedMbar, airResidual.steps[0].toMbar));
test('air residual: no helium', () => assert.equal(airResidual.steps[0].addedMbar, 0));
test('air residual: first step starts at the cylinder pressure', () => assert.equal(airResidual.steps[0].toMbar, 50000));

// Impossible: 150 bar of air left in the cylinder, EAN36 wanted at 150 bar:
// the nitrogen alone, 0.79 * 150 = 118.5 bar, exceeds 0.64 * 150 = 96 bar.
// Bleed down to 96 / 0.79 = 121.5 bar (ideal), then oxygen up to 150 bar.
const tooMuch = blend(360, 0, 150000, 12000, 150000, 210, 0, 210);
test('too much residual: not feasible', () => assert.equal(tooMuch.feasible, false));
test('too much residual: error', () => assert.equal(tooMuch.error, 'RESIDUAL_TOO_HIGH'));
test('too much residual: bleed to about 121.5 bar', () => assert.ok(near(tooMuch.bleedToMbar, 121500, 0.03)));
test('too much residual: the fill starts from the bleed pressure', () => assert.ok(tooMuch.steps[0].toMbar === tooMuch.bleedToMbar));
test('too much residual: ends at the wanted pressure', () => assert.equal(tooMuch.steps[2].toMbar, 150000));

// Impossible: helium left in the cylinder while a nitrox is wanted: empty it.
test('helium left, nitrox wanted: bleed to empty', () => {
  const r = blend(320, 0, 200000, 12000, 30000, 210, 350, 210);
  assert.ok(r.error === 'RESIDUAL_TOO_HIGH' && r.bleedToMbar === 0);
});

// Impossible whatever is bled: top-up gas richer than the wanted mix (EAN32
// wanted from EAN50 top-up cannot be reached with only oxygen/helium added).
test('top-up too rich: error', () => assert.equal(blend(210, 350, 220000, 12000, 0, 0, 0, 500).error, 'TOPUP_TOO_RICH'));
test('bad blend refused', () => assert.throws(() => blend(0, 0, 200000, 12000, 0, 0, 0, 210), /^Error: BAD_REQUEST/));
test('bad top-up refused', () => assert.throws(() => blend(320, 0, 200000, 12000, 0, 0, 0, 1000), /^Error: BAD_REQUEST/));

// ---------------------------------------------------------------------------
// Compressibility factor: values printed by Subsurface's gas_compressibility_factor()
// (core/gas-model.cpp, built in WSL: tests/tools_test.cpp's core) for pinned mixes and
// pressures, compared exactly. An oxygen of 0 is read as air (20.9 %); the fit is clamped to
// 0..500 bar.
// ---------------------------------------------------------------------------
const Z_PINNED = [
  // [o2 permille, he permille, bar, Z from the core]
  [210, 0, 0, 1],
  [210, 0, 1, 0.99967888839434749],
  [210, 0, 200, 1.0357655298969164],
  [210, 0, 232, 1.0567850014226559],
  [210, 0, 300, 1.1114728831519771],
  [210, 0, 500, 1.3198640619325326],
  [210, 0, 600, 1.3198640619325326], // clamped to 500 bar
  [320, 0, 200, 1.0248120132299487],
  [1000, 0, 200, 0.95709936474323998],
  [210, 350, 200, 1.048953294786483],
  [210, 350, 232, 1.066634268560654],
  [0, 700, 200, 1.062240637100295], // oxygen 0 read as 20.9 %
  [100, 700, 300, 1.125889709297673],
  [0, 0, 1, 0.99967938733541739], // air at 20.9 %
];
for (const [o2, he, bar, z] of Z_PINNED) {
  test(`Z of ${o2 / 10}/${he / 10} at ${bar} bar`, () => assert.equal(compressibilityFactor(o2, he, bar), z));
}

// ---------------------------------------------------------------------------
// Gas blender against the exact real-gas reference
// ---------------------------------------------------------------------------
// Compressibility factor of a mix, Z = 1 + sum_i x_i (c1_i P + c2_i P^2 + c3_i P^3),
// the cubic virial fit of Perry's Chemical Engineers' Handbook (7th ed.) data for
// O2, N2 and He at 300 K. The coefficients are the ones Subsurface publishes in
// core/gas-model.cpp (they are data, copied: no other source gives this fit); the
// mixing is linear in the mole fractions. Everything below is written from the
// definition of a blend, not from the code under test:
//  - a cylinder of volume V at pressure P holds n = P V / (Z R T) of gas, and T
//    and V are fixed, so amounts are kept as n^ = P / Z(mix, P) in bar (the
//    pressure the same amount would read as an ideal gas);
//  - the amounts of helium, nitrogen and oxygen after filling are those of the
//    wanted mix at its final pressure: n^_f = Pf / Z(F, Pf), each gas x_i n^_f;
//  - the three additions (helium, oxygen, nitrox top-up) solve a 3 x 3 linear
//    system of component balances (back substitution) and must be >= 0;
//  - the pressure after a step solves P / Z(mix, P) = n^ by Newton's method
//    (the code under test bisects);
//  - a residual that is too rich is bled down: the highest residual pressure for
//    which the system has a non-negative solution, found by bisection on the
//    pressure (the code under test solves the limit in closed form);
//  - the volume of a gas used is n^ V Z(pure gas, 1 bar), as measured at 1 bar.
const reference = (() => {
  const O2 = [-7.18092073703e-4, +2.81852572808e-6, -1.50290620492e-9];
  const N2 = [-2.19260353292e-4, +2.92844845532e-6, -2.07613482075e-9];
  const HE = [+4.87320026468e-4, -8.83632921053e-8, +5.33304543646e-11];

  const z = (m, bar) => {
    const virial = (c) => bar * (c[0] + bar * (c[1] + bar * c[2]));
    return 1.0 + m.o2 * virial(O2) + m.he * virial(HE) + (1.0 - m.o2 - m.he) * virial(N2);
  };
  const nhat = (m, bar) => bar / z(m, bar);

  // Pressure at which the cylinder holds n^ of the mix: Newton from the ideal value.
  const pressure = (m, n) => {
    let p = n;
    for (let i = 0; i < 60; i++) {
      const h = 1e-4;
      const f = nhat(m, p) - n;
      const df = (nhat(m, p + h) - nhat(m, p - h)) / (2 * h);
      const next = p - f / df;
      if (Math.abs(next - p) < 1e-12) return next;
      p = next;
    }
    return p;
  };

  // Solves the component balances for a residual amount nR of the mix r.
  const solve = (r, nR, f, nF, topupO2) => {
    // Unknowns (he, o2, topup). Rows: helium, oxygen, nitrogen.
    const a = [
      [1, 0, 0, f.he * nF - r.he * nR],
      [0, 1, topupO2, f.o2 * nF - r.o2 * nR],
      [0, 0, 1 - topupO2, (1.0 - f.o2 - f.he) * nF - (1.0 - r.o2 - r.he) * nR],
    ];
    const x = [0, 0, 0];
    for (let i = 2; i >= 0; i--) {
      let s = a[i][3];
      for (let j = i + 1; j < 3; j++) s -= a[i][j] * x[j];
      x[i] = s / a[i][i];
    }
    const eps = 1e-7;
    return { ok: x[0] >= -eps && x[1] >= -eps && x[2] >= -eps, he: Math.max(0, x[0]), o2: Math.max(0, x[1]), topup: Math.max(0, x[2]) };
  };

  // A blend: wanted o2/he at final bar in a cylinder of `ml`; start `startBar` of the mix r; top-up o2.
  // Steps in the order of the code under test: he, o2, topup (oxygen first: o2, he, topup).
  const run = (f, finalBar, ml, startBar, r, topupO2, oxygenFirst) => {
    const res = { ok: false, bleedBar: -1, steps: [] };
    const nF = nhat(f, finalBar);
    let nR = nhat(r, startBar);
    let fill = solve(r, nR, f, nF, topupO2);
    if (!fill.ok) {
      // Highest residual pressure that still gives a feasible fill.
      let lo = 0;
      let hi = startBar;
      for (let i = 0; i < 200; i++) {
        const mid = 0.5 * (lo + hi);
        if (solve(r, nhat(r, mid), f, nF, topupO2).ok) lo = mid;
        else hi = mid;
      }
      res.bleedBar = lo;
      startBar = lo;
      nR = nhat(r, lo);
      fill = solve(r, nR, f, nF, topupO2);
    }
    res.ok = fill.ok;
    // Amounts in the cylinder after each step.
    const he = nR * r.he;
    const o2 = nR * r.o2;
    const n2 = nR * (1.0 - r.o2 - r.he);
    const pOf = (heN, o2N) => {
      const tot = heN + o2N + n2;
      return tot > 0 ? pressure({ o2: o2N / tot, he: heN / tot }, tot) : 0.0;
    };
    const p0 = startBar;
    let p1, p2;
    if (oxygenFirst) {
      p1 = pOf(he, o2 + fill.o2);
      p2 = pOf(he + fill.he, o2 + fill.o2);
    } else {
      p1 = pOf(he + fill.he, o2);
      p2 = pOf(he + fill.he, o2 + fill.o2);
    }
    const p3 = pressure(f, nF);
    const vol = (n, gas) => n * ml * z(gas, 1.0);
    const heStep = { addedBar: 0, volumeMl: vol(fill.he, { o2: 0, he: 1 }) };
    const o2Step = { addedBar: 0, volumeMl: vol(fill.o2, { o2: 1, he: 0 }) };
    if (oxygenFirst) {
      o2Step.addedBar = p1 - p0;
      heStep.addedBar = p2 - p1;
      res.steps = [o2Step, heStep];
    } else {
      heStep.addedBar = p1 - p0;
      o2Step.addedBar = p2 - p1;
      res.steps = [heStep, o2Step];
    }
    res.steps[2] = { addedBar: p3 - p2, volumeMl: vol(fill.topup, { o2: topupO2, he: 0 }) };
    return res;
  };
  return { run };
})();

// Each fill step (added pressure, gas volume) and the bleed-down pressure are compared with the
// reference. The reference solves the blend to 1e-12 bar; what the code under test rounds is
// described at TOL_BLEND_*. The worst differences measured are in the message of a failure.
const vsReference = (what, o2, he, finalMbar, ml, startMbar, startO2, startHe, topup, oxygenFirst) => {
  test(`reference blend, ${what}`, () => {
    const j = gasBlend(o2, he, finalMbar + (mutated('blend') ? 1000 : 0), ml, startMbar, startO2, startHe, topup, oxygenFirst);
    const r = reference.run({ o2: o2 / 1000.0, he: he / 1000.0 }, finalMbar / 1000.0, ml, startMbar / 1000.0,
      { o2: startO2 / 1000.0, he: startHe / 1000.0 }, topup / 1000.0, oxygenFirst);
    let worstP = 0;
    let worstV = 0;
    let ok = r.ok === (j.feasible || j.error === 'RESIDUAL_TOO_HIGH');
    for (let i = 0; i < 3; i++) {
      const p = j.steps[i].addedMbar / 1000.0;
      const v = j.steps[i].volumeMl;
      worstP = Math.max(worstP, Math.abs(p - r.steps[i].addedBar) * 1000.0);
      worstV = Math.max(worstV, Math.abs(v - r.steps[i].volumeMl));
      ok = ok && Math.abs(p - r.steps[i].addedBar) <= TOL_BLEND_MBAR / 1000.0;
      // After a bleed-down the code keeps 1 mbar less than the exact limit (rounded down so as
      // never to keep too much): the top-up then fills that 1 mbar (ml / 1000 ml).
      ok = ok && Math.abs(v - r.steps[i].volumeMl) <= TOL_BLEND_ML + (r.bleedBar >= 0 ? ml / 1000.0 : 0.0);
    }
    if (r.bleedBar >= 0) ok = ok && Math.abs(j.bleedToMbar / 1000.0 - r.bleedBar) <= 1.0 / 1000.0; // floored to 1 mbar
    else ok = ok && j.bleedToMbar === undefined;
    if (process.env.OD_TOOLS_DUMP) console.log(`reference blend, ${what}: worst difference ${worstP.toFixed(2)} mbar and ${worstV.toFixed(1)} ml`);
    assert.ok(ok, `worst difference ${worstP.toFixed(2)} mbar and ${worstV.toFixed(1)} ml${r.bleedBar >= 0 ? ', with bleed-down' : ''}`);
  });
};
vsReference('nitrox from empty, helium first', 320, 0, 200000, 12000, 0, 0, 0, 210, false);
vsReference('nitrox from empty, oxygen first', 320, 0, 200000, 12000, 0, 0, 0, 210, true);
vsReference('trimix 21/35 from empty', 210, 350, 220000, 12000, 0, 0, 0, 210, false);
vsReference('trimix 21/35 from empty, oxygen first', 210, 350, 220000, 12000, 0, 0, 0, 210, true);
vsReference('trimix 18/45 to 300 bar', 180, 450, 300000, 15000, 0, 0, 0, 320, false);
vsReference('partly filled with the same trimix', 210, 350, 220000, 12000, 50000, 210, 350, 210, false);
vsReference('partly filled with the same trimix, oxygen first', 210, 350, 220000, 12000, 50000, 210, 350, 210, true);
vsReference('partly filled with air', 320, 0, 200000, 12000, 50000, 210, 0, 210, false);
vsReference('partly filled with a lean trimix', 180, 450, 232000, 18000, 80000, 210, 300, 320, false);
vsReference('bleed-down of air', 360, 0, 150000, 12000, 150000, 210, 0, 210, false);
vsReference('bleed-down of air, oxygen first', 360, 0, 150000, 12000, 150000, 210, 0, 210, true);
vsReference('helium left, nitrox wanted', 320, 0, 200000, 12000, 30000, 210, 350, 210, false);
vsReference('bleed-down of a trimix', 180, 450, 200000, 12000, 120000, 210, 350, 210, false);
