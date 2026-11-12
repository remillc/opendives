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
  import { conflictChoices, conflictLayout } from '../lib/conflict-choices.js';
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
  /** "Same choice for all" (several dives): one side applies to every dive. */
  let forAll = $state(false);
  /** @type {'device'|'cloud'} */
  let allSide = $state('device');
  /** The path of the dive whose full values are shown (several dives). */
  let detail = $state(/** @type {string|null} */ (null));
  let busy = $state(false);
  let failed = $state(false);

  const items = $derived(conflict?.items ?? []);
  /** Several items: a full-screen list, one card each; one item: the dialog with its two cards. */
  const list = $derived(conflictLayout(items.length) === 'list');
  const detailItem = $derived(detail ? items.find((i) => i.path === detail) : undefined);
  /** The items shown with their full values. */
  const asked = $derived(list ? (detailItem ? [detailItem] : []) : items);

  /** The dive of an item, for its site and thumbnail. @param {Item} item */
  const diveOf = (item) => logbook.dives.find((d) => d.id === item.diveId);

  /** The line of the dive computers' names, in the logbook's settings. @param {Item} item */
  const computersLine = (item) => (item.path === SETTINGS_FILE ? item.lines.find((l) => l.key === 'divecomputerid') : undefined);

  const title = $derived.by(() => {
    if (list && !detailItem) return t('conflict.titleMany', { n: items.length });
    const first = detailItem ?? items[0];
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

  /** The side chosen for an item: the common one when "same choice for all" is on. @param {Item} item */
  const sideOf = (item) => (forAll ? allSide : (choices[item.path] ?? 'device'));

  /** What differs in an item, in plain words. @param {Item} item */
  function differsText(item) {
    return item.lines.map((l) => fieldName(l.key, item)).join(', ');
  }

  /** A version's value of the first differing field, for the small card (cut to two lines by CSS). @param {Item} item @param {'device'|'cloud'} side */
  function shortValue(item, side) {
    const s = summary(item);
    if (s?.differing.length) return quoted(s.differing[0][side]);
    const line = item.lines.find((l) => l.key !== 'divecomputerid');
    return line ? t('conflict.quoted', { text: line[side] || t('conflict.empty') }) : '';
  }

  /** "Plus tard", Escape, Back: from a dive's full values back to the list, else close. */
  function dismiss() {
    if (detail) detail = null;
    else onlater();
  }

  /**
   * The full-screen dialog is moved under <body> (no page transform can clip
   * it); Back and Escape dismiss it (lib/back-button.js sends od-cancel to a
   * .od-dialog).
   * @param {HTMLElement} node
   */
  function portal(node) {
    document.body.appendChild(node);
    const cancel = (/** @type {Event} */ e) => {
      e.stopPropagation();
      dismiss();
    };
    node.addEventListener('od-cancel', cancel);
    queueMicrotask(() => /** @type {HTMLElement|null} */ (node.querySelector('[role="dialog"]'))?.focus({ preventScroll: true }));
    return {
      destroy() {
        node.removeEventListener('od-cancel', cancel);
        node.remove();
      },
    };
  }

  /** @param {KeyboardEvent} e */
  function keydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      dismiss();
    }
  }

  async function choose() {
    const all = conflictChoices(items, choices, forAll, allSide);
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
  <div class="od-conflict-sheet--identity">
    {#if item.date && dive}
      <ProfileThumbnail profile={dive.profile} maxDepthMm={dive.maxDepthMm} prefs={logbook.prefs} />
    {:else}
      <span class="od-conflict-sheet--identity-icon" aria-hidden="true"><Icon name={computersLine(item) ? 'computer' : 'file'} weight={2} /></span>
    {/if}
    <span class="od-conflict-sheet--identity-text">
      {#if item.date}
        <span class="od-conflict-sheet--identity-title">{dive?.site || t('dive.siteNotSet')}</span>
        <span class="od-conflict-sheet--identity-sub od-value">
          {[item.number ? t('detail.number', { number: String(item.number) }) : '', formatLongDateTime(item.date)].filter(Boolean).join(' · ')}
        </span>
      {:else if computersLine(item)}
        <span class="od-conflict-sheet--identity-title">{t('conflict.computersCard')}</span>
        <span class="od-conflict-sheet--identity-sub">{t('conflict.computersCardSub')}</span>
      {:else}
        <span class="od-conflict-sheet--identity-title">{t('conflict.otherCard')}</span>
      {/if}
    </span>
  </div>
{/snippet}

{#snippet explanation(/** @type {Item} */ item)}
  {@const s = summary(item)}
  <p class="od-conflict-sheet--text">
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
  <span class="od-conflict-sheet--values">
    {#if s}
      {#each s.differing as d (`${d.model}\n${d.serial}`)}
        <span>{t('conflict.labelled', { label: d.model })} <b>{quoted(d[side])}</b></span>
      {/each}
      {#if side === 'device'}
        {#if s.onlyDevice.length}<span>{t('conflict.extra', { names: computerNames(s.onlyDevice) })}</span>{/if}
        {#if s.onlyCloud.length}<span class="od-conflict-sheet--loss">{t('conflict.loseCloud', { n: s.onlyCloud.length })}</span>{/if}
      {:else}
        {#if s.onlyCloud.length}<span>{t('conflict.extra', { names: computerNames(s.onlyCloud) })}</span>{/if}
        {#if s.onlyDevice.length}<span class="od-conflict-sheet--loss">{t('conflict.loseDevice', { n: s.onlyDevice.length })}</span>{/if}
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
    <section class="od-conflict-sheet--item">
      {@render identity(item)}
      {@render explanation(item)}
      <div class="od-conflict-sheet--cards" role="radiogroup" aria-label={t('conflict.choiceLabel')}>
        {#each sides as side (side)}
          {@const selected = sideOf(item) === side}
          <label class="od-conflict-sheet--choice" class:od-conflict-sheet--selected={selected}>
            <input type="radio" name="od-conflict-{item.path}" value={side} checked={selected} disabled={forAll} onchange={() => (choices[item.path] = side)} />
            {#if selected || theme.ios}<span class="od-conflict-sheet--mark" aria-hidden="true">{#if selected}<Icon name="check" size={16} weight={3} />{/if}</span>{/if}
            <span class="od-conflict-sheet--card-text">
              <span class="od-conflict-sheet--card-title">{t(side === 'device' ? 'conflict.deviceCard' : 'conflict.cloudCard')}</span>
              <span class="od-conflict-sheet--card-when">
                {t(side === 'device' ? 'conflict.deviceWhen' : 'conflict.cloudWhen', { when: when(side === 'device' ? (conflict?.deviceTime ?? '') : (conflict?.cloudTime ?? '')) })}
              </span>
              {@render values(item, side)}
            </span>
          </label>
        {/each}
      </div>
      {#if s?.same.length}<p class="od-conflict-sheet--unchanged">{t('conflict.unchanged', { names: computerNames(s.same) })}</p>{/if}
    </section>
  {/each}
  {#if failed}<p class="od-conflict-sheet--failed" role="alert">{t('conflict.failed')}</p>{/if}
{/snippet}

<!-- Two small selectable cards, side by side (several dives). -->
{#snippet small(/** @type {Item|null} */ item, /** @type {string} */ name)}
  <div class="od-conflict-sheet--smalls" role="radiogroup" aria-label={t('conflict.choiceFor', { name })}>
    {#each sides as side (side)}
      {@const selected = (item ? sideOf(item) : allSide) === side}
      {@const disabled = !!item && forAll}
      <label class="od-conflict-sheet--small" class:od-conflict-sheet--selected={selected} class:disabled>
        <input
          type="radio"
          name="od-conflict-{item ? item.path : 'all'}"
          value={side}
          checked={selected}
          {disabled}
          onchange={() => (item ? (choices[item.path] = side) : (allSide = side))}
        />
        {#if selected || theme.ios}<span class="od-conflict-sheet--mark od-conflict-sheet--small-mark" aria-hidden="true">{#if selected}<Icon name="check" size={13} weight={3} />{/if}</span>{/if}
        <span class="od-conflict-sheet--small-title">{t(side === 'device' ? 'conflict.phoneShort' : 'conflict.cloudShort')}</span>
        {#if item}
          <span class="od-conflict-sheet--small-when">{when(side === 'device' ? (conflict?.deviceTime ?? '') : (conflict?.cloudTime ?? ''))}</span>
          <span class="od-conflict-sheet--small-value">{shortValue(item, side)}</span>
        {/if}
      </label>
    {/each}
  </div>
{/snippet}

{#snippet many()}
  <p class="od-conflict-sheet--text od-conflict-sheet--intro-many">{t('conflict.introMany')}</p>
  <div class="od-conflict-sheet--all-card">
    <label class="od-conflict-sheet--all-row">
      <span class="od-conflict-sheet--all-texts">
        <span class="od-conflict-sheet--all-title">{t('conflict.allSame')}</span>
        <span class="od-conflict-sheet--all-sub">{t('conflict.allSameText')}</span>
      </span>
      <span class="toggle">
        <input type="checkbox" role="switch" bind:checked={forAll} />
        <span class="toggle-icon"></span>
      </span>
    </label>
    {#if forAll}{@render small(null, t('conflict.allSame'))}{/if}
  </div>
  {#each items as item (item.path)}
    {@const dive = diveOf(item)}
    {@const name = (item.date ? dive?.site : '') || (computersLine(item) ? t('conflict.computersCard') : item.date ? t('dive.siteNotSet') : t('conflict.otherCard'))}
    <section class="od-conflict-sheet--dive-card">
      <button type="button" class="od-conflict-sheet--dive-head" aria-label={t('conflict.details', { name })} onclick={() => (detail = item.path)}>
        {#if item.date && dive}
          <ProfileThumbnail profile={dive.profile} maxDepthMm={dive.maxDepthMm} prefs={logbook.prefs} />
        {:else}
          <span class="od-conflict-sheet--identity-icon" aria-hidden="true"><Icon name={computersLine(item) ? 'computer' : 'file'} weight={2} /></span>
        {/if}
        <span class="od-conflict-sheet--identity-text">
          <span class="od-conflict-sheet--identity-title">{name}</span>
          <span class="od-conflict-sheet--identity-sub od-value">
            {[item.number ? t('detail.number', { number: String(item.number) }) : '', item.date ? formatLongDateTime(item.date) : '', t('conflict.differs', { fields: differsText(item) })].filter(Boolean).join(' · ')}
          </span>
        </span>
      </button>
      {@render small(item, name)}
    </section>
  {/each}
  {#if failed}<p class="od-conflict-sheet--failed" role="alert">{t('conflict.failed')}</p>{/if}
{/snippet}

{#if conflict}
  {#if theme.ios}
    <Sheet opened swipeToClose={false} backdrop class="od-conflict-sheet" style={list ? 'height: 92%' : 'height: auto'}>
      <div class="od-conflict-sheet--sheet" class:od-conflict-sheet--large={list} role="dialog" aria-labelledby="od-conflict-title">
        <h2 id="od-conflict-title" class="od-conflict-sheet--title">{title}</h2>
        {#if list && !detailItem}{@render many()}{:else}{@render body()}{/if}
        {#if detailItem}
          <button type="button" class="od-conflict-sheet--tonal od-conflict-sheet--wide" onclick={dismiss}>{t('conflict.back')}</button>
        {:else}
          <button type="button" class="od-conflict-sheet--tonal od-conflict-sheet--wide" disabled={busy} onclick={choose}>{t('conflict.continue')}</button>
          <button type="button" class="od-conflict-sheet--later" disabled={busy} onclick={onlater}>{t('conflict.later')}</button>
        {/if}
      </div>
    </Sheet>
  {:else if list}
    <!-- Android, several dives: an MD3 full-screen dialog. ✕ is "Plus tard" (or back to the list from one dive). -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="od-conflict-sheet od-conflict-sheet--full od-md3-dialog modal-in" use:portal onkeydown={keydown}>
      <div class="od-conflict-sheet--full-surface" role="dialog" aria-modal="true" aria-labelledby="od-conflict-title" tabindex="-1">
        <div class="od-conflict-sheet--bar">
          <button type="button" class="od-conflict-sheet--bar-close" aria-label={t(detailItem ? 'conflict.back' : 'conflict.later')} disabled={busy} onclick={dismiss}>
            <Icon name="close" weight={2} />
          </button>
          <h1 id="od-conflict-title">{title}</h1>
          {#if detailItem}
            <button type="button" class="od-conflict-sheet--tonal od-conflict-sheet--bar-action" onclick={dismiss}>{t('conflict.back')}</button>
          {:else}
            <button type="button" class="od-conflict-sheet--tonal od-conflict-sheet--bar-action" disabled={busy} onclick={choose}>{t('conflict.continue')}</button>
          {/if}
        </div>
        <div class="od-conflict-sheet--full-body">
          {#if detailItem}{@render body()}{:else}{@render many()}{/if}
        </div>
      </div>
    </div>
  {:else}
    <Md3Dialog class="od-conflict-sheet" {title} oncancel={onlater}>
      <div class="od-conflict-sheet--md-body">{@render body()}</div>
      {#snippet actions()}
        <button type="button" disabled={busy} onclick={onlater}>{t('conflict.later')}</button>
        <button type="button" class="od-conflict-sheet--tonal" disabled={busy} onclick={choose}>{t('conflict.continue')}</button>
      {/snippet}
    </Md3Dialog>
  {/if}
{/if}

<style>
  @layer od.components {
    .od-conflict-sheet--md-body {
      padding: 0 24px;
    }

    .od-conflict-sheet--title {
      margin: 16px 4px 12px;
      font-size: 22px;
      line-height: 28px;
      font-weight: 700;
    }

    .od-conflict-sheet--item + .od-conflict-sheet--item {
      margin-top: 20px;
    }

    .od-conflict-sheet--identity {
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

    .od-conflict-sheet--identity-icon {
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

    .od-conflict-sheet--identity-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .od-conflict-sheet--identity-title {
      font-size: 16px;
      line-height: 24px;
      font-weight: 600;
      color: var(--od-text);

      :global(.ios) & {
        font-size: 17px;
        line-height: 22px;
      }
    }

    .od-conflict-sheet--identity-sub {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);

      :global(.ios) & {
        font-size: 15px;
      }
    }

    .od-conflict-sheet--text {
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

    .od-conflict-sheet--cards {
      margin-top: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;

      :global(.ios) & {
        gap: 10px;
      }
    }

    .od-conflict-sheet--choice {
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

      &.od-conflict-sheet--selected {
        padding: 14px 16px 16px;
        border: none;
        border-radius: 24px;
        background: var(--od-selected-container);

        :global(.ios) & {
          border-radius: 14px;
          background: var(--od-selected-container);
        }

        .od-conflict-sheet--mark {
          border: none;
          background: var(--od-selected);
          color: var(--od-on-secondary);
        }

        .od-conflict-sheet--values {
          background: var(--od-surface);
        }

        /* On the tinted fill, the secondary text keeps its contrast in dark mode too. */
        .od-conflict-sheet--card-title {
          color: var(--od-on-secondary-container);
        }

        .od-conflict-sheet--card-when {
          color: var(--od-on-secondary-container);
        }
      }

      &:has(input:focus-visible) {
        outline: 2px solid var(--od-text);
        outline-offset: 2px;
      }
    }

    .od-conflict-sheet--mark {
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

    .od-conflict-sheet--card-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-conflict-sheet--card-title {
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

    .od-conflict-sheet--card-when {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);

      :global(.ios) & {
        font-size: 13px;
        line-height: 18px;
      }
    }

    .od-conflict-sheet--values {
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

      .od-conflict-sheet--loss {
        font-size: 13px;
        line-height: 18px;
        color: var(--od-text-2);
      }
    }

    .od-conflict-sheet--unchanged {
      margin: 8px 0 0 4px;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    /* Several dives: the full-screen dialog (Android) and the same content in the large sheet (iOS). */
    .od-conflict-sheet--full {
      position: fixed;
      inset: 0;
      z-index: 13500;
      font-family: inherit;
    }

    .od-conflict-sheet--full-surface {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      background: var(--od-background);
      color: var(--od-text);
      outline: none;
    }

    .od-conflict-sheet--bar {
      flex: none;
      display: flex;
      align-items: center;
      height: 64px;
      box-sizing: content-box;
      padding: var(--f7-safe-area-top, 0px) 4px 0;
    }

    .od-conflict-sheet--bar h1 {
      flex: 1;
      min-width: 0;
      margin: 0 0 0 4px;
      font-size: 22px;
      line-height: 28px;
      font-weight: 500;
    }

    .od-conflict-sheet--bar-close {
      flex: none;
      width: 48px;
      height: 48px;
      border: none;
      background: none;
      color: var(--od-text);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    button.od-conflict-sheet--tonal.od-conflict-sheet--bar-action {
      width: auto;
      flex: none;
      margin-right: 12px;
      padding: 0 16px;
    }

    .od-conflict-sheet--full-body {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 0 16px calc(16px + var(--f7-safe-area-bottom, 0px));
    }

    .od-conflict-sheet--intro-many {
      margin: 4px 4px 12px;
    }

    .od-conflict-sheet--all-card,
    .od-conflict-sheet--dive-card {
      margin-bottom: 12px;
      border-radius: 20px;
      background: var(--od-surface);

      :global(.ios) & {
        border-radius: 14px;
      }
    }

    .od-conflict-sheet--all-card {
      padding: 4px 16px;
    }

    .od-conflict-sheet--dive-card {
      padding: 12px;
    }

    .od-conflict-sheet--all-row {
      min-height: 56px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .od-conflict-sheet--all-texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .od-conflict-sheet--all-title {
      font-size: 16px;
      line-height: 24px;
    }

    .od-conflict-sheet--all-sub {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-conflict-sheet--all-card .od-conflict-sheet--smalls {
      padding-bottom: 12px;
    }

    button.od-conflict-sheet--dive-head {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 0;
      border: none;
      background: none;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .od-conflict-sheet--smalls {
      margin-top: 10px;
      display: flex;
      gap: 8px;
    }

    .od-conflict-sheet--small {
      position: relative;
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
      box-sizing: border-box;
      padding: 9px 9px 11px 11px;
      border: 1px solid var(--od-menu-divider);
      border-radius: 14px;
      cursor: pointer;

      input {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: 0;
        opacity: 0;
      }

      &.od-conflict-sheet--selected {
        padding: 10px 10px 12px 12px;
        border: none;
        border-radius: 20px;
        background: var(--od-selected-container);

        .od-conflict-sheet--small-mark {
          border: none;
          background: var(--od-selected);
          color: var(--od-on-secondary);
        }

        .od-conflict-sheet--small-title,
        .od-conflict-sheet--small-when {
          color: var(--od-on-secondary-container);
        }
      }

      /* Disabled by "Same choice for all": the common choice shows, the card does not answer. */
      &.disabled {
        cursor: default;
        opacity: 0.7;
      }

      &:has(input:focus-visible) {
        outline: 2px solid var(--od-text);
        outline-offset: 2px;
      }
    }

    .od-conflict-sheet--small-mark {
      top: 8px;
      right: 8px;
      width: 20px;
      height: 20px;
      border-radius: 10px;
    }

    .od-conflict-sheet--small-title {
      padding-right: 24px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
    }

    .od-conflict-sheet--small-when {
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);
    }

    .od-conflict-sheet--small-value {
      margin-top: 4px;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      overflow-wrap: anywhere;
    }

    .od-conflict-sheet--failed {
      margin: 12px 0 0;
      font-size: 14px;
      color: var(--od-alarm);
    }

    button.od-conflict-sheet--tonal.od-conflict-sheet--tonal {
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

      &.od-conflict-sheet--wide {
        width: 100%;
        height: 50px;
        margin-top: 16px;
        border-radius: 12px;
        font-size: 17px;
      }
    }

    .od-conflict-sheet--later {
      width: 100%;
      height: 44px;
      margin-top: 4px;
      border: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-size: 17px;
    }

    .od-conflict-sheet--sheet.od-conflict-sheet--large {
      max-height: none;
      height: 100%;
      box-sizing: border-box;
    }

    .od-conflict-sheet--sheet {
      max-height: 85vh;
      overflow-y: auto;
      padding: 8px 16px calc(16px + var(--f7-safe-area-bottom, 0px));
      background: var(--od-background);
      display: flex;
      flex-direction: column;
    }
  }
</style>
