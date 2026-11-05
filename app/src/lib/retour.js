// @ts-check
// Touche Retour d'Android (spécification, section 3 : le retour système
// fonctionne partout). Framework7 n'utilise pas l'historique du navigateur :
// sans ce relais, Retour fermerait l'application.
import { App as CapacitorApp } from '@capacitor/app';
import { f7 } from 'framework7-svelte';

export function activerRetour() {
  CapacitorApp.addListener('backButton', () => {
    // 1. Une feuille ou une boîte de dialogue ouverte se ferme.
    const modal = document.querySelector('.modal-in');
    if (modal) {
      if (modal.classList.contains('actions-modal')) f7.actions.close();
      else if (modal.classList.contains('dialog')) f7.dialog.close();
      else if (modal.classList.contains('sheet-modal')) f7.sheet.close();
      else if (modal.classList.contains('popup')) f7.popup.close();
      return;
    }
    // 2. Une recherche active se referme.
    const recherche = document.querySelector('.searchbar-enabled');
    if (recherche) {
      f7.searchbar.disable(/** @type {HTMLElement} */ (recherche));
      return;
    }
    // 3. Retour à l'écran précédent de la section.
    const vue = f7.views.current;
    if (vue && vue.router.history.length > 1) {
      vue.router.back();
      return;
    }
    // 4. Depuis une autre section, retour au Carnet.
    if (vue && vue.el?.id !== 'vue-carnet') {
      f7.tab.show('#vue-carnet');
      return;
    }
    // 5. Depuis le Carnet : l'application passe en arrière-plan, comme sur Android.
    CapacitorApp.minimizeApp();
  });
}
