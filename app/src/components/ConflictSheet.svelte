<script>
  // @ts-check
  // Sync conflict (docs/mockups/android-etat-conflit.dc.html,
  // ios-etat-conflit.dc.html; spec, section 6, "Conflict"; an OpenDives
  // addition). After Subsurface's automatic merge, dives whose same line
  // changed here and in the cloud: Android, an MD3 dialog; iOS, a sheet. The
  // diver keeps this device's version or takes the cloud's, after comparing
  // them if wanted; nothing is lost before the choice (the merge keeps both).
  import { Sheet, theme } from 'framework7-svelte';
  import Md3Dialog from './Md3Dialog.svelte';
  import { formatLongDate } from '../lib/format.js';
  import { t, tIfExists } from '../lib/i18n.js';

  /** @typedef {import('../lib/logbook.svelte.js').Conflict} Conflict */

  /**
   * @type {{
   *   conflict: Conflict|null,
   *   onchoose: (version: 'device'|'cloud') => Promise<void>,
   * }}
   */
  let { conflict, onchoose } = $props();

  let choice = $state(/** @type {'device'|'cloud'} */ ('device'));
  let comparing = $state(false);
  let busy = $state(false);
  let failed = $state(false);

  /** A line of the git log ("notes", "buddy"…) as the diver names it. @param {string} key */
  const fieldName = (key) => tIfExists(`conflict.fields.${key}`) ?? t('conflict.fields.other');

  /** When a version was made: the commit time, in the device's format. @param {string} iso */
  function when(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
  }

  const text = $derived.by(() => {
    if (!conflict) return '';
    const first = conflict.items[0];
    const field = fieldName(first.lines[0]?.key ?? '');
    const date = first.date ? formatLongDate(first.date) : '';
    const one = date ? t('conflict.text', { field, date }) : t('conflict.textNoDate', { field });
    return conflict.items.length > 1 ? `${one} ${t('conflict.more', { n: conflict.items.length - 1 })}` : one;
  });

  async function choose() {
    busy = true;
    failed = false;
    try {
      await onchoose(choice);
      comparing = false;
    } catch (e) {
      console.error('Resolving the sync conflict', e);
      failed = true;
    } finally {
      busy = false;
    }
  }
</script>

{#snippet body()}
  <div class="choices" role="radiogroup" aria-label={t('conflict.choiceLabel')}>
    {#each /** @type {const} */ (['device', 'cloud']) as v (v)}
      <label class="choice">
        <input type="radio" name="od-conflict" value={v} bind:group={choice} />
        <span class="choice-text">
          <span class="choice-label">{t(`conflict.${v}`)}</span>
          <span class="choice-hint">
            {t(v === 'device' ? 'conflict.deviceWhen' : 'conflict.cloudWhen', {
              when: when(v === 'device' ? conflict?.deviceTime ?? '' : conflict?.cloudTime ?? ''),
            })}
          </span>
        </span>
      </label>
    {/each}
  </div>
  {#if comparing && conflict}
    <div class="compare-list">
      {#each conflict.items as item (item.path)}
        {#if conflict.items.length > 1 && item.date}<h3>{formatLongDate(item.date)}</h3>{/if}
        {#each item.lines as line (line.key)}
          <p class="field">{fieldName(line.key)}</p>
          <p class="version"><span class="who">{t('conflict.thisDevice')}</span> {line.device || t('conflict.empty')}</p>
          <p class="version"><span class="who">{t('conflict.theCloud')}</span> {line.cloud || t('conflict.empty')}</p>
        {/each}
      {/each}
    </div>
  {/if}
  {#if failed}<p class="failed" role="alert">{t('conflict.failed')}</p>{/if}
{/snippet}

{#if conflict}
  {#if theme.ios}
    <Sheet opened swipeToClose={false} backdrop class="od-conflict-sheet" style="height: auto">
      <div class="sheet" role="dialog" aria-labelledby="od-conflict-title">
        <h2 id="od-conflict-title" class="title">{t('conflict.title')}</h2>
        <p class="text">{text}</p>
        {@render body()}
        <button type="button" class="od-text-button compare" aria-expanded={comparing} onclick={() => (comparing = !comparing)}>
          {t('conflict.compareLong')}
        </button>
        <button type="button" class="continue" disabled={busy} onclick={choose}>{t('conflict.continueLong')}</button>
      </div>
    </Sheet>
  {:else}
    <!-- The choice is required: Back and the scrim do not close it. -->
    <Md3Dialog title={t('conflict.title')} {text} oncancel={() => {}}>
      <div class="md-body">{@render body()}</div>
      {#snippet actions()}
        <button type="button" aria-expanded={comparing} onclick={() => (comparing = !comparing)}>{t('conflict.compare')}</button>
        <button type="button" disabled={busy} onclick={choose}>{t('conflict.continue')}</button>
      {/snippet}
    </Md3Dialog>
  {/if}
{/if}

<style>
  @layer od.components {
    .md-body {
      padding: 0 24px;
    }

    .title {
      margin: 16px 0 6px;
      font-size: 22px;
      line-height: 28px;
      font-weight: 700;
    }

    .text {
      margin: 0;
      font-size: 15px;
      line-height: 21px;
      color: var(--od-text-2);
    }

    .choices {
      display: flex;
      flex-direction: column;

      :global(.ios) & {
        margin-top: 16px;
        border-radius: 10px;
        background: var(--od-surface);
        overflow: hidden;
      }
    }

    .choice {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      padding: 8px 0;

      :global(.ios) & {
        gap: 12px;
        padding: 12px 16px;
        border-bottom: 0.5px solid var(--od-separator);

        &:last-child {
          border-bottom: none;
        }
      }

      input {
        flex: none;
        width: 20px;
        height: 20px;
        margin: 2px 0 0;
        accent-color: var(--od-action);
      }
    }

    .choice-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .choice-label {
      font-size: 16px;
      line-height: 24px;

      :global(.ios) & {
        font-size: 17px;
        font-weight: 600;
      }
    }

    .choice-hint {
      font-size: 14px;
      color: var(--od-text-2);

      :global(.ios) & {
        font-size: 13px;
      }
    }

    .compare-list {
      margin-top: 12px;

      h3 {
        margin: 12px 0 4px;
        font-size: 14px;
        font-weight: 500;
      }

      p {
        margin: 0 0 4px;
        font-size: 14px;
        line-height: 20px;
        white-space: pre-wrap;
      }

      .field {
        margin-top: 8px;
        font-weight: 500;
      }

      .who {
        color: var(--od-text-2);
      }
    }

    .failed {
      margin: 12px 0 0;
      font-size: 14px;
      color: var(--od-alarm);
    }

    .sheet {
      max-height: 85vh;
      overflow-y: auto;
      padding: 16px 16px calc(24px + var(--f7-safe-area-bottom, 0px));
      background: var(--od-background);
      display: flex;
      flex-direction: column;
    }

    .compare {
      align-self: flex-start;
      margin-top: 4px;
    }

    .continue {
      margin-top: 16px;
      height: 52px;
      border: none;
      border-radius: 14px;
      background: var(--od-primary-action);
      color: var(--od-on-primary-action);
      font: inherit;
      font-size: 17px;
      font-weight: 600;
      cursor: pointer;
    }
  }
</style>
