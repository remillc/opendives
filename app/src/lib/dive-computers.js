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
 * The computers this one may be a duplicate of. Two that appear in the same
 * dives are compared by their profiles, whatever their names: the name alone
 * proves nothing. Those that never meet in a dive can only be compared by
 * model, and then only without a serial number (spec).
 * @param {LogbookComputer} computer
 * @param {LogbookComputer[]} all
 */
export function duplicateCandidates(computer, all) {
  return all
    .filter((other) => {
      if (other === computer) return false;
      const shared = sharedWith(computer, other);
      if (shared) return shared.same / shared.dives >= SAME_RECORDING_SHARE;
      return !computer.serial && other.model === computer.model;
    })
    .sort((a, b) => Number(!!b.serial) - Number(!!a.serial));
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
