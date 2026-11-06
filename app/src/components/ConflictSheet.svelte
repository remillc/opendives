<script>
  // @ts-check
  // Sync conflict (docs/mockups/android-etat-conflit.dc.html,
  // ios-etat-conflit.dc.html; spec, section 6, "Conflict"; an OpenDives
  // addition). After Subsurface's automatic merge, dives whose same line
  // changed here and in the cloud: Android, an MD3 dialog; iOS, a sheet. Dive
  // by dive, the diver keeps this phone's version or takes the cloud's, after
  // comparing them; "Apply this choice to all the dives" makes one choice for
  // all. Nothing is lost before the choice (the merge keeps both versions).
  import { Sheet, theme } from 'framework7-svelte';
  import Md3Dialog from './Md3Dialog.svelte';
  import { formatLongDate } from '../lib/format.js';
  import { t, tIfExists } from '../lib/i18n.js';

  /** @typedef {import('../lib/logbook.svelte.js').Conflict} Conflict */

  /**
   * @type {{
   *   conflict: Conflict|null,
   *   onchoose: (choices: Record<string, 'device'|'cloud'>) => Promise<void>,
   * }}
   */
  let { conflict, onchoose } = $props();

  /** The choice for each dive, by path of its file in the git log. */
  let choices = $state(/** @type {Record<string, 'device'|'cloud'>} */ ({}));
  /** @type {('device'|'cloud')[]} */
  const sides = ['device', 'cloud'];
  let forAll = $state(false);
  let comparing = $state(false);
  let busy = $state(false);
  let failed = $state(false);

  const items = $derived(conflict?.items ?? []);
  /** With "apply to all", only the first dive's choice is asked. */
  const asked = $derived(forAll ? items.slice(0, 1) : items);

  /** A line of the git log ("notes", "buddy"…) as the diver names it. @param {string} key */
  const fieldName = (key) => tIfExists(`conflict.fields.${key}`) ?? t('conflict.fields.other');

  /** When a version was made: the commit time, in the device's format. @param {string} iso */
  function when(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
  }

  const text = $derived.by(() => {
    if (!conflict || !items.length) return '';
    if (items.length > 1) return t('conflict.textMany', { n: items.length });
    const first = items[0];
    const field = first.lines.map((l) => fieldName(l.key)).join(', ');
    return first.date ? t('conflict.text', { field, date: formatLongDate(first.date) }) : t('conflict.textNoDate', { field });
  });

  /** @param {(typeof items)[number]} item */
  function title(item) {
    const date = item.date ? formatLongDate(item.date) : t('conflict.unknownDive');
    return item.number ? t('conflict.diveTitle', { number: String(item.number), date }) : date;
  }

  async function choose() {
    /** @type {Record<string, 'device'|'cloud'>} */
    const all = {};
    for (const item of items) all[item.path] = forAll ? (choices[items[0].path] ?? 'device') : (choices[item.path] ?? 'device');
    busy = true;
    failed = false;
    try {
      await onchoose(all);
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
  {#each asked as item (item.path)}
    <section class="dive">
      {#if items.length > 1 && !forAll}<h3>{title(item)}</h3>{/if}
      <p class="fields">{item.lines.map((l) => fieldName(l.key)).join(', ')}</p>
      <div class="choices" role="radiogroup" aria-label={forAll ? t('conflict.choiceLabel') : title(item)}>
        {#each sides as v (v)}
          <label class="choice">
            <input
              type="radio"
              name="od-conflict-{item.path}"
              value={v}
              checked={(choices[item.path] ?? 'device') === v}
              onchange={() => (choices[item.path] = v)}
            />
            <span class="choice-text">
              <span class="choice-label">{t(`conflict.${v}`)}</span>
              <span class="choice-hint">
                {t(v === 'device' ? 'conflict.deviceWhen' : 'conflict.cloudWhen', {
                  when: when(v === 'device' ? conflict?.deviceTime ?? '' : conflict?.cloudTime ?? ''),
                })}
              </span>
              {#if comparing && !forAll}
                {#each item.lines as line (line.key)}
                  <span class="version">
                    {#if item.lines.length > 1}<span class="who">{fieldName(line.key)} :</span>{/if}
                    {(v === 'device' ? line.device : line.cloud) || t('conflict.empty')}
                  </span>
                {/each}
              {/if}
            </span>
          </label>
        {/each}
      </div>
    </section>
  {/each}
  {#if items.length > 1}
    <label class="for-all">
      <input type="checkbox" bind:checked={forAll} />
      <span>{t('conflict.forAll')}</span>
    </label>
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
        {#if !forAll}
          <button type="button" class="od-text-button compare" aria-expanded={comparing} onclick={() => (comparing = !comparing)}>
            {t('conflict.compareLong')}
          </button>
        {/if}
        <button type="button" class="continue" disabled={busy} onclick={choose}>{t('conflict.continueLong')}</button>
      </div>
    </Sheet>
  {:else}
    <!-- The choice is required: Back and the scrim do not close it. -->
    <Md3Dialog title={t('conflict.title')} {text} oncancel={() => {}}>
      <div class="md-body">{@render body()}</div>
      {#snippet actions()}
        {#if !forAll}
          <button type="button" aria-expanded={comparing} onclick={() => (comparing = !comparing)}>{t('conflict.compare')}</button>
        {/if}
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

    .dive {
      margin-top: 8px;

      :global(.ios) & {
        margin-top: 16px;
      }

      h3 {
        margin: 8px 0 0;
        font-size: 16px;
        font-weight: 500;
      }
    }

    .fields {
      margin: 2px 0 4px;
      font-size: 14px;
      color: var(--od-text-2);
    }

    .choices {
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
      min-width: 0;
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

    .version {
      margin-top: 4px;
      font-size: 14px;
      line-height: 20px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;

      .who {
        color: var(--od-text-2);
      }
    }

    .for-all {
      margin-top: 12px;
      min-height: 48px;
      display: flex;
      align-items: center;
      gap: 16px;
      font-size: 16px;

      input {
        flex: none;
        width: 18px;
        height: 18px;
        margin: 0;
        accent-color: var(--od-action);
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
