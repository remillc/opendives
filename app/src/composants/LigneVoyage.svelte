<script>
  // @ts-check
  // <LigneVoyage> (spécification, section 4) : un voyage replié. Quatre
  // miniatures en grille 2 × 2, le nom du voyage, puis « 4 plongées, de 21,8 à
  // 28,7 m » ; un toucher déplie le voyage.
  import Icone from './Icone.svelte';
  import Miniature from './Miniature.svelte';
  import { depthValue, formatDepth, formatLongDate } from '../lib/format.js';

  /**
   * @type {{
   *   dives: import('opendives-core').Dive[],
   *   location: string,
   *   prefs: import('opendives-core').Prefs,
   *   ouvert: boolean,
   *   onbasculer: () => void,
   * }}
   */
  let { dives, location, prefs, ouvert, onbasculer } = $props();

  // Les plongées arrivent de la plus récente à la plus ancienne.
  const debut = $derived(dives[dives.length - 1].date);
  const titre = $derived(location || `Voyage du ${formatLongDate(debut)}`);
  const resume = $derived.by(() => {
    const n = dives.length;
    if (n === 1) return dives[0].maxDepthMm ? `1 plongée, ${formatDepth(dives[0].maxDepthMm, prefs)}` : '1 plongée';
    // Une profondeur nulle signifie « inconnue » : elle n'entre pas dans l'écart.
    const p = dives.map((d) => d.maxDepthMm).filter((mm) => mm > 0);
    if (!p.length) return `${n} plongées`;
    const min = Math.min(...p);
    const max = Math.max(...p);
    return min === max
      ? `${n} plongées, ${formatDepth(max, prefs)}`
      : `${n} plongées, de ${depthValue(min, prefs)} à ${formatDepth(max, prefs)}`;
  });
  const apercu = $derived(dives.slice(0, 4));

  /** @param {MouseEvent} e */
  function basculer(e) {
    e.preventDefault();
    onbasculer();
  }

  /** @param {KeyboardEvent} e */
  function touche(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onbasculer();
    }
  }
</script>

<li class="ligne-voyage">
  <div
    class="item-link item-content no-chevron"
    role="button"
    tabindex="0"
    aria-expanded={ouvert}
    onclick={basculer}
    onkeydown={touche}
  >
    <div class="item-media">
      <div class="grille" aria-hidden="true">
        {#each apercu as d (d.id)}
          <Miniature profile={d.profile} maxDepthMm={d.maxDepthMm} {prefs} reduite />
        {/each}
      </div>
    </div>
    <div class="item-inner">
      <div class="item-title-row">
        <div class="item-title">{titre}</div>
        <div class="item-after"><span class="fleche" class:ouvert><Icone nom="deplier" /></span></div>
      </div>
      <div class="item-text od-valeur">{resume}</div>
      {#if location}<div class="item-text">Voyage du {formatLongDate(debut)}</div>{/if}
    </div>
  </div>
</li>

<style>
  @layer od.composants {
    .grille {
      width: 56px;
      height: 40px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      gap: 2px;
    }

    .item-title {
      white-space: normal;
    }

    .fleche {
      display: block;

      &.ouvert {
        transform: rotate(180deg);
      }
    }
  }
</style>
