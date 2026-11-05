<script>
  // @ts-check
  // Tab label that shows its full form when it fits, its short form otherwise
  // ("Statistiques", "Stats"). Screen readers always hear the full form.
  import { onMount } from 'svelte';

  /** @type {{ full: string, short: string }} */
  let { full, short } = $props();

  /** @type {HTMLSpanElement|undefined} */
  let label = $state();
  /** @type {HTMLSpanElement|undefined} */
  let measure = $state();
  let shortened = $state(false);

  function fit() {
    if (!label || !measure) return;
    shortened = measure.offsetWidth > label.clientWidth;
  }

  onMount(() => {
    // The tab width changes on rotation; the text width with the system text size.
    const observer = new ResizeObserver(fit);
    if (label) observer.observe(label);
    if (measure) observer.observe(measure);
    fit();
    return () => observer.disconnect();
  });
</script>

<span class="tabbar-label label" class:shortened bind:this={label}>
  <span class="full">{full}</span>
  <span class="short" aria-hidden="true">{short}</span>
  <span class="measure" aria-hidden="true" bind:this={measure}>{full}</span>
</span>

<style>
  @layer od.components {
    .label {
      position: relative;
      display: block;
      width: 100%;
      overflow: hidden;
      white-space: nowrap;
      text-align: center;

      &.shortened .full {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
      }

      &:not(.shortened) .short {
        display: none;
      }
    }

    .measure {
      position: absolute;
      left: 0;
      top: 0;
      visibility: hidden;
      white-space: nowrap;
    }
  }
</style>
