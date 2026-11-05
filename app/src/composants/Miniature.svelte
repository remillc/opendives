<script>
  // @ts-check
  // <Miniature> (spécification, section 4) : profil réduit à la place d'une
  // icône. La courbe occupe toute la hauteur (échelle propre à la plongée) ;
  // la colonne d'eau suit l'échelle commune, donc la profondeur reste lisible.
  import { couleurFond } from '../lib/colonne.js';
  import { formatDepth } from '../lib/format.js';

  /**
   * @type {{
   *   profile: number[],
   *   maxDepthMm: number,
   *   prefs: import('opendives-core').Prefs,
   *   reduite?: boolean,
   * }}
   */
  let { profile, maxDepthMm, prefs, reduite = false } = $props();

  const uid = $props.id();
  const L = 56;
  const H = 40;

  const trace = $derived.by(() => {
    if (profile.length < 4) return null;
    let tMax = 0;
    let dMax = 0;
    for (let i = 0; i < profile.length; i += 2) {
      tMax = Math.max(tMax, profile[i]);
      dMax = Math.max(dMax, profile[i + 1]);
    }
    if (!tMax || !dMax) return null;
    /** @type {string[]} */
    const pts = [];
    for (let i = 0; i < profile.length; i += 2) {
      const x = (profile[i] / tMax) * L;
      const y = (profile[i + 1] / dMax) * (H - 1);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return { ligne: `M${pts.join('L')}`, eau: `M0,0L${pts.join('L')}L${L},0Z` };
  });
</script>

<svg
  class="miniature"
  class:reduite
  viewBox="0 0 {L} {H}"
  preserveAspectRatio="none"
  role={reduite ? undefined : 'img'}
  aria-hidden={reduite ? 'true' : undefined}
  aria-label={reduite ? undefined : `Profil, ${formatDepth(maxDepthMm, prefs)} au plus profond`}
>
  <defs>
    <linearGradient id="eau-{uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color: var(--od-sapin-clair)" />
      <stop offset="1" style="stop-color: {couleurFond(maxDepthMm)}" />
    </linearGradient>
  </defs>
  {#if trace}
    <path d={trace.eau} fill="url(#eau-{uid})" />
    <path d={trace.ligne} class="ligne" vector-effect="non-scaling-stroke" />
  {/if}
</svg>

<style>
  @layer od.composants {
    .miniature {
      display: block;
      width: 56px;
      height: 40px;
      border-radius: 8px;
      background: var(--od-fond-miniature);
      overflow: hidden;
      flex-shrink: 0;

      :global(.ios) & {
        height: 36px;
        border-radius: 4px;
      }

      &.reduite {
        width: 100%;
        height: 100%;
        border-radius: 3px;
      }
    }

    .ligne {
      fill: none;
      stroke: var(--od-trace-profil);
      stroke-width: 1.5;
      stroke-linejoin: round;
    }
  }
</style>
