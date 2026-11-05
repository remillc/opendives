// @ts-check
// Framework7 keeps a view's previous page in the document, hidden under the
// current one. Without "inert", TalkBack and VoiceOver can still reach it.
import { f7, f7ready } from 'framework7-svelte';

function update() {
  document.querySelectorAll('.page').forEach((page) => {
    const hidden = page.classList.contains('page-previous') || page.classList.contains('page-next');
    page.toggleAttribute('inert', hidden);
  });
}

export function enableAccessibility() {
  f7ready(() => {
    f7.on('pageAfterIn', update);
    f7.on('pageAfterOut', update);
    f7.on('pageBeforeIn', update);
  });
}
