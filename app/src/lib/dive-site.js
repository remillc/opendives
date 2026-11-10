// @ts-check
// Giving a site to a dive that has none: the list of dives without a site and
// the profile of one of them do the same thing.
import { f7 } from 'framework7-svelte';
import { showSnackbar } from './snackbar.js';
import { logbook, saveDiveChanges } from './logbook.svelte.js';
import { t } from './i18n.js';

/**
 * @param {number} diveId
 * @param {number} uuid
 * @returns {Promise<boolean>} whether the dive now has this site
 */
export async function setDiveSite(diveId, uuid) {
  try {
    await saveDiveChanges(diveId, { site: uuid });
    logbook.sitesVersion++;
    return true;
  } catch (e) {
    console.error('Set site', e);
    showSnackbar(t('edit.failed'));
    return false;
  }
}

/**
 * "Choose a site": the sites with the most dives first.
 * @param {number} diveId
 * @param {import('opendives-core').SiteSummary[]} sites
 * @param {() => void} [done] called once the dive has its site
 */
export function chooseDiveSite(diveId, sites, done) {
  const choices = [...sites].filter((s) => s.name).sort((a, b) => b.dives - a.dives).slice(0, 12);
  const pick = async (/** @type {number} */ uuid) => {
    if (await setDiveSite(diveId, uuid)) done?.();
  };
  f7.actions
    .create({
      buttons: [
        [{ text: t('sites.chooseSite'), label: true }, ...choices.map((s) => ({ text: s.name, onClick: () => pick(s.uuid) }))],
        [{ text: t('logbook.cancel') }],
      ],
    })
    .open();
}
