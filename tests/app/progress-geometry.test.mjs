// Geometry of the wavy progress indicator and of the loading indicator.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WAVY, amplitudeFactor, wavePath, determinatePieces, indeterminatePieces, piecePath, SHAPES, SHAPE_POINTS, morphPath, loadingState } from '../../app/src/lib/progress-geometry.js';

test('amplitude flattens near 0 % and 100 %', () => {
  assert.equal(amplitudeFactor(0), 0);
  assert.equal(amplitudeFactor(0.05), 0.5);
  assert.equal(amplitudeFactor(0.5), 1);
  assert.equal(amplitudeFactor(1), 0);
  assert.ok(amplitudeFactor(0.975) > 0 && amplitudeFactor(0.975) < 1);
});

test('wave path stays within the amplitude around the centre line', () => {
  const d = wavePath(0, 100, { wavelength: 40, amplitude: 3, centerY: 5 });
  const ys = [...d.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(Math.min(...ys) >= 2 - 0.01 && Math.max(...ys) <= 8 + 0.01);
  assert.ok(d.startsWith('M0.00 5.00'));
  assert.equal(wavePath(10, 5, { wavelength: 40, amplitude: 3, centerY: 5 }), '');
});

test('determinate: wave, 4 dp gap, flat track, stop dot', () => {
  const p = determinatePieces(300, 0.42);
  assert.deepEqual(p.map((x) => x.kind), ['wave', 'track', 'dot']);
  assert.equal(p[0].from, 0);
  assert.equal(p[0].to, 126);
  assert.equal(p[1].from - p[0].to, WAVY.gap);
  assert.equal(p[1].to, 300);
  assert.deepEqual([p[2].from, p[2].to], [296, 300]);
});

test('determinate: 0 % is only the track, 100 % only the wave', () => {
  assert.deepEqual(determinatePieces(300, 0).map((x) => x.kind), ['track', 'dot']);
  assert.deepEqual(determinatePieces(300, 1).map((x) => x.kind), ['wave']);
  assert.equal(determinatePieces(300, 1)[0].amplitude, 0);
});

test('indeterminate: pieces stay inside the bar and keep the gap', () => {
  for (let c = 0; c <= 1; c += 0.05) {
    const p = indeterminatePieces(300, c).sort((a, b) => a.from - b.from);
    for (const x of p) assert.ok(x.from >= -0.001 && x.to <= 300.001 && x.to >= x.from);
    for (let i = 1; i < p.length; i++) assert.ok(p[i].from - p[i - 1].to >= WAVY.gap - 0.001);
  }
});

test('piece path insets the round caps', () => {
  const d = piecePath({ kind: 'track', from: 10, to: 50 }, { centerY: 5, phase: 0, wavelength: 40 });
  assert.equal(d, 'M12.00 5L48.00 5');
});

test('shapes: seven, same sampling, fit the unit circle', () => {
  assert.equal(SHAPES.length, 7);
  for (const s of SHAPES) {
    assert.equal(s.radii.length, SHAPE_POINTS);
    assert.ok(Math.max(...s.radii) <= 1 + 1e-9 && Math.min(...s.radii) > 0.4);
  }
});

test('morph: the ends are the shapes themselves, the middle is in between', () => {
  assert.equal(morphPath(0, 1, 0), morphPath(0, 0, 0));
  assert.equal(morphPath(0, 1, 1), morphPath(1, 1, 0));
  assert.notEqual(morphPath(0, 1, 0.5), morphPath(0, 1, 0));
  assert.ok(morphPath(2, 3, 0.3, 1).endsWith('Z'));
});

test('loading state cycles through the shapes', () => {
  assert.deepEqual(loadingState(0), { from: 0, to: 1, progress: 0, rotation: 0 });
  assert.equal(loadingState(650 * 7).from, 0);
  assert.equal(loadingState(650 * 8 - 1).to, 1);
});

test('loading state tolerates a time before the start (animation frame stamps)', () => {
  assert.deepEqual(loadingState(-5), loadingState(0));
});
