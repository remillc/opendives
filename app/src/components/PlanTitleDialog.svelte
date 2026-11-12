<script>
  // @ts-check
  // "Enregistrer le plan" (task 37; mock-up android-planificateur-titre): the
  // MD3 basic dialog asking for the title of a new plan, one filled field
  // focused with the keyboard open, no helper text. An empty title is allowed.
  import Md3Dialog from './Md3Dialog.svelte';
  import TextField from './TextField.svelte';
  import { t } from '../lib/i18n.js';

  /** @type {{ title: string, oncancel: () => void, onsave: (title: string) => void }} */
  let { title, oncancel, onsave } = $props();

  // svelte-ignore state_referenced_locally
  let text = $state(title);
  /** @type {HTMLElement|undefined} */
  let field = $state();

  // After the dialog has taken the focus itself (Md3Dialog), the field takes it.
  $effect(() => {
    const timer = setTimeout(() => {
      const input = field?.querySelector('input');
      input?.focus();
      input?.select();
    }, 0);
    return () => clearTimeout(timer);
  });

  /** @param {KeyboardEvent} e */
  function keydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onsave(text);
    }
  }
</script>

<Md3Dialog class="od-plan-title-dialog" title={t('plan.titleDialog')} {oncancel}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="od-plan-title-dialog--field" bind:this={field} onkeydown={keydown}>
    <TextField label={t('plan.titleLabel')} bind:value={text} />
  </div>
  {#snippet actions()}
    <button type="button" onclick={oncancel}>{t('dialog.cancel')}</button>
    <button type="button" onclick={() => onsave(text)}>{t('plan.save')}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer od.components {
    .od-plan-title-dialog--field {
      --od-field-margin: 24px;
    }
  }
</style>
