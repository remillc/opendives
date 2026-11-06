<script>
  // @ts-check
  // Sync conflict (docs/mockups/android-etat-conflit.dc.html,
  // ios-etat-conflit.dc.html; spec, section 6, "Conflict"): only when
  // Subsurface cannot merge. Android: an MD3 dialog; iOS: a sheet. The diver
  // keeps the version of this device or takes the cloud's, after comparing
  // them if wanted; nothing is lost before the choice. An OpenDives addition,
  // to be validated: the core does not report such a conflict to the app yet.
  import { Popup, Sheet, theme } from 'framework7-svelte';
  import { formatLongDate } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /** @typedef {import('../lib/logbook.svelte.js').Conflict} Conflict */

  /**
   * @type {{
   *   conflict: Conflict|null,
   *   oncompare: () => void,
   *   onchoose: (version: 'device'|'cloud') => void,
   * }}
   */
  let { conflict, oncompare, onchoose } = $props();

  let choice = $state(/** @type {'device'|'cloud'} */ ('device'));
  const opened = $derived(!!conflict);
  const text = $derived(
    conflict
      ? t('conflict.text', { field: t(`conflict.fields.${conflict.field}`), date: formatLongDate(conflict.date) })
      : '',
  );
</script>

{#snippet body()}
  <h2 id="od-conflict-title" class="title">{t('conflict.title')}</h2>
  <p class="text">{text}</p>
  <div class="choices" role="radiogroup" aria-label={t('conflict.choiceLabel')}>
    {#each /** @type {const} */ (['device', 'cloud']) as v (v)}
      <label class="choice">
        <input type="radio" name="od-conflict" value={v} bind:group={choice} />
        <span class="choice-text">
          <span class="choice-label">{t(`conflict.${v}`)}</span>
          <span class="choice-hint">{v === 'device' ? conflict?.localWhen : conflict?.cloudWhen}</span>
        </span>
      </label>
    {/each}
  </div>
{/snippet}

{#if theme.ios}
  <Sheet opened={opened} swipeToClose={false} backdrop class="od-conflict-sheet" style="height: auto">
    <div class="sheet" role="dialog" aria-labelledby="od-conflict-title">
      {@render body()}
      <button type="button" class="od-text-button compare" onclick={oncompare}>{t('conflict.compareLong')}</button>
      <button type="button" class="continue" onclick={() => onchoose(choice)}>{t('conflict.continueLong')}</button>
    </div>
  </Sheet>
{:else}
  <!-- MD3 basic dialog: a popup without swipe, so that the radio buttons are plain inputs. -->
  <Popup opened={opened} closeByBackdropClick={false} swipeToClose={false} class="od-conflict-dialog">
    <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="od-conflict-title">
      {@render body()}
      <div class="buttons">
        <button type="button" class="od-text-button" onclick={oncompare}>{t('conflict.compare')}</button>
        <button type="button" class="od-text-button" onclick={() => onchoose(choice)}>{t('conflict.continue')}</button>
      </div>
    </section>
  </Popup>
{/if}

<style>
  @layer od.components {
    /* Android: a centred MD3 dialog, 28 dp corners, over the scrim. */
    :global(.md .popup.od-conflict-dialog) {
      --f7-popup-tablet-width: 100%;
      inset: 0;
      width: auto;
      height: auto;
      margin: 0;
      background: rgb(0 0 0 / 0.32);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .dialog {
      margin: 0 24px;
      max-width: 560px;
      padding: 24px;
      border-radius: 28px;
      background: var(--od-drawer);
      color: var(--od-text);
    }

    .title {
      margin: 0 0 16px;
      font-size: 24px;
      line-height: 32px;
      font-weight: 400;

      :global(.ios) & {
        margin: 16px 0 6px;
        font-size: 22px;
        line-height: 28px;
        font-weight: 700;
      }
    }

    .text {
      margin: 0;
      font-size: 14px;
      line-height: 20px;
      letter-spacing: 0.25px;
      color: var(--od-text-2);

      :global(.ios) & {
        font-size: 15px;
        line-height: 21px;
        letter-spacing: 0;
      }
    }

    .choices {
      margin-top: 16px;
      display: flex;
      flex-direction: column;

      :global(.ios) & {
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

    .buttons {
      margin-top: 24px;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .sheet {
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
