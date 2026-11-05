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

  /** @type {Record<string, string>} */
  const modes = { OC: 'Circuit ouvert', CCR: 'Recycleur', PSCR: 'Recycleur semi-fermé', Freedive: 'Apnée' };
  /** @type {Record<string, string>} */
  const usages = { 'OC-gas': '', diluent: 'Diluant', oxygen: 'Oxygène du recycleur' };

  const bouteilles = $derived(plongee ? plongee.cylinders.filter((c) => c.used) : []);
  const titre = $derived(plongee ? plongee.site || 'Site à préciser' : '');

  /** @param {import('opendives-core').Cylinder} c */
  function pressions(c) {
    if (c.startMbar && c.endMbar) return `${formatPressure(c.startMbar, prefs)} à ${formatPressure(c.endMbar, prefs)}`;
    if (c.startMbar) return `Départ ${formatPressure(c.startMbar, prefs)}`;
    return '';
  }

  /** @param {import('opendives-core').Cylinder} c */
  function detailBouteille(c) {
    return [c.description, formatCylinderSize(c.sizeMl, c.workingPressureMbar, prefs), usages[c.use]]
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
        <span class="od-lecteur">Retour au carnet</span>
      </Link>
    {/snippet}
  </Navbar>

  {#if erreur}
    <Block>
      <h2 class="titre-etat">Cette plongée n'a pas pu être lue</h2>
      <p>Aucune plongée n'a été modifiée. Revenez au carnet, puis rouvrez la plongée.</p>
    </Block>
  {:else if !plongee}
    <div class="skeleton-text" aria-busy="true" aria-label="Chargement de la plongée">
      <div class="skeleton-block squelette-profil"></div>
      <List>
        {#each Array(5) as _, i (i)}
          <ListItem title="Profondeur maximale" after="00,0 m" />
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
      <ListItem title="Date" after={formatFullDate(plongee.date)} />
      {#if plongee.number}<ListItem title="Numéro" after={String(plongee.number)} />{/if}
      {#if plongee.maxDepthMm}<ListItem title="Profondeur maximale" after={formatDepth(plongee.maxDepthMm, prefs)} />{/if}
      {#if plongee.meanDepthMm}<ListItem title="Profondeur moyenne" after={formatDepth(plongee.meanDepthMm, prefs)} />{/if}
      <ListItem title="Durée" after={formatDuration(plongee.durationSeconds)} />
      {#if formatTemperature(plongee.waterTempMk, prefs)}
        <ListItem title="Température de l'eau" after={formatTemperature(plongee.waterTempMk, prefs) ?? ''} />
      {/if}
      <ListItem title="Mode" after={modes[plongee.divemode] ?? plongee.divemode} />
      {#if plongee.sacMlMin}<ListItem title="Consommation (SAC)" after={formatSac(plongee.sacMlMin, prefs)} />{/if}
      {#if plongee.suit}<ListItem title="Combinaison" after={plongee.suit} />{/if}
      <ListItem
        title="Ordinateur de plongée"
        after={plongee.computer
          ? plongee.computers > 1
            ? `${plongee.computer} (et ${plongee.computers - 1} autre${plongee.computers > 2 ? 's' : ''})`
            : plongee.computer
          : 'À préciser'}
      />
      {#if plongee.trip?.location}<ListItem title="Voyage" after={plongee.trip.location} />{/if}
    </List>

    {#if bouteilles.length}
      <BlockTitle>Bouteilles et gaz</BlockTitle>
      <List dividers>
        {#each bouteilles as c, i (i)}
          <ListItem title={c.gas} after={pressions(c)} footer={detailBouteille(c)} />
        {/each}
      </List>
    {/if}

    <BlockTitle>Compagnons</BlockTitle>
    <Block>
      {#if plongee.buddies.length || plongee.guides.length}
        <ul class="puces" aria-label="Compagnons">
          {#each plongee.buddies as nom (nom)}<li class="puce">{nom}</li>{/each}
          {#each plongee.guides as nom (nom)}<li class="puce">{nom}, guide</li>{/each}
        </ul>
      {:else}
        <p class="absent">Aucun compagnon noté.</p>
      {/if}
    </Block>

    <BlockTitle>Étiquettes</BlockTitle>
    <Block>
      {#if plongee.tags.length}
        <ul class="puces" aria-label="Étiquettes">
          {#each plongee.tags as tag (tag)}<li class="puce puce-contour">{tag}</li>{/each}
        </ul>
      {:else}
        <p class="absent">Aucune étiquette.</p>
      {/if}
    </Block>

    {#if plongee.notes.trim()}
      <BlockTitle>Notes</BlockTitle>
      <Block><p class="notes">{plongee.notes}</p></Block>
    {/if}

    <Block>
      <!-- Sans action pour l'instant : le planificateur viendra plus tard. -->
      <Button fill large class="od-bouton-principal">Planifier à partir de cette plongée</Button>
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
