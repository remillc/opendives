// @ts-check
// Langues de l'interface (spécification, section 2, « Langues »).
// Aucun texte visible n'est écrit en dur dans un composant : chaque texte a une
// clé, et ses traductions vivent dans src/i18n/<langue>.json. Le français est la
// langue de référence ; une langue non traduite retombe sur l'anglais.
// Les données du plongeur (sites, notes, étiquettes) ne passent jamais par ici.
import fr from '../i18n/fr.json';
import en from '../i18n/en.json';

/** @typedef {string | {[pluriel: string]: string} | {[cle: string]: any}} Entree */

/** @type {Record<string, Record<string, any>>} */
const catalogues = { fr, en };
const REPLI = 'en';

/** Langue de l'interface : la première langue de l'appareil qui est traduite. */
export const langue = (() => {
  const preferees = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [];
  for (const l of preferees) {
    const code = l.toLowerCase().split('-')[0];
    if (code in catalogues) return code;
  }
  return REPLI;
})();

/** Format des nombres : celui de l'appareil (« 1 353 » en français). */
const nombres = new Intl.NumberFormat(typeof navigator !== 'undefined' ? navigator.language : langue);
const pluriels = new Intl.PluralRules(langue);

/**
 * @param {Record<string, any>} catalogue
 * @param {string} cle ex. « carnet.titre »
 */
function chercher(catalogue, cle) {
  return cle.split('.').reduce((noeud, partie) => (noeud == null ? undefined : noeud[partie]), /** @type {any} */ (catalogue));
}

/**
 * Texte traduit. Les paramètres remplacent les {noms} ; le paramètre numérique
 * `n` choisit la forme du pluriel (Intl.PluralRules) et s'affiche au format de
 * l'appareil.
 * @param {string} cle
 * @param {Record<string, string|number>} [params]
 * @returns {string}
 */
export function t(cle, params = {}) {
  let valeur = chercher(catalogues[langue], cle) ?? chercher(catalogues[REPLI], cle);
  if (valeur == null) {
    console.warn(`Texte manquant : ${cle}`);
    return cle;
  }
  if (typeof valeur === 'object') {
    const n = typeof params.n === 'number' ? params.n : 0;
    valeur = valeur[pluriels.select(n)] ?? valeur.other;
  }
  return String(valeur).replace(/\{(\w+)\}/g, (tout, nom) => {
    if (!(nom in params)) return tout;
    const v = params[nom];
    return typeof v === 'number' ? nombres.format(v) : v;
  });
}

/**
 * Texte traduit facultatif : undefined si la clé n'existe pas (ex. un mode de
 * plongée inconnu, affiché alors tel que le cœur le donne).
 * @param {string} cle
 */
export function tSiExiste(cle) {
  const valeur = chercher(catalogues[langue], cle) ?? chercher(catalogues[REPLI], cle);
  return typeof valeur === 'string' ? valeur : undefined;
}

if (typeof document !== 'undefined') document.documentElement.lang = langue;
