<script>
  // @ts-check
  // About, "Bibliothèques libres": the open source components inside the app,
  // each with its licence (names and licences are not translated). A row opens
  // the library's website in the system browser.
  import { Page, Navbar, Link } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import { t } from '../lib/i18n.js';

  /** The dive core and its native libraries, then the app's web layer. */
  const groups = [
    {
      title: 'core',
      rows: [
        ['Subsurface', 'GPL-2.0', 'https://subsurface-divelog.org'],
        ['libdivecomputer', 'LGPL-2.1', 'https://www.libdivecomputer.org'],
        ['libgit2', 'GPL-2.0 with linking exception', 'https://libgit2.org'],
        ['libxml2', 'MIT', 'https://gitlab.gnome.org/GNOME/libxml2'],
        ['libxslt', 'MIT', 'https://gitlab.gnome.org/GNOME/libxslt'],
        ['libzip', 'BSD-3-Clause', 'https://libzip.org'],
        ['Mbed TLS', 'GPL-2.0-or-later', 'https://www.trustedfirmware.org/projects/mbed-tls/'],
        ['SQLite', 'Public domain', 'https://sqlite.org'],
      ],
    },
    {
      title: 'app',
      rows: [
        ['Capacitor', 'MIT', 'https://capacitorjs.com'],
        ['Framework7', 'MIT', 'https://framework7.io'],
        ['Svelte', 'MIT', 'https://svelte.dev'],
        ['MapLibre GL JS', 'BSD-3-Clause', 'https://maplibre.org'],
        ['Natural Earth (simplified world map)', 'Public domain', 'https://www.naturalearthdata.com'],
        ['Source Sans 3', 'SIL Open Font License 1.1', 'https://github.com/adobe-fonts/source-sans'],
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

  <p class="intro">{t('about.librariesIntro')}</p>

  {#each groups as group (group.title)}
    <h2 class="block-title">{t(`about.librariesGroups.${group.title}`)}</h2>
    <div class="list list-strong inset list-dividers">
      <ul>
        {#each group.rows as [name, licence, url] (name)}
          <li>
            <a href={url} class="item-link item-content external no-chevron" target="_blank" rel="noopener" aria-label={t('about.libraryLink', { name, licence })}>
              <div class="item-inner">
                <div class="item-title">
                  {name}
                  <div class="item-footer">{licence}</div>
                </div>
                <div class="item-after"><Icon name="openInNew" size={24} /></div>
              </div>
            </a>
          </li>
        {/each}
      </ul>
    </div>
  {/each}
</Page>

<style>
  @layer od.components {
    .intro {
      margin: 8px 16px 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }
  }
</style>
