<script>
  // @ts-check
  // Development aid: the address of the page on screen (path, query string
  // and hash of the current view's route), in a small badge at the bottom.
  // Shown only when VITE_SHOW_ROUTE=1 (app/.env.local, not in git), so a
  // published build never has it. Not interactive: taps go through.
  import { onDestroy, onMount } from 'svelte';
  import { f7 } from 'framework7-svelte';

  let url = $state('');
  /** @type {ReturnType<typeof setInterval>|undefined} */
  let timer;

  function read() {
    // The view on screen: an open popup's view, else the current tab's.
    const popupView = document.querySelector('.popup.modal-in .view');
    const router = /** @type {any} */ (popupView)?.f7View?.router ?? f7.views.current?.router;
    const route = router?.currentRoute;
    if (!route) return;
    const hash = route.hash ? `#${route.hash}` : '';
    url = `${route.url}${hash}`;
  }

  onMount(() => {
    read();
    timer = setInterval(read, 300);
  });
  onDestroy(() => clearInterval(timer));
</script>

{#if url}<div class="route" aria-hidden="true">{url}</div>{/if}

<style>
  @layer od.components {
    .route {
      position: fixed;
      left: 8px;
      bottom: calc(4px + env(safe-area-inset-bottom));
      z-index: 20000;
      max-width: calc(100% - 16px);
      padding: 2px 8px;
      border-radius: 6px;
      background: rgb(0 0 0 / 0.6);
      color: #fff;
      font: 12px/18px ui-monospace, monospace;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      pointer-events: none;
    }
  }
</style>
