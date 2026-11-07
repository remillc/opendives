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

<h2 class="title">{title}</h2>
<div class="results" role="list" aria-live="polite">
  {#each rows as row, i (i)}
    <div class="result" role="listitem">
      <span class="texts">
        <span class="name">{row.title}</span>
        <span class="sub" class:alarm={row.alarm}>{row.sub}</span>
      </span>
      <span class="value od-value">{row.value}</span>
    </div>
  {/each}
</div>

<style>
  @layer od.components {
    .title {
      margin: 0;
      padding: 20px 20px 8px;
      font-size: 18px;
      line-height: 24px;
      font-weight: 700;
    }

    .results {
      margin: 0 16px;
      border-radius: 20px;
      background: var(--od-surface);
      overflow: hidden;
    }

    .result {
      display: flex;
      align-items: center;
      gap: 16px;
      min-height: 72px;
      padding: 8px 20px 8px 16px;
      box-sizing: border-box;
    }

    .texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .name {
      font-size: 16px;
      line-height: 24px;
    }

    .sub {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);

      &.alarm {
        color: var(--od-alarm);
      }
    }

    .value {
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
