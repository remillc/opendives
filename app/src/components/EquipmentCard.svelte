<script>
  // @ts-check
  // The "Equipment" section of the dive detail (docs/mockups/detail3-android.dc.html):
  // one card, collapsed by default, with the suit (only when set) and the total
  // weight in bold and a chevron on the right. A tap anywhere opens it and shows
  // the weights by location, as the section did before. Role button with
  // aria-expanded.
  import Icon from './Icon.svelte';
  import ButtonGroup from './ButtonGroup.svelte';
  import { FEEDBACK_CHOICES } from '../lib/weight-feedback.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   label: string,
   *   suit: string,
   *   weightTotal: string,
   *   weights: { place: string, weight: string }[],
   *   computer?: string,
   *   computers?: { name: string, main: boolean }[],
   *   open: boolean,
   *   opens?: boolean,
   *   ontoggle: () => void,
   *   feedback?: string,
   *   onfeedback?: (value: string) => void,
   * }}
   * label: the accessible name, "Equipment: dry suit, weights 35 lb. Show details";
   * weightTotal: empty when no weight is set; weights: one entry per location.
   * computer: the main computer's name (a third row); computers: all of them, listed when open;
   * opens: false when opening would show nothing more (one weight, no
   * location): a plain card, no chevron.
   * Open, the order is: suit, weight total, weights by location, "Ce lest était"
   * (feedback: 'too-light', 'ok', 'too-heavy' or '', when a weight is set and
   * onfeedback is given), then the computer. Closed, the computer row is the third row.
   */
  let { label, suit, weightTotal, weights, computer = '', computers = [], open, opens = true, ontoggle, feedback = '', onfeedback } = $props();

  const spread = $derived(opens && open);
  /** The computer row stays in the summary when closed, or when it is the only row. */
  const computerInSummary = $derived(!spread || (!suit && !weightTotal));
  const feedbackOptions = $derived(FEEDBACK_CHOICES.map((value) => ({ value, label: t(`weightFeedback.${value === 'too-light' ? 'tooLight' : value === 'ok' ? 'ok' : 'tooHeavy'}`) })));
</script>

<div class="od-equipment-card">
  <svelte:element
    this={opens ? 'button' : 'div'}
    type={opens ? 'button' : undefined}
    class="od-equipment-card--summary"
    class:od-equipment-card--static={!opens}
    role={opens ? undefined : 'group'}
    aria-expanded={opens ? open : undefined}
    aria-label={label}
    onclick={opens ? ontoggle : undefined}
  >
    <span class="od-equipment-card--rows">
      {#if suit}
        <span class="od-equipment-card--row"><span class="od-equipment-card--name">{t('detail.suitRow')}</span><span class="od-equipment-card--value">{suit}</span></span>
      {/if}
      {#if weightTotal}
        <span class="od-equipment-card--row"><span class="od-equipment-card--name">{t('detail.weights')}</span><span class="od-equipment-card--value od-equipment-card--strong od-value">{weightTotal}</span></span>
      {/if}
      {#if computer && computerInSummary}
        <span class="od-equipment-card--row"><span class="od-equipment-card--name">{t('detail.computerRow')}</span><span class="od-equipment-card--value">{computer}</span></span>
      {/if}
    </span>
    {#if opens}<span class="od-equipment-card--chevron" class:od-equipment-card--open={open}><Icon name="expand" size={24} weight={2} /></span>{/if}
  </svelte:element>
  {#if spread && weights.length}
    <ul class="od-equipment-card--weights" aria-label={t('detail.weightsByPlace')}>
      {#each weights as weight, i (i)}
        <li class="od-value"><span>{weight.place || t('detail.weights')}</span><span>{weight.weight}</span></li>
      {/each}
    </ul>
  {/if}
  {#if spread && weightTotal && onfeedback}
    <div class="od-equipment-card--feedback">
      <p class="od-equipment-card--feedback-title" id="od-weight-feedback-title">{t('weightFeedback.title')}</p>
      <ButtonGroup options={feedbackOptions} value={feedback} onchange={(v) => onfeedback(v)} ariaLabelledby="od-weight-feedback-title" clearable marked />
    </div>
  {/if}
  {#if spread && computer && !computerInSummary}
    <div class="od-equipment-card--computer">
      <span class="od-equipment-card--row"><span class="od-equipment-card--name">{t('detail.computerRow')}</span><span class="od-equipment-card--value">{computer}</span></span>
    </div>
  {/if}
  {#if spread && computers.length > 1}
    <ul class="od-equipment-card--weights" aria-label={t('detail.computers')}>
      {#each computers as c, i (i)}
        <li><span>{c.name}</span>{#if c.main}<span>{t('detail.mainBadge')}</span>{/if}</li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  @layer od.components {
    .od-equipment-card {
      border-radius: 16px;
      background: var(--od-surface);
      color: var(--od-text);
      overflow: hidden;
    }

    .od-equipment-card--summary {
      width: 100%;
      box-sizing: border-box;
      padding: 4px 8px 4px 16px;
      border: none;
      background: none;
      color: inherit;
      font: inherit;
      text-align: start;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;

      &.od-equipment-card--static {
        padding-inline-end: 16px;
        cursor: default;
      }
    }

    .od-equipment-card--rows {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .od-equipment-card--row {
      min-height: 48px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 16px;

      & + & {
        border-top: 1px solid var(--od-separator);
      }
    }

    .od-equipment-card--name {
      flex: 1;
    }

    .od-equipment-card--value {
      color: var(--od-text-2);
      font-variant-numeric: tabular-nums;
      text-align: end;

      &.od-equipment-card--strong {
        font-weight: 600;
        color: var(--od-text);
      }
    }

    .od-equipment-card--chevron {
      flex: none;
      display: flex;

      &.od-equipment-card--open {
        transform: rotate(180deg);
      }
    }

    /* "Ce lest était": its title, then the three buttons. */
    .od-equipment-card--feedback {
      padding: 12px 16px 16px;
      border-top: 1px solid var(--od-separator);
    }

    .od-equipment-card--feedback-title {
      margin: 0 0 8px;
      font-size: 14px;
      color: var(--od-text-2);
    }

    .od-equipment-card--computer {
      padding: 0 16px;
      border-top: 1px solid var(--od-separator);
    }

    /* The weights by location: one line each, as the section showed them. */
    .od-equipment-card--weights {
      margin: 0;
      padding: 12px 16px 14px;
      list-style: none;
      border-top: 1px solid var(--od-separator);
      display: flex;
      flex-direction: column;
      gap: 4px;

      li {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 14px;
        line-height: 20px;
        color: var(--od-text-2);
      }
    }
  }
</style>
