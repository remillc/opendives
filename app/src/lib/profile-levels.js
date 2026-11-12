// @ts-check
// Turns the measured profile of a logbook dive into a few planner levels
// (planner "Simplifier le profil", task 2026-11-12-68).
//
// Algorithm:
// 1. Resample the profile every STEP_S seconds (linear interpolation) and take
//    a running median over MEDIAN_WINDOW points, so that a spike or noise of a
//    few seconds disappears.
// 2. Cut the series into phases, greedily: a point joins the current phase
//    while the phase stays within a band of twice the tolerance, the tolerance
//    being 10 % of the deepest depth of the phase or 3 m, whichever is larger.
//    The descent and the ascent cross bands quickly, so they make short
//    phases of their own.
// 3. A phase's depth is the median of its points; its duration is the time of
//    the points within the tolerance of that depth, so the transit towards
//    the next phase is not counted (the planner adds the descent and the
//    ascent itself).
// 4. Phases shorter than MIN_PHASE_S are dropped, and so are those shallower
//    than the minimum tolerance (3 m: the surface, a snorkel moment), unless
//    nothing else remains. Neighbours left within the tolerance of each other
//    are merged (duration-weighted depth). Above MAX_LEVELS, the two adjacent
//    levels closest in depth are merged until the limit is met.
// 5. Depths are rounded to 100 mm and durations to whole minutes (one minute
//    at least). Units are the core's: millimetres and seconds.
// A dive with no usable phase gives one level at its maximum depth.

/** Resampling step, seconds. */
const STEP_S = 10;
/** Running median window, points (an odd number). */
const MEDIAN_WINDOW = 5;
/** Phases shorter than this are dropped, seconds. */
const MIN_PHASE_S = 120;
/** Smallest tolerance, and depth under which a phase is the surface, mm. */
const MIN_TOLERANCE_MM = 3000;
/** Share of the depth taken as tolerance. */
const TOLERANCE_RATIO = 0.1;
/** The most levels a simplified profile has. */
const MAX_LEVELS = 6;

/** @typedef {{ depthMm: number, durationSeconds: number }} Level */

/** @param {number} depthMm */
const tolerance = (depthMm) => Math.max(MIN_TOLERANCE_MM, TOLERANCE_RATIO * depthMm);

/** @param {number[]} values */
function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * The depth every STEP_S seconds, linearly interpolated.
 * @param {number[]} times @param {number[]} depths
 */
function resample(times, depths) {
  const out = [];
  let j = 0;
  const end = times[times.length - 1];
  for (let t = times[0]; t <= end; t += STEP_S) {
    while (j < times.length - 2 && times[j + 1] < t) j++;
    const t0 = times[j];
    const t1 = times[j + 1];
    const f = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
    out.push(depths[j] + (depths[j + 1] - depths[j]) * f);
  }
  return out;
}

/**
 * @param {{ timeSeconds: number[], depthMm: number[] }} samples
 * @returns {Level[]} chronological; empty when the profile has no usable sample
 */
export function simplifyProfile(samples) {
  const pairs = [];
  const n = Math.min(samples?.timeSeconds?.length ?? 0, samples?.depthMm?.length ?? 0);
  for (let i = 0; i < n; i++) {
    const t = samples.timeSeconds[i];
    const d = samples.depthMm[i];
    if (Number.isFinite(t) && Number.isFinite(d) && (!pairs.length || t > pairs[pairs.length - 1][0])) pairs.push([t, Math.max(0, d)]);
  }
  if (pairs.length < 2) return [];
  const grid = resample(
    pairs.map((p) => p[0]),
    pairs.map((p) => p[1]),
  );
  const half = MEDIAN_WINDOW >> 1;
  const smooth = grid.map((_, i) => median(grid.slice(Math.max(0, i - half), i + half + 1)));
  const deepest = Math.max(...smooth);
  if (deepest <= 0) return [];

  // Phases: runs of points inside a band.
  /** @type {number[][]} */
  const runs = [];
  let run = /** @type {number[]} */ ([]);
  let lo = 0;
  let hi = 0;
  for (const d of smooth) {
    const nlo = run.length ? Math.min(lo, d) : d;
    const nhi = run.length ? Math.max(hi, d) : d;
    if (run.length && nhi - nlo > 2 * tolerance(nhi)) {
      runs.push(run);
      run = [];
      lo = hi = d;
    } else {
      lo = nlo;
      hi = nhi;
    }
    run.push(d);
  }
  if (run.length) runs.push(run);

  /** @type {Level[]} */
  let levels = runs.map((points) => {
    const depthMm = median(points);
    const near = points.filter((d) => Math.abs(d - depthMm) <= tolerance(depthMm)).length;
    return { depthMm, durationSeconds: near * STEP_S };
  });

  const deepestPhase = levels.reduce((a, b) => (b.depthMm > a.depthMm || (b.depthMm === a.depthMm && b.durationSeconds > a.durationSeconds) ? b : a));
  const kept = levels.filter((l) => l.durationSeconds >= MIN_PHASE_S && l.depthMm >= MIN_TOLERANCE_MM);
  levels = kept.length ? kept : [deepestPhase];

  // Neighbours within the tolerance of each other are one phase.
  /** @param {Level} a @param {Level} b @returns {Level} */
  const join = (a, b) => ({
    depthMm: (a.depthMm * a.durationSeconds + b.depthMm * b.durationSeconds) / (a.durationSeconds + b.durationSeconds),
    durationSeconds: a.durationSeconds + b.durationSeconds,
  });
  for (let merged = true; merged; ) {
    merged = false;
    for (let i = 0; i + 1 < levels.length; i++) {
      if (Math.abs(levels[i].depthMm - levels[i + 1].depthMm) <= tolerance(Math.max(levels[i].depthMm, levels[i + 1].depthMm))) {
        levels.splice(i, 2, join(levels[i], levels[i + 1]));
        merged = true;
        break;
      }
    }
  }
  while (levels.length > MAX_LEVELS) {
    let at = 0;
    for (let i = 1; i + 1 < levels.length; i++) {
      if (Math.abs(levels[i].depthMm - levels[i + 1].depthMm) < Math.abs(levels[at].depthMm - levels[at + 1].depthMm)) at = i;
    }
    levels.splice(at, 2, join(levels[at], levels[at + 1]));
  }

  return levels.map((l) => ({
    depthMm: Math.max(100, Math.round(l.depthMm / 100) * 100),
    durationSeconds: Math.max(60, Math.round(l.durationSeconds / 60) * 60),
  }));
}
