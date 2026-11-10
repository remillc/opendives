<script>
  // @ts-check
  // The sub-screens of About that show a text: the release notes of this
  // version (items from the translations), the full text of the GNU GPL
  // version 2 (public/licenses/gpl-2.0.txt, the one in Subsurface's LICENSE)
  // and the privacy policy (public/privacy/<language>.html, also the source
  // of the public web page built by site/build.mjs).
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { language, t, tIfExists } from '../lib/i18n.js';
  import { formatLongDate } from '../lib/format.js';

  /** @type {{ which: 'notes'|'licence'|'privacy' }} */
  let { which } = $props();

  let licence = $state('');
  $effect(() => {
    if (which !== 'licence') return;
    fetch('licenses/gpl-2.0.txt')
      .then((r) => r.text())
      .then((text) => (licence = text))
      .catch((e) => console.error('Licence text', e));
  });

  // The policy in the app's language, English otherwise: a file of the app,
  // read without the network.
  let policy = $state('');
  $effect(() => {
    if (which !== 'privacy') return;
    /** @param {string} lang */
    const read = (lang) => fetch(`privacy/${lang}.html`).then((r) => (r.ok ? r.text() : Promise.reject(r.status)));
    read(language.startsWith('fr') ? 'fr' : 'en')
      .catch(() => read('en'))
      .then((html) => (policy = html))
      .catch((e) => console.error('Privacy policy', e));
  });

  /** The release notes: about.releaseNotes.0, .1, … */
  /** @type {string[]} */
  const notes = [];
  for (let i = 0; ; i++) {
    const item = tIfExists(`about.releaseNotes.${i}`);
    if (!item) break;
    notes.push(item);
  }
</script>

<Page class="od-about-text">
  <Navbar title={which === 'notes' ? t('about.notes') : which === 'privacy' ? t('about.privacyPolicy') : t('about.licence')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('detail.back')}</span>
      </Link>
    {/snippet}
  </Navbar>

  {#if which === 'notes'}
    <div class="od-about-text--text">
      <!-- The version of app/package.json, the one source of the version; its date from CHANGELOG.md. -->
      <h2>
        {__APP_RELEASE_DATE__
          ? t('about.versionDated', { version: __APP_VERSION__, date: formatLongDate(__APP_RELEASE_DATE__) })
          : t('about.version', { version: __APP_VERSION__ })}
      </h2>
      <ul>
        {#each notes as note, i (i)}<li>{note}</li>{/each}
      </ul>
    </div>
  {:else if which === 'privacy'}
    <!-- The app's own file (public/privacy), not text from elsewhere. -->
    <div class="od-about-text--text od-about-text--policy">{@html policy}</div>
  {:else}
    <pre class="od-about-text--licence">{licence}</pre>
  {/if}
</Page>

<style>
  @layer od.components {
    .od-about-text--text {
      padding: 8px 24px 32px;
      font-size: 16px;
      line-height: 24px;

      h2 {
        font-size: 18px;
        line-height: 24px;
      }

      li {
        margin-bottom: 8px;
      }
    }

    .od-about-text--policy {
      :global(a[href]) {
        text-decoration: underline;
      }

      :global(h2) {
        margin: 24px 0 8px;
        font-size: 18px;
        line-height: 24px;
        font-weight: 700;
      }

      :global(li) {
        margin-bottom: 6px;
      }

      :global(p) {
        margin: 0 0 12px;
      }

      :global(ul) {
        margin: 0 0 12px;
        padding-left: 20px;
      }

      :global(.od-about-text--updated) {
        font-size: 14px;
        color: var(--od-text-2);
      }
    }

    .od-about-text--licence {
      margin: 0;
      padding: 16px 16px 40px;
      font-family: ui-monospace, monospace;
      font-size: 12px;
      line-height: 17px;
      white-space: pre-wrap;
      color: var(--od-text);
    }
  }
</style>
