// @ts-check
// The computers the logbook's dives come from (Settings, "Ordinateurs du carnet").
import { OpenDivesCore } from 'opendives-core';
import { refreshAfterChange } from './logbook.svelte.js';

/** @typedef {import('opendives-core').LogbookComputer} LogbookComputer */

/** A computer as the diver calls it. @param {LogbookComputer} c */
export const computerName = (c) => c.nickname || c.model;

/** What the core knows of two computers found in the same dives. @param {LogbookComputer} a @param {LogbookComputer} b */
const sharedWith = (a, b) => a.shared.find((s) => s.model === b.model && s.serial === b.serial);

/** Share of their common dives that must be the same recording. */
const SAME_RECORDING_SHARE = 0.8;

/**
 * Whether two computers may be one. Two serial numbers decide: the same one is
 * the same computer, different ones are two computers. When one is missing, two
 * computers found in the same dives are compared by their profiles, whatever
 * their names: the name alone proves nothing. Those that never meet in a dive
 * can only be compared by model (spec).
 * @param {LogbookComputer} a
 * @param {LogbookComputer} b
 */
function mayBeSame(a, b) {
  if (a.serial && b.serial) return a.serial === b.serial;
  const shared = sharedWith(a, b);
  if (shared) return shared.same / shared.dives >= SAME_RECORDING_SHARE;
  return a.model === b.model;
}

/**
 * The entry to keep of two duplicates: the one with a serial number, then the
 * one the diver named, then the one with the most dives. Merging the other way
 * would lose the serial number or the name.
 * @param {LogbookComputer} a
 * @param {LogbookComputer} b
 */
function keeperOf(a, b) {
  const order =
    Number(!!b.serial) - Number(!!a.serial) ||
    Number(!!b.nickname) - Number(!!a.nickname) ||
    b.dives - a.dives ||
    `${a.model}\n${a.serial}`.localeCompare(`${b.model}\n${b.serial}`);
  return order <= 0 ? a : b;
}

/**
 * The computers this one should be merged into: it is the entry to remove.
 * @param {LogbookComputer} computer
 * @param {LogbookComputer[]} all
 */
export function mergeTargets(computer, all) {
  return all
    .filter((other) => other !== computer && mayBeSame(computer, other) && keeperOf(computer, other) === other)
    .sort((a, b) => (keeperOf(a, b) === a ? -1 : 1));
}

/**
 * The duplicates that should be merged into this computer: it is the one kept.
 * @param {LogbookComputer} computer
 * @param {LogbookComputer[]} all
 */
export function duplicatesOf(computer, all) {
  return all.filter((other) => other !== computer && mayBeSame(computer, other) && keeperOf(computer, other) === computer);
}

/** In how many dives the two are the same recording: only one is kept there. @param {LogbookComputer} a @param {LogbookComputer} b */
export const sameRecordings = (a, b) => sharedWith(a, b)?.same ?? 0;

/**
 * One undoable change, saved and synced like an edit.
 * @param {Parameters<import('opendives-core').OpenDivesCorePlugin['diveComputerAction']>[0]} options
 */
export async function computerChange(options) {
  const result = await OpenDivesCore.diveComputerAction(options);
  await refreshAfterChange(result.undo);
  return result;
}
