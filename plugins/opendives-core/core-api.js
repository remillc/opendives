// @ts-check
// Contrat entre l'interface et le plugin natif OpenDivesCore.
// Toutes les valeurs sont en unités SI entières, comme dans le cœur :
// mm, s, mK, mbar, ml, pour mille. La conversion se fait à l'affichage.
import { registerPlugin } from '@capacitor/core';

/**
 * Les identifiants de voyage changent à chaque chargement : ne jamais les conserver.
 * @typedef {Object} DiveTrip
 * @property {number} id
 * @property {string} location chaîne vide si le voyage n'a pas de nom
 * @property {boolean} autogen voyage créé par le regroupement automatique du cœur
 */

/**
 * Une plongée dans la liste du carnet.
 * @typedef {Object} Dive
 * @property {number} id identifiant valable jusqu'au prochain chargement (pour getDive)
 * @property {number} number
 * @property {string} date heure locale de la plongée, ex. 2012-11-05T10:15:00
 * @property {string} site chaîne vide si aucun site
 * @property {number} maxDepthMm
 * @property {number} durationSeconds
 * @property {number[]} profile miniature : couples [temps s, profondeur mm] à plat, environ 40
 * @property {DiveTrip|null} trip
 */

/**
 * @typedef {Object} Cylinder
 * @property {string} description ex. AL80 ; chaîne vide si inconnue
 * @property {number} sizeMl
 * @property {number} workingPressureMbar
 * @property {number} startMbar 0 si inconnue
 * @property {number} endMbar 0 si inconnue
 * @property {number} o2Permille
 * @property {number} hePermille
 * @property {string} gas nom du mélange donné par le cœur : Air, EAN32, (18/45)…
 * @property {string} use OC-gas, diluent, oxygen, not used
 * @property {boolean} used la bouteille sert pendant la plongée
 */

/**
 * Profil calculé par le cœur (profile.cpp), un point par entrée du tracé.
 * @typedef {Object} DiveSamples
 * @property {number[]} timeSeconds
 * @property {number[]} depthMm
 * @property {number[]} cylinder bouteille respirée en circuit ouvert ; -1 si inconnue ou recycleur
 * @property {number[]|null} ceilingMm plafond calculé ; null s'il est nul sur toute la plongée
 * @property {number[]} ppo2Mbar
 */

/**
 * @typedef {Object} DiveDetail
 * @property {number} id
 * @property {number} number
 * @property {string} date
 * @property {string} site
 * @property {number} maxDepthMm
 * @property {number} meanDepthMm
 * @property {number} durationSeconds
 * @property {number} waterTempMk 0 si inconnue
 * @property {number} airTempMk 0 si inconnue
 * @property {number} sacMlMin 0 si inconnu
 * @property {number} cns
 * @property {number} otu
 * @property {number} rating
 * @property {number} visibility
 * @property {string} divemode OC, CCR, PSCR, Freedive
 * @property {string} computer modèle du premier ordinateur
 * @property {number} computers nombre d'ordinateurs
 * @property {string[]} buddies
 * @property {string[]} guides
 * @property {string} suit
 * @property {string[]} tags
 * @property {string} notes
 * @property {DiveTrip|null} trip
 * @property {Cylinder[]} cylinders
 * @property {{type: 'gaschange', timeSeconds: number, cylinder: number}[]} events
 * @property {DiveSamples} samples
 */

/**
 * Unités du carnet, une par mesure.
 * @typedef {Object} Prefs
 * @property {'m'|'ft'} length
 * @property {'C'|'F'} temperature
 * @property {'bar'|'psi'} pressure
 * @property {'l'|'cuft'} volume
 * @property {'kg'|'lbs'} weight
 */

/**
 * Résultat de la lecture du cloud. `available` vaut false quand aucun
 * identifiant n'est configuré ; les autres champs sont alors absents.
 * @typedef {Object} CloudDives
 * @property {boolean} available
 * @property {string} [server] ex. ssrf-cloud-eu.subsurface-divelog.org
 * @property {string} [head] commit de la branche sur le serveur
 * @property {boolean} [synced] false : copie locale, le serveur n'a pas répondu
 * @property {string} [offlineReason] raison, quand le serveur n'a pas répondu
 * @property {Dive[]} [dives]
 */

/**
 * @typedef {Object} OpenDivesCorePlugin
 * @property {() => Promise<{count: number}>} importSample
 *   Enregistre le carnet d'exemple comme dépôt git local.
 * @property {() => Promise<{exists: boolean, dives: Dive[]}>} listDives
 *   Relit le dépôt git local. `exists` vaut false tant qu'aucun dépôt n'a été créé.
 * @property {() => Promise<CloudDives>} listCloudDives
 *   Lecture seule du carnet du cloud Subsurface (identifiants de développement).
 * @property {(options: {id: number}) => Promise<DiveDetail>} getDive
 *   Détail d'une plongée du dernier carnet chargé.
 * @property {() => Promise<Prefs>} getPrefs
 *   Unités du dernier carnet chargé.
 */

/** @type {OpenDivesCorePlugin} */
export const OpenDivesCore = registerPlugin('OpenDivesCore');
