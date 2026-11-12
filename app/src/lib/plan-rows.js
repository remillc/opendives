// @ts-check
// The rows of the plan table (task 73): the waypoints of the core's computed
// plan, selected and rounded as Subsurface's plan notes do (core/plannernotes.cpp,
// the non-verbatim table without "display transitions"). Nothing is computed here
// about decompression: the segments come from the core, this only decides which
// of them make a row and what to write on it.

/**
 * @typedef {Object} PlanSegment a waypoint of the plan, as the core returns it
 * @property {number} timeSeconds runtime at the end of the segment
 * @property {number} depthMm depth at the end of the segment
 * @property {number} cylinder index into the plan's cylinders
 * @property {boolean} entered typed by the diver (descent, levels), else calculated
 */

/**
 * @typedef {Object} PlanRow
 * @property {'descent'|'level'|'ascent'|'stop'} kind
 * @property {number} depthMm 0 for the final ascent to the surface
 * @property {boolean} surface
 * @property {number} startMinutes when to leave for this row
 * @property {number} durationMinutes
 * @property {number} endMinutes the surface row's end is the total runtime
 * @property {{o2Permille: number, hePermille: number}|null} gas set on the first row and where the gas changes (the chip)
 * @property {{o2Permille: number, hePermille: number}|null} breathed the gas of every row (task 2026-11-12-73 addendum: never an empty cell)
 * @property {number|null} speedMmMin descent and ascent rows: the planner setting that applies
 */

/** Minutes as Subsurface rounds them: (seconds + 30) / 60, integer division. @param {number} seconds */
export const roundMinutes = (seconds) => Math.floor((seconds + 30) / 60);

/** @param {{o2Permille: number, hePermille: number}|null} a @param {{o2Permille: number, hePermille: number}|null} b */
const differ = (a, b) => !a || !b || a.o2Permille !== b.o2Permille || a.hePermille !== b.hePermille;

/**
 * The rate a segment was flown at, as the planner setting it matches (within 10 %),
 * or null (instant descent, a very short transit).
 * @param {number} mmPerMin @param {(number|undefined)[]} candidates
 */
function settingFor(mmPerMin, candidates) {
  let best = null;
  for (const c of candidates) {
    if (!c || Math.abs(c - mmPerMin) > c * 0.1) continue;
    if (best === null || Math.abs(c - mmPerMin) < Math.abs(best - mmPerMin)) best = c;
  }
  return best;
}

/**
 * @param {{segments: PlanSegment[], cylinders: {o2Permille: number, hePermille: number}[], setup?: {descentMmMin?: number, ascent75MmMin?: number, ascent50MmMin?: number, ascentStopsMmMin?: number, ascentLast6mMmMin?: number}}} plan
 * @returns {PlanRow[]}
 */
export function planRows(plan) {
  const segments = plan.segments ?? [];
  const setup = plan.setup ?? {};
  const ascents = [setup.ascent75MmMin, setup.ascent50MmMin, setup.ascentStopsMmMin, setup.ascentLast6mMmMin];
  /** @type {PlanRow[]} */
  const rows = [];
  let lastDepth = 0;
  let lastTime = 0; // seconds, advanced by the minutes displayed so that rounding never accumulates
  let lastEntered = true;
  /** @type {{o2Permille: number, hePermille: number}|null} */
  let lastGas = null;
  let rawDepth = 0;
  let rawTime = 0;

  for (let i = 0; i < segments.length; i++) {
    const dp = segments[i];
    const next = segments[i + 1];
    const atEnd = !next;
    const previousDepth = rawDepth;
    const previousTime = rawTime;
    rawDepth = dp.depthMm;
    rawTime = dp.timeSeconds;

    const isAscent = dp.depthMm < lastDepth;
    const gas = plan.cylinders[dp.cylinder] ?? null;
    const newGas = next ? (plan.cylinders[next.cylinder] ?? null) : null;
    const changeAfter = !atEnd && differ(gas, newGas);
    const changeBefore = differ(lastGas, gas);
    const nextDeeperOrShallower = !atEnd && next.depthMm !== dp.depthMm;

    // Legs without anything useful, the final stay at the surface, tiny repeats.
    if (!dp.entered && !atEnd && dp.depthMm !== lastDepth && next.depthMm !== dp.depthMm && !changeBefore && !changeAfter) continue;
    if (lastDepth === 0 && dp.depthMm === 0 && atEnd) continue;
    if (dp.timeSeconds - lastTime < 10 && lastDepth === dp.depthMm && !(changeAfter && nextDeeperOrShallower)) continue;

    const show =
      dp.entered ||
      atEnd ||
      nextDeeperOrShallower ||
      (!isAscent && changeBefore && nextDeeperOrShallower) ||
      (changeAfter && lastEntered) ||
      (changeAfter && !isAscent) ||
      (isAscent && changeAfter && nextDeeperOrShallower) ||
      (lastEntered && !dp.entered && !atEnd && next.depthMm === dp.depthMm);

    if (show) {
      /** @type {PlanRow['kind']} */
      let kind;
      if (isAscent) kind = 'ascent';
      else if (dp.depthMm > lastDepth) kind = 'descent';
      else kind = dp.entered ? 'level' : 'stop';

      // The gas is written where it starts to be breathed; at the end of an ascent
      // that is followed by an entered segment, the gas of that segment.
      /** @type {PlanRow['gas']} */
      let shown = null;
      if (isAscent && changeAfter && !atEnd && next.entered) {
        shown = newGas;
        lastGas = newGas;
      } else if (changeBefore) {
        shown = gas;
        lastGas = gas;
      }

      const breathed = shown ?? lastGas;
      const minutes = roundMinutes(dp.timeSeconds - lastTime);
      let speed = null;
      if (kind === 'descent' || kind === 'ascent') {
        const seconds = dp.timeSeconds - previousTime;
        const rate = seconds > 0 ? (Math.abs(dp.depthMm - previousDepth) * 60) / seconds : 0;
        speed = settingFor(rate, kind === 'descent' ? [setup.descentMmMin] : ascents);
      }
      rows.push({
        kind,
        depthMm: dp.depthMm,
        surface: dp.depthMm === 0,
        startMinutes: Math.floor(lastTime / 60),
        durationMinutes: minutes,
        endMinutes: roundMinutes(dp.timeSeconds),
        gas: shown ? { o2Permille: shown.o2Permille, hePermille: shown.hePermille } : null,
        breathed: breathed ? { o2Permille: breathed.o2Permille, hePermille: breathed.hePermille } : null,
        speedMmMin: speed,
      });
      lastTime += minutes * 60;
    }
    lastDepth = dp.depthMm;
    lastEntered = dp.entered;
  }
  return rows;
}
