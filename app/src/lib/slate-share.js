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
 * The card as a PNG, base64: the card's HTML drawn as an SVG foreign object on a canvas.
 * @param {SlateCard} card @param {ReturnType<typeof slateLayout>} layout
 * @param {number} [scale] pixels per CSS pixel
 */
export async function cardPng(card, layout, scale = 4) {
  const w = Math.round((layout.widthMm * 96) / 25.4);
  const h = Math.round((layout.heightMm * 96) / 25.4);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><foreignObject x="0" y="0" width="${w}" height="${h}"><div xmlns="http://www.w3.org/1999/xhtml">${cardHtml(card, layout)}</div></foreignObject></svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png').split(',')[1];
  } finally {
    URL.revokeObjectURL(url);
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
