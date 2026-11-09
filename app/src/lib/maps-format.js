// @ts-check
// Texts of the offline maps screens: sizes in Mo and Go, rows of regions.
import { t } from './i18n.js';
import { formatNumber, formatLongDate } from './format.js';
import { MB, GB } from './maps-logic.js';

/**
 * "96 Mo", "1 Go", "18,4 Go": megabytes below 1 Go, gigabytes with one decimal when needed.
 * @param {number} bytes
 */
export function formatMapSize(bytes) {
  if (bytes >= GB) {
    const rounded = Math.round((bytes / GB) * 10) / 10;
    return t('maps.units.gb', { value: formatNumber(rounded, Number.isInteger(rounded) ? 0 : 1) });
  }
  return t('maps.units.mb', { value: formatNumber(Math.max(0, Math.round(bytes / MB)), 0) });
}

/** "48 Mo sur 80 Mo · 60 %". @param {number} received @param {number} total */
export function formatProgress(received, total) {
  return t('maps.download.progress', { received: formatMapSize(received), total: formatMapSize(total), percent: percent(received, total) });
}

/** @param {number} received @param {number} total */
export function percent(received, total) {
  return total > 0 ? Math.min(100, Math.floor((received / total) * 100)) : 0;
}

/** "3 mars 2026". @param {string} iso */
export function formatMapDate(iso) {
  return iso ? formatLongDate(iso) : '';
}
