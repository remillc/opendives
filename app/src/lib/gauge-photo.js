// @ts-check
// Reading a cylinder pressure from a photo, page side (docs/ui-specification.md,
// "Reading cylinder pressures from a photo"): opens the native gauge camera with
// the translated texts, and turns what it recognised into readings. The camera
// itself is native (plugins/opendives-core, GaugeCameraActivity); the rules that
// decide what a reading is are in gauge-reading.js.
import { Capacitor } from '@capacitor/core';
import { OpenDivesCore } from 'opendives-core';
import { t } from './i18n.js';

/** The camera exists on Android only for now (iOS needs a Mac to build). */
export const gaugeCameraAvailable = () => Capacitor.getPlatform() === 'android';

/**
 * @typedef {Object} GaugePhoto
 * @property {import('./gauge-reading.js').GaugeReading[]} readings one or two, left to right
 * @property {string} thumbnail base64 JPEG of the analysed area (data URL without its prefix)
 */

/**
 * Opens the camera until it ends with something to use.
 * @param {{
 *   field: 'start'|'end',
 *   cylinder: string,
 *   gas: string,
 *   userUnit: 'bar'|'psi',
 *   decide: (blocks: import('opendives-core').GaugeTextBlock[], userUnit: 'bar'|'psi') => import('./gauge-reading.js').GaugeReading[],
 * }} options
 * @returns {Promise<{action: 'cancelled'|'manual'} | ({action: 'photo'} & GaugePhoto)>}
 *   decide: the rules (gauge-reading.js readGauges); a photo for which it finds nothing
 *   reopens the camera on the "nothing read" alert.
 */
export async function runGaugeCamera({ field, cylinder, gas, userUnit, decide }) {
  let nothingRead = false;
  for (;;) {
    const result = await OpenDivesCore.gaugeCamera({
      title: t(field === 'start' ? 'gauge.titleStart' : 'gauge.titleEnd'),
      subtitle: `${cylinder} · ${gas}`,
      hintMain: t('gauge.hintMain'),
      hintSub: t('gauge.hintSub'),
      flash: t('gauge.flash'),
      photos: t('gauge.photos'),
      photosDescription: t('gauge.photosDescription'),
      shutter: t('gauge.shutter'),
      manual: t('gauge.manual'),
      close: t('dialog.close'),
      nothingTitle: t('gauge.nothingTitle'),
      nothingText: t('gauge.nothingText'),
      permissionReason: t('gauge.permissionReason'),
      permissionButton: t('gauge.permissionButton'),
      permissionDenied: t('gauge.permissionDenied'),
      cameraFailed: t('gauge.cameraFailed'),
      nothingRead,
    });
    if (result.action !== 'photo') return { action: result.action };
    const readings = decide(result.blocks, userUnit);
    if (readings.length) return { action: 'photo', readings, thumbnail: result.thumbnail };
    nothingRead = true;
  }
}
