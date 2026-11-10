// @ts-check
// Search of the Sites section (spec, "Sites, search open and its animation"):
// a site matches when the typed text is part of its name or its country,
// ignoring case and accents. The matched part of the name is highlighted.

/** One character without its accents, lower case; the result may be longer or empty. @param {string} c */
const fold = (c) => c.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** @param {string} text */
export function normalise(text) {
  let out = '';
  for (const c of text) out += fold(c);
  return out.trim();
}

/**
 * @param {{name: string, country?: string}} site
 * @param {string} query
 */
export function matchesSite(site, query) {
  const q = normalise(query);
  if (!q) return true;
  return normalise(site.name).includes(q) || normalise(site.country ?? '').includes(q);
}

/**
 * The name cut in parts, the ones that match the query marked. The name is
 * kept as is: only the cuts are computed on the folded text.
 * @param {string} name
 * @param {string} query
 * @returns {{text: string, match: boolean}[]}
 */
export function highlightParts(name, query) {
  const q = normalise(query);
  if (!q || !name) return [{ text: name, match: false }];
  // The folded text, and for each folded character the index of its source character.
  let folded = '';
  /** @type {number[]} */
  const source = [];
  const chars = [...name];
  chars.forEach((c, i) => {
    for (const f of fold(c)) {
      folded += f;
      source.push(i);
    }
  });
  const at = folded.indexOf(q);
  if (at < 0) return [{ text: name, match: false }];
  const from = source[at];
  const to = source[at + q.length - 1] + 1;
  return [
    { text: chars.slice(0, from).join(''), match: false },
    { text: chars.slice(from, to).join(''), match: true },
    { text: chars.slice(to).join(''), match: false },
  ].filter((p) => p.text);
}
