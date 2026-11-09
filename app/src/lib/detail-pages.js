// @ts-check
// On a tablet, replacing the detail pane (reloadDetail) moves the new page next
// to the old one. Svelte then removes the old page's anchors but not its
// element, which would stay in the document under the new page, still alive
// for the router.
import { f7, f7ready } from 'framework7-svelte';

export function enableDetailPageCleanup() {
  f7ready(() => {
    f7.on('pageBeforeRemove', (page) => {
      const el = page.el;
      if (!el?.classList.contains('page-master-detail')) return;
      // After Svelte's own removal, which runs in a later microtask.
      setTimeout(() => el.remove(), 0);
    });
  });
}
