<script>
  // @ts-check
  // The "Gas" section of the dive detail (docs/mockups/detail3-android.dc.html):
  // a read-only white card with one drawn cylinder per cylinder, side by side;
  // under each the gas, the use and size, and the pressure from start to end.
  // A closed-circuit dive passes `rebreather` (which item is the diluent, the
  // oxygen, and which stand beside the unit): the unit is drawn instead of the
  // row, and the text columns follow it (task 2026-11-12-78).
  // Under the cylinders, one line for the gas changes, and the SAC when the core
  // computes one. Nothing to tap.
  import CylinderDrawing from './CylinderDrawing.svelte';
  import RebreatherDrawing from './RebreatherDrawing.svelte';

  /**
   * @type {{
   *   label: string,
   *   items: { gas: string, line: string, range: string, ratio: number, startRatio: number|null, hatched?: boolean, noPressure?: boolean }[],
   *   changes?: string,
   *   sac?: { label: string, value: string }|null,
   *   rebreather?: { diluent: number, oxygen: number, others: number[], marks: { diluent: string, oxygen: string, bailout: string } }|null,
   * }}
   * label: the accessible name of the group; range: "2 683 → 1 885 psi", empty when unknown;
   * hatched: start and end pressures not both known (the drawing is hatched); noPressure: none at all.
   */
  let { label, items, changes = '', sac = null, rebreather = null } = $props();

  /** In a rebreather view: diluent, oxygen, then the others, each present one a text column. */
  const columns = $derived(rebreather ? [rebreather.diluent, ...(rebreather.oxygen === rebreather.diluent ? [] : [rebreather.oxygen]), ...rebreather.others].filter((i) => i >= 0) : []);
</script>

<div class="od-gas-card" role="group" aria-label={label}>
  {#if rebreather}
    <RebreatherDrawing
      diluent={rebreather.diluent >= 0 ? items[rebreather.diluent] : null}
      oxygen={rebreather.oxygen >= 0 ? items[rebreather.oxygen] : null}
      others={rebreather.others.map((i) => items[i])}
      marks={rebreather.marks}
    />
    <div class="od-gas-card--columns" style:grid-template-columns="repeat({columns.length}, 1fr)">
      {#each columns as i (i)}
        <div class="od-gas-card--cylinder">
          <span class="od-gas-card--gas">{items[i].gas}</span>
          {#if items[i].line}<span class="od-gas-card--line">{items[i].line}</span>{/if}
          {#if items[i].range}<span class="od-gas-card--line od-value">{items[i].range}</span>{/if}
        </div>
      {/each}
    </div>
  {:else}
    <div class="od-gas-card--cylinders">
      {#each items as item, i (i)}
        <div class="od-gas-card--cylinder">
          <CylinderDrawing ratio={item.ratio} startRatio={item.startRatio} hatched={item.hatched} />
          <span class="od-gas-card--gas">{item.gas}</span>
          {#if item.line}<span class="od-gas-card--line">{item.line}</span>{/if}
          {#if item.range}<span class="od-gas-card--line od-value">{item.range}</span>{/if}
        </div>
      {/each}
    </div>
  {/if}
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

    .od-gas-card--columns {
      display: grid;
      column-gap: 4px;
      margin-top: 8px;
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
