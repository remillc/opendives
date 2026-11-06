// @ts-check
// Contract between the interface and the native OpenDivesCore plugin.
// All values are in integer SI units, as in the core:
// mm, s, mK, mbar, ml, per mille. Conversion happens at display time.
import { registerPlugin } from '@capacitor/core';

/**
 * Trip identifiers change on every load: never store them.
 * @typedef {Object} DiveTrip
 * @property {number} id
 * @property {string} location empty string when the trip has no name
 * @property {boolean} autogen trip created by the core's automatic grouping
 */

/**
 * A dive in the logbook list.
 * @typedef {Object} Dive
 * @property {number} id identifier valid until the next load (for getDive)
 * @property {number} number
 * @property {string} date local time of the dive, e.g. 2012-11-05T10:15:00
 * @property {string} site empty string when there is no site
 * @property {number} maxDepthMm
 * @property {number} durationSeconds
 * @property {number[]} profile thumbnail: flat [time s, depth mm] pairs, about 40
 * @property {DiveTrip|null} trip
 */

/**
 * @typedef {Object} Cylinder
 * @property {string} description e.g. AL80; empty string when unknown
 * @property {number} sizeMl
 * @property {number} workingPressureMbar
 * @property {number} startMbar 0 when unknown
 * @property {number} endMbar 0 when unknown
 * @property {number} o2Permille
 * @property {number} hePermille
 * @property {string} gas mix name given by the core: Air, EAN32, (18/45)…
 * @property {string} use OC-gas, diluent, oxygen, not used
 * @property {boolean} used the cylinder is breathed during the dive
 * @property {number} gasUsedMl gas used, computed by the core (compressibility included); 0 when unknown
 * @property {number} switchDepthMm depth of the first switch to this cylinder after the start (core's get_depth_at_time); 0 when none
 */

/**
 * Profile computed by the core (profile.cpp), one point per plot entry.
 * @typedef {Object} DiveSamples
 * @property {number[]} timeSeconds
 * @property {number[]} depthMm
 * @property {number[]} cylinder open-circuit cylinder being breathed; -1 when unknown or rebreather
 * @property {number[]|null} ceilingMm computed ceiling; null when zero for the whole dive
 * @property {number[]} ppo2Mbar
 */

/**
 * @typedef {Object} DiveDetail
 * @property {number} id
 * @property {number} number
 * @property {string} date
 * @property {string} site
 * @property {{city: string, region: string, country: string}} siteLocation from the site's taxonomy; empty strings when unknown
 * @property {number} maxDepthMm
 * @property {number} meanDepthMm
 * @property {number} durationSeconds
 * @property {number} waterTempMk 0 when unknown
 * @property {number} airTempMk 0 when unknown
 * @property {number} sacMlMin 0 when unknown
 * @property {number} cns
 * @property {number} otu
 * @property {number} rating 0 to 5 stars; 0: not filled in
 * @property {number} visibility 0 to 5 stars; 0: not filled in
 * @property {{wavesize: number, current: number, surge: number, chill: number}} conditions 0 to 5 stars each
 * @property {''|'fresh'|'brackish'|'en13319'|'salt'} waterType from the salinity, Subsurface's thresholds; empty when unknown
 * @property {number} surfacePressureMbar as stored; 0 when not stored
 * @property {number} pictures number of pictures and videos referenced
 * @property {{model: string, divemode: string}[]} diveComputers the first is the main one
 * @property {string} divemode OC, CCR, PSCR, Freedive
 * @property {string} computer model of the first dive computer
 * @property {number} computers number of dive computers
 * @property {string[]} buddies
 * @property {string[]} guides
 * @property {string} suit
 * @property {{grams: number, description: string}[]} weights description as stored, e.g. integrated, belt
 * @property {string[]} tags
 * @property {string} notes
 * @property {DiveTrip|null} trip
 * @property {Cylinder[]} cylinders
 * @property {{type: 'gaschange', timeSeconds: number, cylinder: number}[]} events
 * @property {DiveSamples} samples
 */

/**
 * Units, one per quantity (Subsurface's preferences; the log's when it has a
 * "units" line).
 * @typedef {Object} Units
 * @property {'m'|'ft'} length
 * @property {'C'|'F'} temperature
 * @property {'bar'|'psi'} pressure
 * @property {'l'|'cuft'} volume
 * @property {'kg'|'lbs'} weight
 */

/**
 * The core's preferences shown in Settings (core/pref.h), in integer units;
 * the keys accepted by setPrefs.
 * @typedef {Units & {
 *   unitSystem: 'metric'|'imperial'|'personalize',
 *   verticalSpeed: 'min'|'s',
 *   duration: 'mixed'|'minutes'|'hours',
 *   dateFormat: string, dateFormatOverride: boolean,
 *   timeFormat: string, timeFormatOverride: boolean,
 *   displayInvalidDives: boolean, extraEnvironmental: boolean, salinityEdit: boolean,
 *   defaultCylinder: string, includeUnusedTanks: boolean, displayDefaultTankInfos: boolean,
 *   showAverageDepth: boolean, threeMGrid: boolean, dcCeiling: boolean, redCeiling: boolean,
 *   calcCeiling: boolean, tankbar: boolean,
 *   decoModel: 'buehlmann'|'vpmb', gfLow: number, gfHigh: number, vpmbConservatism: number,
 *   o2narcotic: boolean, bestMixEndMm: number,
 *   po2MinMbar: number, po2MaxMbar: number, pn2Mbar: number, pheMbar: number, modPo2Mbar: number,
 *   setpointMbar: number, showCcrSensors: boolean, showCcrSetpoint: boolean,
 *   allowOcGasAsDiluent: boolean, showScrOcPo2: boolean,
 *   o2ConsumptionMlMin: number, pscrRatio: number,
 *   bottomPo2Mbar: number, decoPo2Mbar: number, bottomSacMlMin: number, decoSacMlMin: number,
 *   descentMmMin: number, ascent75MmMin: number, ascent50MmMin: number, ascentStopsMmMin: number,
 *   ascentLast6mMmMin: number, lastStop6m: boolean, safetyStop: boolean, switchAtRequiredStop: boolean,
 *   minSwitchSeconds: number, o2Breaks: boolean, reserveMbar: number, problemSolvingMinutes: number,
 *   sacFactor: number,
 * }} CorePrefValues
 * The planner's own values (rates in mm per minute, sacFactor x100) are set from the planner screen.
 */

/**
 * @typedef {CorePrefValues & {
 *   autogroup?: boolean,
 *   diveComputers?: {slot: number, vendor: string, product: string, device: string, name: string}[],
 *   planner?: {bottomPo2Mbar: number, decoPo2Mbar: number, bottomSacMlMin: number, decoSacMlMin: number},
 *   defaults?: CorePrefValues,
 * }} Prefs
 * `autogroup` is the log's; `diveComputers` the remembered ones; `defaults`
 * Subsurface's default of each value.
 */

/**
 * @typedef {Object} CylinderType
 * @property {string} name
 * @property {number} ml
 * @property {number} mbar working pressure; 0 when unknown
 * @property {boolean} standard in the core's default list
 * @property {boolean} library in the device's library (can be removed)
 */

/**
 * @typedef {Object} CylinderTypes
 * @property {CylinderType[]} types the runtime table, sorted by name
 * @property {string[]} library the device's library, to keep as is and set again at start
 * @property {string} undo
 * @property {string} redo
 */

/**
 * Planner settings (plan_dive in opendives.h). The deco model, gradient
 * factors and VPM-B conservatism are the shared preferences (Settings); the
 * others are the planner's own, rates in mm per minute.
 * @typedef {Object} PlannerSetup
 * @property {'buehlmann'|'vpmb'|'recreational'} model
 * @property {number} gfLow
 * @property {number} gfHigh
 * @property {number} vpmbConservatism
 * @property {number} bottomSacMlMin
 * @property {number} decoSacMlMin
 * @property {number} bottomPo2Mbar
 * @property {number} decoPo2Mbar
 * @property {number} descentMmMin
 * @property {number} ascent75MmMin
 * @property {number} ascent50MmMin
 * @property {number} ascentStopsMmMin
 * @property {number} ascentLast6mMmMin
 * @property {boolean} lastStop6m
 * @property {boolean} safetyStop
 * @property {boolean} switchAtRequiredStop
 * @property {number} minSwitchSeconds
 * @property {boolean} o2Breaks
 * @property {number} reserveMbar
 * @property {number} problemSolvingMinutes
 * @property {number} sacFactor x100
 */

/**
 * @typedef {Object} PlanCylinderRequest
 * @property {number} o2Permille
 * @property {number} hePermille
 * @property {number} sizeMl
 * @property {number} startMbar
 * @property {number} [switchDepthMm] deco gases: 0 or absent for the MOD at the ppO2 for deco
 */

/**
 * A square profile and the planner-only settings for this plan.
 * @typedef {Partial<Omit<PlannerSetup, 'model'|'gfLow'|'gfHigh'|'vpmbConservatism'>> & {
 *   depthMm: number, bottomTimeSeconds: number, cylinders: PlanCylinderRequest[],
 *   surfacePressureMbar?: number, salinity?: number, when?: number
 * }} PlanRequest
 */

/**
 * @typedef {Object} PlanCylinder
 * @property {number} o2Permille
 * @property {number} hePermille
 * @property {number} sizeMl
 * @property {number} startMbar
 * @property {number} endMbar
 * @property {number} gasUsedMl
 * @property {number} decoGasUsedMl
 * @property {number} decoPressureMbar
 * @property {number} switchDepthMm
 * @property {number} bottomModMm
 * @property {''|'MORE_THAN_AVAILABLE'|'NO_RESERVE_FOR_SHARING'|'NO_GAS_FOR_PROBLEM_SOLVING'} warning
 */

/**
 * Result of the core's planner.
 * @typedef {Object} PlanResult
 * @property {''|'TIMEOUT'|'INAPPROPRIATE_GAS'|'NO_SUITABLE_BAILOUT_GAS'|'RECREATIONAL_EXCEEDS_NDL'} error
 * @property {PlannerSetup} setup the settings used
 * @property {number} effGfLow VPM-B only
 * @property {number} effGfHigh
 * @property {number} runtimeSeconds
 * @property {number} maxDepthMm
 * @property {number} cns
 * @property {number} otu
 * @property {number} surfaceIntervalSeconds
 * @property {[number, number][]} points seconds, mm
 * @property {{timeSeconds: number, depthMm: number, cylinder: number, entered: boolean}[]} segments
 * @property {{depthMm: number, durationSeconds: number, runtimeSeconds: number, cylinder: number, gasChange: boolean}[]} stops
 * @property {PlanCylinder[]} cylinders
 * @property {{cylinder: number, depthMm: number, pressureMbar: number, deltaMbar: number, sacFactor: number, problemSolvingMinutes: number}|null} minimumGas
 *   deltaMbar negative: that much short of the minimum gas
 */

/**
 * Result of reading the cloud. `available` is false when no credentials are
 * configured; the other fields are then absent.
 * @typedef {Object} CloudDives
 * @property {boolean} available
 * @property {boolean} [cached] false when a cached read found no copy on the device
 * @property {string} [server] e.g. ssrf-cloud-eu.subsurface-divelog.org
 * @property {string} [head] commit read: the server's, or the device copy's for a cached read
 * @property {boolean} [synced] false: device copy only (cached read, or the server did not answer)
 * @property {string} [offlineReason] reason, when the server did not answer
 * @property {boolean} [unchanged] the server's head is the log already loaded: `dives` is absent
 *   and the dives already listed (and their identifiers) stay valid
 * @property {Dive[]} [dives]
 */

/**
 * A trip of the loaded log; tripId is 0 when it no longer exists.
 * @typedef {Object} TripDetail
 * @property {number} tripId valid until the next load; never stored
 * @property {string} location empty when not named
 * @property {string} notes
 * @property {boolean} autogen grouped automatically by the core
 * @property {{id: number, number: number, date: string, durationSeconds: number, site: string}[]} dives
 */

/**
 * @typedef {Object} SiteSummary
 * @property {number} uuid
 * @property {string} name
 * @property {boolean} hasLocation
 * @property {number} latUdeg micro-degrees
 * @property {number} lonUdeg
 * @property {string} country
 * @property {number} dives number of dives at this site
 * @property {string} lastDate local time of the latest dive; empty without dives
 * @property {number} maxDepthMm deepest dive at this site
 */

/**
 * One free-filter rule, in the text form of Subsurface's filter presets
 * (opendives.h, filter_rule): type token ("suit", "depth", "dive_mode"…, or
 * the OpenDives od_country, od_region, od_trip), modes as tokens or empty,
 * data in core units.
 * @typedef {{type: string, stringMode?: ''|'starts_with'|'substring'|'exact',
 *   rangeMode?: ''|'equal'|'less'|'greater'|'range', negate?: boolean, data: string}} FilterRule
 */

/**
 * Values present in the loaded log for each filter criterion (filter_options).
 * @typedef {{modes: string[], years: [number, number], suits: string[], computers: string[],
 *   cylinderTypes: string[], tags: string[], people: string[], sites: string[], countries: string[],
 *   regions: string[], helium: boolean, oxygen: boolean, cylinderSize: boolean, sac: boolean,
 *   waterTemp: boolean, airTemp: boolean, planned: boolean, notes: boolean, rating: boolean,
 *   visibility: boolean, current: boolean, wavesize: boolean, surge: boolean, chill: boolean}} FilterOptions
 */

/**
 * A site; uuid is 0 when it no longer exists. Region and city say whether the
 * diver corrected them (manual), in which case a lookup never replaces them.
 * @typedef {SiteSummary & {description: string, notes: string,
 *   countryTaxonomy: {value: string, manual: boolean}, region: {value: string, manual: boolean},
 *   city: {value: string, manual: boolean},
 *   diveList: {id: number, number: number, date: string, durationSeconds: number, maxDepthMm: number}[]}} SiteDetail
 */

/**
 * Gas calculator result (gas_calculator in opendives.h): sea water, 1013 mbar.
 * @typedef {Object} GasResult
 * @property {number} o2 per mille
 * @property {number} he per mille
 * @property {number} po2Mbar
 * @property {number} modMm core's gas_mod, rounded to 1 m
 * @property {number} eadMm equivalent air depth at the MOD
 * @property {number} endMm equivalent narcotic depth at the MOD
 * @property {boolean} o2Narcotic oxygen counted as narcotic in endMm (core preference)
 * @property {number} plannedDepthMm
 * @property {number} bestO2 per mille, best mix for the planned depth at po2Mbar
 * @property {number} bestHe per mille, for the core's best-mix END
 * @property {number} bestMixEndMm
 */

/**
 * @typedef {Object} GasCylinderTypes
 * @property {string} default the default cylinder preference; empty when none
 * @property {{name: string, ml: number, workingPressureMbar: number}[]} types
 */

/**
 * Tissues now, loaded by the core with the logbook dives before now
 * (desaturation in opendives.h).
 * @typedef {Object} Desaturation
 * @property {string} now local time used
 * @property {number} surfaceSeconds since the end of the last dive; -1 when no dive counts
 * @property {'buehlmann'|'vpmb'|'recreational'} model planner model
 * @property {number} gfLow
 * @property {number} gfHigh
 * @property {number} vpmbConservatism
 * @property {{id: number, number: number, date: string, endDate: string, site: string, maxDepthMm: number, durationSeconds: number}[]} dives
 * @property {{percent: number, surfaceGf: number, n2Bar: number, heBar: number, halfTimeMin: number}[]} tissues
 *   16 compartments, fastest first; percent as in Subsurface's tissue graph (50 = ambient, 100 = M-value)
 */

/**
 * @typedef {Object} EditResult
 * @property {DiveDetail} [dive] the dive after a dive step
 * @property {SiteDetail} [site] the site after a site step
 * @property {TripDetail} [trip] the trip after a trip step
 * @property {{types: CylinderType[], library: string[]}} [cylinderTypes] after a cylinder type rename
 * @property {string} undo text of the step that Undo would revert ("Edit notes [#12]"); empty when none
 * @property {string} redo text of the step that Redo would apply; empty when none
 */

/**
 * @typedef {Object} OpenDivesCorePlugin
 * @property {() => Promise<{count: number}>} importSample
 *   Saves the sample log as a local git repository.
 * @property {() => Promise<{exists: boolean, dives: Dive[]}>} listDives
 *   Reads the local git repository again. `exists` is false until a repository has been created.
 * @property {() => Promise<{available: boolean, email: string}>} configureCloud
 *   Sets the cloud account (development credentials), without network.
 *   `available` is false when none is configured; `email` is the account's.
 * @property {() => Promise<{exists: boolean, head: string}>} probeCloud
 *   Head of the log branch on the server, network only; may run during a load.
 * @property {(options?: {cached?: boolean}) => Promise<CloudDives>} listCloudDives
 *   Read-only access to the Subsurface cloud log (development credentials).
 *   `cached`: the device's copy only, without network, to show the log at once
 *   (after configureCloud).
 * @property {() => Promise<{id: string, summary: string, message: string}[]>} pendingChanges
 *   Local commits of the loaded cloud log not yet on the server, newest first;
 *   empty for a log without account.
 * @property {(options?: {deleteCopy?: boolean}) => Promise<void>} signOut
 *   Closes the cloud log and forgets the account and its credentials; the
 *   device copy is kept unless deleteCopy (refused with changes not sent).
 * @property {(options: {password: string, keepDives: boolean}) => Promise<{deleted: boolean, status: number, reply: string}>} deleteAccount
 *   Deletes the cloud account; `deleted` only when the server confirmed it.
 *   Rejects with WRONG_PASSWORD, PENDING_CHANGES or NETWORK when nothing was deleted.
 * @property {(options: {id: number, changes: Record<string, string|number|string[]>}) => Promise<EditResult>} editDive
 *   One undoable step; only the fields named change (edit_dive in opendives.h).
 * @property {(options?: {redo?: boolean}) => Promise<EditResult>} undo
 * @property {(options: {kind: 'list'|'site'|'nearby'|'duplicates'|'without'|'place', uuid?: number, lat?: number, lon?: number, a?: number, b?: number, text?: string}) => Promise<any>} siteQuery
 *   Read-only site queries (opendives.h): list of SiteSummary, a SiteDetail, the site
 *   within a metres of lat/lon (or null), possible duplicates (a: same name within a m,
 *   b: other names within b m), dives without a site, and place: {country, region, city,
 *   offline} at lat/lon in the language text (Nominatim, else offline Natural Earth), or null.
 * @property {(options: {kind: 'gas'|'cylinders'|'desaturation', o2?: number, he?: number, po2?: number, depth?: number}) => Promise<any>} toolQuery
 *   Read-only tools (opendives.h): gas, a GasResult (o2, he per mille, po2 in mbar,
 *   planned depth in mm; rejects with BAD_REQUEST); cylinders, the GasCylinderTypes;
 *   desaturation, the Desaturation now.
 * @property {(options: {kind: 'options'} | {kind: 'dives', fulltext?: string, mode?: string, rules: FilterRule[]}) => Promise<any>} filterQuery
 *   Read-only free filter (opendives.h): FilterOptions, or the identifiers of the
 *   dives matching every rule and the fulltext query (number[]).
 * @property {(options: {action: 'create'|'edit'|'geocode'|'merge'|'delete'|'deleteSite', uuid?: number, other?: number, uuids?: number[], field?: string, value?: string, lat?: number, lon?: number}) => Promise<EditResult>} siteAction
 *   One undoable site change, as Subsurface's site commands.
 * @property {(options: {tripId: number}) => Promise<TripDetail>} getTrip
 * @property {(options: {action: 'location'|'notes'|'remove'|'split'|'merge'|'add'|'ungroup'|'autogroup', tripId?: number, diveId?: number, otherId?: number, diveIds?: number[], value?: string}) => Promise<EditResult>} tripAction
 *   One undoable trip change, as Subsurface's trip commands; "autogroup" (value "on" or
 *   "off") sets the log's trip grouping, as Subsurface's View > Autogroup.
 * @property {() => Promise<Dive[]>} listLoadedDives
 *   The dives of the log in memory, without loading anything.
 * @property {() => Promise<void>} saveLocal
 *   Local save only, without network (manual synchronisation).
 * @property {() => Promise<{status: string, pending: number, reloaded: boolean}>} syncChanges
 *   Local save, then the cloud sync (refused with WRITE_LOCKED except on the test account).
 * @property {(options: {id: number}) => Promise<DiveDetail>} getDive
 *   Detail of one dive of the last loaded log.
 * @property {() => Promise<Prefs>} getPrefs
 *   The core's preferences: units (the loaded log's when it has them), the Settings values.
 * @property {(options: {changes: Partial<CorePrefValues> & {forgetDiveComputer?: number}}) => Promise<void>} setPrefs
 *   Sets core preferences (set_prefs in opendives.h); a device setting, kept by the app.
 * @property {(options: {action: 'list'|'library'|'add'|'size'|'remove'|'rename', name?: string, value?: string, ml?: number, mbar?: number}) => Promise<CylinderTypes>} cylinderTypes
 *   Cylinder types of Settings; "rename" (to value) changes the log as one undoable step,
 *   "library" sets the device's library (value: JSON {"library": [...]}).
 * @property {() => Promise<PlannerSetup>} plannerSetup
 *   The planner's settings as the core's preferences hold them.
 * @property {(request: PlanRequest) => Promise<PlanResult>} planDive
 *   Runs Subsurface's planner; read only, nothing is added to the logbook.
 */

/** @type {any} */
const native = registerPlugin('OpenDivesCore');

/**
 * The native side passes the lists as JSON text (`json`), parsed here once:
 * much faster than converting them into bridge objects.
 * @type {OpenDivesCorePlugin}
 */
export const OpenDivesCore = {
  importSample: () => native.importSample(),
  configureCloud: () => native.configureCloud(),
  async probeCloud() {
    const { json } = await native.probeCloud();
    return JSON.parse(json);
  },
  async listDives() {
    const { exists, json } = await native.listDives();
    return { exists, dives: JSON.parse(json) };
  },
  async listCloudDives(options = {}) {
    const { available, json } = await native.listCloudDives(options);
    if (!available) return { available: false };
    if (!json) return { available: true, cached: false };
    return { available: true, ...JSON.parse(json) };
  },
  async pendingChanges() {
    const { json } = await native.pendingChanges();
    return JSON.parse(json);
  },
  signOut: (options = {}) => native.signOut(options),
  async deleteAccount(options) {
    const { json } = await native.deleteAccount(options);
    return JSON.parse(json);
  },
  async editDive(options) {
    return JSON.parse((await native.editDive(options)).json);
  },
  async siteQuery(options) {
    return JSON.parse((await native.siteQuery(options)).json);
  },
  async toolQuery(options) {
    return JSON.parse((await native.toolQuery(options)).json);
  },
  async filterQuery(options) {
    return JSON.parse((await native.filterQuery(options)).json);
  },
  async siteAction(options) {
    return JSON.parse((await native.siteAction(options)).json);
  },
  async getTrip(options) {
    return JSON.parse((await native.getTrip(options)).json);
  },
  async tripAction(options) {
    return JSON.parse((await native.tripAction(options)).json);
  },
  async undo(options = {}) {
    return JSON.parse((await native.undo(options)).json);
  },
  saveLocal: () => native.saveLocal(),
  async listLoadedDives() {
    return JSON.parse((await native.listLoadedDives()).json);
  },
  async syncChanges() {
    return JSON.parse((await native.syncChanges()).json);
  },
  getDive: (options) => native.getDive(options),
  async getPrefs() {
    return JSON.parse((await native.getPrefs()).json);
  },
  setPrefs: (options) => native.setPrefs(options),
  async cylinderTypes(options) {
    const result = JSON.parse((await native.cylinderTypes(options)).json);
    return { ...result.cylinderTypes, undo: result.undo, redo: result.redo };
  },
  async plannerSetup() {
    return JSON.parse((await native.plannerSetup()).json);
  },
  async planDive(request) {
    return JSON.parse((await native.planDive({ request })).json);
  },
};
