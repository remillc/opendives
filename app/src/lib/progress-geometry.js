// @ts-check
// Geometry of the Material 3 Expressive progress components (pure functions,
// tested in tests/app/progress-geometry.test.mjs).
//
// Linear wavy progress indicator (<LinearWavyProgress>): the values follow
// Compose Material 3's LinearWavyProgressIndicator defaults: stroke 4 dp,
// track gap 4 dp, stop dot 4 dp, wave amplitude 3 dp (so the indicator is
// 10 dp high), wavelength 40 dp when determinate and 20 dp when
// indeterminate. All lines have round caps.
//
// Loading indicator (<LoadingIndicator>): the shapes of Compose Material 3's
// LoadingIndicator (soft burst, 9-sided cookie, pentagon, pill, sunny,
// 4-sided cookie, oval) as radius functions of the angle; two shapes are
// morphed by interpolating their radii at the same angles.

export const WAVY = Object.freeze({
  stroke: 4,
  gap: 4,
  dot: 4,
  amplitude: 3,
  wavelengthDeterminate: 40,
  wavelengthIndeterminate: 20,
  height: 10,
});

/**
 * Amplitude factor (0..1) of the wave of a determinate indicator: the wave
 * flattens near 0 % and near 100 % (smooth ramp over the first 10 % and the
 * last 5 % of the progress).
 * @param {number} value progress, 0..1
 */
export function amplitudeFactor(value) {
  const v = Math.min(1, Math.max(0, value));
  if (v <= 0.1) return v / 0.1;
  if (v >= 0.95) return (1 - v) / 0.05;
  return 1;
}

/**
 * Polyline path of a wave over the horizontal extent [from, to] (px). The
 * wave is a sine of the absolute x position, so successive frames only
 * differ by `phase`, a distance in px (the wave moves right when it grows).
 * @param {number} from
 * @param {number} to
 * @param {{ wavelength: number, amplitude: number, centerY: number, phase?: number, step?: number }} o
 * @returns {string} SVG path data, "" when the extent is empty
 */
export function wavePath(from, to, { wavelength, amplitude, centerY, phase = 0, step = 2 }) {
  if (!(to >= from)) return '';
  const y = (/** @type {number} */ x) => centerY + amplitude * Math.sin((2 * Math.PI * (x - phase)) / wavelength);
  const n = Math.max(1, Math.ceil((to - from) / step));
  let d = '';
  for (let i = 0; i <= n; i++) {
    const x = from + ((to - from) * i) / n;
    d += `${i ? 'L' : 'M'}${x.toFixed(2)} ${y(x).toFixed(2)}`;
  }
  return d;
}

/**
 * @typedef {{ kind: 'wave'|'track'|'dot', from: number, to: number, amplitude?: number }} Piece
 * A piece to draw: its visible extent in px (round caps included).
 */

/**
 * Determinate indicator: the wave for the done part, a gap, the flat track
 * and a stop dot at its end.
 * @param {number} width total width, px
 * @param {number} value progress, 0..1
 * @returns {Piece[]}
 */
export function determinatePieces(width, value) {
  const v = Math.min(1, Math.max(0, value));
  const { stroke, gap, dot } = WAVY;
  /** @type {Piece[]} */
  const pieces = [];
  const done = v * width;
  if (v > 0) pieces.push({ kind: 'wave', from: 0, to: Math.max(done, stroke), amplitude: amplitudeFactor(v) });
  const trackFrom = v > 0 ? Math.max(done, stroke) + gap : 0;
  if (trackFrom < width) {
    pieces.push({ kind: 'track', from: trackFrom, to: width });
    pieces.push({ kind: 'dot', from: width - dot, to: width });
  }
  return pieces;
}

/** @param {number} t 0..1 */
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** @param {number} t @param {number} a @param {number} b */
const ramp = (t, a, b) => easeInOut(Math.min(1, Math.max(0, (t - a) / (b - a))));

/**
 * Indeterminate indicator at a moment of its cycle: two wave segments that
 * run across (the second one catching up with a delay), the flat track in
 * the gaps between them, no stop dot.
 * @param {number} width total width, px
 * @param {number} cycle position in the cycle, 0..1
 * @returns {Piece[]}
 */
export function indeterminatePieces(width, cycle) {
  const { stroke, gap } = WAVY;
  /** @type {[number, number][]} fractions [tail, head] of the two segments */
  const raw = [
    [ramp(cycle, 0.25, 0.85), ramp(cycle, 0, 0.6)],
    [ramp(cycle, 0.6, 1), ramp(cycle, 0.35, 0.8)],
  ];
  /** @type {[number, number][]} */
  const segs = [];
  for (const [tail, head] of raw) {
    const from = tail * width;
    const to = head * width;
    if (to - from >= 1) segs.push([from, Math.max(to, from + stroke)]);
  }
  segs.sort((a, b) => a[0] - b[0]);
  // Merge segments that overlap or are closer than the gap.
  /** @type {[number, number][]} */
  const merged = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && s[0] <= last[1] + gap) last[1] = Math.max(last[1], s[1]);
    else merged.push([s[0], s[1]]);
  }
  /** @type {Piece[]} */
  const pieces = merged.map(([from, to]) => ({ kind: /** @type {const} */ ('wave'), from, to: Math.min(to, width), amplitude: 1 }));
  let cursor = 0;
  for (const [from, to] of merged) {
    const end = from - gap;
    if (end - cursor >= 1) pieces.push({ kind: 'track', from: cursor, to: end });
    cursor = Math.min(to, width) + gap;
  }
  if (width - cursor >= 1) pieces.push({ kind: 'track', from: cursor, to: width });
  return pieces;
}

/**
 * SVG path data of a piece: the extent is the visible one, so the round caps
 * are accounted for by insetting the line by half the stroke.
 * @param {Piece} piece
 * @param {{ centerY: number, phase: number, wavelength: number }} o
 */
export function piecePath(piece, { centerY, phase, wavelength }) {
  const r = WAVY.stroke / 2;
  const a = piece.from + r;
  const b = Math.max(piece.to - r, a);
  if (piece.kind === 'wave') {
    return wavePath(a, b, { wavelength, amplitude: WAVY.amplitude * (piece.amplitude ?? 1), centerY, phase });
  }
  return `M${a.toFixed(2)} ${centerY}L${b.toFixed(2)} ${centerY}`;
}

// ---- Loading indicator ----

/** Number of points of a shape outline. */
export const SHAPE_POINTS = 120;

/**
 * Superellipse radius at angle `a`.
 * @param {number} a @param {number} ax @param {number} by @param {number} p
 */
function superellipse(a, ax, by, p) {
  return Math.pow(Math.pow(Math.abs(Math.cos(a) / ax), p) + Math.pow(Math.abs(Math.sin(a) / by), p), -1 / p);
}

/** Radius of a regular polygon (circumradius 1) at angle `a`, a vertex pointing up. */
function polygon(/** @type {number} */ a, /** @type {number} */ n) {
  const sector = (2 * Math.PI) / n;
  const local = ((((a + Math.PI / 2) % sector) + sector) % sector) - sector / 2;
  return Math.cos(Math.PI / n) / Math.cos(local);
}

/** Circular moving average: rounds the corners of a radius table. */
function smooth(/** @type {number[]} */ radii, /** @type {number} */ window) {
  const n = radii.length;
  return radii.map((_, i) => {
    let s = 0;
    for (let k = -window; k <= window; k++) s += radii[(i + k + n) % n];
    return s / (2 * window + 1);
  });
}

/** @param {(a: number) => number} f */
const table = (f) => Array.from({ length: SHAPE_POINTS }, (_, i) => f((2 * Math.PI * i) / SHAPE_POINTS));

/**
 * The shapes of the loading indicator, in the order of Compose's
 * LoadingIndicatorDefaults.IndeterminateIndicatorPolygons, as radius tables
 * scaled to fit the unit circle.
 * @type {{ name: string, radii: number[] }[]}
 */
export const SHAPES = (() => {
  /** @type {[string, number[]][]} */
  const raw = [
    ['softBurst', table((a) => 1 + 0.13 * Math.cos(10 * a))],
    ['cookie9', table((a) => 1 + 0.08 * Math.cos(9 * a + Math.PI))],
    ['pentagon', smooth(table((a) => polygon(a, 5)), 4)],
    ['pill', table((a) => superellipse(a, 1, 0.58, 5))],
    ['sunny', smooth(table((a) => 1 + 0.2 * Math.sign(Math.cos(8 * a)) * Math.pow(Math.abs(Math.cos(8 * a)), 0.7)), 1)],
    ['cookie4', table((a) => superellipse(a, 1, 1, 3.2) * (1 + 0.06 * Math.cos(4 * a)))],
    ['oval', table((a) => superellipse(a, 1, 0.72, 2))],
  ];
  return raw.map(([name, radii]) => {
    const max = Math.max(...radii);
    return { name, radii: radii.map((r) => r / max) };
  });
})();

/**
 * Closed SVG path of a shape (or a morph between two), centred on (0,0),
 * turned by `rotation` radians.
 * @param {number} from index in SHAPES
 * @param {number} to index in SHAPES
 * @param {number} progress morph progress, 0 = `from`, 1 = `to`
 * @param {number} [rotation] radians
 * @param {number} [radius] outer radius
 */
export function morphPath(from, to, progress, rotation = 0, radius = 1) {
  const a = SHAPES[from].radii;
  const b = SHAPES[to].radii;
  let d = '';
  for (let i = 0; i < SHAPE_POINTS; i++) {
    const r = (a[i] + (b[i] - a[i]) * progress) * radius;
    const ang = (2 * Math.PI * i) / SHAPE_POINTS + rotation;
    d += `${i ? 'L' : 'M'}${(r * Math.cos(ang)).toFixed(3)} ${(r * Math.sin(ang)).toFixed(3)}`;
  }
  return d + 'Z';
}

/**
 * State of the loading indicator at time `ms`: each shape is held, then
 * morphs into the next one with an ease-in-out, while turning.
 * @param {number} ms
 * @returns {{ from: number, to: number, progress: number, rotation: number }}
 */
export function loadingState(ms) {
  ms = Math.max(0, ms);
  const step = 650;
  const hold = 0.35;
  const n = SHAPES.length;
  const k = Math.floor(ms / step);
  const t = (ms - k * step) / step;
  const progress = t <= hold ? 0 : easeInOut((t - hold) / (1 - hold));
  const rotation = ((ms / (step * n)) * 4 * Math.PI) % (2 * Math.PI);
  return { from: k % n, to: (k + 1) % n, progress, rotation };
}
