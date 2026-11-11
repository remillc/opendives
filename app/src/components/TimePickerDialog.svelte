<script>
  // @ts-check
  // Material 3 time picker with a clock dial (Android; docs/system-design.md,
  // section 8, "Date and time fields"): hour and minute boxes, AM/PM in the
  // 12-hour format only, a 256 dp dial (tap or drag: hour, then minutes in
  // steps of 1) and a keyboard icon that switches to two typed fields.
  // Confirms with { hour (0..23), minute }.
  import Md3Dialog from './Md3Dialog.svelte';
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';
  import { locale } from '../lib/format.js';
  import { settings } from '../lib/settings.svelte.js';
  import { dialValue, isInnerHour, localeUses12Hour, parseHour, parseMinute, pointAngle, to12Hour, to24Hour, valueAngle } from '../lib/date-time-picker.js';

  /**
   * @type {{
   *   hour: number, minute: number,
   *   onconfirm: (time: { hour: number, minute: number }) => void,
   *   oncancel: () => void,
   * }}
   */
  let { hour, minute, onconfirm, oncancel } = $props();

  const twelve = settings.timeFormat === '12' || (settings.timeFormat === 'system' && localeUses12Hour(locale));
  const two = (/** @type {number} */ n) => String(n).padStart(2, '0');

  // svelte-ignore state_referenced_locally
  let h24 = $state(hour);
  // svelte-ignore state_referenced_locally
  let min = $state(minute);
  let unit = $state(/** @type {'hour'|'minute'} */ ('hour'));
  let mode = $state(/** @type {'dial'|'input'} */ ('dial'));
  // svelte-ignore state_referenced_locally
  let hourText = $state(twelve ? String(to12Hour(hour).hour) : two(hour));
  // svelte-ignore state_referenced_locally
  let minuteText = $state(two(minute));
  let touched = $state(false);
  let dragging = false;

  const pm = $derived(h24 >= 12);
  const shownHour = $derived(twelve ? to12Hour(h24).hour : h24);
  const hourInvalid = $derived(mode === 'input' && parseHour(hourText, twelve) === null);
  const minuteInvalid = $derived(mode === 'input' && parseMinute(minuteText) === null);

  const C = 128; // dial centre, in dial units (1 unit = 1 dp)
  const OUTER = 101;
  const INNER = 66;
  const INNER_LIMIT = 83.5;

  /** @param {number} angle @param {number} radius */
  const at = (angle, radius) => ({ x: C + radius * Math.sin((angle * Math.PI) / 180), y: C - radius * Math.cos((angle * Math.PI) / 180) });

  /** Numbers drawn on the dial: { text, value, ring }. */
  const labels = $derived.by(() => {
    if (unit === 'minute') return Array.from({ length: 12 }, (_, i) => ({ text: two(i * 5), value: i * 5, ...at(i * 30, OUTER) }));
    const outer = Array.from({ length: 12 }, (_, i) => {
      const n = i === 0 ? 12 : i;
      return { text: String(n), value: n, ...at(i * 30, OUTER) };
    });
    if (twelve) return outer;
    const inner = Array.from({ length: 12 }, (_, i) => ({ text: i === 0 ? '00' : String(i + 12), value: i === 0 ? 0 : i + 12, ...at(i * 30, INNER) }));
    return [...outer, ...inner];
  });

  const handleAngle = $derived(unit === 'minute' ? valueAngle('minute', min) : valueAngle('hour', h24));
  const handleRadius = $derived(unit === 'hour' && !twelve && isInnerHour(h24) ? INNER : OUTER);
  const handle = $derived(at(handleAngle, handleRadius));
  const offFive = $derived(unit === 'minute' && min % 5 !== 0);

  /** @param {{value:number}} label */
  function isLabelSelected(label) {
    if (unit === 'minute') return label.value === min;
    return twelve ? label.value === shownHour : label.value === h24;
  }

  /** @param {PointerEvent} e */
  function pointerValue(e) {
    const svg = /** @type {SVGSVGElement} */ (e.currentTarget);
    const rect = svg.getBoundingClientRect();
    const scale = 256 / rect.width;
    const dx = (e.clientX - rect.left) * scale - C;
    const dy = (e.clientY - rect.top) * scale - C;
    const angle = pointAngle(dx, dy);
    if (unit === 'minute') {
      min = dialValue('minute', angle);
      minuteText = two(min);
    } else if (twelve) {
      h24 = to24Hour(dialValue('hour', angle), pm);
      hourText = String(shownHour);
    } else {
      h24 = dialValue('hour', angle, { twentyFour: true, inner: Math.hypot(dx, dy) < INNER_LIMIT });
      hourText = two(h24);
    }
  }

  /** @param {PointerEvent} e */
  function down(e) {
    dragging = true;
    /** @type {Element} */ (e.currentTarget).setPointerCapture?.(e.pointerId);
    pointerValue(e);
  }

  /** @param {PointerEvent} e */
  function move(e) {
    if (dragging) pointerValue(e);
  }

  /** @param {PointerEvent} e */
  function up(e) {
    if (!dragging) return;
    dragging = false;
    pointerValue(e);
    if (unit === 'hour') unit = 'minute';
  }

  /** @param {boolean} next */
  function setPm(next) {
    if (next === pm) return;
    h24 = (h24 + 12) % 24;
  }

  /** Spinbutton keys on a box. @param {'hour'|'minute'} which @param {KeyboardEvent} e */
  function boxKey(which, e) {
    const dir = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      unit = which;
      return;
    }
    if (!dir) return;
    e.preventDefault();
    unit = which;
    if (which === 'minute') {
      min = (min + dir + 60) % 60;
      minuteText = two(min);
    } else if (twelve) {
      const next = ((shownHour - 1 + dir + 12) % 12) + 1;
      h24 = to24Hour(next, pm);
      hourText = String(next);
    } else {
      h24 = (h24 + dir + 24) % 24;
      hourText = two(h24);
    }
  }

  function toggleMode() {
    if (mode === 'dial') {
      hourText = twelve ? String(shownHour) : two(h24);
      minuteText = two(min);
      touched = false;
      mode = 'input';
    } else mode = 'dial';
  }

  /** @param {Event} e */
  function typedHour(e) {
    hourText = /** @type {HTMLInputElement} */ (e.target).value;
    touched = true;
    const n = parseHour(hourText, twelve);
    if (n !== null) h24 = twelve ? to24Hour(n, pm) : n;
  }

  /** @param {Event} e */
  function typedMinute(e) {
    minuteText = /** @type {HTMLInputElement} */ (e.target).value;
    touched = true;
    const n = parseMinute(minuteText);
    if (n !== null) min = n;
  }

  function confirm() {
    if (hourInvalid || minuteInvalid) return;
    onconfirm({ hour: h24, minute: min });
  }
</script>

<Md3Dialog class="od-time-picker" title={mode === 'input' ? t('timePicker.titleInput') : t('timePicker.title')} {oncancel}>
  <div class="od-time-picker--boxes">
    <div class="od-time-picker--box-wrap">
      {#if mode === 'input'}
        <input
          class="od-time-picker--box od-time-picker--box-input"
          class:od-time-picker--selected={unit === 'hour'}
          class:od-time-picker--invalid={hourInvalid && touched}
          type="text"
          inputmode="numeric"
          maxlength="2"
          autocomplete="off"
          aria-label={t('timePicker.hour')}
          aria-invalid={hourInvalid && touched}
          value={hourText}
          onfocus={() => (unit = 'hour')}
          oninput={typedHour}
          onkeydown={(e) => e.key === 'Enter' && confirm()}
        />
        <span class="od-time-picker--box-label">{t('timePicker.hour')}</span>
      {:else}
        <div
          class="od-time-picker--box"
          class:od-time-picker--selected={unit === 'hour'}
          role="spinbutton"
          tabindex="0"
          aria-label={t('timePicker.hour')}
          aria-valuemin={twelve ? 1 : 0}
          aria-valuemax={twelve ? 12 : 23}
          aria-valuenow={shownHour}
          aria-valuetext={two(shownHour)}
          onclick={() => (unit = 'hour')}
          onkeydown={(e) => boxKey('hour', e)}
        >
          {two(shownHour)}
        </div>
      {/if}
    </div>
    <span class="od-time-picker--colon" aria-hidden="true">:</span>
    <div class="od-time-picker--box-wrap">
      {#if mode === 'input'}
        <input
          class="od-time-picker--box od-time-picker--box-input"
          class:od-time-picker--selected={unit === 'minute'}
          class:od-time-picker--invalid={minuteInvalid && touched}
          type="text"
          inputmode="numeric"
          maxlength="2"
          autocomplete="off"
          aria-label={t('timePicker.minute')}
          aria-invalid={minuteInvalid && touched}
          value={minuteText}
          onfocus={() => (unit = 'minute')}
          oninput={typedMinute}
          onkeydown={(e) => e.key === 'Enter' && confirm()}
        />
        <span class="od-time-picker--box-label">{t('timePicker.minute')}</span>
      {:else}
        <div
          class="od-time-picker--box"
          class:od-time-picker--selected={unit === 'minute'}
          role="spinbutton"
          tabindex="0"
          aria-label={t('timePicker.minute')}
          aria-valuemin="0"
          aria-valuemax="59"
          aria-valuenow={min}
          aria-valuetext={two(min)}
          onclick={() => (unit = 'minute')}
          onkeydown={(e) => boxKey('minute', e)}
        >
          {two(min)}
        </div>
      {/if}
    </div>
    {#if twelve}
      <div class="od-time-picker--period" role="radiogroup" aria-label={t('timePicker.period')}>
        <button type="button" role="radio" aria-checked={!pm} class="od-time-picker--period-button" class:od-time-picker--on={!pm} onclick={() => setPm(false)}>{t('timePicker.am')}</button>
        <button type="button" role="radio" aria-checked={pm} class="od-time-picker--period-button" class:od-time-picker--on={pm} onclick={() => setPm(true)}>{t('timePicker.pm')}</button>
      </div>
    {/if}
  </div>
  {#if hourInvalid || minuteInvalid}
    {#if touched}<p class="od-time-picker--error" role="alert">{t('timePicker.invalid')}</p>{/if}
  {/if}
  {#if mode === 'dial'}
    <div class="od-time-picker--dial-area">
      <!-- The dial is a pointer shortcut: the boxes above are the accessible way to set the time. -->
      <svg
        class="od-time-picker--dial"
        viewBox="0 0 256 256"
        width="256"
        height="256"
        aria-hidden="true"
        onpointerdown={down}
        onpointermove={move}
        onpointerup={up}
        onpointercancel={() => (dragging = false)}
      >
        <circle class="od-time-picker--face" cx={C} cy={C} r="128" />
        <line class="od-time-picker--hand" x1={C} y1={C} x2={handle.x} y2={handle.y} />
        <circle class="od-time-picker--hub" cx={C} cy={C} r="4" />
        <circle class="od-time-picker--handle" cx={handle.x} cy={handle.y} r="24" />
        {#if offFive}<circle class="od-time-picker--dot" cx={handle.x} cy={handle.y} r="4" />{/if}
        {#each labels as label (label.text + label.x)}
          <text
            class="od-time-picker--number"
            class:od-time-picker--number-selected={isLabelSelected(label)}
            class:od-time-picker--number-small={unit === 'hour' && !twelve && label.x !== undefined && Math.hypot(label.x - C, label.y - C) < 80}
            x={label.x}
            y={label.y}
            text-anchor="middle"
            dominant-baseline="central">{label.text}</text
          >
        {/each}
      </svg>
    </div>
  {/if}
  {#snippet actions()}
    <button type="button" class="od-md3-dialog--start od-time-picker--mode" onclick={toggleMode} aria-label={mode === 'input' ? t('timePicker.toDial') : t('timePicker.toInput')}>
      <Icon name={mode === 'input' ? 'clock' : 'keyboard'} />
    </button>
    <button type="button" onclick={oncancel}>{t('dialog.cancel')}</button>
    <button type="button" onclick={confirm} disabled={hourInvalid || minuteInvalid}>{t('dialog.ok')}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer od.components {
    :global(.od-time-picker .od-md3-dialog--surface) {
      width: min(328px, calc(100% - 32px));
      padding-top: 16px;
    }

    :global(.od-time-picker .od-md3-dialog--surface h2) {
      margin: 0 24px 20px 24px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 500;
      letter-spacing: 0.1px;
      color: var(--od-text-2);
    }

    .od-time-picker--boxes {
      display: flex;
      align-items: flex-start;
      justify-content: center;
      gap: 0;
      padding: 0 24px;
    }

    .od-time-picker--box-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .od-time-picker--box {
      box-sizing: border-box;
      width: 96px;
      height: 80px;
      border: 2px solid transparent;
      border-radius: 8px;
      background: var(--od-surface-container-highest);
      color: var(--od-text);
      font: inherit;
      font-size: 56px;
      line-height: 76px;
      text-align: center;
      cursor: pointer;
      outline: none;
      padding: 0;
    }

    .od-time-picker--box.od-time-picker--selected {
      background: var(--od-primary-container);
      border-color: var(--od-primary);
    }

    .od-time-picker--box:focus-visible {
      outline: 2px solid var(--od-primary);
      outline-offset: 2px;
    }

    .od-time-picker--box-input {
      height: 72px;
      font-size: 48px;
      line-height: 68px;
    }

    .od-time-picker--box-input.od-time-picker--invalid {
      border-color: var(--od-error);
    }

    .od-time-picker--box-label {
      margin-top: 4px;
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);
    }

    .od-time-picker--colon {
      width: 24px;
      height: 80px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 56px;
      color: var(--od-text);
    }

    .od-time-picker--period {
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      width: 52px;
      height: 80px;
      margin-left: 12px;
      border: 1px solid var(--od-outline);
      border-radius: 8px;
      overflow: hidden;
    }

    .od-time-picker--period-button {
      flex: 1;
      border: none;
      padding: 0;
      background: none;
      color: var(--od-text-2);
      font: inherit;
      font-size: 16px;
      cursor: pointer;
    }

    .od-time-picker--period-button + .od-time-picker--period-button {
      border-top: 1px solid var(--od-outline);
    }

    .od-time-picker--period-button.od-time-picker--on {
      background: var(--od-primary-container);
      box-shadow: inset 0 0 0 2px var(--od-primary);
      color: var(--od-text);
      font-weight: 600;
    }

    .od-time-picker--period-button:focus-visible {
      outline: 2px solid var(--od-primary);
      outline-offset: -2px;
    }

    .od-time-picker--error {
      margin: 8px 24px 0;
      font-size: 12px;
      color: var(--od-error);
      text-align: center;
    }

    .od-time-picker--dial-area {
      display: flex;
      justify-content: center;
      padding: 36px 0 8px;
    }

    .od-time-picker--dial {
      touch-action: none;
      user-select: none;
      cursor: pointer;
    }

    .od-time-picker--face {
      fill: var(--od-surface-container-highest);
    }

    .od-time-picker--hand {
      stroke: var(--od-primary);
      stroke-width: 2;
    }

    .od-time-picker--hub,
    .od-time-picker--handle {
      fill: var(--od-primary);
    }

    .od-time-picker--dot {
      fill: var(--od-on-primary);
    }

    .od-time-picker--number {
      fill: var(--od-text);
      font-size: 16px;
      pointer-events: none;
    }

    .od-time-picker--number-small {
      font-size: 14px;
    }

    .od-time-picker--number-selected {
      fill: var(--od-on-primary);
    }

    :global(.od-time-picker .od-md3-dialog--actions .od-time-picker--mode) {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      padding: 0;
      color: var(--od-text-2);
    }
  }
</style>
