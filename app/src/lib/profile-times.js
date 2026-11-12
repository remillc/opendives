// @ts-check
// Entry and exit times and the average-depth line of the profile chart
// (spec, "Entry and exit times and average depth in the profile chart").

/**
 * Entry time (time zero) and exit time (the last sample: entry time plus the
 * length of the profile) as written in the user's time format.
 * @param {string|undefined} startIso local start of the dive, e.g. 2012-11-05T10:15:00
 * @param {number} profileSeconds length of the profile (time of the last sample)
 * @param {(iso: string, afterSeconds?: number) => string} formatTime
 * @returns {{ entry: string, exit: string }|null}
 */
export function entryExitTimes(startIso, profileSeconds, formatTime) {
  if (!startIso) return null;
  // Times are written to the minute: the exit is the nearest minute (10:00 +
  // 82:50 reads 11:23, as in the mock-up), not the one the formatter truncates to.
  const startSeconds = Number(startIso.slice(17, 19)) || 0;
  const exitAfter = Math.round((startSeconds + profileSeconds) / 60) * 60 - startSeconds;
  return { entry: formatTime(startIso), exit: formatTime(startIso, exitAfter) };
}

/**
 * The vertical place of the "moy. 58" label in the depth-label column: at the
 * height of the average line, moved up or down just enough not to overlap a
 * depth label, and kept inside the plot.
 * @param {number} lineY height of the average-depth line
 * @param {number[]} labelYs heights of the depth labels already drawn (their baseline minus 4)
 * @param {number} top highest allowed centre
 * @param {number} bottom lowest allowed centre
 * @param {number} [gap] minimum distance between two label centres
 * @returns {number} the centre of the label
 */
export function meanLabelY(lineY, labelYs, top, bottom, gap = 11) {
  const inside = (/** @type {number} */ v) => Math.min(bottom, Math.max(top, v));
  const free = (/** @type {number} */ v) => labelYs.every((l) => Math.abs(l - v) >= gap - 1e-9);
  const wanted = inside(lineY);
  if (free(wanted)) return wanted;
  const candidates = labelYs
    .flatMap((l) => [l - gap, l + gap])
    .map(inside)
    .filter(free)
    .sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted));
  return candidates[0] ?? wanted;
}
