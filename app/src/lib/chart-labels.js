// @ts-check
// The level labels of the planner chart ("83 ft · 54 min"): with several
// short levels they collided. The longest levels are labelled first; a label
// that would overlap one already placed is left out (the Levels rows give
// every value); each label stays inside the chart.

/**
 * @param {{ left: number, top: number, text: string, span: number }[]} labels
 *   left, top: the label's centre, % of the chart; span: the level's width, %
 * @param {{ width?: number, height?: number }} [size] a label's size, % of the chart
 * @returns {{ left: number, top: number, text: string }[]}
 */
export function placeLevelLabels(labels, size = {}) {
  const width = size.width ?? 30;
  const height = size.height ?? 16;
  /** @type {{ left: number, top: number, text: string }[]} */
  const kept = [];
  for (const label of [...labels].sort((a, b) => b.span - a.span)) {
    const left = Math.min(100 - width / 2, Math.max(width / 2, label.left));
    const clash = kept.some((k) => Math.abs(k.left - left) < width && Math.abs(k.top - label.top) < height);
    if (!clash) kept.push({ left, top: label.top, text: label.text });
  }
  return kept.sort((a, b) => a.left - b.left);
}
