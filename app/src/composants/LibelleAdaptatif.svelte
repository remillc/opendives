<script>
  // @ts-check
  // Libellé d'onglet qui affiche sa forme complète quand elle tient, sa forme
  // courte sinon (« Statistiques », « Stats »). Les lecteurs d'écran entendent
  // toujours la forme complète.
  import { onMount } from 'svelte';

  /** @type {{ complet: string, court: string }} */
  let { complet, court } = $props();

  /** @type {HTMLSpanElement|undefined} */
  let libelle = $state();
  /** @type {HTMLSpanElement|undefined} */
  let mesure = $state();
  let raccourci = $state(false);

  function ajuster() {
    if (!libelle || !mesure) return;
    raccourci = mesure.offsetWidth > libelle.clientWidth;
  }

  onMount(() => {
    // La largeur de l'onglet change en rotation ; celle du texte, avec la taille de texte du système.
    const observateur = new ResizeObserver(ajuster);
    if (libelle) observateur.observe(libelle);
    if (mesure) observateur.observe(mesure);
    ajuster();
    return () => observateur.disconnect();
  });
</script>

<span class="tabbar-label libelle" class:raccourci bind:this={libelle}>
  <span class="complet">{complet}</span>
  <span class="court" aria-hidden="true">{court}</span>
  <span class="mesure" aria-hidden="true" bind:this={mesure}>{complet}</span>
</span>

<style>
  @layer od.composants {
    .libelle {
      position: relative;
      display: block;
      width: 100%;
      overflow: hidden;
      white-space: nowrap;
      text-align: center;

      &.raccourci .complet {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
      }

      &:not(.raccourci) .court {
        display: none;
      }
    }

    .mesure {
      position: absolute;
      left: 0;
      top: 0;
      visibility: hidden;
      white-space: nowrap;
    }
  }
</style>
