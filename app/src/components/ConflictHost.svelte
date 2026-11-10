<script>
  // @ts-check
  // The sync conflict dialog, mounted once in App.svelte (like the sync
  // failure sheet) so that it shows over any screen and can be reopened from
  // the side menu on any section. "Plus tard" only closes it: the diver is
  // where they were. The choice is applied on the phone first; nothing is sent
  // while the snackbar can still take it back.
  import { f7 } from 'framework7-svelte';
  import ConflictSheet from './ConflictSheet.svelte';
  import { logbook, resolveConflict, sendConflictChoice, cancelConflictChoice, postponeConflict } from '../lib/logbook.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @param {Record<string, 'device'|'cloud'>} choices */
  async function chooseConflict(choices) {
    await resolveConflict(choices);
    const kept = new Set(Object.values(choices));
    let undone = false;
    f7.toast
      .create({
        text: kept.size > 1 ? t('conflict.keptMixed') : t(kept.has('cloud') ? 'conflict.keptCloud' : 'conflict.keptDevice'),
        cssClass: 'od-undo-toast',
        closeButton: true,
        closeButtonText: t('edit.undo'),
        closeTimeout: 8000,
        position: 'bottom',
        on: {
          closeButtonClick: () => {
            undone = true;
            cancelConflictChoice().catch((e) => {
              console.error('Taking back the conflict choice', e);
              f7.toast.show({ text: t('conflict.failed'), closeTimeout: 4000 });
            });
          },
          closed: () => {
            if (!undone) sendConflictChoice();
          },
        },
      })
      .open();
  }
</script>

<ConflictSheet conflict={logbook.conflictLater ? null : logbook.conflict} onchoose={chooseConflict} onlater={postponeConflict} />
