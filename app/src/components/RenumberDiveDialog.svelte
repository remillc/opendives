<script>
  // @ts-check
  // "Renuméroter la plongée" (dive detail ⋮ menu; spec, section 4, "Dive
  // detail"): one dive takes a number, the dives in between shift by one so
  // that numbers stay unique and without gaps; said under the field as the
  // number is typed, and the main button then reads "Renuméroter et décaler"
  // (no second dialog). One undoable step, as Subsurface's RenumberDives.
  // Dive numbers are shown without thousands separators.
  import { showSnackbar } from '../lib/snackbar.js';
  import Md3Dialog from './Md3Dialog.svelte';
  import TextField from './TextField.svelte';
  import { renumberDivesTo, renumberShiftPlan } from '../lib/logbook.svelte.js';
  import { offerUndo } from '../lib/undo.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ id: number, number: number, oncancel: () => void, ondone: () => void }} */
  let { id, number, oncancel, ondone } = $props();

  // svelte-ignore state_referenced_locally
  let text = $state(number > 0 ? String(number) : '');
  let busy = $state(false);

  const wanted = $derived(/^\d{1,6}$/.test(text.trim()) ? Number(text.trim()) : 0);
  const plan = $derived(wanted >= 1 ? renumberShiftPlan(id, wanted) : null);
  const unchanged = $derived(!!plan && plan.number === number && !plan.shifted);
  const supporting = $derived.by(() => {
    if (!plan) return text.trim() ? t('renumberDive.invalid') : '';
    const s = plan.shifted;
    if (!s) return plan.number !== wanted ? t('renumberDive.last', { n: String(plan.number) }) : '';
    return s.from === s.to
      ? t('renumberDive.shiftOne', { n: String(s.from), by: String(Math.abs(s.by)) })
      : t('renumberDive.shiftMany', { from: String(s.from), to: String(s.to), by: String(Math.abs(s.by)) });
  });

  async function confirm() {
    if (busy || !plan) return;
    if (unchanged) {
      oncancel();
      return;
    }
    busy = true;
    try {
      await renumberDivesTo(plan.ids, plan.numbers);
      ondone();
      offerUndo(t('renumberDive.done', { n: String(plan.number) }));
    } catch (e) {
      console.error('Renumber a dive', e);
      ondone();
      const code = String(/** @type {any} */ (e)?.message ?? '');
      showSnackbar(code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('renumber.failed'));
    }
  }
</script>

<Md3Dialog title={t('renumberDive.title')} {oncancel}>
  <div class="field">
    <TextField label={t('renumberDive.number')} bind:value={text} inputmode="numeric" invalid={!!text.trim() && !plan} {supporting} />
  </div>
  {#snippet actions()}
    <button type="button" onclick={oncancel}>{t('dialog.cancel')}</button>
    <button type="button" onclick={confirm} disabled={!plan}>{plan?.shifted ? t('renumberDive.actionShift') : t('renumberDive.action')}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer od.components {
    .field {
      --od-field-margin: 24px;
    }
  }
</style>
