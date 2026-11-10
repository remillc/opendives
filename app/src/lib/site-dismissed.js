// @ts-check
// "Not duplicates": the pairs of sites the diver said are distinct. The
// decision is kept on this device only (the Subsurface log has no clean field
// for it, see docs/agent-inbox.md task 2026-11-10-04). A mark holds the name
// and position of both sites when it was made, and stops counting as soon as
// either site changes name or position, so the pair can be proposed again.

/** @param {number} a @param {number} b */
export function pairKey(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/**
 * What identifies a pair for the mark: both sites' names and positions, in uuid order.
 * @typedef {{uuid: number, name: string, hasLocation: boolean, latUdeg: number, lonUdeg: number}} SiteLike
 * @param {SiteLike} a @param {SiteLike} b
 */
export function pairFingerprint(a, b) {
  const [x, y] = a.uuid < b.uuid ? [a, b] : [b, a];
  const one = (/** @type {SiteLike} */ s) => JSON.stringify([s.name, s.hasLocation ? [s.latUdeg, s.lonUdeg] : null]);
  return `${one(x)}|${one(y)}`;
}

/**
 * Reads the stored marks: an object key -> fingerprint. The first version
 * stored an array of keys; those marks have no fingerprint and stay valid.
 * @param {string|null} raw
 * @returns {Record<string, string>}
 */
export function parseMarks(raw) {
  try {
    const v = JSON.parse(raw ?? '{}');
    if (Array.isArray(v)) return Object.fromEntries(v.filter((k) => typeof k === 'string').map((k) => [k, '']));
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/**
 * Whether the pair is marked and nothing changed since.
 * @param {Record<string, string>} marks @param {SiteLike} a @param {SiteLike} b
 */
export function isDismissed(marks, a, b) {
  const fp = marks[pairKey(a.uuid, b.uuid)];
  return fp !== undefined && (fp === '' || fp === pairFingerprint(a, b));
}

/** @param {Record<string, string>} marks @param {SiteLike} a @param {SiteLike} b */
export function withMark(marks, a, b) {
  return { ...marks, [pairKey(a.uuid, b.uuid)]: pairFingerprint(a, b) };
}

/** @param {Record<string, string>} marks @param {SiteLike} a @param {SiteLike} b */
export function withoutMark(marks, a, b) {
  const { [pairKey(a.uuid, b.uuid)]: _, ...rest } = marks;
  return rest;
}
