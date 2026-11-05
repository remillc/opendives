// @ts-check
// Framework7 garde dans le document la page précédente d'une vue, cachée sous
// la page courante. Sans « inert », TalkBack et VoiceOver y naviguent encore.
import { f7, f7ready } from 'framework7-svelte';

function mettreAJour() {
  document.querySelectorAll('.page').forEach((page) => {
    const cachee = page.classList.contains('page-previous') || page.classList.contains('page-next');
    page.toggleAttribute('inert', cachee);
  });
}

export function activerAccessibilite() {
  f7ready(() => {
    f7.on('pageAfterIn', mettreAJour);
    f7.on('pageAfterOut', mettreAJour);
    f7.on('pageBeforeIn', mettreAJour);
  });
}
