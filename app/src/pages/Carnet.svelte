<script>
  // @ts-check
  // Écran Carnet (spécification, sections 3 à 6) : liste par voyage, recherche,
  // état de synchronisation, bouton « + ».
  import { Page, Navbar, NavRight, Link, Subnavbar, Searchbar, List, Block, Button, f7, theme } from 'framework7-svelte';
  import EtatSynchro from '../composants/EtatSynchro.svelte';
  import LignePlongee from '../composants/LignePlongee.svelte';
  import LigneVoyage from '../composants/LigneVoyage.svelte';
  import Icone from '../composants/Icone.svelte';
  import { carnet, chargerCarnet } from '../lib/carnet.svelte.js';
  import { formatDateTime } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /** @typedef {import('opendives-core').Dive} Dive */
  /**
   * @typedef {{ type: 'plongee', cle: string, dive: Dive }
   *   | { type: 'voyage', cle: string, location: string, dives: Dive[] }} Entree
   */

  let recherche = $state('');
  /** Voyages dépliés, par identifiant de voyage du chargement courant. */
  let ouverts = $state(/** @type {Record<number, boolean>} */ ({}));

  const triees = $derived([...carnet.dives].sort((a, b) => b.date.localeCompare(a.date)));

  /** Plongées hors voyage et voyages, du plus récent au plus ancien. */
  const entrees = $derived.by(() => {
    /** @type {Entree[]} */
    const res = [];
    /** @type {Map<number, Extract<Entree, {type: 'voyage'}>>} */
    const voyages = new Map();
    for (const dive of triees) {
      if (!dive.trip) {
        res.push({ type: 'plongee', cle: `p${dive.id}`, dive });
        continue;
      }
      let v = voyages.get(dive.trip.id);
      if (!v) {
        v = { type: 'voyage', cle: `v${dive.trip.id}`, location: dive.trip.location, dives: [] };
        voyages.set(dive.trip.id, v);
        res.push(v);
      }
      v.dives.push(dive);
    }
    return res;
  });

  /** Recherche : site, voyage, numéro ou date ; résultat à plat. */
  const resultats = $derived.by(() => {
    const q = recherche.trim().toLocaleLowerCase();
    if (!q) return null;
    return triees.filter(
      (d) =>
        d.site.toLocaleLowerCase().includes(q) ||
        (d.trip?.location ?? '').toLocaleLowerCase().includes(q) ||
        String(d.number) === q ||
        formatDateTime(d.date).toLocaleLowerCase().includes(q),
    );
  });

  function ajouter() {
    // Les trois choix du bouton « + » (section 3). Sans action pour l'instant.
    f7.actions
      .create({
        buttons: [
          [
            { text: t('carnet.ajouter'), label: true },
            { text: t('carnet.ajouterTelecharger') },
            { text: t('carnet.ajouterImporter') },
            { text: t('carnet.ajouterNoter') },
          ],
          [{ text: t('carnet.annuler'), bold: true }],
        ],
      })
      .open();
  }
</script>

<Page>
  <Navbar large title={t('carnet.titre')}>
    {#if theme.ios}
      <NavRight>
        <Link iconOnly onClick={ajouter}><Icone nom="plus" /><span class="od-lecteur">{t('carnet.ajouter')}</span></Link>
      </NavRight>
    {/if}
    <Subnavbar inner={false}>
      <Searchbar
        customSearch
        disableButtonText={t('carnet.annuler')}
        placeholder={t('carnet.rechercher')}
        onSearchbarSearch={(/** @type {any} */ _sb, /** @type {string} */ q) => (recherche = q)}
        onSearchbarClear={() => (recherche = '')}
      />
    </Subnavbar>
  </Navbar>

  <!-- Pendant le chargement, l'état n'est pas encore connu : rien n'est affiché. -->
  {#if !carnet.chargement && !carnet.erreur}<EtatSynchro synchro={carnet.synchro} />{/if}

  {#if carnet.chargement}
    <!-- Chargement : les lignes gardent leur place, sans roue au centre (section 6). -->
    <List mediaList dividers class="skeleton-text" aria-busy="true" aria-label={t('carnet.chargement')}>
      {#each Array(8) as _, i (i)}
        <!-- Lignes grisées : les tirets ne servent qu'à donner une largeur aux blocs. -->
        <li aria-hidden="true">
          <div class="item-content">
            <div class="item-media"><div class="skeleton-block squelette-miniature"></div></div>
            <div class="item-inner">
              <div class="item-title-row"><div class="item-title">––––––––––––––</div><div class="item-after">––––––</div></div>
              <div class="item-text">––––––––––––––––––</div>
            </div>
          </div>
        </li>
      {/each}
    </List>
  {:else if carnet.erreur}
    <Block>
      <h2 class="titre-etat">{t('carnet.erreurTitre')}</h2>
      <p>{t('carnet.erreurRien')}</p>
      <p>{t('carnet.erreurVerifier')}</p>
      <ol>
        <li>{t('carnet.erreurInternet')}</li>
        <li>{t('carnet.erreurEspace')}</li>
      </ol>
      <Button fill class="od-bouton-principal" onClick={chargerCarnet}>{t('carnet.reessayer')}</Button>
    </Block>
  {:else if carnet.dives.length === 0}
    <Block>
      <h2 class="titre-etat">{t('carnet.videTitre')}</h2>
      <p>{t('carnet.videPhrase')}</p>
      <Button tonal onClick={ajouter}>{t('carnet.ajouter')}</Button>
    </Block>
  {:else if resultats}
    {#if resultats.length}
      <List mediaList dividers>
        {#each resultats as dive (dive.id)}
          <LignePlongee {dive} prefs={carnet.prefs} />
        {/each}
      </List>
    {:else}
      <Block><p>{t('carnet.aucunResultat', { recherche })}</p></Block>
    {/if}
  {:else}
    <List mediaList dividers>
      {#each entrees as e (e.cle)}
        {#if e.type === 'plongee'}
          <LignePlongee dive={e.dive} prefs={carnet.prefs} />
        {:else}
          {@const id = e.dives[0].trip?.id ?? 0}
          <LigneVoyage
            dives={e.dives}
            location={e.location}
            prefs={carnet.prefs}
            ouvert={!!ouverts[id]}
            onbasculer={() => (ouverts[id] = !ouverts[id])}
          />
          {#if ouverts[id]}
            {#each e.dives as dive (dive.id)}
              <LignePlongee {dive} prefs={carnet.prefs} dansVoyage />
            {/each}
          {/if}
        {/if}
      {/each}
    </List>
  {/if}

  {#snippet fixedContent()}
    {#if !theme.ios}
      <!--
        Écrit à la main : le composant Fab de framework7-svelte 9 appelle onclick
        deux fois et laisse le lien sans nom pour les lecteurs d'écran.
      -->
      <div class="fab fab-right-bottom od-fab-ajouter">
        <a href="#ajouter" class="external" role="button" onclick={(e) => { e.preventDefault(); ajouter(); }}>
          <Icone nom="plus" />
          <span class="od-lecteur">{t('carnet.ajouter')}</span>
        </a>
      </div>
    {/if}
  {/snippet}
</Page>

<style>
  @layer od.composants {
    .titre-etat {
      font-size: 22px;
      font-weight: 400;
      margin: 16px 0 8px;
    }

    .squelette-miniature {
      width: 56px;
      height: 40px;
      border-radius: 8px;
    }
  }
</style>
