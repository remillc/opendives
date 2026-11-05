<script>
  // @ts-check
  // <Profil> (spécification, section 4) : profondeur en fonction du temps,
  // surface en haut ; colonne d'eau ; curseur au doigt ; couche Gaz quand la
  // plongée en contient. Les autres couches (plafond, ppO2, tissus) viendront.
  import { couleurFond } from '../lib/colonne.js';
  import { depthUnit, formatDepth, formatDuration, formatMinSec } from '../lib/format.js';
  // « t » désigne ici les temps du profil : la traduction s'appelle « texte ».
  import { t as texte } from '../lib/i18n.js';

  /**
   * @type {{
   *   samples: import('opendives-core').DiveSamples,
   *   cylinders: import('opendives-core').Cylinder[],
   *   divemode: string,
   *   maxDepthMm: number,
   *   durationSeconds: number,
   *   prefs: import('opendives-core').Prefs,
   * }}
   */
  let { samples, cylinders, divemode, maxDepthMm, durationSeconds, prefs } = $props();

  const uid = $props.id();
  let largeur = $state(320);
  const HAUTEUR = 180;
  const MARGE_G = 40;
  const MARGE_D = 8;
  const MARGE_H = 8;
  const MARGE_B = 22;
  const BANDE = 22;

  const t = $derived(samples.timeSeconds);
  const d = $derived(samples.depthMm);
  const tMax = $derived(Math.max(1, t.length ? t[t.length - 1] : durationSeconds));
  const dMaxDonnees = $derived(Math.max(1, ...d, maxDepthMm));

  // Graduations en unité d'affichage, à pas « ronds ».
  const graduations = $derived.by(() => {
    const parUnite = prefs.length === 'ft' ? 304.8 : 1000;
    const max = dMaxDonnees / parUnite;
    const pas = [1, 2, 5, 10, 20, 25, 50, 100, 200].find((p) => max / p <= 5) ?? 500;
    const fin = Math.ceil(max / pas) * pas;
    const res = [];
    for (let v = 0; v <= fin + 1e-9; v += pas) res.push({ valeur: v, mm: v * parUnite });
    return { liste: res, finMm: fin * parUnite };
  });

  const larg = $derived(Math.max(10, largeur - MARGE_G - MARGE_D));
  const haut = $derived(HAUTEUR - MARGE_H - MARGE_B);
  /** @param {number} s */
  const x = (s) => MARGE_G + (s / tMax) * larg;
  /** @param {number} mm */
  const y = (mm) => MARGE_H + (mm / graduations.finMm) * haut;

  const chemins = $derived.by(() => {
    if (!t.length) return null;
    let ligne = '';
    for (let i = 0; i < t.length; i++) ligne += `${i ? 'L' : 'M'}${x(t[i]).toFixed(1)},${y(d[i]).toFixed(1)}`;
    const eau = `${ligne}L${x(t[t.length - 1]).toFixed(1)},${y(0).toFixed(1)}L${x(t[0]).toFixed(1)},${y(0).toFixed(1)}Z`;
    return { ligne, eau };
  });

  const reperesTemps = $derived.by(() => {
    const minutes = tMax / 60;
    const pas = [5, 10, 15, 20, 30, 60, 120].find((p) => minutes / p <= 5) ?? 240;
    const res = [];
    for (let m = 0; m * 60 <= tMax; m += pas) res.push(m);
    return res;
  });

  // Couche Gaz : une bande par mélange, à partir de la bouteille respirée.
  const segmentsGaz = $derived.by(() => {
    /** @type {{debut: number, fin: number, nom: string, oxygene: boolean}[]} */
    const res = [];
    const recycleur = divemode === 'CCR' || divemode === 'PSCR';
    for (let i = 0; i < t.length; i++) {
      const c = samples.cylinder[i];
      const cyl = c >= 0 ? cylinders[c] : null;
      const nom = cyl ? cyl.gas : recycleur ? texte('profil.recycleur') : '';
      const oxygene = cyl ? cyl.o2Permille > 210 : false;
      const dernier = res[res.length - 1];
      if (dernier && dernier.nom === nom) dernier.fin = t[i];
      else res.push({ debut: t[i], fin: t[i], nom, oxygene });
    }
    return res.filter((s) => s.nom);
  });
  const gazDisponible = $derived(segmentsGaz.length > 0);
  let coucheGaz = $state(false);

  // Curseur : un doigt posé place un trait vertical et affiche temps et profondeur.
  /** @type {number|null} */
  let curseur = $state(null);

  /** @param {PointerEvent} e */
  function placerCurseur(e) {
    const svg = /** @type {SVGSVGElement} */ (e.currentTarget);
    const r = svg.getBoundingClientRect();
    const s = ((e.clientX - r.left - MARGE_G) / larg) * tMax;
    let lo = 0;
    let hi = t.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (t[mid] < s) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && Math.abs(t[lo - 1] - s) < Math.abs(t[lo] - s)) lo--;
    curseur = lo;
  }

  /** @param {PointerEvent} e */
  function bouger(e) {
    if (e.buttons || e.pointerType === 'touch') placerCurseur(e);
  }

  const description = $derived(
    texte('profil.description', { profondeur: formatDepth(maxDepthMm, prefs), duree: formatDuration(durationSeconds) }),
  );
</script>

<div class="profil">
  <div class="lecture od-valeur" aria-hidden="true">
    {#if curseur !== null}
      <span>{texte('profil.temps')} <strong>{formatMinSec(t[curseur])}</strong></span>
      <span>{texte('profil.profondeur')} <strong>{formatDepth(d[curseur], prefs)}</strong></span>
    {:else}
      <span class="consigne">{texte('profil.consigne')}</span>
    {/if}
  </div>

  <div class="cadre" bind:clientWidth={largeur}>
    <svg
      width={largeur}
      height={HAUTEUR + (coucheGaz ? BANDE + 4 : 0)}
      role="img"
      aria-label={description}
      onpointerdown={placerCurseur}
      onpointermove={bouger}
    >
      <defs>
        <linearGradient id="eau-{uid}" x1="0" y1={y(0)} x2="0" y2={y(dMaxDonnees)} gradientUnits="userSpaceOnUse">
          <stop offset="0" style="stop-color: var(--od-sapin-clair)" />
          <stop offset="1" style="stop-color: {couleurFond(maxDepthMm)}" />
        </linearGradient>
      </defs>

      {#each graduations.liste as g (g.valeur)}
        <line class="grille" x1={MARGE_G} x2={MARGE_G + larg} y1={y(g.mm)} y2={y(g.mm)} />
        <text class="etiquette od-valeur" x={MARGE_G - 6} y={y(g.mm) + 4} text-anchor="end">{g.valeur}</text>
      {/each}
      <text class="etiquette" x={4} y={MARGE_H + 4}>{depthUnit(prefs)}</text>
      {#each reperesTemps as m (m)}
        <text class="etiquette od-valeur" x={x(m * 60)} y={HAUTEUR - 6} text-anchor="middle">{m}</text>
      {/each}
      <text class="etiquette" x={MARGE_G + larg} y={HAUTEUR - 6} text-anchor="end">{texte('unites.minutes')}</text>

      {#if chemins}
        <path d={chemins.eau} fill="url(#eau-{uid})" />
        <path d={chemins.ligne} class="trace" />
      {/if}

      {#if coucheGaz}
        {#each segmentsGaz as s, i (i)}
          {@const x1 = x(s.debut)}
          {@const x2 = Math.max(x(s.fin), x1 + 1)}
          <g class="gaz" class:oxygene={s.oxygene}>
            <rect x={x1} y={HAUTEUR + 2} width={x2 - x1} height={BANDE} rx="3" />
            {#if x2 - x1 > 44}
              <text x={x1 + 6} y={HAUTEUR + 2 + BANDE / 2 + 4}>{s.nom}</text>
            {/if}
          </g>
        {/each}
      {/if}

      {#if curseur !== null}
        <line class="curseur" x1={x(t[curseur])} x2={x(t[curseur])} y1={MARGE_H} y2={MARGE_H + haut} />
      {/if}
    </svg>
  </div>

  {#if gazDisponible}
    <div class="couches">
      <!-- Cible de 48 px autour d'une puce de 32 px (spécification, section 3). -->
      <button type="button" class="filtre" aria-pressed={coucheGaz} onclick={() => (coucheGaz = !coucheGaz)}>
        <span class="chip" class:chip-outline={!coucheGaz}><span class="chip-label">{texte('profil.gaz')}</span></span>
      </button>
    </div>
  {/if}
</div>

<style>
  @layer od.composants {
    .profil {
      padding: 0 16px;
    }

    svg {
      display: block;
    }

    .lecture {
      display: flex;
      gap: 24px;
      min-height: 24px;
      align-items: baseline;
      font-size: 14px;
      color: var(--f7-md-on-surface-variant, var(--f7-list-item-text-text-color));

      strong {
        color: var(--f7-md-on-surface, inherit);
      }
    }

    .consigne {
      font-size: 12px;
    }

    .cadre {
      width: 100%;
      touch-action: pan-y;
      user-select: none;
    }

    .grille {
      stroke: var(--f7-list-item-border-color);
      stroke-width: 1;
    }

    .etiquette {
      font-size: 11px;
      fill: var(--f7-md-on-surface-variant, var(--f7-list-item-text-text-color));
    }

    .trace {
      fill: none;
      stroke: var(--od-trace-profil);
      stroke-width: 2;
      stroke-linejoin: round;
    }

    .curseur {
      stroke: var(--od-mandarine);
      stroke-width: 2;
    }

    .gaz {
      rect {
        fill: var(--od-teinte);
      }

      &.oxygene rect {
        stroke: var(--od-oxygene);
        stroke-width: 2;
      }

      text {
        font-size: 12px;
        fill: var(--od-sur-teinte);
      }
    }

    .couches {
      display: flex;
      gap: 8px;
      padding: 8px 0;
    }

    .filtre {
      min-height: 48px;
      min-width: 48px;
      display: flex;
      align-items: center;
      padding: 0;
      border: none;
      background: none;
      cursor: pointer;
      font: inherit;
    }
  }
</style>
