<script>
  // @ts-check
  // The "Gas" section of the dive detail (docs/mockups/detail3-android.dc.html):
  // a read-only white card with one drawn cylinder per cylinder, side by side;
  // under each the gas, the use and size, and the pressure from start to end.
  // Under the cylinders, one line for the gas changes, and the SAC when the core
  // computes one. Nothing to tap.
  import CylinderDrawing from './CylinderDrawing.svelte';

  /**
   * @type {{
   *   label: string,
   *   items: { gas: string, line: string, range: string, ratio: number, startRatio: number|null }[],
   *   changes?: string,
   *   sac?: { label: string, value: string }|null,
   * }}
   * label: the accessible name of the group; range: "2 683 → 1 885 psi", empty when unknown.
   */
  let { label, items, changes = '', sac = null } = $props();
</script>

<div class="od-gas-card" role="group" aria-label={label}>
  <div class="od-gas-card--cylinders">
    {#each items as item, i (i)}
      <div class="od-gas-card--cylinder">
        <CylinderDrawing ratio={item.ratio} startRatio={item.startRatio} />
        <span class="od-gas-card--gas">{item.gas}</span>
        {#if item.line}<span class="od-gas-card--line">{item.line}</span>{/if}
        {#if item.range}<span class="od-gas-card--line od-value">{item.range}</span>{/if}
      </div>
    {/each}
  </div>
  {#if changes}<p class="od-gas-card--changes">{changes}</p>{/if}
  {#if sac}
    <div class="od-gas-card--sac"><span>{sac.label}</span><span class="od-value">{sac.value}</span></div>
  {/if}
</div>

<style>
  @layer od.components {
    .od-gas-card {
      padding: 16px 8px 12px;
      border-radius: 16px;
      background: var(--od-surface);
      color: var(--od-text);
    }

    .od-gas-card--cylinders {
      display: flex;
      align-items: flex-start;
      gap: 4px;
    }

    .od-gas-card--cylinder {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      text-align: center;
    }

    .od-gas-card--gas {
      margin-top: 2px;
      font-size: 14px;
      font-weight: 600;
    }

    .od-gas-card--line {
      font-size: 12px;
      color: var(--od-text-2);
    }

    .od-gas-card--changes {
      margin: 12px 8px 0;
      font-size: 13px;
      color: var(--od-text-2);
    }

    .od-gas-card--sac {
      margin: 12px 8px 0;
      padding-top: 10px;
      border-top: 1px solid var(--od-separator);
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 14px;
      color: var(--od-text-2);
    }
  }
</style>
