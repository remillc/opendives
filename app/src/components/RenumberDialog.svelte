<script>
  // @ts-check
  // "Renumber dives" of Settings > Logbook: Subsurface's Renumber dialog for
  // all the dives (RenumberDialog, desktop-widgets/simplewidgets.cpp). The
  // dialog says what changes, asks for the first number, and renumbers all the
  // dives in date order as one undoable step; the "Undo" message follows.
  import { showSnackbar } from '../lib/snackbar.js';
  import Md3Dialog from './Md3Dialog.svelte';
  import TextField from './TextField.svelte';
  import { logbook, renumberDives } from '../lib/logbook.svelte.js';
  import { offerUndo } from '../lib/undo.js';
  import { t } from '../lib/i18n.js';

  /**
   * `ids`: only these dives (the Logbook's checked ones), in date order;
   * all the dives without it.
   * @type {{ oncancel: () => void, ondone: () => void, ids?: number[] }}
   */
  let { oncancel, ondone, ids = undefined } = $props();

  /** Checked dives start from the smallest number they have, as a suggestion (read once, on opening). */
  function suggestedStart() {
    const numbered = ids ? logbook.dives.filter((d) => ids.includes(d.id) && d.number > 0).map((d) => d.number) : [];
    return String(numbered.length ? Math.min(...numbered) : 1);
  }
  let start = $state(suggestedStart());
  let tried = $state(false);
  let busy = $state(false);

  const first = $derived(/^\d{1,6}$/.test(start.trim()) ? Number(start.trim()) : 0);

  async function confirm() {
    tried = true;
    if (busy || first < 1) return;
    busy = true;
    try {
      await renumberDives(ids ?? [], first);
      ondone();
      offerUndo(t('renumber.done'));
    } catch (e) {
      console.error('Renumber', e);
      ondone();
      const code = String(/** @type {any} */ (e)?.message ?? '');
      showSnackbar(code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('renumber.failed'));
    }
  }
</script>

<Md3Dialog
  title={t(ids ? 'renumber.titleChecked' : 'renumber.title')}
  text={t(ids ? 'renumber.dialogTextChecked' : 'renumber.dialogText', { count: ids ? ids.length : logbook.dives.length })}
  {oncancel}
>
  <div class="field">
    <TextField
      label={t('renumber.start')}
      bind:value={start}
      inputmode="numeric"
      invalid={tried && first < 1}
      supporting={tried && first < 1 ? t('renumber.invalid') : ''}
    />
  </div>
  {#snippet actions()}
    <button type="button" onclick={oncancel}>{t('dialog.cancel')}</button>
    <button type="button" onclick={confirm}>{t('renumber.action')}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer od.components {
    .field {
      --od-field-margin: 24px;
    }
  }
</style>
