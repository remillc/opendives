<script>
  // @ts-check
  // "Delete cylinder N?" (docs/mockups/android-edition-gaz-supprimer.dc.html): an
  // alert dialog with the cylinder in a white card (its small drawing, the gas in
  // 20 sp bold, under it the type and size). When the dive's gas changes use the
  // cylinder, one sentence says how many moments disappear from the profile.
  // When the core refuses (the profile uses the cylinder, CYLINDER_IN_USE) the
  // dialog says so and offers nothing destructive.
  import Md3Dialog from './Md3Dialog.svelte';
  import CylinderIcon from './CylinderIcon.svelte';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   n: number,
   *   gas: string,
   *   line: string,
   *   ratio: number,
   *   outcome: 'refused'|'moments'|'plain',
   *   moments: number,
   *   oncancel: () => void,
   *   onconfirm: () => void,
   * }}
   */
  let { n, gas, line, ratio, outcome, moments, oncancel, onconfirm } = $props();
</script>

<Md3Dialog title={t('edit.deleteCylinderTitle', { n })} role="alertdialog" class="od-cylinder-delete" {oncancel}>
  <div class="od-cylinder-delete--content">
    <div class="od-cylinder-delete--card">
      <CylinderIcon />
      <span class="od-cylinder-delete--texts">
        <span class="od-cylinder-delete--gas od-value">{gas}</span>
        {#if line}<span class="od-cylinder-delete--line od-value">{line}</span>{/if}
      </span>
    </div>
    {#if outcome === 'refused'}
      <p class="od-cylinder-delete--text">{t('edit.deleteCylinderRefused')}</p>
    {:else if outcome === 'moments'}
      <p class="od-cylinder-delete--text">{t('edit.deleteCylinderMoments', { n: moments })}</p>
    {/if}
  </div>
  {#snippet actions()}
    {#if outcome === 'refused'}
      <button type="button" onclick={oncancel}>{t('dialog.ok')}</button>
    {:else}
      <button type="button" onclick={oncancel}>{t('dialog.cancel')}</button>
      <button type="button" class="od-cylinder-delete--confirm" onclick={onconfirm}>{t('edit.deleteCylinderConfirm')}</button>
    {/if}
  {/snippet}
</Md3Dialog>

<style>
  @layer od.components {
    .od-cylinder-delete--content {
      padding: 0 24px;
    }

    .od-cylinder-delete--card {
      padding: 12px 16px;
      border-radius: 16px;
      background: var(--od-surface);
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .od-cylinder-delete--texts {
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .od-cylinder-delete--gas {
      font-size: 20px;
      line-height: 28px;
      font-weight: 700;
    }

    .od-cylinder-delete--line {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .od-cylinder-delete--text {
      margin: 16px 0 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    :global(.od-cylinder-delete .od-md3-dialog--actions .od-cylinder-delete--confirm) {
      color: var(--od-alarm);
    }
  }
</style>
