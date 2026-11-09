<script>
  // @ts-check
  // Sync conflict (docs/mockups/android-etat-conflit.dc.html,
  // android-etat-conflit-ordinateurs.dc.html, ios-etat-conflit.dc.html; spec,
  // "Sync conflict dialog, redesigned"; an OpenDives addition). After
  // Subsurface's automatic merge, what changed differently here and in the
  // cloud: an MD3 dialog on Android, a sheet on iOS. It names what is in
  // conflict and shows each version; nothing is lost before the choice.
  import { Sheet, theme } from 'framework7-svelte';
  import Icon from './Icon.svelte';
  import Md3Dialog from './Md3Dialog.svelte';
  import ProfileThumbnail from './ProfileThumbnail.svelte';
  import { SETTINGS_FILE, compareComputers, computerNames } from '../lib/conflict-text.js';
  import { formatLongDateTime, locale } from '../lib/format.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { t, tIfExists } from '../lib/i18n.js';

  /** @typedef {import('../lib/logbook.svelte.js').Conflict} Conflict */
  /** @typedef {Conflict['items'][number]} Item */

  /**
   * @type {{
   *   conflict: Conflict|null,
   *   onchoose: (choices: Record<string, 'device'|'cloud'>) => Promise<void>,
   *   onlater: () => void,
   * }}
   */
  let { conflict, onchoose, onlater } = $props();

  /** The choice for each item, by path of its file in the git log. */
  let choices = $state(/** @type {Record<string, 'device'|'cloud'>} */ ({}));
  /** @type {('device'|'cloud')[]} */
  const sides = ['device', 'cloud'];
  let forAll = $state(false);
  let busy = $state(false);
  let failed = $state(false);

  const items = $derived(conflict?.items ?? []);
  /** With "apply to all", only the first dive's choice is asked. */
  const asked = $derived(forAll ? items.slice(0, 1) : items);

  /** The dive of an item, for its site and thumbnail. @param {Item} item */
  const diveOf = (item) => logbook.dives.find((d) => d.id === item.diveId);

  /** The line of the dive computers' names, in the logbook's settings. @param {Item} item */
  const computersLine = (item) => (item.path === SETTINGS_FILE ? item.lines.find((l) => l.key === 'divecomputerid') : undefined);

  const title = $derived.by(() => {
    const first = items[0];
    if (!first || first.date) return t('conflict.title');
    return computersLine(first) ? t('conflict.titleComputers') : t('conflict.titleOther');
  });

  /** Every line of the log has a name; an unknown one falls back to the dive. @param {string} key @param {Item} item */
  function fieldName(key, item) {
    const known = tIfExists(`conflict.fields.${key}`);
    if (known) return known;
    return [diveOf(item)?.site, item.date ? formatLongDateTime(item.date) : ''].filter(Boolean).join(', ') || t('conflict.unknownDive');
  }

  /** @param {string} text */
  const capitalised = (text) => text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);

  /** When a version was made. @param {string} iso */
  function when(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    if (date.toDateString() === new Date().toDateString()) {
      return t('conflict.today', { time: date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }) });
    }
    return date.toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short' });
  }

  /** @param {Item} item */
  function summary(item) {
    const line = computersLine(item);
    return line ? compareComputers(line.device, line.cloud) : null;
  }

  /** The names of a computer in one version. @param {string[]} names */
  const quoted = (names) => names.map((name) => t('conflict.quoted', { text: name || t('conflict.empty') })).join(` ${t('conflict.and')} `);

  /** @param {NonNullable<ReturnType<typeof summary>>} s */
  function differingText(s) {
    return s.differing
      .map((d) => t('conflict.nameOf', { model: d.model }) + (d.serial ? ` (${t('settings.logbookComputers.serialShort', { serial: d.serial })})` : ''))
      .join(', ');
  }

  async function choose() {
    /** @type {Record<string, 'device'|'cloud'>} */
    const all = {};
    for (const item of items) all[item.path] = forAll ? (choices[items[0].path] ?? 'device') : (choices[item.path] ?? 'device');
    busy = true;
    failed = false;
    try {
      await onchoose(all);
    } catch (e) {
      console.error('Resolving the sync conflict', e);
      failed = true;
    } finally {
      busy = false;
    }
  }
</script>

{#snippet identity(/** @type {Item} */ item)}
  {@const dive = diveOf(item)}
  <div class="identity">
    {#if item.date && dive}
      <ProfileThumbnail profile={dive.profile} maxDepthMm={dive.maxDepthMm} prefs={logbook.prefs} />
    {:else}
      <span class="identity-icon" aria-hidden="true"><Icon name={computersLine(item) ? 'computer' : 'file'} weight={2} /></span>
    {/if}
    <span class="identity-text">
      {#if item.date}
        <span class="identity-title">{dive?.site || t('dive.siteNotSet')}</span>
        <span class="identity-sub od-value">
          {[item.number ? t('detail.number', { number: String(item.number) }) : '', formatLongDateTime(item.date)].filter(Boolean).join(' · ')}
        </span>
      {:else if computersLine(item)}
        <span class="identity-title">{t('conflict.computersCard')}</span>
        <span class="identity-sub">{t('conflict.computersCardSub')}</span>
      {:else}
        <span class="identity-title">{t('conflict.otherCard')}</span>
      {/if}
    </span>
  </div>
{/snippet}

{#snippet explanation(/** @type {Item} */ item)}
  {@const s = summary(item)}
  <p class="text">
    {#if s}
      {t('conflict.introComputers')}
      {#if s.differing.length}<b>{differingText(s)}</b>{/if}
      {#if s.differing.length && (s.onlyCloud.length || s.onlyDevice.length)}{t('conflict.and')}{/if}
      {[s.onlyCloud.length ? t('conflict.onlyInCloud', { n: s.onlyCloud.length }) : '', s.onlyDevice.length ? t('conflict.onlyOnDevice', { n: s.onlyDevice.length }) : ''].filter(Boolean).join(', ')}.
      {t('conflict.outroComputers')}
    {:else}
      {t('conflict.intro')}
      <b>{item.lines.map((l) => fieldName(l.key, item)).join(', ')}</b>.
      {t('conflict.outro')}
    {/if}
  </p>
{/snippet}

{#snippet values(/** @type {Item} */ item, /** @type {'device'|'cloud'} */ side)}
  {@const s = summary(item)}
  <span class="values">
    {#if s}
      {#each s.differing as d (`${d.model}\n${d.serial}`)}
        <span>{t('conflict.labelled', { label: d.model })} <b>{quoted(d[side])}</b></span>
      {/each}
      {#if side === 'device'}
        {#if s.onlyDevice.length}<span>{t('conflict.extra', { names: computerNames(s.onlyDevice) })}</span>{/if}
        {#if s.onlyCloud.length}<span class="loss">{t('conflict.loseCloud', { n: s.onlyCloud.length })}</span>{/if}
      {:else}
        {#if s.onlyCloud.length}<span>{t('conflict.extra', { names: computerNames(s.onlyCloud) })}</span>{/if}
        {#if s.onlyDevice.length}<span class="loss">{t('conflict.loseDevice', { n: s.onlyDevice.length })}</span>{/if}
      {/if}
    {/if}
    {#each item.lines.filter((l) => l.key !== 'divecomputerid' || !s) as line (line.key)}
      <span>{t('conflict.labelled', { label: capitalised(fieldName(line.key, item)) })} {t('conflict.quoted', { text: line[side] || t('conflict.empty') })}</span>
    {/each}
  </span>
{/snippet}

{#snippet body()}
  {#each asked as item (item.path)}
    {@const s = summary(item)}
    <section class="item">
      {@render identity(item)}
      {@render explanation(item)}
      <div class="cards" role="radiogroup" aria-label={t('conflict.choiceLabel')}>
        {#each sides as side (side)}
          {@const selected = (choices[item.path] ?? 'device') === side}
          <label class="choice" class:selected>
            <input type="radio" name="od-conflict-{item.path}" value={side} checked={selected} onchange={() => (choices[item.path] = side)} />
            <span class="mark" aria-hidden="true">{#if selected}<Icon name="check" size={16} weight={3} />{/if}</span>
            <span class="card-text">
              <span class="card-title">{t(side === 'device' ? 'conflict.deviceCard' : 'conflict.cloudCard')}</span>
              <span class="card-when">
                {t(side === 'device' ? 'conflict.deviceWhen' : 'conflict.cloudWhen', { when: when(side === 'device' ? (conflict?.deviceTime ?? '') : (conflict?.cloudTime ?? '')) })}
              </span>
              {@render values(item, side)}
            </span>
          </label>
        {/each}
      </div>
      {#if s?.same.length}<p class="unchanged">{t('conflict.unchanged', { names: computerNames(s.same) })}</p>{/if}
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
        <h2 id="od-conflict-title" class="title">{title}</h2>
        {@render body()}
        <button type="button" class="tonal wide" disabled={busy} onclick={choose}>{t('conflict.continue')}</button>
        <button type="button" class="later" disabled={busy} onclick={onlater}>{t('conflict.later')}</button>
      </div>
    </Sheet>
  {:else}
    <Md3Dialog {title} oncancel={onlater}>
      <div class="md-body">{@render body()}</div>
      {#snippet actions()}
        <button type="button" disabled={busy} onclick={onlater}>{t('conflict.later')}</button>
        <button type="button" class="tonal" disabled={busy} onclick={choose}>{t('conflict.continue')}</button>
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
      margin: 16px 4px 12px;
      font-size: 22px;
      line-height: 28px;
      font-weight: 700;
    }

    .item + .item {
      margin-top: 20px;
    }

    .identity {
      padding: 12px;
      border-radius: 16px;
      background: var(--od-surface);
      display: flex;
      align-items: center;
      gap: 12px;

      :global(.ios) & {
        border-radius: 14px;
      }
    }

    .identity-icon {
      flex: none;
      width: 56px;
      height: 40px;
      border-radius: 8px;
      background: var(--od-background);
      color: var(--od-text);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .identity-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .identity-title {
      font-size: 16px;
      line-height: 24px;
      font-weight: 600;
      color: var(--od-text);

      :global(.ios) & {
        font-size: 17px;
        line-height: 22px;
      }
    }

    .identity-sub {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);

      :global(.ios) & {
        font-size: 15px;
      }
    }

    .text {
      margin: 16px 0 0;
      font-size: 14px;
      line-height: 20px;
      letter-spacing: 0.25px;
      color: var(--od-text-2);

      :global(.ios) & {
        margin: 12px 4px 0;
        font-size: 15px;
        line-height: 21px;
        letter-spacing: 0;
      }

      b {
        font-weight: 600;
        color: var(--od-text);
      }
    }

    .cards {
      margin-top: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;

      :global(.ios) & {
        gap: 10px;
      }
    }

    .choice {
      position: relative;
      display: flex;
      align-items: flex-start;
      padding: 13px 15px 15px;
      border: 1px solid var(--od-menu-divider);
      border-radius: 16px;
      cursor: pointer;

      :global(.ios) & {
        border-radius: 14px;
        border-width: 0.5px;
        background: var(--od-surface);
      }

      input {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: 0;
        opacity: 0;
      }

      &.selected {
        padding: 14px 16px 16px;
        border: none;
        border-radius: 24px;
        background: var(--od-selected-container);

        :global(.ios) & {
          border-radius: 14px;
          background: var(--od-selected-container);
        }

        .mark {
          border: none;
          background: var(--od-selected);
          color: var(--od-on-secondary);
        }

        .values {
          background: var(--od-surface);
        }

        /* On the tinted fill, the secondary text keeps its contrast in dark mode too. */
        .card-title {
          color: var(--od-on-secondary-container);
        }

        .card-when {
          color: var(--od-on-secondary-container);
        }
      }

      &:has(input:focus-visible) {
        outline: 2px solid var(--od-text);
        outline-offset: 2px;
      }
    }

    .mark {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 24px;
      height: 24px;
      box-sizing: border-box;
      border: 2px solid var(--od-chip-outline);
      border-radius: 12px;
      background: var(--od-surface);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .card-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .card-title {
      padding-right: 32px;
      font-size: 16px;
      line-height: 24px;
      color: var(--od-text);

      :global(.ios) & {
        font-size: 17px;
        line-height: 22px;
        font-weight: 600;
      }
    }

    .card-when {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);

      :global(.ios) & {
        font-size: 13px;
        line-height: 18px;
      }
    }

    .values {
      margin-top: 6px;
      padding: 8px 10px;
      border-radius: 8px;
      background: var(--od-surface);
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text);
      display: flex;
      flex-direction: column;
      gap: 4px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;

      :global(.ios) & {
        background: var(--od-background);
        font-size: 15px;
      }

      b {
        font-weight: 600;
      }

      .loss {
        font-size: 13px;
        line-height: 18px;
        color: var(--od-text-2);
      }
    }

    .unchanged {
      margin: 8px 0 0 4px;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .for-all {
      margin-top: 12px;
      min-height: 48px;
      display: flex;
      align-items: center;
      gap: 16px;
      font-size: 16px;
      color: var(--od-text);

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

    button.tonal.tonal {
      height: 40px;
      padding: 0 24px;
      border: none;
      border-radius: 20px;
      background: var(--od-tonal);
      color: var(--od-on-secondary-container);
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.1px;

      &.wide {
        width: 100%;
        height: 50px;
        margin-top: 16px;
        border-radius: 12px;
        font-size: 17px;
      }
    }

    .later {
      width: 100%;
      height: 44px;
      margin-top: 4px;
      border: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-size: 17px;
    }

    .sheet {
      max-height: 85vh;
      overflow-y: auto;
      padding: 8px 16px calc(16px + var(--f7-safe-area-bottom, 0px));
      background: var(--od-background);
      display: flex;
      flex-direction: column;
    }
  }
</style>
