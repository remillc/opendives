// @ts-check
// The cylinder types offered for a default cylinder (Settings, Équipement):
// "Aucune", then each type with its volume and working pressure.
import { OpenDivesCore } from 'opendives-core';
import { formatCylinderSize, formatPressure } from './format.js';
import { t } from './i18n.js';

/**
 * @param {import('./format.js').Prefs} prefs
 * @param {boolean} [withNone] false for a bailout cylinder, which is added or removed instead
 */
export async function cylinderChoices(prefs, withNone = true) {
  const { types } = await OpenDivesCore.cylinderTypes({ action: 'list' });
  return [
    ...(withNone ? [{ value: '', label: t('settings.defaultCylinder.none'), example: t('settings.defaultCylinder.noneText') }] : []),
    ...types.map((type) => ({
      value: type.name,
      label: type.name,
      example: [formatCylinderSize(type.ml, type.mbar, prefs), type.mbar ? formatPressure(type.mbar, prefs) : ''].filter(Boolean).join(', '),
    })),
  ];
}
