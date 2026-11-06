// @ts-check
// The people and tags already in the logbook, proposed by the chips fields
// (spec, section 4, "People and tags in dive editing"), the most used first.
import { OpenDivesCore } from 'opendives-core';

/**
 * @param {'buddy'|'guide'|'tag'|'suit'} field
 * @returns {Promise<string[]>}
 */
export async function logbookValues(field) {
  try {
    /** @type {{key: string, dives: number}[]} */
    const values = await OpenDivesCore.statsQuery({ kind: 'values', field });
    return values.filter((v) => v.key).sort((a, b) => b.dives - a.dives).map((v) => v.key);
  } catch (e) {
    console.error('Logbook values', field, e);
    return [];
  }
}
