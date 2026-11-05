<script>
  // @ts-check
  // <LignePlongee> (spécification, section 4) : miniature, site (ou « Site à
  // préciser »), date et heure ; à droite la profondeur maximale puis la durée.
  import Miniature from './Miniature.svelte';
  import { formatDateTime, formatDepth, formatDuration } from '../lib/format.js';

  /**
   * `dansVoyage` : la ligne appartient à un voyage déplié et se décale vers la droite.
   * @type {{ dive: import('opendives-core').Dive, prefs: import('opendives-core').Prefs, dansVoyage?: boolean }}
   */
  let { dive, prefs, dansVoyage = false } = $props();

  // Nom lu par TalkBack et VoiceOver : site, date, puis les valeurs.
  // Une profondeur nulle signifie « inconnue » dans le cœur : elle n'est pas lue.
  const nom = $derived(
    [
      dive.site || 'Site à préciser',
      formatDateTime(dive.date),
      dive.maxDepthMm ? `profondeur maximale ${formatDepth(dive.maxDepthMm, prefs)}` : '',
      `durée ${formatDuration(dive.durationSeconds)}`,
    ]
      .filter(Boolean)
      .join(', '),
  );
</script>

<li class:dans-voyage={dansVoyage}>
  <a href="/plongee/{dive.id}/" class="item-link item-content ligne-plongee" aria-label={nom}>
    <div class="item-media">
      <Miniature profile={dive.profile} maxDepthMm={dive.maxDepthMm} {prefs} />
    </div>
    <div class="item-inner">
      <div class="item-title-row">
        <div class="item-title">
          {#if dive.site}{dive.site}{:else}<span class="a-preciser">Site à préciser</span>{/if}
        </div>
        <div class="item-after valeurs od-valeur">
          {#if dive.maxDepthMm}<strong>{formatDepth(dive.maxDepthMm, prefs)}</strong>{/if}
          <span>{formatDuration(dive.durationSeconds)}</span>
        </div>
      </div>
      <div class="item-text">{formatDateTime(dive.date)}</div>
    </div>
  </a>
</li>

<style>
  @layer od.composants {
    .dans-voyage {
      --f7-list-item-padding-horizontal: 32px;
    }

    .item-title {
      white-space: normal;
    }

    .a-preciser {
      color: var(--f7-list-item-text-text-color, var(--f7-md-on-surface-variant));
      font-weight: normal;
    }

    .valeurs {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      text-align: right;
      flex-shrink: 0;
      margin-left: 12px;

      strong {
        color: var(--f7-list-item-title-text-color, inherit);
      }
    }
  }
</style>
