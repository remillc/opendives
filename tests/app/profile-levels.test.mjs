// Simplifying the measured profile of a dive into planner levels.
import test from 'node:test';
import assert from 'node:assert/strict';

const { simplifyProfile } = await import('../../app/src/lib/profile-levels.js');

/**
 * A profile from waypoints [minute, metres], one sample every 5 s, with optional noise.
 * @param {[number, number][]} points @param {(i: number) => number} [noise]
 */
function profile(points, noise = () => 0) {
  const timeSeconds = [];
  const depthMm = [];
  const end = points[points.length - 1][0] * 60;
  for (let t = 0, i = 0; t <= end; t += 5, i++) {
    let k = 0;
    while (k < points.length - 2 && points[k + 1][0] * 60 < t) k++;
    const [m0, d0] = points[k];
    const [m1, d1] = points[k + 1];
    const f = (t - m0 * 60) / ((m1 - m0) * 60);
    const d = d0 + (d1 - d0) * Math.min(1, Math.max(0, f));
    timeSeconds.push(t);
    depthMm.push(Math.max(0, Math.round(d * 1000 + noise(i))));
  }
  return { timeSeconds, depthMm };
}
/** Deterministic wobble of +-0.5 m. */
const wobble = (i) => Math.sin(i * 1.7) * 500;
const minutes = (levels) => levels.map((l) => l.durationSeconds / 60);
const metres = (levels) => levels.map((l) => l.depthMm / 1000);

test('a square dive gives one level at its depth', () => {
  const levels = simplifyProfile(profile([[0, 0], [2, 30], [22, 30], [24, 0]], wobble));
  assert.equal(levels.length, 1);
  assert.ok(Math.abs(levels[0].depthMm - 30000) <= 500);
  assert.ok(Math.abs(minutes(levels)[0] - 20) <= 1);
});

test('two phases give two levels, in order', () => {
  const levels = simplifyProfile(profile([[0, 0], [2, 30], [22, 30], [23.5, 15], [38.5, 15], [40, 0]], wobble));
  assert.equal(levels.length, 2);
  assert.ok(Math.abs(metres(levels)[0] - 30) <= 1 && Math.abs(metres(levels)[1] - 15) <= 1);
  assert.ok(Math.abs(minutes(levels)[0] - 20) <= 1);
  assert.ok(Math.abs(minutes(levels)[1] - 15) <= 1);
});

test('a short spike, a short shallow pass and noise create no level', () => {
  const spike = profile([[0, 0], [2, 30], [10, 30], [10.1, 12], [10.4, 30], [22, 30], [24, 0]], wobble);
  assert.equal(simplifyProfile(spike).length, 1);
  const pass = profile([[0, 0], [2, 30], [10, 30], [10.5, 18], [11.5, 18], [12, 30], [22, 30], [24, 0]]);
  assert.equal(simplifyProfile(pass).length, 1);
  const noisy = profile([[0, 0], [2, 25], [32, 25], [34, 0]], (i) => Math.sin(i * 0.9) * 1200 + Math.cos(i * 2.3) * 600);
  assert.equal(simplifyProfile(noisy).length, 1);
});

test('a slow multilevel ascent gives a few levels, deepest first', () => {
  const levels = simplifyProfile(profile([[0, 0], [2, 36], [14, 36], [20, 27], [30, 27], [36, 18], [46, 18], [52, 9], [60, 9], [63, 0]], wobble));
  assert.ok(levels.length >= 3 && levels.length <= 6, `got ${levels.length}`);
  const depths = metres(levels);
  assert.ok(Math.abs(depths[0] - 36) <= 1.5);
  for (let i = 1; i < depths.length; i++) assert.ok(depths[i] < depths[i - 1]);
  for (const l of levels) assert.ok(l.durationSeconds >= 120 && l.depthMm % 100 === 0);
});

test('a drifting profile keeps at most six levels; nothing usable gives none', () => {
  const zigzag = [[0, 0]];
  for (let i = 0; i < 20; i++) zigzag.push([2 + i * 4, i % 2 ? 12 : 30], [4 + i * 4, i % 2 ? 12 : 30]);
  zigzag.push([90, 0]);
  assert.ok(simplifyProfile(profile(zigzag)).length <= 6);
  assert.deepEqual(simplifyProfile({ timeSeconds: [], depthMm: [] }), []);
  assert.deepEqual(simplifyProfile({ timeSeconds: [0, 60], depthMm: [0, 0] }), []);
});

const planning = await import('../../app/src/lib/planner.svelte.js');

test('simplifying a plan from a dive uses its levels and keeps the dive; Undo restores the plan', () => {
  const { planner, planRequest, simplifyPlan, restorePlan, canSimplify, startFromDive } = planning;
  const source = { id: 7, number: 3, durationSeconds: 3000, date: '2013-02-02T10:00:00', site: 's', maxDepthMm: 30000, profile: [] };
  const dive = { cylinders: [{ used: true, use: 'OC-gas', o2Permille: 320, hePermille: 0, sizeMl: 12000, startMbar: 200000, endMbar: 80000 }], sacMlMin: 18000, waterType: 'salt', surfacePressureMbar: 1000 };
  startFromDive(/** @type {any} */ (dive), source, {});
  const requestBefore = JSON.stringify(planRequest());
  assert.ok(canSimplify());
  assert.equal(planRequest().sourceDiveId, 7);
  assert.equal(planRequest().levels, undefined);
  const stateBefore = JSON.stringify(Object.entries(planner).filter(([k]) => !['version', 'loaded', 'setup'].includes(k)));

  const levels = [{ depthMm: 30000, durationSeconds: 1200 }, { depthMm: 15000, durationSeconds: 900 }];
  const before = simplifyPlan(levels);
  assert.ok(!canSimplify());
  const request = planRequest();
  assert.equal(request.sourceDiveId, 7);
  assert.deepEqual(request.levels, levels);
  assert.equal(request.when, undefined);
  assert.equal(request.bottomSacMlMin, 18000);
  assert.equal(request.surfacePressureMbar, 1000);
  assert.equal(request.cylinders[0].o2Permille, 320);

  planner.levels[0].depthMm = 25000; // an edit of the levels
  restorePlan(before);
  assert.ok(canSimplify());
  assert.equal(JSON.stringify(planRequest()), requestBefore);
  assert.equal(JSON.stringify(Object.entries(planner).filter(([k]) => !['version', 'loaded', 'setup'].includes(k))), stateBefore);
});

test('the safety stop at the end is not a level', async () => {
  const { simplifyProfile } = await import('../../app/src/lib/profile-levels.js');
  const t = [], d = [];
  const push = (s, mm) => { t.push(s); d.push(mm); };
  push(0, 0); push(120, 25000);
  for (let s = 180; s <= 1800; s += 60) push(s, 25000);
  push(2000, 5000);
  for (let s = 2040; s <= 2220; s += 60) push(s, 5000);
  push(2280, 0);
  const levels = simplifyProfile({ timeSeconds: t, depthMm: d });
  assert.equal(levels.length, 1);
  assert.ok(Math.abs(levels[0].depthMm - 25000) <= 1000);
});
