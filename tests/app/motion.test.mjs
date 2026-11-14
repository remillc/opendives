// Material 3 Expressive motion tokens: springs sampled into CSS linear() easings.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SPRINGS, motionSpring, motionVariables, applyMotionTokens } from '../../app/src/lib/motion.js';
import { springEasing } from '../../app/src/lib/spring.js';

/** @param {string} css @returns {number[]} */
const points = (css) => css.replace(/^linear\(|\)$/g, '').split(',').map(Number);

test('the token table holds the Expressive scheme', () => {
  assert.deepEqual(SPRINGS['spatial-fast'], { stiffness: 800, damping: 0.6 });
  assert.deepEqual(SPRINGS['spatial-default'], { stiffness: 380, damping: 0.8 });
  assert.deepEqual(SPRINGS['spatial-slow'], { stiffness: 200, damping: 0.8 });
  assert.deepEqual(SPRINGS['effects-fast'], { stiffness: 3800, damping: 1 });
  assert.deepEqual(SPRINGS['effects-default'], { stiffness: 1600, damping: 1 });
  assert.deepEqual(SPRINGS['effects-slow'], { stiffness: 800, damping: 1 });
});

test('curves start at 0 and end at 1', () => {
  for (const name of Object.keys(SPRINGS)) {
    const p = points(motionSpring(name).css);
    assert.equal(p[0], 0, name);
    assert.equal(p[p.length - 1], 1, name);
  }
});

test('spatial springs overshoot, effects and anchored springs never do', () => {
  for (const name of Object.keys(SPRINGS)) {
    const max = Math.max(...points(motionSpring(name).css));
    if (name.startsWith('spatial')) assert.ok(max > 1.01, `${name} overshoots`);
    else assert.ok(max <= 1, `${name} stays under 1`);
  }
});

test('a stiffer spring settles sooner; durations stay short', () => {
  assert.ok(motionSpring('effects-fast').ms < motionSpring('effects-default').ms);
  assert.ok(motionSpring('effects-default').ms < motionSpring('effects-slow').ms);
  assert.ok(motionSpring('spatial-default').ms < motionSpring('spatial-slow').ms);
  for (const name of Object.keys(SPRINGS)) assert.ok(motionSpring(name).ms <= 700, name);
});

test('the settle time matches the spring equation', () => {
  // Critically damped, stiffness 100: (1 + 10t) e^(-10t) <= 0.001 at about 0.92 s.
  const { ms } = springEasing(100, 1);
  assert.ok(ms > 900 && ms < 950, String(ms));
});

test('variables are --od-motion-<name> and -ms, for every token', () => {
  const vars = motionVariables();
  assert.equal(Object.keys(vars).length, Object.keys(SPRINGS).length * 2);
  assert.match(vars['--od-motion-spatial-default'], /^linear\(/);
  assert.match(vars['--od-motion-spatial-default-ms'], /^\d+ms$/);
});

test('an unknown token is an error', () => {
  assert.throws(() => motionSpring('nope'));
});

test('tokens are declared on Android only', () => {
  /** @param {string[]} classes */
  const root = (classes) => {
    /** @type {Record<string, string>} */
    const set = {};
    return { classList: { contains: (/** @type {string} */ c) => classes.includes(c) }, style: { setProperty: (/** @type {string} */ k, /** @type {string} */ v) => { set[k] = v; } }, set };
  };
  const ios = root(['ios']);
  applyMotionTokens(/** @type {any} */ (ios));
  assert.equal(Object.keys(ios.set).length, 0);
  const md = root(['md']);
  applyMotionTokens(/** @type {any} */ (md));
  assert.ok(md.set['--od-motion-spatial-fast']);
});

// A screen released by the finger (lib/swipe.js): the spring starts at the finger's speed.
test('a spring released at rest is the same with velocity 0', () => {
  assert.deepEqual(springEasing(800, 1, 0.005, 32, 0), springEasing(800, 1, 0.005, 32));
  assert.deepEqual(springEasing(380, 0.8, 0.005, 32, 0), springEasing(380, 0.8, 0.005, 32));
});

test('a released spring starts at the given speed', () => {
  for (const [stiffness, damping] of [[800, 1], [380, 0.8]]) {
    for (const v of [5, 20, -4]) {
      const { css, ms } = springEasing(stiffness, damping, 0.005, 400, v);
      const p = points(css);
      // Slope of the first segment, in distances per second.
      const slope = p[1] / (ms / 1000 / 400);
      assert.ok(Math.abs(slope - v) < Math.max(1, Math.abs(v) * 0.08), `${stiffness}/${damping} at ${v}: ${slope}`);
      assert.equal(p.at(-1), 1);
    }
  }
});

test('settle: the anchored fast spring, from the finger, never past the target', async () => {
  const { settle } = await import('../../app/src/lib/swipe.js');
  assert.deepEqual(settle(100, 100.5, 3), { easing: 'linear', ms: 0 });
  // A flick to the left far quicker than the spring: its speed is capped, no overshoot.
  for (const [from, to, v] of [[-80, -400, -9], [-80, -400, -0.5], [-80, 0, -1], [40, 400, 2], [-80, 0, 0]]) {
    const { easing, ms } = settle(from, to, v);
    const p = points(easing);
    assert.ok(Math.max(...p) <= 1.0001, `${from}→${to} at ${v}: ${Math.max(...p)}`);
    assert.ok(ms > 0 && ms <= 400, `${ms} ms`);
  }
  // Towards the target, a quicker finger gives a steeper start.
  const slow = points(settle(-80, -400, -0.5).easing)[1];
  const fast = points(settle(-80, -400, -3).easing)[1];
  assert.ok(fast > slow);
});
