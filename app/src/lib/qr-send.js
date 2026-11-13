// @ts-check
// What the sending side of a QR share needs: the core's .ssrf text of one dive or plan, the
// summary line of the screen, and the QR drawing of one code. The format is in qr-transfer.js.
import { OpenDivesCore } from 'opendives-core';
import { formatDepth, formatLongDate, formatMinutes } from './format.js';
import { t } from './i18n.js';
import { encodeTransfer } from './qr-transfer.js';
import { labelOf } from './qr-preview.js';

/**
 * The dive or the plan as the core's .ssrf XML of that one entry, cut into the QR code texts.
 * Nothing is written to the logbook; the export is read back at once (no file is kept).
 * @param {number} id the dive's or the saved plan's id
 * @param {'d'|'p'} kind
 * @returns {Promise<string[]>} one text per QR code
 */
export async function transferOf(id, kind) {
  const { text } = await OpenDivesCore.exportDives({ ids: [id], format: 'ssrf', anonymize: false, name: `qr-share-${id}.ssrf`, text: true });
  if (!text) throw new Error('EMPTY_EXPORT');
  const { chunks } = await encodeTransfer({ kind, label: labelOf(text), xml: text });
  return chunks;
}

/**
 * "Lake Coleridge · 2 avril 2014 · 128 pi · 78 min", the line under the title of the sending screen.
 * @param {{site: string, date: string, maxDepthMm: number, durationSeconds: number}} dive
 * @param {import('opendives-core').Prefs} prefs
 */
export function qrSummary(dive, prefs) {
  return [dive.site || t('qr.noSite'), formatLongDate(dive.date), formatDepth(dive.maxDepthMm, prefs), formatMinutes(dive.durationSeconds)].join(' · ');
}
