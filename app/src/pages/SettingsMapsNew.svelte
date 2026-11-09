<script>
  // @ts-check
  // /settings/maps/new: "Ajouter une région" (docs/mockups/android-cartes-ajout.dc.html).
  // `?lng=…&lat=…` comes from the Sites map ("Cette zone n’est pas téléchargée",
  // "Télécharger"): the zone that contains that point is offered first.
  import { Page, Navbar, Link } from 'framework7-svelte';
  import MapsAddContent from '../components/MapsAddContent.svelte';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7route: { query: Record<string, string> }, f7router: any }} */
  let { f7route, f7router } = $props();

  const near = $derived.by(() => {
    const q = f7route.query ?? {};
    const lng = Number(q.lng);
    const lat = Number(q.lat);
    return q.lng && q.lat && Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null;
  });

  /** Back to the list, whether this screen was reached from it or from the Sites map. */
  function started() {
    f7router.back('/settings/maps/', { force: true });
  }
</script>

<Page class="od-maps-page">
  <Navbar title={t('maps.add')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('detail.back')}</span>
      </Link>
    {/snippet}
  </Navbar>
  <MapsAddContent {near} onstarted={started} />
</Page>
