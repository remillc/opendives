<script>
  // @ts-check
  // The three key figures of a set of dives (spec, section 1, "Statistics"):
  // dives, time under water, deepest. Computed by the core; "—" while pending.
  // With `href`, the whole card opens the filtered result.
  import { formatDepth, formatHours, formatNumber } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   figures: import('../lib/statistics.svelte.js').StatsFigures|null,
   *   prefs: import('opendives-core').Prefs,
   *   href?: string,
   *   onclick?: (e: MouseEvent) => void,
   * }}
   * `onclick`: handles the link itself (the router does not follow it).
   */
  let { figures, prefs, href = undefined, onclick = undefined } = $props();

  const items = $derived([
    { label: t('stats.figureDives'), value: figures ? formatNumber(figures.dives) : null },
    { label: t('stats.figureTime'), value: figures ? formatHours(figures.totalSeconds) : null },
    { label: t('stats.figureDeepest'), value: figures?.maxDepthMm ? formatDepth(figures.maxDepthMm, prefs) : null },
  ]);
</script>

{#snippet content()}
  {#each items as item (item.label)}
    <span class="figure">
      <span class="label">{item.label}</span>
      {#if item.value}
        <span class="value od-value">{item.value}</span>
      {:else}
        <span class="value" aria-hidden="true">—</span><span class="od-sr-only">{t('stats.pendingValue')}</span>
      {/if}
    </span>
  {/each}
{/snippet}

{#if href}
  <a {href} class={['figures', onclick && 'external']} {onclick}>{@render content()}</a>
{:else}
  <div class="figures">{@render content()}</div>
{/if}

<style>
  @layer od.components {
    .figures {
      margin: 8px 16px 0;
      padding: 16px;
      border-radius: 12px;
      background: var(--od-surface);
      color: var(--od-text);
      text-decoration: none;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;

      :global(.ios) & {
        margin-top: 12px;
        padding: 14px 16px;
        border-radius: 10px;
        gap: 10px;
      }
    }

    .figure {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .label {
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);

      :global(.ios) & {
        font-size: 13px;
        line-height: 18px;
      }
    }

    /* Highlighted value (spec, section 2): 24 px on Android, 22 px semibold on iOS. */
    .value {
      font-size: 24px;
      line-height: 32px;
      overflow-wrap: anywhere;

      :global(.ios) & {
        font-size: 22px;
        line-height: 28px;
        font-weight: 600;
      }
    }
  }
</style>
