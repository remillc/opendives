<script>
  // @ts-check
  // <EtatSynchro> (spécification, section 4) : une ligne sous le titre du
  // Carnet, jamais une fenêtre. Une icône accompagne toujours la couleur.
  import Icone from './Icone.svelte';
  import { t } from '../lib/i18n.js';

  /** @type {{ synchro: import('../lib/carnet.svelte.js').Synchro }} */
  let { synchro } = $props();

  // Aucune modification n'est possible pour l'instant : rien n'attend d'envoi.
  const etats = {
    cloud: { icone: 'coche', texte: t('synchro.cloud'), attente: false },
    horsLigne: { icone: 'horsLigne', texte: t('synchro.horsLigne'), attente: true },
    local: { icone: 'appareil', texte: t('synchro.local'), attente: false },
  };
  const etat = $derived(etats[synchro]);
</script>

<div class="etat-synchro" class:attente={etat.attente} role="status">
  <Icone nom={/** @type {any} */ (etat.icone)} taille={18} />
  <span>{etat.texte}</span>
</div>

<style>
  @layer od.composants {
    .etat-synchro {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      font-size: 14px;
      line-height: 20px;
      color: var(--f7-md-on-surface-variant, var(--f7-list-item-text-text-color));

      :global(.ios) & {
        font-size: 13px;
        color: var(--f7-list-item-text-text-color);
      }

      &.attente {
        color: var(--od-attente);
      }
    }
  }
</style>
