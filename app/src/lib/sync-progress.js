// @ts-check
// Progress of a sync with the cloud, from the messages of Subsurface's git
// work ("syncProgress" events, opendives.h set_sync_progress). The core gives
// stages and, while transferring, counts ("Transfer from storage (30/80)");
// they are mapped onto one bar that never goes back:
//   connect  0 to 15 %   connection, fetch started
//   receive 15 to 65 %   objects and deltas received
//   send    70 to 80 %   local commits pushed (or merged first)
//   read    80 to 100 %  local copy updated, then the log read again

/** @typedef {'connect'|'receive'|'merge'|'send'|'read'} SyncStage */
/** @typedef {{ stage: SyncStage, fraction: number }} SyncProgress */

/** @type {[RegExp, SyncStage, number, number][]} message, stage, start, width */
const STAGES = [
  [/^(Sync with cloud storage|Synchronising data file|Trying different cloud server)/, 'connect', 0.05, 0],
  [/^Successful cloud connection/, 'connect', 0.15, 0],
  [/^Transfer from storage/, 'receive', 0.15, 0.5],
  [/^Try to merge/, 'merge', 0.68, 0],
  [/^(Push local changes|Store data into cloud storage)/, 'send', 0.7, 0],
  [/^Transfer to storage/, 'send', 0.7, 0.1],
  [/^Update local storage/, 'read', 0.8, 0],
  [/^Checkout from storage/, 'read', 0.8, 0.1],
  [/^Done syncing/, 'read', 0.92, 0],
];

/**
 * The progress after a message of the core; an unknown message keeps it.
 * @param {string} message
 * @param {SyncProgress|null} previous
 * @returns {SyncProgress|null}
 */
export function nextProgress(message, previous) {
  const found = STAGES.find(([re]) => re.test(message));
  if (!found) return previous;
  const [, stage, start, width] = found;
  const counts = /\((\d+)\/(\d+)\)/.exec(message);
  const part = counts && Number(counts[2]) > 0 ? Math.min(1, Number(counts[1]) / Number(counts[2])) : 0;
  const fraction = Math.max(previous?.fraction ?? 0, start + width * part);
  return { stage: fraction > (previous?.fraction ?? 0) || !previous ? stage : previous.stage, fraction };
}
