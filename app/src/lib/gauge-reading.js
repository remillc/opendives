// @ts-check
// Reading cylinder pressures from a photo (docs/ui-specification.md, "Reading
// cylinder pressures from a photo"). The native side only returns the text
// blocks it recognised, with their boxes and confidences; every rule is here:
// number-shaped tokens, grouping into one or two gauges ordered left to right,
// the unit, plausibility, the confidence threshold and the conversion.

const MBAR_PER_PSI = 68.947572932;

/** A recognised text block. Box coordinates are fractions (0 to 1) of the analysed image. */
/**
 * @typedef {Object} TextBlock
 * @property {string} text
 * @property {number} left
 * @property {number} top
 * @property {number} right
 * @property {number} bottom
 * @property {number} confidence 0 to 1; a recogniser that gives none reports 1
 */

/**
 * @typedef {Object} GaugeReading
 * @property {number} mbar the pressure in mbar, as the core stores it
 * @property {'bar'|'psi'} unit the unit the gauge shows
 * @property {number} value the number as the gauge shows it, in that unit
 * @property {number} x horizontal centre in the image, 0 (left) to 1 (right)
 * @property {number} confidence
 */

/** A value is shown only from this recogniser confidence (to tune on real photos). */
export const MIN_CONFIDENCE = 0.8;
/** Plausible pressures: a cylinder is never above these. */
export const MAX_BAR = 350;
export const MAX_PSI = 5000;
/** Above this number with no printed unit, the gauge is read in psi. */
export const PSI_FROM = 400;
/** Two tokens closer than this (fraction of the image width, between their boxes) belong to one gauge. */
export const GROUP_GAP = 0.12;
/** A unit word farther than this from a gauge (same measure) is not its unit. */
const UNIT_REACH = 0.2;
/** At most two gauges are read in one picture. */
const MAX_GAUGES = 2;

/**
 * @param {number} value
 * @param {'bar'|'psi'} unit
 */
export function toMbar(value, unit) {
  return Math.round(unit === 'psi' ? value * MBAR_PER_PSI : value * 1000);
}

/**
 * @param {number} value
 * @param {'bar'|'psi'} unit
 */
export function isPlausible(value, unit) {
  return value > 0 && value <= (unit === 'psi' ? MAX_PSI : MAX_BAR);
}

/**
 * The unit written in a text: "bar", "psi" (case does not matter), alone or
 * after a number; null when none.
 * @param {string} text
 * @returns {'bar'|'psi'|null}
 */
export function printedUnit(text) {
  const m = /(?:^|[^a-z])(bar|psi)(?![a-z])/i.exec(text);
  return m ? /** @type {'bar'|'psi'} */ (m[1].toLowerCase()) : null;
}

/**
 * The number-shaped tokens of a text: digits, with a decimal comma or point,
 * and a thousands space ("2 950"). Anything else is ignored.
 * @param {string} text
 * @returns {number[]}
 */
export function numberTokens(text) {
  const cleaned = text.replace(/(\d)[   ](?=\d{3}(?!\d))/g, '$1');
  const found = cleaned.match(/\d+(?:[.,]\d+)?/g) ?? [];
  return found.map((s) => Number(s.replace(',', '.'))).filter((n) => Number.isFinite(n));
}

/**
 * @param {TextBlock} a
 * @param {TextBlock} b
 */
function gap(a, b) {
  return Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
}

const area = (/** @type {TextBlock} */ b) => (b.right - b.left) * (b.bottom - b.top);
const centre = (/** @type {TextBlock} */ b) => (b.left + b.right) / 2;

/**
 * Reads the gauges of one picture.
 * @param {TextBlock[]} blocks
 * @param {{ userUnit: 'bar'|'psi', minConfidence?: number }} options userUnit: the diver's pressure unit
 * @returns {GaugeReading[]} one or two readings, left to right; empty when nothing is read
 */
export function readGauges(blocks, { userUnit, minConfidence = MIN_CONFIDENCE }) {
  /** @type {{ box: TextBlock, value: number }[]} */
  const numbers = [];
  /** @type {{ box: TextBlock, unit: 'bar'|'psi' }[]} */
  const units = [];
  for (const b of blocks) {
    if (!b || !(b.confidence >= minConfidence)) continue;
    const unit = printedUnit(b.text);
    if (unit) units.push({ box: b, unit });
    const nums = numberTokens(b.text);
    // A block of several numbers is not one gauge reading: keep it only when it has one.
    if (nums.length === 1) numbers.push({ box: b, value: nums[0] });
  }
  if (!numbers.length) return [];

  // Single-linkage grouping by horizontal gap.
  /** @type {{ box: TextBlock, value: number }[][]} */
  const groups = [];
  for (const n of [...numbers].sort((a, b) => a.box.left - b.box.left)) {
    const near = groups.filter((g) => g.some((m) => gap(m.box, n.box) < GROUP_GAP));
    if (!near.length) groups.push([n]);
    else {
      near[0].push(n);
      for (const extra of near.slice(1)) {
        near[0].push(...extra);
        groups.splice(groups.indexOf(extra), 1);
      }
    }
  }

  // The main number of a gauge is its biggest one.
  const mains = groups.map((g) => g.reduce((best, n) => (area(n.box) > area(best.box) ? n : best)));
  const kept = [...mains].sort((a, b) => area(b.box) - area(a.box)).slice(0, MAX_GAUGES);
  kept.sort((a, b) => centre(a.box) - centre(b.box));

  /** @type {GaugeReading[]} */
  const readings = [];
  for (const n of kept) {
    // The unit printed with the number, else the nearest printed unit within reach, else the range, else the diver's.
    let unit = printedUnit(n.box.text);
    if (!unit) {
      const near = units
        .map((u) => ({ u, d: gap(u.box, n.box) }))
        .filter((x) => x.d <= UNIT_REACH)
        .sort((a, b) => a.d - b.d)[0];
      if (near) unit = near.u.unit;
    }
    if (!unit) unit = n.value > PSI_FROM ? 'psi' : userUnit;
    if (!isPlausible(n.value, unit)) continue;
    readings.push({ mbar: toMbar(n.value, unit), unit, value: n.value, x: centre(n.box), confidence: n.box.confidence });
  }
  return readings;
}
