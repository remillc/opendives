// @ts-check
// Colonne d'eau (docs/specification-interface.md, section 4) : dégradé vertical
// de --od-sapin-clair en haut à un mélange de --od-sapin-clair et --od-sapin,
// dans la proportion profondeur max / 60 m, plafonnée à 1. Même échelle pour
// toutes les plongées.

const PROFONDEUR_SOMBRE_MM = 60000;

/**
 * Couleur du bas de la colonne d'eau, en CSS (aucune valeur en dur).
 * @param {number} maxDepthMm
 */
export function couleurFond(maxDepthMm) {
  const part = Math.min(1, Math.max(0, maxDepthMm / PROFONDEUR_SOMBRE_MM));
  const pourcent = Math.round(part * 1000) / 10;
  return `color-mix(in srgb, var(--od-sapin) ${pourcent}%, var(--od-sapin-clair))`;
}
