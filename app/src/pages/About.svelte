<script>
  // @ts-check
  // About (docs/ui-specification.md, section 1, "About";
  // docs/mockups/apropos-android.dc.html): the logo, the name, the version and
  // build of the installed app, one sentence; then the project, the licences
  // and the privacy policy; the credit to Subsurface at the bottom, which its
  // licence requires. Links that leave the app say so and show the
  // external-link icon.
  import { Page, Navbar, Link } from 'framework7-svelte';
  import MenuButton from '../components/MenuButton.svelte';
  import { layout, bottomNav } from '../lib/layout.svelte.js';
  import { navigation } from '../lib/navigation.svelte.js';
  import { App } from '@capacitor/app';
  import { Capacitor } from '@capacitor/core';
  import { logbook } from '../lib/logbook.svelte.js';
  import Icon from '../components/Icon.svelte';
  import { t } from '../lib/i18n.js';
  import { OpenDivesCore } from 'opendives-core';

  /** The author's name: a proper name, not translated. */
  const AUTHOR = 'Christian Rémillard';

  /**
   * The support address of "Question / signaler un problème", a build-time setting
   * (VITE_SUPPORT_EMAIL in app/.env): the row is hidden while it is empty.
   */
  const SUPPORT_EMAIL = String(/** @type {any} */ (import.meta).env?.VITE_SUPPORT_EMAIL ?? '').trim();

  const LINKS = {
    source: 'https://github.com/remillc/opendives',
    osm: 'https://www.openstreetmap.org/copyright',
    geonames: 'https://www.geonames.org/about.html',
  };

  /**
   * "Version 0.1.0": the installed package's version (its build number stays
   * internal); in a browser, the one of the web build (package.json).
   */
  let appVersion = $state(__APP_VERSION__);
  const version = $derived(t('about.version', { version: appVersion }));
  App.getInfo()
    .then((info) => (appVersion = info.version))
    .catch(() => {});

  /**
   * Installed from Google Play or the App Store (native installer check); false in a
   * browser and in a build from GitHub or F-Droid, where the row asks for feedback instead.
   */
  let storeBuild = $state(false);
  const platform = Capacitor.getPlatform();
  OpenDivesCore.installSource()
    .then((r) => (storeBuild = r?.store === true))
    .catch(() => {});

  /**
   * "Question / signaler un problème": the phone's mail app, with an empty line for the
   * description, then the technical block (spec, "Reporting a problem").
   * Nothing else: no credentials, no email address, no dive data, no place.
   */
  function reportProblem() {
    const ua = navigator.userAgent;
    const os = /Android [\d.]+/.exec(ua)?.[0] ?? /(?:iPhone|CPU) OS [\d_]+/.exec(ua)?.[0]?.replace(/_/g, '.') ?? '';
    const model = /Android [\d.]+; ([^;)]+?)(?: Build|\))/.exec(ua)?.[1] ?? (/iPad/.test(ua) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : '');
    const p = logbook.prefs;
    const units = p ? [p.length, p.pressure, p.volume, p.temperature, p.weight].filter(Boolean).join(', ') : '';
    const lines = [
      [t('about.report.version'), appVersion],
      [t('about.report.platform'), [Capacitor.getPlatform(), os].filter(Boolean).join(', ')],
      [t('about.report.device'), model],
      [t('about.report.language'), document.documentElement.lang],
      [t('about.report.units'), units],
      [t('about.report.mode'), t(logbook.email ? (logbook.mode === 'git' ? 'about.report.git' : 'about.report.cloud') : 'about.report.noAccount')],
      [t('about.report.dives'), String(logbook.dives.length)],
      [t('about.report.lastSync'), [logbook.lastSync ?? '—', logbook.sync].join(', ')],
      [t('about.report.lastError'), logbook.error ?? '—'],
    ];
    const body = ['', '', t('about.report.technical'), ...lines.map(([k, v]) => `${k} : ${v || '—'}`)].join('\n');
    const subject = t('about.report.subject', { version: appVersion });
    location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  /**
   * @type {{ title: string, rows: { key: string, text: string, sub: string, href: string, external?: boolean, opens?: string, mail?: boolean, onclick?: () => void }[] }[]}
   */
  const groups = $derived([
    {
      title: t('about.project'),
      rows: [
        { key: 'notes', text: t('about.notes'), sub: t('about.notesText'), href: '/about/notes' },
        storeBuild
          ? {
              key: 'rate',
              text: t('about.rate'),
              sub: t(platform === 'ios' ? 'about.rateTextIos' : 'about.rateTextAndroid'),
              href: '#rate',
              external: true,
              opens: t(platform === 'ios' ? 'about.rateOpensIos' : 'about.rateOpensAndroid'),
              onclick: () => OpenDivesCore.openStorePage().catch((e) => console.error('Store page', e)),
            }
          : { key: 'rate', text: t('about.feedback'), sub: t('about.feedbackText'), href: LINKS.source, external: true },
        { key: 'source', text: t('about.source'), sub: LINKS.source.replace('https://', ''), href: LINKS.source, external: true },
        ...(SUPPORT_EMAIL
          ? [{ key: 'issues', text: t('about.issues'), sub: t('about.issuesText'), href: '#report', mail: true, onclick: reportProblem }]
          : []),
      ],
    },
    {
      title: t('about.licences'),
      rows: [
        { key: 'licence', text: t('about.licence'), sub: t('about.licenceText'), href: '/about/licence' },
        { key: 'libraries', text: t('about.libraries'), sub: t('about.librariesText'), href: '/about/libraries' },
        { key: 'maps', text: t('about.maps'), sub: t('about.mapsText'), href: LINKS.osm, external: true },
        { key: 'regions', text: t('about.regions'), sub: t('about.regionsText'), href: LINKS.geonames, external: true },
      ],
    },
    {
      title: t('about.privacy'),
      rows: [{ key: 'privacy', text: t('about.privacyPolicy'), sub: t('about.privacyText'), href: '/about/privacy' }],
    },
  ]);
</script>

<Page class="od-about" onPageBeforeIn={() => (navigation.page = 'about')} onPageBeforeOut={() => (navigation.page = '')}>
  <Navbar title={t('about.title')}>
    {#snippet left()}
      {#if !layout.rail && !bottomNav()}
        <MenuButton />
      {:else}
        <Link back iconOnly>
          <i class="icon icon-back"></i>
          <span class="od-sr-only">{t('detail.back')}</span>
        </Link>
      {/if}
    {/snippet}
  </Navbar>

  <header class="od-about--head">
    <!-- The large standalone logo, without the grey arc of the small sizes (spec, "Logo"). -->
    <img class="od-about--logo od-about--light" src="logo-light.svg" alt="" width="112" height="112" />
    <img class="od-about--logo dark" src="logo-dark.svg" alt="" width="112" height="112" />
    <h1>OpenDives</h1>
    {#if version}<p class="od-about--version od-value">{version}</p>{/if}
    <p class="od-about--tagline">{t('about.tagline')}</p>
    <p class="od-about--author">{t('about.author', { name: AUTHOR })}</p>
  </header>

  {#each groups as group (group.title)}
    <h2 class="block-title od-section-title">{group.title}</h2>
    <nav class="list list-strong inset list-dividers" aria-label={group.title}>
      <ul>
        {#each group.rows as row (row.key)}
          <li>
            <a
              href={row.href}
              class="item-link item-content {row.external || row.mail ? 'external no-chevron' : ''}"
              target={row.external ? '_blank' : undefined}
              rel={row.external ? 'noopener' : undefined}
              onclick={row.onclick
                ? (e) => {
                    e.preventDefault();
                    row.onclick?.();
                  }
                : undefined}
            >
              <div class="item-inner">
                <div class="item-title">
                  {row.text}
                  {#if row.sub}<div class="item-footer">{row.sub}</div>{/if}
                </div>
                {#if row.external}
                  <div class="item-after"><Icon name="openInNew" size={24} /><span class="od-sr-only">{row.opens ?? t('about.opensElsewhere')}</span></div>
                {:else if row.mail}
                  <div class="item-after"><Icon name="mail" size={24} /><span class="od-sr-only">{t('about.opensMail')}</span></div>
                {/if}
              </div>
            </a>
          </li>
        {/each}
      </ul>
    </nav>
  {/each}

  <p class="od-about--credit">{t('about.copyright', { year: '2026', name: AUTHOR })} {t('about.credit')}</p>
</Page>

<style>
  @layer od.components {
    .od-about--head {
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

    .od-about--logo.dark,
    :global(html.dark) .od-about--logo.od-about--light {
      display: none;
    }

    :global(html.dark) .od-about--logo.dark {
      display: block;
    }

    .od-about--author {
      margin: 4px 0 0;
      font-size: 14px;
      color: var(--od-text-2);
    }

    .od-about--version {
      margin: 0;
      font-size: 14px;
      color: var(--od-text-2);
    }

    .od-about--tagline {
      margin: 8px 0 0;
      max-width: 320px;
      font-size: 15px;
      line-height: 21px;
      color: var(--od-text-2);
    }

    /* The section titles hold the space between the groups. */
    .list {
      margin-top: 0;
      margin-bottom: 0;
    }

    /* Rows: headline 16/24, supporting text 14/20 (task 2026-11-07-23). */
    .item-title {
      font-size: 16px;
      line-height: 24px;
    }

    .item-footer {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
      white-space: normal;
    }

    .item-after {
      color: var(--od-text-2);
    }

    .od-about--credit {
      margin: 24px 24px 40px;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
      text-align: center;
    }
  }
</style>
