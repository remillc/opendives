// @ts-check
// "Ardoise pour l’eau" (task 2026-11-12-76): the plan as a pocket card to print,
// its extra plans, its sizes by paper, and its layout. Nothing is computed here
// about decompression: every extra plan is a request for the core's planner
// (the same planDive call as the planner screen), and the card only lays out
// what the core returned. Pure functions, tested in tests/app/slate.test.mjs.

/** @typedef {{ depthMm: number, durationSeconds: number }} SlateLevel */
/** @typedef {{ o2Permille: number, hePermille: number }} SlateGas */

/** The depth step of "Plus 10 ft" (10 ft) and "Plus 3 m", in mm. */
export const FEET_STEP_MM = 3048;
export const METRE_STEP_MM = 3000;
/** The extra bottom time of "Plus 5 min au fond", in seconds. */
export const EXTRA_BOTTOM_SECONDS = 300;

const MM_PER_INCH = 25.4;
/** Inches to mm, to a tenth. @param {number} n */
const inch = (n) => Math.round(n * MM_PER_INCH * 10) / 10;

/** The sheet the PDF is printed on, mm. */
export const PAPERS = {
  letter: { widthMm: 215.9, heightMm: 279.4 },
  a4: { widthMm: 210, heightMm: 297 },
};

/**
 * The sizes of the card by paper region. The ids are the same for both, so that the
 * choice survives a change of the paper setting: standard is the default.
 * @typedef {Object} SlateSize
 * @property {'standard'|'small'|'full'} id
 * @property {number} widthMm
 * @property {number} heightMm
 * @property {string} nameKey i18n key of the name
 * @property {string} noteKey i18n key of the supporting text
 */

/** @param {boolean} letter true for US Letter regions @returns {SlateSize[]} */
export function slateSizes(letter) {
  if (letter) {
    return [
      { id: 'standard', widthMm: inch(4), heightMm: inch(6), nameKey: 'slate.size.letterStandard', noteKey: 'slate.size.letterStandardNote' },
      { id: 'small', widthMm: inch(3), heightMm: inch(5), nameKey: 'slate.size.letterSmall', noteKey: 'slate.size.letterSmallNote' },
      { id: 'full', ...PAPERS.letter, nameKey: 'slate.size.full', noteKey: 'settings.paperSize.letter' },
    ];
  }
  return [
    { id: 'standard', widthMm: 105, heightMm: 148, nameKey: 'slate.size.a4Standard', noteKey: 'slate.size.a4StandardNote' },
    { id: 'small', widthMm: 74, heightMm: 105, nameKey: 'slate.size.a4Small', noteKey: 'slate.size.a4SmallNote' },
    { id: 'full', ...PAPERS.a4, nameKey: 'slate.size.full', noteKey: 'settings.paperSize.a4' },
  ];
}

/** The size chosen, the default one for an id that does not exist. @param {boolean} letter @param {string} id */
export function slateSize(letter, id) {
  const sizes = slateSizes(letter);
  return sizes.find((s) => s.id === id) ?? sizes[0];
}

// --- The extra plans ------------------------------------------------------------

/**
 * @typedef {Object} SlateOptions
 * @property {boolean} plus5 the deepest level 5 min longer
 * @property {boolean} plusDepth every level 10 ft or 3 m deeper
 * @property {number[]} without indexes of the deco gases (cylinders after the first) to lose
 * @property {boolean} feet the diver's depth unit is feet
 */

/**
 * @typedef {Object} SlateVariant
 * @property {string} id 'plus5', 'plusDepth' or 'without-<cylinder index>'
 * @property {'plus5'|'plusDepth'|'without'} kind
 * @property {number} [cylinder] without: the cylinder lost
 * @property {import('opendives-core').PlanRequest} request the request for the core's planner
 */

/** The deco gases of a plan: every cylinder after the bottom gas. @param {unknown[]} cylinders @returns {number[]} */
export const decoGasIndexes = (cylinders) => cylinders.map((_, i) => i).slice(1);

/**
 * The requests of the extra plans, in the order of the columns: "+5 min", "+10 ft",
 * then one "Sans <gas>" per deco gas. Each is the plan's own request with one change;
 * the core plans each of them again.
 * @param {import('opendives-core').PlanRequest} request the plan's request
 * @param {SlateLevel[]|null} levels the plan's levels (the request's, or those of a measured profile simplified); null: none, so no "plus" plan
 * @param {SlateOptions} options
 * @returns {SlateVariant[]}
 */
export function variantRequests(request, levels, options) {
  /** @type {SlateVariant[]} */
  const out = [];
  const list = (levels ?? []).map((l) => ({ depthMm: l.depthMm, durationSeconds: l.durationSeconds }));
  if (list.length && options.plus5) {
    let deepest = 0;
    list.forEach((l, i) => {
      if (l.depthMm > list[deepest].depthMm) deepest = i;
    });
    const changed = list.map((l, i) => (i === deepest ? { ...l, durationSeconds: l.durationSeconds + EXTRA_BOTTOM_SECONDS } : l));
    out.push({ id: 'plus5', kind: 'plus5', request: { ...request, levels: changed } });
  }
  if (list.length && options.plusDepth) {
    const step = options.feet ? FEET_STEP_MM : METRE_STEP_MM;
    out.push({ id: 'plusDepth', kind: 'plusDepth', request: { ...request, levels: list.map((l) => ({ ...l, depthMm: l.depthMm + step })) } });
  }
  for (const cylinder of decoGasIndexes(request.cylinders)) {
    if (!options.without.includes(cylinder)) continue;
    out.push({
      id: `without-${cylinder}`,
      kind: 'without',
      cylinder,
      request: { ...request, cylinders: request.cylinders.filter((_, i) => i !== cylinder) },
    });
  }
  return out;
}

// --- The table ------------------------------------------------------------------

/**
 * @typedef {import('./plan-rows.js').PlanRow} PlanRow
 * @typedef {Object} SlateEntry a line of the card's table
 * @property {string} key
 * @property {PlanRow} row the base plan's row, or the extra plan's row when the base plan has none there
 * @property {boolean} inBase false: a stop only an extra plan makes, shown without the base plan's duration and Fin
 * @property {(number|null)[]} ends the Fin of each extra plan on this line, null where it has no such line
 */

/**
 * The key that matches a row of an extra plan with a row of the base plan: the planned
 * levels (descent and levels, and what lies between them) by their order, since an extra
 * plan may change their depth; the ascent and the stops by their depth, since a stop
 * may appear or disappear.
 * @param {PlanRow[]} rows @returns {string[]}
 */
function keysOf(rows) {
  let lastEntered = -1;
  rows.forEach((r, i) => {
    if (r.kind === 'descent' || r.kind === 'level') lastEntered = i;
  });
  /** @type {Map<number, number>} */
  const seen = new Map();
  return rows.map((r, i) => {
    if (i <= lastEntered) return `e${i}`;
    const n = seen.get(r.depthMm) ?? 0;
    seen.set(r.depthMm, n + 1);
    return `${r.depthMm}#${n}`;
  });
}

/**
 * The lines of the table: the base plan's rows, with the Fin of each extra plan matched by
 * row. A row an extra plan has and the base plan has not (a deeper stop) is inserted after
 * the row before it; a row the extra plan lacks has no Fin ("–" on the card). An extra plan
 * the core could not compute (null) has no Fin at all.
 * @param {PlanRow[]} base
 * @param {(PlanRow[]|null)[]} variants
 * @returns {SlateEntry[]}
 */
export function alignRows(base, variants) {
  const baseKeys = keysOf(base);
  /** @type {SlateEntry[]} */
  const entries = base.map((row, i) => ({ key: baseKeys[i], row, inBase: true, ends: variants.map(() => null) }));
  variants.forEach((rows, vi) => {
    if (!rows) return;
    const keys = keysOf(rows);
    /** @type {SlateEntry|null} */
    let previous = null;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      let entry = entries.find((e) => e.key === keys[i]);
      if (!entry) {
        entry = { key: keys[i], row, inBase: false, ends: variants.map(() => null) };
        entries.splice(previous ? entries.indexOf(previous) + 1 : 0, 0, entry);
      }
      entry.ends[vi] = row.endMinutes;
      previous = entry;
    }
  });
  return entries;
}

/** The symbol of a row's type. @param {PlanRow['kind']} kind */
export const rowSymbol = (kind) => ({ descent: '↓', level: '→', ascent: '↑', stop: '–' })[kind];

// --- The card -------------------------------------------------------------------

/**
 * What the card says, already written in the diver's units and language.
 * @typedef {Object} SlateCard
 * @property {string} title
 * @property {string} subtitle date, model, water
 * @property {string} gasLine the gases with their switch depth
 * @property {{ depth: string, gas: string, duration: string, end: string }} headers
 * @property {string[]} extraHeaders one per extra plan
 * @property {{ symbol: string, depth: string, gas: string, gasChange: boolean, duration: string, end: string, extra: string[] }[]} rows
 * @property {string} note
 * @property {string} gasNeeded
 * @property {string} oxygen
 * @property {string} footer
 */

const PT_MM = 25.4 / 72;
/** The width of a character, in ems, for tabular figures in a sans-serif. */
const CHAR_EM = 0.58;
const MIN_FONT_PT = 5;

/**
 * The numbers the card is laid out with, at real size. The font is the largest that fits the card's width
 * (the table's columns) and height (its rows), up to a base size by card size, and never under 5 pt.
 * @param {{ widthMm: number, heightMm: number }} size
 * @param {number} rowCount lines of the table
 * @param {number} extraColumns Fin columns of the extra plans
 * @param {number} [longestExtraHeader] characters of the longest extra header
 */
export function slateLayout(size, rowCount, extraColumns, longestExtraHeader = 6) {
  const { widthMm, heightMm } = size;
  const paddingMm = widthMm < 90 ? 3 : widthMm < 120 ? 4 : 10;
  const basePt = widthMm < 90 ? 6.5 : widthMm < 120 ? 8 : 10;
  const innerW = widthMm - 2 * paddingMm;
  const innerH = heightMm - 2 * paddingMm;
  // Characters across: type, depth, gas, Durée, Fin, the extra Fin columns (their header wraps to two lines), the cell padding.
  const chars = 2 + 7 + 8 + 3.5 + 3.5 + extraColumns * Math.max(4.5, Math.ceil(longestExtraHeader / 2) + 1) + (5 + extraColumns) * 1.3;
  // Lines down: title, date, gases (2), headers (2), the rows (1.5 each), note (2), gas needed (2), oxygen, footer, gaps.
  const lines = 15 + rowCount * 1.5;
  const byWidth = innerW / (chars * CHAR_EM);
  const byHeight = innerH / (lines * 1.3);
  const fontPt = Math.max(MIN_FONT_PT, Math.min(basePt, Math.floor((Math.min(byWidth, byHeight) / PT_MM) * 10) / 10));
  return { widthMm, heightMm, paddingMm, fontPt, titlePt: Math.round(fontPt * 1.2 * 10) / 10, footerPt: Math.max(4.5, Math.round(fontPt * 0.8 * 10) / 10) };
}

/** @param {string} s */
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/**
 * The card as HTML, black on white, with inline styles in mm and pt so that it prints at real
 * size (and the preview is the same markup, scaled). A fixed size: nothing in it depends on the
 * page's styles.
 * @param {SlateCard} card
 * @param {ReturnType<typeof slateLayout>} layout
 */
export function cardHtml(card, layout) {
  const cell = 'padding:0.25em 0.3em;border-top:0.2mm solid #1F2124;';
  const head = 'padding:0.1em 0.3em;font-weight:600;vertical-align:bottom;';
  const rows = card.rows
    .map(
      (r) =>
        `<tr><td style="${cell}">${esc(r.symbol)}</td><td style="${cell}font-weight:700">${esc(r.depth)}</td><td style="${cell}${r.gasChange ? 'font-weight:700;text-decoration:underline' : ''}">${esc(r.gas)}</td><td style="${cell}text-align:right">${esc(r.duration)}</td><td style="${cell}text-align:right;font-weight:700">${esc(r.end)}</td>${r.extra.map((e) => `<td style="${cell}text-align:right">${esc(e)}</td>`).join('')}</tr>`,
    )
    .join('');
  return `<div class="od-slate-card" style="box-sizing:border-box;width:${layout.widthMm}mm;height:${layout.heightMm}mm;overflow:hidden;padding:${layout.paddingMm}mm;background:#FFFFFF;color:#000000;font-family:Roboto,'Source Sans 3',Arial,sans-serif;font-size:${layout.fontPt}pt;line-height:1.25;font-variant-numeric:tabular-nums">`
    + `<div style="font-size:${layout.titlePt}pt;font-weight:700;line-height:1.2">${esc(card.title)}</div>`
    + `<div style="margin-top:0.15em">${esc(card.subtitle)}</div>`
    + `<div style="margin-top:0.3em">${esc(card.gasLine)}</div>`
    + `<table style="margin-top:0.6em;width:100%;border-collapse:collapse;font-size:inherit;line-height:1.2"><thead><tr><th style="${head}"></th><th style="${head}text-align:left">${esc(card.headers.depth)}</th><th style="${head}text-align:left">${esc(card.headers.gas)}</th><th style="${head}text-align:right">${esc(card.headers.duration)}</th><th style="${head}text-align:right">${esc(card.headers.end)}</th>${card.extraHeaders.map((h) => `<th style="${head}text-align:right">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`
    + `<div style="margin-top:0.6em">${esc(card.note)}</div>`
    + `<div style="margin-top:0.4em">${esc(card.gasNeeded)}</div>`
    + `<div style="margin-top:0.4em">${esc(card.oxygen)}</div>`
    + `<div style="margin-top:0.7em;font-size:${layout.footerPt}pt;color:#4B4A47">${esc(card.footer)}</div>`
    + `</div>`;
}

/** The distance of a cut mark from the card's corner, its length, mm. */
export const CUT_MARK_GAP_MM = 1.5;
export const CUT_MARK_LENGTH_MM = 4;
/** The card's distance from the sheet's top and left edges, mm. */
export const SHEET_MARGIN_MM = 12;

/**
 * The sheet to print: one page of the paper, the card at real size near the top left, four corner cut
 * marks. A card the size of the page is the page itself, without marks.
 * @param {SlateCard} card
 * @param {ReturnType<typeof slateLayout>} layout
 * @param {boolean} letter
 * @param {string} lang
 */
export function slatePageHtml(card, layout, letter, lang) {
  const paper = letter ? PAPERS.letter : PAPERS.a4;
  const full = layout.widthMm >= paper.widthMm - 1;
  const x = full ? 0 : SHEET_MARGIN_MM;
  const y = full ? 0 : SHEET_MARGIN_MM;
  /** @param {number} left @param {number} top @param {number} w @param {number} h */
  const line = (left, top, w, h) => `<div style="position:absolute;left:${left.toFixed(2)}mm;top:${top.toFixed(2)}mm;width:${w}mm;height:${h}mm;background:#000000"></div>`;
  let marks = '';
  if (!full) {
    const g = CUT_MARK_GAP_MM;
    const l = CUT_MARK_LENGTH_MM;
    const t = 0.2;
    const right = x + layout.widthMm;
    const bottom = y + layout.heightMm;
    for (const [cx, dx] of /** @type {[number, number][]} */ ([[x, -1], [right, 1]])) {
      for (const [cy, dy] of /** @type {[number, number][]} */ ([[y, -1], [bottom, 1]])) {
        // Horizontal and vertical stroke, outside the corner, each leaving a gap before the card.
        marks += line(dx < 0 ? cx - g - l : cx + g, cy - t / 2, l, t);
        marks += line(cx - t / 2, dy < 0 ? cy - g - l : cy + g, t, l);
      }
    }
  }
  return `<!DOCTYPE html><html lang="${esc(lang)}"><head><meta charset="utf-8"><style>
@page { size: ${letter ? 'letter' : 'A4'}; margin: 0; }
html, body { margin: 0; padding: 0; background: #FFFFFF; }
</style></head><body><div style="position:relative;width:${paper.widthMm}mm;height:${paper.heightMm - 2}mm;overflow:hidden">${marks}<div style="position:absolute;left:${x}mm;top:${y}mm">${cardHtml(card, layout)}</div></div></body></html>`;
}

/**
 * The card as plain text: the table with its columns aligned, for a message.
 * @param {SlateCard} card
 */
export function slateText(card) {
  const head = ['', card.headers.depth, card.headers.gas, card.headers.duration, card.headers.end, ...card.extraHeaders];
  const body = card.rows.map((r) => [r.symbol, r.depth, r.gas, r.duration, r.end, ...r.extra]);
  const all = [head, ...body];
  const widths = head.map((_, c) => Math.max(...all.map((row) => (row[c] ?? '').length)));
  // Depth and gas to the left, the numbers to the right.
  const table = all.map((row) => row.map((cell, c) => (c === 1 || c === 2 ? cell.padEnd(widths[c]) : cell.padStart(widths[c]))).join('  ').trimEnd());
  return [card.title, card.subtitle, card.gasLine, '', ...table, '', card.note, card.gasNeeded, card.oxygen, card.footer].join('\n');
}
