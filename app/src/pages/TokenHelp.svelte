<script>
  // @ts-check
  // "Comment créer un jeton d'accès" (spec, section 4, "Own git repository
  // instead of the cloud"): the steps to create, on each host, a token limited
  // to the one repository, with the right to read and write its contents and
  // an expiry date. Labels are those of each site's English interface, in both
  // languages. To add a host: one entry in PROVIDERS and its texts
  // `tokenHelp.<id>.*` (name, note, then the steps).
  // The links to the hosts open in the browser, with the external-link icon.
  // One host at a time, chosen with Material 3 primary tabs under the top bar
  // (docs/mockups/git-jeton-aide-android.dc.html); swiping sideways changes tab.
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

  let selected = $state(0);
  const provider = $derived(PROVIDERS[selected]);
  const name = $derived(t(`tokenHelp.${provider.id}.name`));

  /** @param {number} index @param {boolean} [focus] */
  function choose(index, focus = false) {
    selected = (index + PROVIDERS.length) % PROVIDERS.length;
    if (focus) document.getElementById(`od-token-help-tab-${PROVIDERS[selected].id}`)?.focus();
  }

  /** Arrow keys, Home and End move between the tabs (WAI-ARIA tabs). @param {KeyboardEvent} e */
  function keydown(e) {
    const to = { ArrowRight: selected + 1, ArrowLeft: selected - 1, Home: 0, End: PROVIDERS.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    choose(to, true);
  }

  // A sideways swipe on the card changes tab.
  let startX = 0;
  let startY = 0;
  /** @param {TouchEvent} e */
  function touchstart(e) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }
  /** @param {TouchEvent} e */
  function touchend(e) {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0 && selected < PROVIDERS.length - 1) choose(selected + 1);
    if (dx > 0 && selected > 0) choose(selected - 1);
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

  <div class="od-token-help--tabs" role="tablist" aria-label={t('tokenHelp.hosts')}>
    {#each PROVIDERS as p, i (p.id)}
      <button
        type="button"
        role="tab"
        id="od-token-help-tab-{p.id}"
        class="od-token-help--tab"
        aria-selected={i === selected}
        aria-controls="od-token-help-panel"
        tabindex={i === selected ? 0 : -1}
        onclick={() => choose(i)}
        onkeydown={keydown}
      >
        <span class="od-token-help--tab-label">{t(`tokenHelp.${p.id}.name`)}</span>
      </button>
    {/each}
  </div>

  <p class="od-token-help--intro">{t('tokenHelp.intro')}</p>

  <div
    class="od-token-help--surface"
    id="od-token-help-panel"
    role="tabpanel"
    tabindex="0"
    aria-labelledby="od-token-help-tab-{provider.id}"
    ontouchstart={touchstart}
    ontouchend={touchend}
  >
      <p class="od-token-help--note">{t(`tokenHelp.${provider.id}.note`)}</p>
      {#each provider.sections as section}
        {#if section.title}<h3>{t(section.title)}</h3>{/if}
        <ol>
          {#each section.steps as key (key)}<li>{t(key)}</li>{/each}
        </ol>
      {/each}
      {#if provider.after}<p class="od-token-help--note">{t(provider.after)}</p>{/if}
      <a href={provider.page} class="od-token-help--open external" target="_blank" rel="noopener">
        <span>{t('tokenHelp.open', { name })}</span>
        <Icon name="openInNew" size={20} />
      </a>
      {#if provider.docs}
        <a href={provider.docs} class="od-token-help--open external" target="_blank" rel="noopener">
          <span>{t('tokenHelp.openDocs', { name })}</span>
          <Icon name="openInNew" size={20} />
        </a>
      {/if}
  </div>

  <p class="od-token-help--intro od-token-help--afterwards">{t('tokenHelp.afterwards')}</p>
</Page>

<style>
  @layer od.components {
    .od-token-help--intro {
      margin: 16px 24px 0;
      font-size: 14px;
      line-height: 20px;
      letter-spacing: 0.25px;
      color: var(--od-text-2);

      &.od-token-help--afterwards {
        margin-bottom: calc(var(--f7-safe-area-bottom) + 24px);
      }
    }

    /* MD3 primary tabs, fixed under the top bar: equal widths, 48 dp, an indicator under the active label. */
    .od-token-help--tabs {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      background: var(--od-background);
      border-bottom: 1px solid var(--od-separator);
    }

    .od-token-help--tab {
      flex: 1 1 0;
      min-width: 0;
      height: 48px;
      padding: 0;
      border: none;
      background: none;
      color: var(--od-text-2);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.1px;
      display: flex;
      justify-content: center;
      align-items: stretch;
      cursor: pointer;

      &[aria-selected='true'] {
        color: var(--od-text);
        font-weight: 600;

        .od-token-help--tab-label {
          border-bottom: 3px solid var(--od-text);
          border-radius: 3px 3px 0 0;
        }
      }
    }

    .od-token-help--tab-label {
      box-sizing: border-box;
      padding: 0 4px;
      display: flex;
      align-items: center;
    }

    .od-token-help--surface {
      margin: 16px 16px 0;
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

    .od-token-help--note {
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

    .od-token-help--open {
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
