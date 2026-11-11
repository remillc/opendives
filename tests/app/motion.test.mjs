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
