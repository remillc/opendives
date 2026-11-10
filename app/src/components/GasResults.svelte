<script>
  // @ts-check
  // Results of a gas tool: a white surface with one row per result, the name
  // and a line of detail on the left, the value on the right (docs/mockups/
  // outils-ead-mod-android.dc.html).

  /**
   * @type {{
   *   title: string,
   *   rows: { title: string, sub: string, value: string, alarm?: boolean }[],
   * }}
   */
  let { title, rows } = $props();
</script>

<h2 class="od-gas-results od-gas-results--title">{title}</h2>
<div class="od-gas-results od-gas-results--results" role="list" aria-live="polite">
  {#each rows as row, i (i)}
    <div class="od-gas-results--result" role="listitem">
      <span class="od-gas-results--texts">
        <span class="od-gas-results--name">{row.title}</span>
        <span class="od-gas-results--sub" class:od-gas-results--alarm={row.alarm}>{row.sub}</span>
      </span>
      <span class="od-gas-results--value od-value">{row.value}</span>
    </div>
  {/each}
</div>

<style>
  @layer od.components {
    .od-gas-results--title {
      margin: 0;
      padding: 20px 20px 8px;
      font-size: 18px;
      line-height: 24px;
      font-weight: 700;
    }

    .od-gas-results--results {
      margin: 0 16px;
      border-radius: 20px;
      background: var(--od-surface);
      overflow: hidden;
    }

    .od-gas-results--result {
      display: flex;
      align-items: center;
      gap: 16px;
      min-height: 72px;
      padding: 8px 20px 8px 16px;
      box-sizing: border-box;
    }

    .od-gas-results--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .od-gas-results--name {
      font-size: 16px;
      line-height: 24px;
    }

    .od-gas-results--sub {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);

      &.od-gas-results--alarm {
        color: var(--od-alarm);
      }
    }

    .od-gas-results--value {
      flex: none;
      font-size: 24px;
      line-height: 32px;
      font-weight: 600;
      white-space: nowrap;

      :global(.ios) & {
        font-size: 22px;
      }
    }
  }
</style>
