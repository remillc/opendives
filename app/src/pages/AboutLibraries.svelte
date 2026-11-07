<script>
  // @ts-check
  // About, "Bibliothèques libres": the open source components inside the app,
  // each with its licence (names and licences are not translated).
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { t } from '../lib/i18n.js';

  /** The dive core and its native libraries, then the app's web layer. */
  const groups = [
    {
      title: 'core',
      rows: [
        ['Subsurface', 'GPL-2.0'],
        ['libdivecomputer', 'LGPL-2.1'],
        ['libgit2', 'GPL-2.0 with linking exception'],
        ['libxml2', 'MIT'],
        ['libxslt', 'MIT'],
        ['libzip', 'BSD-3-Clause'],
        ['OpenSSL', 'Apache-2.0'],
        ['SQLite', 'Public domain'],
      ],
    },
    {
      title: 'app',
      rows: [
        ['Capacitor', 'MIT'],
        ['Framework7', 'MIT'],
        ['Svelte', 'MIT'],
        ['MapLibre GL JS', 'BSD-3-Clause'],
        ['Source Sans 3', 'SIL Open Font License 1.1'],
      ],
    },
  ];
</script>

<Page>
  <Navbar title={t('about.libraries')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('detail.back')}</span>
      </Link>
    {/snippet}
  </Navbar>

  {#each groups as group (group.title)}
    <h2 class="block-title">{t(`about.librariesGroups.${group.title}`)}</h2>
    <div class="list list-strong inset list-dividers">
      <ul>
        {#each group.rows as [name, licence] (name)}
          <li>
            <div class="item-content">
              <div class="item-inner">
                <div class="item-title">
                  {name}
                  <div class="item-footer">{licence}</div>
                </div>
              </div>
            </div>
          </li>
        {/each}
      </ul>
    </div>
  {/each}
</Page>
