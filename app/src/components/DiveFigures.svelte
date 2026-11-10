<script>
  // @ts-check
  // The key figures of a dive: depth, time, water temperature. A figure
  // without a value is left out.
  import { formatDepth, formatDuration, formatTemperature } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ dive: import('opendives-core').DiveDetail, prefs: import('opendives-core').Prefs }} */
  let { dive, prefs } = $props();

  const figures = $derived.by(() => {
    const water = formatTemperature(dive.waterTempMk, prefs);
    return [
      dive.maxDepthMm ? { value: formatDepth(dive.maxDepthMm, prefs), label: t('detail.figureMaxDepth') } : null,
      { value: formatDuration(dive.durationSeconds), label: t('detail.figureDuration') },
      // Subsurface keeps the lowest water temperature of the dive.
      water ? { value: water, label: t('detail.figureWaterMin') } : null,
    ].filter((f) => f !== null);
  });
</script>

<div class="od-dive-figures od-value">
  {#each figures as figure (figure.label)}
    <span class="od-dive-figures--figure"><span class="od-dive-figures--value">{figure.value}</span><span class="od-dive-figures--label">{figure.label}</span></span>
  {/each}
</div>

<style>
  @layer od.components {
    .od-dive-figures {
      padding: 14px 20px 0;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .od-dive-figures--figure {
      display: flex;
      flex-direction: column;
    }

    /* Large key figures: the system font, as the titles (spec, "Fonts"). */
    .od-dive-figures--value {
      font-family: var(--od-title-font);
      font-size: 28px;
      line-height: normal;
      font-weight: 800;
      color: var(--od-text);
    }

    .od-dive-figures--label {
      font-size: 13px;
      color: var(--od-text-2);
    }
  }
</style>
