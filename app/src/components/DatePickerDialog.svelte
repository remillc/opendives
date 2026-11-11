<script>
  // @ts-check
  // Material 3 modal date picker (Android; docs/system-design.md, section 8,
  // "Date and time fields"): a header with the selected date and a pencil that
  // switches to a typed date, then a calendar with a month and year row (the
  // year opens a grid of years), 40 dp day cells and Cancel / OK. Months are
  // 0-based. Confirms with { year, month, day }.
  import { tick } from 'svelte';
  import Md3Dialog from './Md3Dialog.svelte';
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';
  import { locale } from '../lib/format.js';
  import { addDays, addMonths, daysInMonth, formatDateInput, monthGrid, parseDateInput, weekStart, weekday, weekdayOrder } from '../lib/date-time-picker.js';

  /**
   * @type {{
   *   year: number, month: number, day: number,
   *   minYear?: number, maxYear?: number,
   *   onconfirm: (date: { year: number, month: number, day: number }) => void,
   *   oncancel: () => void,
   * }}
   */
  let { year, month, day, minYear = 1950, maxYear = new Date().getFullYear() + 1, onconfirm, oncancel } = $props();

  // svelte-ignore state_referenced_locally
  let selected = $state({ year: Math.min(Math.max(year, minYear), maxYear), month, day: Math.min(day, daysInMonth(Math.min(Math.max(year, minYear), maxYear), month)) });
  // svelte-ignore state_referenced_locally
  let view = $state({ year: selected.year, month: selected.month });
  // svelte-ignore state_referenced_locally
  let focused = $state({ ...selected });
  let mode = $state(/** @type {'calendar'|'input'} */ ('calendar'));
  let yearGrid = $state(false);
  // svelte-ignore state_referenced_locally
  let text = $state(formatDateInput(selected, locale));
  let touched = $state(false);

  const first = weekStart(locale);
  const rows = $derived(monthGrid(view.year, view.month, first));
  const dayFormat = new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const fullFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' });
  const monthFormat = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const narrow = new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' });
  const long = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
  // 2023-01-01 is a Sunday.
  const weekdays = weekdayOrder(first).map((w) => ({ initial: narrow.format(new Date(Date.UTC(2023, 0, 1 + w))), name: long.format(new Date(Date.UTC(2023, 0, 1 + w))) }));
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

  /** @param {number} y @param {number} m @param {number} d */
  const utc = (y, m, d) => new Date(Date.UTC(y, m, d));
  const headline = $derived(dayFormat.format(utc(selected.year, selected.month, selected.day)));
  const monthLabel = $derived(monthFormat.format(utc(view.year, view.month, 1)));
  const monthName = $derived(new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(utc(view.year, view.month, 1)));
  const canPrev = $derived(view.year * 12 + view.month > minYear * 12);
  const canNext = $derived(view.year * 12 + view.month < maxYear * 12 + 11);
  const parsed = $derived(parseDateInput(text, locale, minYear, maxYear));
  const invalid = $derived(mode === 'input' && !parsed);

  /** @param {number} delta */
  function shift(delta) {
    const next = addMonths(view.year, view.month, delta);
    if (next.year < minYear || next.year > maxYear) return;
    view = next;
    focused = { ...next, day: Math.min(focused.day, daysInMonth(next.year, next.month)) };
  }

  /** @param {number} d */
  function pick(d) {
    selected = { year: view.year, month: view.month, day: d };
    focused = { ...selected };
    text = formatDateInput(selected, locale);
  }

  /** @param {KeyboardEvent} e */
  async function keydown(e) {
    /** @type {Record<string, number>} */
    const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let next = null;
    if (e.key in steps) next = addDays(focused.year, focused.month, focused.day, steps[e.key]);
    else if (e.key === 'Home') next = addDays(focused.year, focused.month, focused.day, -((weekday(focused.year, focused.month, focused.day) - first + 7) % 7));
    else if (e.key === 'End') next = addDays(focused.year, focused.month, focused.day, 6 - ((weekday(focused.year, focused.month, focused.day) - first + 7) % 7));
    else if (e.key === 'PageUp' || e.key === 'PageDown') {
      const m = addMonths(focused.year, focused.month, e.key === 'PageUp' ? -1 : 1);
      next = { ...m, day: Math.min(focused.day, daysInMonth(m.year, m.month)) };
    }
    if (!next) return;
    e.preventDefault();
    if (next.year < minYear || next.year > maxYear) return;
    focused = next;
    view = { year: next.year, month: next.month };
    await tick();
    /** @type {HTMLElement|null} */ (document.querySelector(`.od-date-picker--day[data-day="${next.day}"]`))?.focus();
  }

  // Swipe left or right on the grid changes the month.
  let swipe = /** @type {{x:number,y:number}|null} */ (null);
  /** @param {PointerEvent} e */
  function swipeStart(e) {
    swipe = { x: e.clientX, y: e.clientY };
  }
  /** @param {PointerEvent} e */
  function swipeEnd(e) {
    if (!swipe) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 56 && Math.abs(dx) > 2 * Math.abs(dy)) shift(dx < 0 ? 1 : -1);
  }

  async function openYears() {
    yearGrid = !yearGrid;
    if (yearGrid) {
      await tick();
      /** @type {HTMLElement|null} */ (document.querySelector('.od-date-picker--year[aria-pressed="true"]'))?.scrollIntoView({ block: 'center' });
    }
  }

  /** @param {number} y */
  function chooseYear(y) {
    view = { year: y, month: view.month };
    focused = { year: y, month: view.month, day: Math.min(focused.day, daysInMonth(y, view.month)) };
    yearGrid = false;
  }

  function toggleMode() {
    if (mode === 'calendar') {
      text = formatDateInput(selected, locale);
      touched = false;
      mode = 'input';
    } else {
      if (parsed) {
        selected = parsed;
        focused = { ...parsed };
        view = { year: parsed.year, month: parsed.month };
      }
      mode = 'calendar';
    }
  }

  /** @param {Event} e */
  function typed(e) {
    text = /** @type {HTMLInputElement} */ (e.target).value;
    touched = true;
    if (parsed) selected = parsed;
  }

  function confirm() {
    if (mode === 'input') {
      if (!parsed) return;
      onconfirm(parsed);
    } else onconfirm({ ...selected });
  }

  const pattern = $derived(
    (() => {
      const letters = { d: t('datePicker.pattern.d'), m: t('datePicker.pattern.m'), y: t('datePicker.pattern.y') };
      return formatDateInput({ year: 3333, month: 10, day: 22 }, locale)
        .replace('22', letters.d)
        .replace('11', letters.m)
        .replace('3333', letters.y);
    })(),
  );
</script>

<Md3Dialog class="od-date-picker" title={mode === 'input' ? t('datePicker.titleInput') : t('datePicker.title')} {oncancel}>
  <div class="od-date-picker--header">
    <span class="od-date-picker--headline">{headline}</span>
    <button type="button" class="od-date-picker--mode" onclick={toggleMode} aria-label={mode === 'input' ? t('datePicker.toCalendar') : t('datePicker.toInput')}>
      <Icon name={mode === 'input' ? 'calendar' : 'edit'} />
    </button>
  </div>
  <div class="od-date-picker--divider"></div>
  {#if mode === 'input'}
    <div class="od-date-picker--input-area">
      <label class="od-date-picker--input-box" class:od-date-picker--invalid={invalid && touched}>
        <span class="od-date-picker--input-label">{t('datePicker.field')}</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input
          class="od-date-picker--input"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          value={text}
          placeholder={pattern}
          aria-invalid={invalid && touched}
          aria-describedby="od-date-picker-help"
          oninput={typed}
          onkeydown={(e) => e.key === 'Enter' && confirm()}
          autofocus
        />
      </label>
      <p id="od-date-picker-help" class="od-date-picker--help" class:od-date-picker--invalid={invalid && touched}>
        {invalid && touched ? t('datePicker.invalid') : pattern}
      </p>
    </div>
  {:else}
    <div class="od-date-picker--month-row">
      <button type="button" class="od-date-picker--month-button" aria-expanded={yearGrid} aria-label={`${monthLabel}, ${t('datePicker.chooseYear')}`} onclick={openYears}>
        <span>{monthLabel}</span>
        <span class="od-date-picker--drop" class:od-date-picker--open={yearGrid}><Icon name="chevron" size={18} /></span>
      </button>
      {#if !yearGrid}
        <span class="od-date-picker--arrows">
          <button type="button" class="od-date-picker--arrow od-date-picker--prev" aria-label={t('datePicker.previousMonth')} disabled={!canPrev} onclick={() => shift(-1)}><Icon name="chevron" /></button>
          <button type="button" class="od-date-picker--arrow" aria-label={t('datePicker.nextMonth')} disabled={!canNext} onclick={() => shift(1)}><Icon name="chevron" /></button>
        </span>
      {/if}
    </div>
    {#if yearGrid}
      <div class="od-date-picker--years" role="group" aria-label={t('datePicker.chooseYear')}>
        {#each years as y (y)}
          <button type="button" class="od-date-picker--year" aria-pressed={y === view.year} onclick={() => chooseYear(y)}>{y}</button>
        {/each}
      </div>
    {:else}
      <div class="od-date-picker--grid" role="grid" aria-label={monthLabel} onpointerdown={swipeStart} onpointerup={swipeEnd} onpointercancel={() => (swipe = null)} onkeydown={keydown} tabindex="-1">
        <div class="od-date-picker--row" role="row">
          {#each weekdays as w (w.name)}
            <span class="od-date-picker--weekday" role="columnheader" aria-label={w.name}>{w.initial}</span>
          {/each}
        </div>
        {#each rows as row, r (r)}
          <div class="od-date-picker--row" role="row">
            {#each row as d, c (c)}
              <span class="od-date-picker--cell" role="gridcell" aria-selected={d !== null && selected.year === view.year && selected.month === view.month && selected.day === d}>
                {#if d !== null}
                  {@const isSelected = selected.year === view.year && selected.month === view.month && selected.day === d}
                  <button
                    type="button"
                    class="od-date-picker--day"
                    class:od-date-picker--selected={isSelected}
                    class:od-date-picker--today={`${view.year}-${view.month}-${d}` === todayKey}
                    data-day={d}
                    tabindex={focused.year === view.year && focused.month === view.month && focused.day === d ? 0 : -1}
                    aria-label={fullFormat.format(utc(view.year, view.month, d))}
                    aria-pressed={isSelected}
                    aria-current={`${view.year}-${view.month}-${d}` === todayKey ? 'date' : undefined}
                    onclick={() => pick(d)}>{d}</button
                  >
                {/if}
              </span>
            {/each}
          </div>
        {/each}
      </div>
      <span class="od-date-picker--sr" aria-live="polite">{monthName} {view.year}</span>
    {/if}
  {/if}
  {#snippet actions()}
    <button type="button" onclick={oncancel}>{t('dialog.cancel')}</button>
    <button type="button" onclick={confirm} disabled={invalid}>{t('dialog.ok')}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer od.components {
    :global(.od-date-picker .od-md3-dialog--surface) {
      width: min(360px, calc(100% - 48px));
      padding-top: 16px;
    }

    /* The dialog title is the small "Select date" label of the header. */
    :global(.od-date-picker .od-md3-dialog--surface h2) {
      margin: 0 24px 36px 24px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 500;
      letter-spacing: 0.1px;
      color: var(--od-text-2);
    }

    .od-date-picker--header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin: -20px 12px 12px 24px;
      min-height: 40px;
    }

    .od-date-picker--headline {
      font-size: 28px;
      line-height: 36px;
      color: var(--od-text);
    }

    .od-date-picker--mode,
    .od-date-picker--arrow {
      width: 48px;
      height: 48px;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: none;
      color: var(--od-text-2);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .od-date-picker--arrow:disabled {
      opacity: 0.38;
    }

    .od-date-picker--prev :global(svg) {
      transform: scaleX(-1);
    }

    .od-date-picker--divider {
      height: 1px;
      background: var(--od-separator);
      margin-bottom: 4px;
    }

    .od-date-picker--month-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 12px 0 24px;
      min-height: 48px;
    }

    .od-date-picker--month-button {
      display: flex;
      align-items: center;
      gap: 4px;
      height: 40px;
      padding: 0 8px 0 0;
      border: none;
      background: none;
      color: var(--od-text-2);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      text-transform: capitalize;
      cursor: pointer;
    }

    .od-date-picker--drop {
      display: flex;
      transform: rotate(90deg);
    }

    .od-date-picker--open {
      transform: rotate(-90deg);
    }

    .od-date-picker--arrows {
      display: flex;
    }

    .od-date-picker--grid {
      padding: 0 12px;
      touch-action: pan-y;
      outline: none;
    }

    .od-date-picker--row {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
    }

    .od-date-picker--weekday {
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      color: var(--od-text);
      text-transform: uppercase;
    }

    .od-date-picker--cell {
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .od-date-picker--day {
      box-sizing: border-box;
      width: 40px;
      height: 40px;
      padding: 0;
      border: 1px solid transparent;
      border-radius: 50%;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-size: 14px;
      cursor: pointer;
    }

    .od-date-picker--today {
      border-color: var(--od-outline);
    }

    .od-date-picker--day.od-date-picker--selected {
      background: var(--od-primary);
      border-color: var(--od-primary);
      color: var(--od-on-primary);
    }

    .od-date-picker--day:focus-visible,
    .od-date-picker--year:focus-visible,
    .od-date-picker--mode:focus-visible,
    .od-date-picker--arrow:focus-visible,
    .od-date-picker--month-button:focus-visible {
      outline: 2px solid var(--od-primary);
      outline-offset: 2px;
    }

    .od-date-picker--years {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px 0;
      height: 288px;
      overflow-y: auto;
      padding: 8px 12px;
      justify-items: center;
    }

    .od-date-picker--year {
      box-sizing: border-box;
      width: 72px;
      height: 36px;
      border: none;
      border-radius: 18px;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-size: 16px;
      cursor: pointer;
    }

    .od-date-picker--year[aria-pressed='true'] {
      background: var(--od-primary);
      color: var(--od-on-primary);
    }

    .od-date-picker--input-area {
      padding: 24px 24px 8px;
    }

    .od-date-picker--input-box {
      position: relative;
      display: block;
      border: 1px solid var(--od-outline);
      border-radius: 4px;
      padding: 8px 16px 6px;
    }

    .od-date-picker--input-box:focus-within {
      border: 2px solid var(--od-primary);
      padding: 7px 15px 5px;
    }

    .od-date-picker--input-label {
      display: block;
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);
    }

    .od-date-picker--input {
      width: 100%;
      box-sizing: border-box;
      border: none;
      outline: none;
      background: none;
      padding: 0;
      height: 28px;
      font: inherit;
      font-size: 16px;
      color: var(--od-text);
    }

    .od-date-picker--help {
      margin: 4px 16px 0;
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);
    }

    .od-date-picker--input-box.od-date-picker--invalid {
      border-color: var(--od-error);
    }

    p.od-date-picker--invalid {
      color: var(--od-error);
    }

    .od-date-picker--sr {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  }
</style>
