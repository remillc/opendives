<script>
  // @ts-check
  // The sync state inside the Carnet's header band (spec, "Carnet sync status
  // pill"): never plain text on the band, whose contrast is too low. A button
  // with a chevron when it opens something.
  import Icon from './Icon.svelte';

  /**
   * @type {{
   *   icon: import('svelte').ComponentProps<typeof Icon>['name'],
   *   text: string,
   *   onclick?: () => void,
   * }}
   */
  let { icon, text, onclick } = $props();
</script>

{#snippet content()}
  <Icon name={icon} size={18} weight={2} />
  <span class="text">{text}</span>
{/snippet}

{#if onclick}
  <button type="button" class="pill" aria-haspopup="dialog" {onclick}>
    {@render content()}
    <Icon name="chevron" size={18} weight={2} />
  </button>
{:else}
  <p class="pill" role="status">{@render content()}</p>
{/if}

<style>
  @layer od.components {
    .pill {
      position: relative;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-height: 40px;
      margin: 12px 0 0;
      padding: 8px 12px;
      border: none;
      border-radius: 20px;
      background: var(--od-band-control);
      color: var(--od-band-pending);
      font: inherit;
      font-size: 14px;
      line-height: 20px;
      letter-spacing: 0.25px;
      text-align: left;
    }

    button.pill {
      cursor: pointer;
    }

    .text {
      flex: 1;
      min-width: 0;
    }
  }
</style>
