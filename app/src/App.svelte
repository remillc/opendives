<script>
  // @ts-check
  // Navigation principale (spécification, section 3) : barre de navigation en
  // bas avec quatre sections ; le Carnet ouvre le détail en plein écran.
  import { onMount } from 'svelte';
  import { App, Views, View, Toolbar, Link } from 'framework7-svelte';
  import Carnet from './pages/Carnet.svelte';
  import Detail from './pages/Detail.svelte';
  import Section from './pages/Section.svelte';
  import Icone from './composants/Icone.svelte';
  import LibelleAdaptatif from './composants/LibelleAdaptatif.svelte';
  import { chargerCarnet } from './lib/carnet.svelte.js';
  import { activerRetour } from './lib/retour.js';
  import { activerAccessibilite } from './lib/accessibilite.js';
  import { t } from './lib/i18n.js';

  const f7params = {
    name: 'OpenDives',
    theme: 'auto',
    darkMode: 'auto',
    colors: { primary: '#1E4D3A' },
    routes: [
      { path: '/', component: Carnet },
      { path: '/plongee/:id/', component: Detail },
      {
        path: '/sites/',
        component: Section,
        options: { props: { titre: t('onglets.sites'), phrase: t('sections.sitesPhrase') } },
      },
      {
        path: '/statistiques/',
        component: Section,
        options: { props: { titre: t('onglets.statistiques'), phrase: t('sections.statistiquesPhrase') } },
      },
      {
        path: '/outils/',
        component: Section,
        options: { props: { titre: t('onglets.outils'), phrase: t('sections.outilsPhrase') } },
      },
    ],
  };

  onMount(() => {
    activerRetour();
    activerAccessibilite();
    chargerCarnet();
  });
</script>

<App {...f7params}>
  <Views tabs class="safe-areas">
    <Toolbar tabbar icons bottom>
      <Link tabLink="#vue-carnet" tabLinkActive text={t('onglets.carnet')}><i class="icon"><Icone nom="carnet" /></i></Link>
      <Link tabLink="#vue-sites" text={t('onglets.sites')}><i class="icon"><Icone nom="sites" /></i></Link>
      <Link tabLink="#vue-statistiques"><i class="icon"><Icone nom="statistiques" /></i><LibelleAdaptatif complet={t('onglets.statistiques')} court={t('onglets.statistiquesCourt')} /></Link>
      <Link tabLink="#vue-outils" text={t('onglets.outils')}><i class="icon"><Icone nom="outils" /></i></Link>
    </Toolbar>
    <View id="vue-carnet" main tab tabActive url="/" />
    <View id="vue-sites" tab url="/sites/" />
    <View id="vue-statistiques" tab url="/statistiques/" />
    <View id="vue-outils" tab url="/outils/" />
  </Views>
</App>
