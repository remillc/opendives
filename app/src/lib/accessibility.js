// @ts-check
// Framework7 keeps a view's previous page in the document, hidden under the
// current one. Without "inert", TalkBack and VoiceOver can still reach it.
import { f7, f7ready } from 'framework7-svelte';
import { t } from './i18n.js';

function update() {
  document.querySelectorAll('.page').forEach((page) => {
    // On a tablet, the list stays on screen and in use beside the detail.
    const besideDetail = page.classList.contains('page-master') && page.parentElement?.querySelector(':scope > .page-current.page-master-detail');
    const hidden = !besideDetail && (page.classList.contains('page-previous') || page.classList.contains('page-next'));
    page.toggleAttribute('inert', hidden);
  });
  nameClearButtons();
  nameTitles();
}

/**
 * The title of a top bar is the page's heading, level 1, for TalkBack and VoiceOver
 * (task 2026-11-14-117: the band's title is now the bar's own).
 */
function nameTitles() {
  document.querySelectorAll('.navbar .title:not([role])').forEach((title) => {
    title.setAttribute('role', 'heading');
    title.setAttribute('aria-level', '1');
  });
}

/**
 * Framework7's search bars clear with a bare span: a button named « Effacer la recherche »
 * for TalkBack and VoiceOver (task 2026-11-13-113), named at start and when a page shows.
 */
function nameClearButtons() {
  document.querySelectorAll('.searchbar .input-clear-button:not([aria-label])').forEach((button) => {
    button.setAttribute('role', 'button');
    button.setAttribute('aria-label', t('searchField.clear'));
  });
}

export function enableAccessibility() {
  f7ready(() => {
    f7.on('pageAfterIn', update);
    f7.on('pageAfterOut', update);
    f7.on('pageBeforeIn', update);
    f7.on(/** @type {any} */ ('searchbarInit'), nameClearButtons);
    nameClearButtons();
    nameTitles();
  });
}
