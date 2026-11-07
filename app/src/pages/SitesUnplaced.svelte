<script>
  // @ts-check
  // Sites without coordinates (spec, section 4, "Sites"): the sites used by
  // dives that have no position; each opens the site editor to place it.
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import { logbook } from '../lib/logbook.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {import('opendives-core').SiteSummary[]} */
  let sites = $state([]);

  $effect(() => {
    logbook.sitesVersion;
    OpenDivesCore.siteQuery({ kind: 'list' }).then((all) => {
      sites = all.filter((/** @type {any} */ s) => s.dives > 0 && !s.hasLocation).sort((/** @type {any} */ a, /** @type {any} */ b) => b.lastDate.localeCompare(a.lastDate));
    });
  });
</script>

<Page>
  <Navbar title={t('sites.unplacedTitle')}>
    {#snippet left()}
      <Link back iconOnly><i class="icon icon-back"></i><span class="od-sr-only">{t('common.back')}</span></Link>
    {/snippet}
  </Navbar>

  <p class="intro">{t('sites.unplacedIntro')}</p>

  <div class="list media-list">
    <ul>
      {#each sites as site (site.uuid)}
        <li>
          <a href="/sites/{site.uuid}/edit" class="item-link item-content">
            <div class="item-inner">
              <div class="item-title">{site.name || t('sites.noName')}</div>
              <div class="item-text">{t('sites.diveCount', { n: site.dives })}</div>
            </div>
          </a>
        </li>
      {/each}
    </ul>
  </div>
</Page>

<style>
  @layer od.components {
    .intro {
      margin: 12px 16px;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }
  }
</style>
