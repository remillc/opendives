<script>
  // @ts-check
  // About (docs/ui-specification.md, section 1, "About";
  // docs/mockups/apropos-android.dc.html): the logo, the name, the version and
  // build of the installed app, one sentence; then the project, the licences
  // and the privacy policy; the credit to Subsurface at the bottom, which its
  // licence requires. Links that leave the app say so and show the
  // external-link icon.
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { App } from '@capacitor/app';
  import Icon from '../components/Icon.svelte';
  import { t } from '../lib/i18n.js';

  /** The author's name: a proper name, not translated. */
  const AUTHOR = 'Christian Rémillard';

  /**
   * Placeholders until Christian gives the real addresses (inbox task
   * 2026-11-07-15): source code, issue tracker, privacy policy.
   */
  const LINKS = {
    source: 'https://github.com/opendives',
    issues: 'https://github.com/opendives/opendives/issues',
    privacy: 'https://github.com/opendives/opendives/blob/main/PRIVACY.md',
    osm: 'https://www.openstreetmap.org/copyright',
    geonames: 'https://www.geonames.org/about.html',
  };

  /**
   * "Version 0.1.0": the installed package's version (its build number stays
   * internal); in a browser, the one of the web build (package.json).
   */
  let version = $state(t('about.version', { version: __APP_VERSION__ }));
  App.getInfo()
    .then((info) => (version = t('about.version', { version: info.version })))
    .catch(() => {});

  /**
   * @type {{ title: string, rows: { key: string, icon: import('svelte').ComponentProps<typeof Icon>['name'], text: string, sub: string, href: string, external?: boolean }[] }[]}
   */
  const groups = [
    {
      title: t('about.project'),
      rows: [
        { key: 'notes', icon: 'info', text: t('about.notes'), sub: t('about.notesText'), href: '/about/notes/' },
        { key: 'source', icon: 'file', text: t('about.source'), sub: LINKS.source.replace('https://', ''), href: LINKS.source, external: true },
        { key: 'issues', icon: 'warning', text: t('about.issues'), sub: '', href: LINKS.issues, external: true },
      ],
    },
    {
      title: t('about.licences'),
      rows: [
        { key: 'licence', icon: 'file', text: t('about.licence'), sub: t('about.licenceText'), href: '/about/licence/' },
        { key: 'libraries', icon: 'logbook', text: t('about.libraries'), sub: t('about.librariesText'), href: '/about/libraries/' },
        { key: 'maps', icon: 'sites', text: t('about.maps'), sub: t('about.mapsText'), href: LINKS.osm, external: true },
        { key: 'regions', icon: 'place', text: t('about.regions'), sub: t('about.regionsText'), href: LINKS.geonames, external: true },
      ],
    },
    {
      title: t('about.privacy'),
      rows: [{ key: 'privacy', icon: 'account', text: t('about.privacyPolicy'), sub: t('about.privacyText'), href: LINKS.privacy, external: true }],
    },
  ];
</script>

<Page class="od-about">
  <Navbar title={t('about.title')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('detail.back')}</span>
      </Link>
    {/snippet}
  </Navbar>

  <header class="head">
    <img class="logo" src="favicon.svg" alt="" width="88" height="88" />
    <h1>OpenDives</h1>
    {#if version}<p class="version od-value">{version}</p>{/if}
    <p class="tagline">{t('about.tagline')}</p>
    <p class="author">{t('about.author', { name: AUTHOR })}</p>
  </header>

  {#each groups as group (group.title)}
    <h2 class="block-title">{group.title}</h2>
    <nav class="list list-strong inset list-dividers" aria-label={group.title}>
      <ul>
        {#each group.rows as row (row.key)}
          <li>
            <a
              href={row.href}
              class="item-link item-content {row.external ? 'external no-chevron' : ''}"
              target={row.external ? '_blank' : undefined}
              rel={row.external ? 'noopener' : undefined}
            >
              <div class="item-media"><Icon name={row.icon} /></div>
              <div class="item-inner">
                <div class="item-title">
                  {row.text}
                  {#if row.sub}<div class="item-footer">{row.sub}</div>{/if}
                </div>
                {#if row.external}
                  <div class="item-after"><Icon name="openInNew" size={20} /><span class="od-sr-only">{t('about.opensElsewhere')}</span></div>
                {/if}
              </div>
            </a>
          </li>
        {/each}
      </ul>
    </nav>
  {/each}

  <p class="credit">{t('about.copyright', { year: '2026', name: AUTHOR })} {t('about.credit')}</p>
</Page>

<style>
  @layer od.components {
    .head {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 24px 24px 8px;
      text-align: center;

      h1 {
        margin: 8px 0 0;
        font-size: 24px;
        line-height: 32px;
      }
    }

    .logo {
      border-radius: 50%;
    }

    .author {
      margin: 4px 0 0;
      font-size: 14px;
      color: var(--od-text-2);
    }

    .version {
      margin: 0;
      font-size: 14px;
      color: var(--od-text-2);
    }

    .tagline {
      margin: 8px 0 0;
      max-width: 320px;
      font-size: 15px;
      line-height: 21px;
      color: var(--od-text-2);
    }

    .item-media {
      color: var(--od-text);
    }

    .item-after {
      color: var(--od-text-2);
    }

    .credit {
      margin: 24px 24px 40px;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
      text-align: center;
    }
  }
</style>
