<script>
  // @ts-check
  // Écran Détail d'une plongée (spécification, sections 4 à 6) : profil, faits,
  // bouteilles et gaz, compagnons et étiquettes en deux blocs séparés, notes,
  // « Planifier à partir de cette plongée ».
  import { onMount } from 'svelte';
  import { Page, Navbar, Link, List, ListItem, BlockTitle, Block, Button } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import Profil from '../composants/Profil.svelte';
  import { carnet } from '../lib/carnet.svelte.js';
  import {
    formatCylinderSize,
    formatDepth,
    formatDuration,
    formatFullDate,
    formatPressure,
    formatSac,
    formatTemperature,
  } from '../lib/format.js';
  import { t, tSiExiste } from '../lib/i18n.js';

  /** @type {{ f7route: { params: { id: string } } }} */
  let { f7route } = $props();

  /** @type {import('opendives-core').DiveDetail|null} */
  let plongee = $state(null);
  let erreur = $state(false);
  const prefs = $derived(carnet.prefs);

  onMount(async () => {
    try {
      plongee = await OpenDivesCore.getDive({ id: Number(f7route.params.id) });
    } catch (e) {
      console.error('Détail de la plongée', e);
      erreur = true;
    }
  });

  // Mode et usage d'une bouteille : traduits quand la clé existe, sinon tels que le cœur les donne.
  /** @param {string} mode */
  const nomMode = (mode) => tSiExiste(`detail.modes.${mode}`) ?? mode;
  /** @param {string} usage */
  const nomUsage = (usage) => tSiExiste(`detail.usages.${usage}`) ?? '';

  const bouteilles = $derived(plongee ? plongee.cylinders.filter((c) => c.used) : []);
  const titre = $derived(plongee ? plongee.site || t('plongee.siteAPreciser') : '');

  /** @param {import('opendives-core').Cylinder} c */
  function pressions(c) {
    if (c.startMbar && c.endMbar)
      return t('detail.pressions', { debut: formatPressure(c.startMbar, prefs), fin: formatPressure(c.endMbar, prefs) });
    if (c.startMbar) return t('detail.pressionDepart', { pression: formatPressure(c.startMbar, prefs) });
    return '';
  }

  /** @param {import('opendives-core').Cylinder} c */
  function detailBouteille(c) {
    return [c.description, formatCylinderSize(c.sizeMl, c.workingPressureMbar, prefs), nomUsage(c.use)]
      .filter(Boolean)
      .join(', ');
  }
</script>

<Page>
  <Navbar title={titre}>
    <!-- Lien de retour nommé : en MD3, Framework7 masque son texte et TalkBack lirait « # ». -->
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-lecteur">{t('detail.retour')}</span>
      </Link>
    {/snippet}
  </Navbar>

  {#if erreur}
    <Block>
      <h2 class="titre-etat">{t('detail.erreurTitre')}</h2>
      <p>{t('detail.erreurPhrase')}</p>
    </Block>
  {:else if !plongee}
    <div class="skeleton-text" aria-busy="true" aria-label={t('detail.chargement')}>
      <div class="skeleton-block squelette-profil"></div>
      <List>
        {#each Array(5) as _, i (i)}
          <ListItem title="––––––––––––––" after="––––––" aria-hidden="true" />
        {/each}
      </List>
    </div>
  {:else}
    <Profil
      samples={plongee.samples}
      cylinders={plongee.cylinders}
      divemode={plongee.divemode}
      maxDepthMm={plongee.maxDepthMm}
      durationSeconds={plongee.durationSeconds}
      {prefs}
    />

    <List dividers class="faits">
      <ListItem title={t('detail.date')} after={formatFullDate(plongee.date)} />
      {#if plongee.number}<ListItem title={t('detail.numero')} after={String(plongee.number)} />{/if}
      {#if plongee.maxDepthMm}<ListItem title={t('detail.profondeurMax')} after={formatDepth(plongee.maxDepthMm, prefs)} />{/if}
      {#if plongee.meanDepthMm}<ListItem title={t('detail.profondeurMoyenne')} after={formatDepth(plongee.meanDepthMm, prefs)} />{/if}
      <ListItem title={t('detail.duree')} after={formatDuration(plongee.durationSeconds)} />
      {#if formatTemperature(plongee.waterTempMk, prefs)}
        <ListItem title={t('detail.temperatureEau')} after={formatTemperature(plongee.waterTempMk, prefs) ?? ''} />
      {/if}
      <ListItem title={t('detail.mode')} after={nomMode(plongee.divemode)} />
      {#if plongee.sacMlMin}<ListItem title={t('detail.sac')} after={formatSac(plongee.sacMlMin, prefs)} />{/if}
      {#if plongee.suit}<ListItem title={t('detail.combinaison')} after={plongee.suit} />{/if}
      <ListItem
        title={t('detail.ordinateur')}
        after={plongee.computer
          ? plongee.computers > 1
            ? t('detail.ordinateurAutres', { modele: plongee.computer, n: plongee.computers - 1 })
            : plongee.computer
          : t('detail.aPreciser')}
      />
      {#if plongee.trip?.location}<ListItem title={t('detail.voyage')} after={plongee.trip.location} />{/if}
    </List>

    {#if bouteilles.length}
      <BlockTitle>{t('detail.bouteilles')}</BlockTitle>
      <List dividers>
        {#each bouteilles as c, i (i)}
          <ListItem title={c.gas} after={pressions(c)} footer={detailBouteille(c)} />
        {/each}
      </List>
    {/if}

    <BlockTitle>{t('detail.compagnons')}</BlockTitle>
    <Block>
      {#if plongee.buddies.length || plongee.guides.length}
        <ul class="puces" aria-label={t('detail.compagnons')}>
          {#each plongee.buddies as nom (nom)}<li class="puce">{nom}</li>{/each}
          {#each plongee.guides as nom (nom)}<li class="puce">{t('detail.guide', { nom })}</li>{/each}
        </ul>
      {:else}
        <p class="absent">{t('detail.aucunCompagnon')}</p>
      {/if}
    </Block>

    <BlockTitle>{t('detail.etiquettes')}</BlockTitle>
    <Block>
      {#if plongee.tags.length}
        <ul class="puces" aria-label={t('detail.etiquettes')}>
          {#each plongee.tags as tag (tag)}<li class="puce puce-contour">{tag}</li>{/each}
        </ul>
      {:else}
        <p class="absent">{t('detail.aucuneEtiquette')}</p>
      {/if}
    </Block>

    {#if plongee.notes.trim()}
      <BlockTitle>{t('detail.notes')}</BlockTitle>
      <Block><p class="notes">{plongee.notes}</p></Block>
    {/if}

    <Block>
      <!-- Sans action pour l'instant : le planificateur viendra plus tard. -->
      <Button fill large class="od-bouton-principal">{t('detail.planifier')}</Button>
    </Block>
  {/if}
</Page>

<style>
  @layer od.composants {
    .titre-etat {
      font-size: 22px;
      font-weight: 400;
      margin: 16px 0 8px;
    }

    .squelette-profil {
      height: 180px;
      margin: 32px 16px 8px;
      border-radius: 8px;
    }

    /* Liste des faits : valeurs à droite, chiffres tabulaires (section 2). */
    :global(.faits .item-after) {
      font-variant-numeric: tabular-nums;
      white-space: normal;
      text-align: right;
      max-width: 60%;
    }

    .puces {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .puce {
      min-height: 32px;
      display: flex;
      align-items: center;
      padding: 0 12px;
      border-radius: 8px;
      background: var(--od-teinte);
      color: var(--od-sur-teinte);
      font-size: 14px;

      &.puce-contour {
        background: none;
        color: inherit;
        border: 1px solid var(--f7-md-outline, var(--f7-list-item-border-color));
      }
    }

    .absent {
      color: var(--f7-md-on-surface-variant, var(--f7-list-item-text-text-color));
      margin: 0;
    }

    .notes {
      white-space: pre-wrap;
      margin: 0;
    }
  }
</style>
