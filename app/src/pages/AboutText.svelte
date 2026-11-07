<script>
  // @ts-check
  // The sub-screens of About that show a text: the release notes of this
  // version (items from the translations) and the full text of the GNU GPL
  // version 2 (public/licenses/gpl-2.0.txt, the one in Subsurface's LICENSE).
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { t, tIfExists } from '../lib/i18n.js';

  /** @type {{ which: 'notes'|'licence' }} */
  let { which } = $props();

  let licence = $state('');
  $effect(() => {
    if (which !== 'licence') return;
    fetch('licenses/gpl-2.0.txt')
      .then((r) => r.text())
      .then((text) => (licence = text))
      .catch((e) => console.error('Licence text', e));
  });

  /** The release notes: about.releaseNotes.0, .1, … */
  /** @type {string[]} */
  const notes = [];
  for (let i = 0; i < 20; i++) {
    const item = tIfExists(`about.releaseNotes.${i}`);
    if (!item) break;
    notes.push(item);
  }
</script>

<Page>
  <Navbar title={which === 'notes' ? t('about.notes') : t('about.licence')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('detail.back')}</span>
      </Link>
    {/snippet}
  </Navbar>

  {#if which === 'notes'}
    <div class="text">
      <h2>{t('about.notesHeading')}</h2>
      <ul>
        {#each notes as note, i (i)}<li>{note}</li>{/each}
      </ul>
    </div>
  {:else}
    <pre class="licence">{licence}</pre>
  {/if}
</Page>

<style>
  @layer od.components {
    .text {
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

    .licence {
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
