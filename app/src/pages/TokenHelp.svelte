<script>
  // @ts-check
  // "Comment créer un jeton d'accès" (spec, section 4, "Own git repository
  // instead of the cloud"): the steps to create, on each host, a token limited
  // to the one repository, with the right to read and write its contents and
  // an expiry date. Labels are those of each site's English interface, in both
  // languages. To add a host: one entry in PROVIDERS and its texts
  // `tokenHelp.<id>.*` (name, note, then the steps).
  // The links to the hosts open in the browser, with the external-link icon.
  import { Page, Navbar, Link } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import { t } from '../lib/i18n.js';

  /**
   * @typedef {{ title?: string, steps: string[] }} Section
   * @typedef {{ id: string, page: string, docs?: string, sections: Section[], after?: string }} Provider
   */

  /**
   * @param {string} id
   * @param {string} prefix
   * @param {number} count
   */
  const steps = (id, prefix, count) => Array.from({ length: count }, (_, i) => `tokenHelp.${id}.${prefix}${i + 1}`);

  /** @type {Provider[]} */
  const PROVIDERS = [
    {
      id: 'github',
      page: 'https://github.com/settings/personal-access-tokens/new',
      sections: [{ steps: steps('github', 's', 9) }],
    },
    {
      id: 'gitlab',
      page: 'https://gitlab.com/-/user_settings/personal_access_tokens',
      docs: 'https://docs.gitlab.com/user/project/settings/project_access_tokens/',
      sections: [
        { title: 'tokenHelp.gitlab.projectTitle', steps: steps('gitlab', 'p', 7) },
        { title: 'tokenHelp.gitlab.personalTitle', steps: steps('gitlab', 'q', 6) },
      ],
      after: 'tokenHelp.gitlab.user',
    },
    {
      id: 'codeberg',
      page: 'https://codeberg.org/user/settings/applications',
      sections: [{ steps: steps('codeberg', 's', 7) }],
    },
  ];

  /** The page menu: to a host's steps, the focus following for screen readers. @param {string} id */
  function jump(id) {
    const heading = document.getElementById(`od-token-help-${id}`);
    heading?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    heading?.focus({ preventScroll: true });
  }
</script>

<Page class="od-token-help">
  <Navbar title={t('tokenHelp.title')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('detail.back')}</span>
      </Link>
    {/snippet}
  </Navbar>

  <p class="intro">{t('tokenHelp.intro')}</p>

  <nav class="page-menu" aria-label={t('tokenHelp.menu')}>
    {#each PROVIDERS as provider (provider.id)}
      <button type="button" onclick={() => jump(provider.id)}>{t(`tokenHelp.${provider.id}.name`)}</button>
    {/each}
  </nav>

  {#each PROVIDERS as provider (provider.id)}
    {@const name = t(`tokenHelp.${provider.id}.name`)}
    <h2 class="block-title" id="od-token-help-{provider.id}" tabindex="-1">{name}</h2>
    <div class="surface">
      <p class="note">{t(`tokenHelp.${provider.id}.note`)}</p>
      {#each provider.sections as section}
        {#if section.title}<h3>{t(section.title)}</h3>{/if}
        <ol>
          {#each section.steps as key (key)}<li>{t(key)}</li>{/each}
        </ol>
      {/each}
      {#if provider.after}<p class="note">{t(provider.after)}</p>{/if}
      <a href={provider.page} class="open external" target="_blank" rel="noopener">
        <span>{t('tokenHelp.open', { name })}</span>
        <Icon name="openInNew" size={20} />
      </a>
      {#if provider.docs}
        <a href={provider.docs} class="open external" target="_blank" rel="noopener">
          <span>{t('tokenHelp.openDocs', { name })}</span>
          <Icon name="openInNew" size={20} />
        </a>
      {/if}
    </div>
  {/each}

  <p class="intro afterwards">{t('tokenHelp.afterwards')}</p>
</Page>

<style>
  @layer od.components {
    .intro {
      margin: 8px 24px 0;
      font-size: 14px;
      line-height: 20px;
      letter-spacing: 0.25px;
      color: var(--od-text-2);

      &.afterwards {
        margin-bottom: calc(var(--f7-safe-area-bottom) + 24px);
      }
    }

    .page-menu {
      margin: 12px 16px 0;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;

      button {
        width: auto;
        min-height: 40px;
        padding: 0 16px;
        border: 1px solid var(--od-text-2);
        border-radius: 20px;
        background: none;
        color: var(--od-text);
        font: inherit;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
      }
    }

    /* Under the top bar when the menu brings a host to the top. */
    .block-title {
      scroll-margin-top: calc(var(--f7-navbar-height) + var(--f7-safe-area-top) + 8px);
      outline: none;
    }

    .surface {
      margin: 0 16px;
      padding: 16px 16px 8px;
      border-radius: 20px;
      background: var(--od-surface);

      :global(.ios) & {
        border-radius: 10px;
      }
    }

    h3 {
      margin: 16px 0 4px;
      font-size: 16px;
      font-weight: 600;
    }

    .note {
      margin: 0 0 8px;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    ol {
      margin: 8px 0;
      padding-left: 22px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-size: 15px;
      line-height: 21px;
      color: var(--od-text);
    }

    .open {
      min-height: 48px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      color: var(--od-text);
      font-weight: 500;
      text-decoration: none;
    }
  }
</style>
