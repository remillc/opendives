// @ts-check
// "Ardoise pour l’eau" (task 2026-11-12-76): writes the card in the diver's units and
// language from the core's plans, and ends in the system share sheet as a PDF to print
// (one Letter or A4 page, the card at real size with cut marks), a PNG (the card alone)
// or a text. The layout and the matching of rows are slate.js (tested); the plans come
// from the core (one planDive call per extra plan, made by the page).
import { Share } from '@capacitor/share';
import { OpenDivesCore } from 'opendives-core';
import { decoSummary, formatDepth, formatGasVolume, locale } from './format.js';
import { t } from './i18n.js';
import { planRows } from './plan-rows.js';
import { letterPaper, planGas } from './share.js';
import { alignRows, cardHtml, rowSymbol, slateLayout, slatePageHtml, slateSize, slateText, FEET_STEP_MM, METRE_STEP_MM } from './slate.js';
import { waterTypeName, waterTypeOfSalinity } from './tools.js';

/** @typedef {import('opendives-core').PlanResult} PlanResult */
/** @typedef {import('opendives-core').PlanRequest} PlanRequest */
/** @typedef {import('opendives-core').Prefs} Prefs */
/** @typedef {import('./slate.js').SlateCard} SlateCard */
/** @typedef {import('./slate.js').SlateVariant} SlateVariant */

/** @param {PlanResult} result @param {number} i */
const gasName = (result, i) => planGas(result.cylinders[i].o2Permille, result.cylinders[i].hePermille);

/**
 * The card's header of an extra plan's column.
 * @param {SlateVariant} variant @param {PlanResult} base @param {Prefs} prefs
 */
function headerOf(variant, base, prefs) {
  if (variant.kind === 'plus5') return t('slate.plus5');
  if (variant.kind === 'plusDepth') return `+${formatDepth(prefs.length === 'ft' ? FEET_STEP_MM : METRE_STEP_MM, prefs)}`;
  return t('slate.without', { gas: gasName(base, variant.cylinder ?? 0) });
}

/**
 * The card of a plan and its extra plans.
 * @param {Object} input
 * @param {PlanResult} input.result the base plan, from the core
 * @param {PlanRequest} input.request its request
 * @param {{ variant: SlateVariant, result: PlanResult|null }[]} input.variants the extra plans the core computed (null: it could not)
 * @param {Prefs} input.prefs
 * @param {string} input.title
 * @returns {SlateCard}
 */
export function buildCard({ result, request, variants, prefs, title }) {
  const day = new Date(result.when * 1000).toLocaleDateString(locale, { dateStyle: 'medium', timeZone: 'UTC' });
  const created = new Date().toLocaleDateString(locale, { dateStyle: 'medium' });
  const model = decoSummary({ decoModel: request.decoModel === 1 ? 'vpmb' : 'buehlmann', gfLow: request.gfLow, gfHigh: request.gfHigh, vpmbConservatism: request.vpmbConservatism });
  const water = waterTypeName(waterTypeOfSalinity(request.salinity ?? 10300));

  const gasLine = result.cylinders
    .map((c, i) => (i === 0 ? t('slate.atBottom', { gas: gasName(result, i) }) : t('slate.at', { gas: gasName(result, i), depth: formatDepth(c.switchDepthMm, prefs) })))
    .join(' · ');

  const extraRows = variants.map((v) => (v.result && !v.result.error ? planRows(v.result) : null));
  const entries = alignRows(planRows(result), extraRows);
  const rows = entries.map((e, i) => ({
    symbol: rowSymbol(e.row.kind),
    depth: e.row.surface ? t('slate.surface') : formatDepth(e.row.depthMm, prefs),
    gas: e.row.breathed ? planGas(e.row.breathed.o2Permille, e.row.breathed.hePermille) : '',
    gasChange: i > 0 && !!e.row.gas,
    duration: e.inBase ? String(e.row.durationMinutes) : '',
    end: e.inBase ? String(e.row.endMinutes) : '',
    extra: e.ends.map((m) => (m === null ? '–' : String(m))),
  }));

  const gasNeeded = result.cylinders.map((c, i) => `${gasName(result, i)} ${formatGasVolume(c.gasUsedMl + c.reserveMl, prefs)}`).join(' · ');
  return {
    title,
    subtitle: [day, model, water].join(' · '),
    gasLine,
    headers: { depth: t('slate.depth'), gas: t('slate.gas'), duration: t('slate.duration'), end: t('slate.end') },
    extraHeaders: variants.map((v) => headerOf(v.variant, result, prefs)),
    rows,
    note: t('slate.note'),
    gasNeeded: t('slate.gasNeeded', { gases: gasNeeded }),
    oxygen: t('plan.oxygenValue', { cns: result.cns, otu: result.otu }),
    footer: t('slate.footer', { date: created }),
  };
}

/** The card's layout at real size. @param {SlateCard} card @param {{ widthMm: number, heightMm: number }} size */
export const layoutOf = (card, size) => slateLayout(size, card.rows.length, card.extraHeaders.length, Math.max(0, ...card.extraHeaders.map((h) => h.length)));

/** @param {PlanResult} result */
function fileBase(result) {
  const day = new Date(result.when * 1000).toISOString().slice(0, 10);
  return `${t('slate.filePrefix')}-${day}`;
}

/**
 * The card as a PNG, base64. The card's HTML is laid out off screen, then each word and each
 * cell border is drawn again on a canvas at the place the page gave it. (An SVG foreign object
 * drawn on a canvas taints it in the Android WebView, and the canvas can no longer be read.)
 * @param {SlateCard} card @param {ReturnType<typeof slateLayout>} layout
 * @param {number} [scale] pixels per CSS pixel
 */
export async function cardPng(card, layout, scale = 4) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;pointer-events:none';
  host.innerHTML = cardHtml(card, layout);
  document.body.appendChild(host);
  try {
    await document.fonts?.ready;
    const root = /** @type {HTMLElement} */ (host.firstElementChild);
    const origin = root.getBoundingClientRect();
    // The image stops below its last line, with the card's padding: a picture for a message
    // has no use for the card's empty bottom.
    const last = /** @type {Element} */ (root.lastElementChild).getBoundingClientRect();
    const height = Math.min(origin.height, last.bottom - origin.top + parseFloat(getComputedStyle(root).paddingBottom));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(origin.width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    ctx.scale(scale, scale);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, origin.width, height);

    // The rows' top borders.
    for (const cell of root.querySelectorAll('td')) {
      const style = getComputedStyle(cell);
      const width = parseFloat(style.borderTopWidth);
      if (!width) continue;
      const r = cell.getBoundingClientRect();
      ctx.fillStyle = style.borderTopColor;
      ctx.fillRect(r.left - origin.left, r.top - origin.top, r.width, width);
    }

    // The text, word by word, where the layout put each word.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    ctx.textBaseline = 'alphabetic';
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? '';
      const style = getComputedStyle(/** @type {Element} */ (node.parentElement));
      ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      ctx.fillStyle = style.color;
      const underline = (style.textDecorationLine || '').includes('underline') || !!node.parentElement?.closest('[style*="underline"]');
      const fontPx = parseFloat(style.fontSize);
      for (const match of text.matchAll(/\S+/g)) {
        range.setStart(node, match.index ?? 0);
        range.setEnd(node, (match.index ?? 0) + match[0].length);
        const r = range.getBoundingClientRect();
        if (!r.width) continue;
        const metrics = ctx.measureText(match[0]);
        // The baseline: the line box's middle, moved down by half the glyphs' ascent minus descent.
        const baseline = r.top - origin.top + r.height / 2 + (metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2;
        ctx.fillText(match[0], r.left - origin.left, baseline);
        if (underline) ctx.fillRect(r.left - origin.left, baseline + fontPx * 0.12, r.width, Math.max(0.5, fontPx * 0.07));
      }
    }
    return canvas.toDataURL('image/png').split(',')[1];
  } finally {
    host.remove();
  }
}

/**
 * Shares the card: "pdf" the sheet to print, "png" the card alone, "text" its text.
 * @param {Object} input
 * @param {SlateCard} input.card
 * @param {PlanResult} input.result
 * @param {'standard'|'small'|'full'} input.size
 * @param {'pdf'|'png'|'text'} input.file
 */
export async function shareSlate({ card, result, size, file }) {
  const letter = letterPaper();
  const layout = layoutOf(card, slateSize(letter, size));
  const name = fileBase(result);
  if (file === 'text') {
    await Share.share({ title: card.title, text: slateText(card), dialogTitle: t('share.title') });
    return;
  }
  let uri;
  let mime;
  if (file === 'pdf') {
    ({ uri } = await OpenDivesCore.htmlToPdf({ html: slatePageHtml(card, layout, letter, locale), name: `${name}.pdf`, letter }));
    mime = 'application/pdf';
  } else {
    ({ uri } = await OpenDivesCore.writeShareFile({ name: `${name}.png`, base64: await cardPng(card, layout) }));
    mime = 'image/png';
  }
  await OpenDivesCore.grantShareFile({ uri, mime });
  await Share.share({ title: card.title, files: [uri], dialogTitle: t('share.title') });
}

/**
 * "Image du tableau": the plan's table alone, on a standard card, as a PNG.
 * @param {PlanResult} result @param {PlanRequest} request @param {Prefs} prefs @param {string} title
 */
export async function sharePlanTableImage(result, request, prefs, title) {
  const card = buildCard({ result, request, variants: [], prefs, title });
  await shareSlate({ card, result, size: 'standard', file: 'png' });
}


/**
 * "Fichier de carnet (.ssrf)": the core's export of this one planned dive, as it is in the
 * logbook. Nothing is written to the logbook: the plan has to be saved already.
 * @param {number} planId the planned dive's id
 * @param {string} title
 * @param {PlanResult} result
 */
export async function sharePlanFile(planId, title, result) {
  const name = `${t('plan.filePrefix')}-${new Date(result.when * 1000).toISOString().slice(0, 10)}.ssrf`;
  const { uri } = await OpenDivesCore.exportDives({ ids: [planId], format: 'ssrf', anonymize: false, name });
  await OpenDivesCore.grantShareFile({ uri, mime: 'application/xml' });
  await Share.share({ title, files: [uri], dialogTitle: t('share.title') });
}

/**
 * The five rows of the plan's share sheet (spec, "Sharing a plan"), in order.
 * @param {boolean} saved whether the plan is a planned dive of the logbook (the .ssrf row needs it)
 * @param {(kind: 'slate'|'pdf'|'image'|'ssrf'|'summary') => void} choose
 */
export function planShareRows(saved, choose) {
  return [
    { id: 'slate', icon: 'plan', title: t('planShare.slate'), text: t('planShare.slateText'), onclick: () => choose('slate') },
    { id: 'pdf', icon: 'pdf', title: t('share.pdf'), text: t('plan.sharePdfText'), onclick: () => choose('pdf') },
    { id: 'image', icon: 'image', title: t('planShare.image'), text: t('planShare.imageText'), onclick: () => choose('image') },
    { id: 'ssrf', icon: 'file', title: t('planShare.ssrf'), text: saved ? t('planShare.ssrfText') : t('planShare.ssrfUnsaved'), disabled: !saved, onclick: () => choose('ssrf') },
    { id: 'summary', icon: 'document', title: t('planShare.text'), text: t('planShare.textText'), onclick: () => choose('summary') },
  ];
}
