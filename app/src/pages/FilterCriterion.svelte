<script>
  // @ts-check
  // One criterion of the free filter: the values found in the logbook (any of
  // them matches), a fixed choice, a range in the diver's units, stars ("at
  // least") or a text. Changes go to the filter being edited at once; Back
  // returns to the Filter screen.
  import { Page, Navbar, List, ListItem, theme } from 'framework7-svelte';
  import TextField from '../components/TextField.svelte';
  import StarsInput from '../components/StarsInput.svelte';
  import Icon from '../components/Icon.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { filter, kindOf, choices, unitOf, validBound } from '../lib/filter.svelte.js';
  import { formatLongDate } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /** @typedef {import('../lib/filter.svelte.js').Criteria} Criteria */

  /** @type {{ f7route: { params: { key: string } } }} */
  let { f7route } = $props();
  const key = /** @type {keyof Criteria} */ (f7route.params.key);
  const kind = kindOf(key);

  /** Values offered for a list: those present in the logbook. */
  const values = $derived.by(() => {
    if (kind === 'choice') {
      const list = /** @type {Record<string, string[]>} */ (choices)[key] ?? [];
      return list.map((v) => ({
        value: v,
        text: key === 'weekdays' ? t(`filter.weekdays.${v}`) : t(`filter.plannedValues.${v}`),
      }));
    }
    if (key === 'trips') {
      /** @type {Map<string, string>} */
      const trips = new Map();
      for (const d of [...logbook.dives].sort((a, b) => b.date.localeCompare(a.date))) {
        if (d.trip && !trips.has(String(d.trip.id)))
          trips.set(String(d.trip.id), d.trip.location || t('trip.startingOn', { date: formatLongDate(d.date) }));
      }
      return [...trips].map(([value, text]) => ({ value, text }));
    }
    const o = /** @type {Record<string, any>} */ (filter.options ?? {});
    /** @type {string[]} */
    const list = o[key] ?? [];
    return list.map((v) => ({ value: v, text: v }));
  });

  const selected = $derived(kind === 'list' || kind === 'choice' ? /** @type {string[]} */ (filter.draft[key]) : []);

  /** @param {string} value */
  function toggle(value) {
    const list = /** @type {string[]} */ (filter.draft[key]);
    /** @type {any} */ (filter.draft)[key] = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  const range = $derived(kind === 'range' ? /** @type {import('../lib/filter.svelte.js').Range} */ (filter.draft[key]) : null);
  const unit = $derived(unitOf(key, logbook.prefs));
  /** @param {string} which */
  const fieldLabel = (which) => (unit ? t(`filter.${which}Unit`, { unit }) : t(`filter.${which}`));
  const rangeHint = $derived(key === 'date' ? t('filter.dateHint') : key === 'timeOfDay' ? t('filter.timeHint') : '');

  function clear() {
    /** @type {any} */ (filter.draft)[key] = [];
  }

  // A text criterion: the field writes into the filter being edited.
  let text = $state(kind === 'text' ? /** @type {string} */ (filter.draft[key]) : '');
  $effect(() => {
    if (kind === 'text') /** @type {any} */ (filter.draft)[key] = text;
  });
</script>

<Page class="od-filter-criterion">
  <Navbar title={t(`filter.criteria.${key}`)} backLink={t('filter.title')} backLinkShowText={theme.ios} />

  {#if kind === 'list' || kind === 'choice'}
    {#if values.length}
      <List inset={theme.ios} strong={theme.ios} dividers={theme.ios} class="values">
        {#each [{ value: '', text: t('filter.any') }, ...values] as v (v.value)}
          {@const checked = v.value ? selected.includes(v.value) : selected.length === 0}
          {#if theme.ios}
            <!-- iOS: a check mark on the chosen rows (Human Interface Guidelines). -->
            <li>
              <button
                type="button"
                class="item-content value-row"
                role="checkbox"
                aria-checked={checked}
                onclick={() => (v.value ? toggle(v.value) : clear())}
              >
                <span class="item-inner">
                  <span class="item-title">{v.text}</span>
                  {#if checked}<span class="check"><Icon name="check" size={20} weight={2.2} /></span>{/if}
                </span>
              </button>
            </li>
          {:else}
            <ListItem checkbox {checked} title={v.text} onChange={() => (v.value ? toggle(v.value) : clear())} />
          {/if}
        {/each}
      </List>
      {#if kind === 'list'}<p class="hint">{t('filter.listHint')}</p>{/if}
    {:else}
      <p class="hint">{t('filter.noValues')}</p>
    {/if}
  {:else if kind === 'range' && range}
    <div class="od-form-surface">
      <TextField
        label={fieldLabel('from')}
        bind:value={range.min}
        inputmode={key === 'date' || key === 'timeOfDay' ? 'text' : 'decimal'}
        invalid={!validBound(key, range.min, logbook.prefs)}
        supporting={!validBound(key, range.min, logbook.prefs) ? t('filter.invalid') : rangeHint}
      />
      <TextField
        label={fieldLabel('to')}
        bind:value={range.max}
        inputmode={key === 'date' || key === 'timeOfDay' ? 'text' : 'decimal'}
        invalid={!validBound(key, range.max, logbook.prefs)}
        supporting={!validBound(key, range.max, logbook.prefs) ? t('filter.invalid') : rangeHint}
      />
    </div>
    <p class="hint">{t(key === 'cylinderSize' ? 'filter.cylinderSizeHint' : 'filter.rangeHint')}</p>
  {:else if kind === 'stars'}
    <div class="od-form-surface stars">
      <p class="stars-label">{t('filter.atLeast')}</p>
      <StarsInput
        value={Number(filter.draft[key])}
        label={t(`filter.criteria.${key}`)}
        onchange={(n) => ((/** @type {any} */ (filter.draft))[key] = n)}
      />
    </div>
    <p class="hint">{t('filter.starsHint')}</p>
  {:else}
    <div class="od-form-surface">
      <TextField
        label={t(`filter.criteria.${key}`)}
        bind:value={text}
        supporting={t(key === 'fulltext' ? 'filter.fulltextHint' : 'filter.notesHint')}
      />
    </div>
  {/if}
</Page>

<style>
  @layer od.components {
    .hint {
      margin: 8px 16px;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);

      :global(.ios) & {
        margin-inline: 32px;
      }
    }

    .value-row {
      width: 100%;
      border: none;
      background: none;
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
    }

    .check {
      color: var(--od-action);
    }

    .stars {
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .stars-label {
      margin: 0;
      flex: 1;
    }
  }
</style>
