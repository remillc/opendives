// @ts-check
// Sharing a dive (spec, section 4, "Dive detail", "Partager"): a one-page
// PDF sheet, or a short text with the profile image, through the system's
// share sheet. Everything is made on the device, without network: the sheet
// is HTML rendered to PDF by the system's print engine (htmlToPdf), the image
// is the profile chart drawn on a canvas.
import { Share } from '@capacitor/share';
import { OpenDivesCore } from 'opendives-core';
import {
  formatCylinderSize,
  formatDepth,
  formatDuration,
  formatFullDate,
  formatGas,
  formatNumber,
  formatPressure,
  formatTemperature,
  formatTimeOfDay,
  formatWeight,
  locale,
} from './format.js';
import { t, tIfExists } from './i18n.js';
import { settings } from './settings.svelte.js';

/** @typedef {import('opendives-core').DiveDetail} DiveDetail */
/** @typedef {import('opendives-core').Prefs} Prefs */

/** Properties copied from the page's styles into a standalone SVG. */
const SVG_STYLES = ['fill', 'stroke', 'stroke-width', 'stroke-linejoin', 'font-size', 'font-family', 'font-weight', 'opacity', 'stop-color'];

/**
 * The profile chart as a standalone SVG: the classes and CSS variables of
 * the page resolved into attributes, so that it draws the same alone.
 * The gas band and the finger cursor of the screen are left out.
 * @param {SVGSVGElement} svg
 */
export function standaloneSvg(svg) {
  const copy = /** @type {SVGSVGElement} */ (svg.cloneNode(true));
  const from = [svg, ...svg.querySelectorAll('*')];
  const to = [copy, ...copy.querySelectorAll('*')];
  from.forEach((el, i) => {
    const style = getComputedStyle(el);
    const target = /** @type {SVGElement} */ (to[i]);
    for (const p of SVG_STYLES) {
      const v = style.getPropertyValue(p);
      if (v) target.style.setProperty(p, v);
    }
  });
  // The chart only: its height without the gas band below it.
  const band = copy.querySelector('.gas rect');
  const w = svg.getAttribute('width') ?? String(svg.clientWidth);
  const h = band ? String(Number(band.getAttribute('y')) - 2) : (svg.getAttribute('height') ?? String(svg.clientHeight));
  for (const el of copy.querySelectorAll('.gas, .cursor, .cursor-halo')) el.remove();
  for (const el of [copy, ...copy.querySelectorAll('*')]) el.removeAttribute('class');
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.setAttribute('height', h);
  copy.setAttribute('viewBox', `0 0 ${w} ${h}`);
  return copy;
}

/**
 * The profile chart as a PNG, base64, on a white or dark block.
 * @param {SVGSVGElement} svg
 * @param {number} [scale]
 */
export async function profilePng(svg, scale = 3) {
  const copy = standaloneSvg(svg);
  const w = Number(copy.getAttribute('width'));
  const h = Number(copy.getAttribute('height'));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    const pad = 12;
    canvas.width = (w + pad * 2) * scale;
    canvas.height = (h + pad * 2) * scale;
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    ctx.fillStyle = getComputedStyle(svg).getPropertyValue('--od-block').trim() || '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, pad * scale, pad * scale, w * scale, h * scale);
    return canvas.toDataURL('image/png').split(',')[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The breathing gases of the dive, as the detail names them. @param {DiveDetail} dive */
function gases(dive) {
  const names = dive.cylinders.filter((c) => c.used).map((c) => formatGas(c.o2Permille, c.hePermille));
  return [...new Set(names)].join(', ');
}

/**
 * The short text shared with the image: site, date, maximum depth, duration,
 * gas, in the diver's units.
 * @param {DiveDetail} dive @param {Prefs} prefs
 */
export function summaryText(dive, prefs) {
  const title = [dive.number ? t('detail.number', { number: String(dive.number) }) : '', dive.site].filter(Boolean).join(' · ');
  const facts = [formatDepth(dive.maxDepthMm, prefs), formatDuration(dive.durationSeconds), gases(dive)].filter(Boolean).join(' · ');
  return [title, formatFullDate(dive.date), facts].filter(Boolean).join('\n');
}

/** File names: OpenDives-plongee-5-2014-04-02.pdf. @param {DiveDetail} dive @param {string} ext */
function fileName(dive, ext) {
  const day = dive.date.slice(0, 10);
  return `${t('share.filePrefix')}${dive.number ? `-${dive.number}` : ''}-${day}.${ext}`;
}

/** "Résumé et image". @param {DiveDetail} dive @param {Prefs} prefs @param {SVGSVGElement|null} svg */
export async function shareSummary(dive, prefs, svg) {
  const text = summaryText(dive, prefs);
  /** @type {string[]} */
  const files = [];
  if (svg) {
    const { uri } = await OpenDivesCore.writeShareFile({ name: fileName(dive, 'png'), base64: await profilePng(svg) });
    await OpenDivesCore.grantShareFile({ uri, mime: 'image/png' });
    files.push(uri);
  }
  await Share.share({ title: shareTitle(dive), text, files, dialogTitle: t('share.title') });
}

/** The subject of a mail: the site, else "Plongée n° 5". @param {DiveDetail} dive */
function shareTitle(dive) {
  return dive.site || (dive.number ? t('share.sheetNumber', { number: String(dive.number) }) : t('share.sheetDive'));
}

/**
 * The regions whose paper is US Letter (Unicode CLDR, paperSize "US-Letter");
 * A4 everywhere else.
 */
const LETTER_REGIONS = new Set(['US', 'CA', 'MX', 'BZ', 'CL', 'CO', 'CR', 'GT', 'NI', 'PA', 'PH', 'PR', 'SV', 'VE']);

/** Whether the device's region uses US Letter (from its language, e.g. fr-CA). */
export function regionUsesLetter() {
  let region = (navigator.language.split('-')[1] ?? '').toUpperCase();
  if (!region) {
    try {
      region = new Intl.Locale(navigator.language).maximize().region ?? '';
    } catch {
      region = '';
    }
  }
  return LETTER_REGIONS.has(region);
}

/** The paper of the PDF sheet: the setting (Settings, "Format du papier"), else the region's. */
function letterPaper() {
  return settings.paperSize === 'system' ? regionUsesLetter() : settings.paperSize === 'letter';
}

/** @param {string} s */
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** @param {number} n */
const stars = (n) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));

/**
 * The dive sheet as HTML (docs/mockups/partage-pdf-fiche.dc.html); rows
 * without a value are left out, as on screen.
 * The profile: the chart of the screen, or one drawn from the samples (a
 * string) when the dive is not shown. Anonymized (the logbook's export), the
 * people and the notes are left out, as Subsurface's anonymize option does.
 * @param {DiveDetail} dive @param {Prefs} prefs @param {SVGSVGElement|string|null} svg @param {boolean} [anonymize]
 */
export function sheetHtml(dive, prefs, svg, anonymize = false) {
  if (anonymize) dive = { ...dive, guides: [], buddies: [], notes: '' };
  const time = formatTimeOfDay(dive.date);
  const end = new Date(new Date(dive.date).getTime() + dive.durationSeconds * 1000);
  const endText = end.toLocaleTimeString(locale, { timeStyle: 'short' });
  const minWater = dive.waterTempMk ? formatTemperature(dive.waterTempMk, prefs) : '';
  const place = [dive.siteLocation.city, dive.siteLocation.region, dive.siteLocation.country].filter(Boolean).join(', ');
  const trip = dive.trip?.location ? t('detail.tripLine', { name: dive.trip.location }) : '';
  const figures = [
    [formatDepth(dive.maxDepthMm, prefs), t('detail.figureMaxDepth')],
    [formatDuration(dive.durationSeconds), t('detail.figureDuration')],
    minWater ? [minWater, t('detail.figureWaterMin')] : null,
  ].filter(Boolean);
  const facts = [
    [t('detail.entry'), time],
    [t('detail.exit'), endText],
    [t('detail.meanDepth'), dive.meanDepthMm ? formatDepth(dive.meanDepthMm, prefs) : ''],
    [t('detail.airTemperature'), dive.airTempMk ? formatTemperature(dive.airTempMk, prefs) : ''],
    [t('detail.water'), dive.waterType ? (tIfExists(`detail.waterTypes.${dive.waterType}`) ?? '') : ''],
    [t('detail.surfacePressure'), dive.surfacePressureMbar ? `${formatNumber(dive.surfacePressureMbar, 0)} mbar` : ''],
    [t('detail.mode'), tIfExists(`detail.modes.${dive.divemode}`) ?? dive.divemode],
    [t('detail.cns'), dive.cns ? `${dive.cns} %` : ''],
    [t('detail.otu'), dive.otu ? String(dive.otu) : ''],
  ]
    .map(([k, v]) => [k, v ?? ''])
    .filter(([, v]) => v);
  const cylinders = dive.cylinders.filter((c) => c.used || c.startMbar);
  const weightTotal = dive.weights.reduce((s, w) => s + w.grams, 0);
  const weights = dive.weights
    .filter((w) => w.grams)
    .map((w) => `${formatWeight(w.grams, prefs)}, ${(tIfExists(`detail.weightPlaces.${w.description}`) ?? w.description).toLocaleLowerCase()}`)
    .join(' ; ');
  const equipment = [
    [t('detail.suitRow'), dive.suit],
    [t('detail.weights'), weights || (weightTotal ? formatWeight(weightTotal, prefs) : '')],
    [t('detail.computer'), dive.diveComputers.map((c) => c.model).join(', ')],
  ].filter(([, v]) => v);
  const people = [
    [t('edit.guides'), dive.guides.join(', ')],
    [t('edit.buddies'), dive.buddies.join(', ')],
    [t('edit.tags'), dive.tags.join(', ')],
  ].filter(([, v]) => v);
  const conditions = [
    [t('edit.rating'), dive.rating ? stars(dive.rating) : ''],
    [t('detail.conditionNames.visibility'), dive.visibility ? stars(dive.visibility) : ''],
    ...['current', 'wavesize', 'surge', 'chill'].map((k) => [
      t(`detail.conditionNames.${k}`),
      /** @type {Record<string, number>} */ (dive.conditions ?? {})[k] ? stars(/** @type {Record<string, number>} */ (dive.conditions)[k]) : '',
    ]),
  ].filter(([, v]) => v);
  const profile = typeof svg === 'string' ? svg : svg ? new XMLSerializer().serializeToString(standaloneSvg(svg)) : '';
  const rows = (/** @type {(string|null)[][]} */ list) =>
    list.map(([k, v]) => `<div class="kv"><dt>${esc(k ?? '')}</dt><dd>${esc(v ?? '')}</dd></div>`).join('');
  const created = new Date().toLocaleDateString(locale, { dateStyle: 'long' });

  return `<!DOCTYPE html><html lang="${esc(locale)}"><head><meta charset="utf-8"><style>
@page { size: ${letterPaper() ? 'letter' : 'A4'}; margin: 14mm 14mm 16mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: sans-serif; color: #1F2124; font-size: 10pt; line-height: 1.35; }
header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 1px solid #DADAD6; padding-bottom: 10px; }
.over { font-size: 10pt; color: #4A4D52; } .over b { color: #1F2124; }
h1 { margin: 2px 0 2px; font-size: 22pt; line-height: 1.1; }
.place { color: #4A4D52; }
.figures { display: flex; gap: 18px; text-align: right; }
.figure b { display: block; font-size: 16pt; } .figure span { color: #4A4D52; font-size: 9pt; }
h2 { font-size: 11pt; margin: 14px 0 6px; }
.legend { color: #4A4D52; font-size: 9pt; margin-top: 2px; }
svg { width: 78%; height: auto; display: block; }
.facts { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px 12px; margin: 0; }
.kv { border-bottom: 1px solid #ECECEA; padding: 3px 0; } dt { color: #4A4D52; font-size: 8.5pt; } dd { margin: 0; font-weight: 600; }
table { width: 100%; border-collapse: collapse; } th { text-align: left; color: #4A4D52; font-weight: normal; font-size: 8.5pt; border-bottom: 1px solid #DADAD6; padding: 3px 4px; }
td { padding: 3px 4px; border-bottom: 1px solid #ECECEA; } td.n { font-variant-numeric: tabular-nums; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 0 24px; }
.list { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px; margin: 6px 0 0; }
.notes { white-space: pre-wrap; }
footer { margin-top: 16px; border-top: 1px solid #DADAD6; padding-top: 6px; color: #4A4D52; font-size: 8.5pt; }
</style></head><body>
<header><div>
<div class="over"><b>${esc(dive.number ? t('share.sheetNumber', { number: String(dive.number) }) : t('share.sheetDive'))}</b> · ${esc(formatFullDate(dive.date))}</div>
<h1>${esc(dive.site || t('dive.siteNotSet'))}</h1>
<div class="place">${esc([place, trip].filter(Boolean).join(' · '))}</div>
</div><div class="figures">${figures.map((f) => `<div class="figure"><b>${esc(/** @type {string[]} */ (f)[0])}</b><span>${esc(/** @type {string[]} */ (f)[1])}</span></div>`).join('')}</div></header>
${profile ? `<h2>${esc(t('share.profile'))}</h2>${profile}<div class="legend">${esc(t(typeof svg !== 'string' && dive.samples.temperatureMk ? 'share.legendTemperature' : 'share.legend'))}</div>` : ''}
<dl class="facts" style="margin-top:10px">${rows(facts)}</dl>
${cylinders.length || equipment.length ? `<h2>${esc(t('detail.gasAndEquipment'))}</h2>` : ''}
${cylinders.length ? `<table><thead><tr><th>${esc(t('share.cylinder'))}</th><th>${esc(t('edit.size'))}</th><th>${esc(t('edit.use'))}</th><th>${esc(t('share.gas'))}</th><th>${esc(t('edit.start'))}</th><th>${esc(t('edit.end'))}</th></tr></thead><tbody>${cylinders
    .map(
      (c) =>
        `<tr><td>${esc(c.description && c.description !== 'unknown' ? c.description : '–')}</td><td class="n">${esc(formatCylinderSize(c.sizeMl, c.workingPressureMbar, prefs) ?? '')}</td><td>${esc(tIfExists(`edit.uses.${c.use}`) ?? c.use)}</td><td>${esc(formatGas(c.o2Permille, c.hePermille))}</td><td class="n">${c.startMbar ? esc(formatPressure(c.startMbar, prefs)) : ''}</td><td class="n">${c.endMbar ? esc(formatPressure(c.endMbar, prefs)) : ''}</td></tr>`,
    )
    .join('')}</tbody></table>` : ''}
${equipment.length ? `<dl class="list">${rows(equipment)}</dl>` : ''}
${people.length || conditions.length ? `<div class="two"><div>${people.length ? `<h2>${esc(t('detail.people'))}</h2><dl class="list" style="grid-template-columns:1fr">${rows(people)}</dl>` : ''}</div><div>${conditions.length ? `<h2>${esc(t('detail.conditions'))}</h2><dl class="list" style="grid-template-columns:1fr">${rows(conditions)}</dl>` : ''}</div></div>` : ''}
${dive.notes ? `<h2>${esc(t('detail.notes'))}</h2><div class="notes">${esc(dive.notes)}</div>` : ''}
<footer>${esc(t('share.footer', { date: created }))}</footer>
</body></html>`;
}

/**
 * A dive's depth profile drawn from its samples, for a sheet whose dive is not
 * on screen: the water column from the surface to the depth line, a depth
 * scale on the left, minutes at the bottom.
 * @param {DiveDetail} dive @param {Prefs} prefs
 */
export function profileSvgFromSamples(dive, prefs) {
  const times = dive.samples.timeSeconds;
  const depths = dive.samples.depthMm;
  if (times.length < 2) return '';
  const W = 330, H = 150, L = 30, B = 22;
  const tMax = times[times.length - 1] || 1;
  const dMax = Math.max(1, ...depths);
  const x = (/** @type {number} */ s) => L + (s / tMax) * (W - L - 6);
  const y = (/** @type {number} */ mm) => 4 + (mm / dMax) * (H - B - 8);
  let line = '';
  times.forEach((s, i) => (line += `${i ? 'L' : 'M'}${x(s).toFixed(1)},${y(depths[i]).toFixed(1)}`));
  const water = `${line}L${x(tMax).toFixed(1)},${y(0).toFixed(1)}L${x(0).toFixed(1)},${y(0).toFixed(1)}Z`;
  const minutes = Math.round(tMax / 60);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FBE3B2"/><stop offset="1" stop-color="#E9B97A"/></linearGradient></defs>
<path d="${water}" fill="url(#w)"/><path d="${line}" fill="none" stroke="#1F2124" stroke-width="2" stroke-linejoin="round"/>
<line x1="${L}" x2="${W - 6}" y1="${H - B + 4}" y2="${H - B + 4}" stroke="#4A4D52"/>
<text x="${L - 4}" y="12" font-size="10" text-anchor="end" fill="#4A4D52">0</text>
<text x="${L - 4}" y="${(y(dMax) + 4).toFixed(1)}" font-size="10" text-anchor="end" fill="#4A4D52">${esc(formatDepth(dMax, prefs))}</text>
<text x="${L}" y="${H - 6}" font-size="10" fill="#4A4D52">0</text>
<text x="${W - 6}" y="${H - 6}" font-size="10" text-anchor="end" fill="#4A4D52">${minutes} min</text>
</svg>`;
}

/**
 * "Exporter au format…" of the logbook's selection (spec, section 4,
 * "Logbook selection and export"): the checked dives in a file, shared. The
 * Subsurface formats come from the core; "pdf" is one sheet per dive.
 * @param {number[]} ids
 * @param {'ssrf'|'uddf'|'csv'|'csvProfiles'|'pdf'} format
 * @param {boolean} anonymize
 * @param {Prefs} prefs
 */
export async function exportDives(ids, format, anonymize, prefs) {
  const day = new Date().toISOString().slice(0, 10);
  const ext = format === 'csvProfiles' ? 'csv' : format;
  const name = `${t('share.exportPrefix', { n: String(ids.length) })}-${day}.${ext}`;
  let uri;
  if (format === 'pdf') {
    const pages = [];
    for (const id of ids) {
      const dive = await OpenDivesCore.getDive({ id });
      pages.push(sheetHtml(dive, prefs, profileSvgFromSamples(dive, prefs), anonymize));
    }
    // One document: the style of the first sheet, each sheet's body on its own page.
    const head = pages[0].slice(0, pages[0].indexOf('<body>') + 6);
    const bodies = pages.map((p) => p.slice(p.indexOf('<body>') + 6, p.lastIndexOf('</body>')));
    const html = `${head}${bodies.join('<div style="break-after: page"></div>')}</body></html>`;
    ({ uri } = await OpenDivesCore.htmlToPdf({ html, name, letter: letterPaper() }));
  } else {
    ({ uri } = await OpenDivesCore.exportDives({ ids, format, anonymize, name }));
  }
  const mime = { ssrf: 'application/xml', uddf: 'application/xml', csv: 'text/csv', csvProfiles: 'text/csv', pdf: 'application/pdf' }[format];
  await OpenDivesCore.grantShareFile({ uri, mime });
  await Share.share({ title: name, files: [uri], dialogTitle: t('share.title') });
}

/** "Fiche PDF". @param {DiveDetail} dive @param {Prefs} prefs @param {SVGSVGElement|null} svg */
export async function sharePdf(dive, prefs, svg) {
  const { uri } = await OpenDivesCore.htmlToPdf({ html: sheetHtml(dive, prefs, svg), name: fileName(dive, 'pdf'), letter: letterPaper() });
  await OpenDivesCore.grantShareFile({ uri, mime: 'application/pdf' });
  await Share.share({ title: shareTitle(dive), files: [uri], dialogTitle: t('share.title') });
}
