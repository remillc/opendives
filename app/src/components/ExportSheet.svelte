<script>
  // @ts-check
  // "Exporter au format…" of the logbook's selection
  // (docs/mockups/carnet-export-android.dc.html; spec, section 4, "Logbook
  // selection and export"): an MD3 modal bottom sheet with the formats as a
  // choice list (64 dp rows with a description, the chosen one tinted and checked), the "Anonymiser" switch (off
  // by default) and Annuler / Exporter. The last format is remembered on the
  // device.
  import { Sheet } from 'framework7-svelte';
  import ChoiceRow from './ChoiceRow.svelte';
  import { t } from '../lib/i18n.js';

  /** @typedef {'ssrf'|'uddf'|'csv'|'csvProfiles'|'pdf'} ExportFormat */

  /**
   * @type {{
   *   count: number,
   *   onexport: (format: ExportFormat, anonymize: boolean) => void,
   *   onclose: () => void,
   * }}
   */
  let { count, onexport, onclose } = $props();

  const KEY = 'od.exportFormat';
  /** @type {ExportFormat[]} */
  const FORMATS = ['ssrf', 'uddf', 'csv', 'csvProfiles', 'pdf'];
  const stored = /** @type {ExportFormat} */ (localStorage.getItem(KEY) ?? 'ssrf');
  let format = $state(FORMATS.includes(stored) ? stored : 'ssrf');
  let anonymize = $state(false);
  let opened = $state(true);

  function submit() {
    localStorage.setItem(KEY, format);
    opened = false;
    onexport(format, anonymize);
  }
</script>

<Sheet {opened} swipeToClose backdrop class="od-export-sheet" style="height: auto" onSheetClosed={onclose}>
  <div class="od-export-sheet--sheet" role="dialog" aria-labelledby="od-export-title">
    <div class="od-export-sheet--handle" aria-hidden="true"></div>
    <h2 id="od-export-title" class="od-export-sheet--title">{t('export.title', { n: count })}</h2>
    <p class="od-export-sheet--text">{t('export.text')}</p>
    <div class="od-export-sheet--formats" role="radiogroup" aria-labelledby="od-export-title">
      {#each FORMATS as f (f)}
        <ChoiceRow class="od-export-sheet--format" name="od-export-format" selected={format === f} onselect={() => (format = f)}>
          <span class="od-export-sheet--texts">
            <span class="od-export-sheet--headline">{t(`export.formats.${f}`)}</span>
            <span class="od-export-sheet--supporting">{t(`export.formatTexts.${f}`)}</span>
          </span>
        </ChoiceRow>
      {/each}
    </div>
    <label class="od-export-sheet--switch-row">
      <span class="od-export-sheet--texts">
        <span class="od-export-sheet--headline">{t('export.anonymize')}</span>
        <span class="od-export-sheet--supporting">{t('export.anonymizeText')}</span>
      </span>
      <span class="toggle">
        <input type="checkbox" bind:checked={anonymize} />
        <span class="toggle-icon"></span>
      </span>
    </label>
    <div class="od-export-sheet--actions">
      <button type="button" class="od-export-sheet--text-button" onclick={() => (opened = false)}>{t('dialog.cancel')}</button>
      <button type="button" class="od-export-sheet--filled" onclick={submit}>{t('export.action')}</button>
    </div>
  </div>
</Sheet>

<style>
  @layer od.components {
    :global(.od-export-sheet) {
      border-radius: 28px 28px 0 0;
      background: var(--od-dialog);
      overflow: hidden;
    }

    .od-export-sheet--sheet {
      max-height: 85vh;
      overflow-y: auto;
      padding: 8px 0 calc(16px + var(--f7-safe-area-bottom, 0px));
    }

    .od-export-sheet--handle {
      width: 32px;
      height: 4px;
      margin: 8px auto 12px;
      border-radius: 2px;
      background: var(--od-text-2);
      opacity: 0.4;
    }

    .od-export-sheet--title {
      margin: 0 24px 4px;
      font-size: 22px;
      line-height: 28px;
      font-weight: 400;
      color: var(--od-text);
    }

    .od-export-sheet--text {
      margin: 0 24px 8px;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    :global(.od-export-sheet--format) {
      min-height: 64px;
      padding: 8px 12px;
    }

    .od-export-sheet--formats {
      padding: 0 12px;
    }

    .od-export-sheet--switch-row {
      min-height: 64px;
      padding: 8px 24px 8px 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      color: var(--od-text);
    }

    .od-export-sheet--texts {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .od-export-sheet--headline {
      font-size: 16px;
      line-height: 24px;
    }

    .od-export-sheet--supporting {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .od-export-sheet--switch-row {
      padding-left: 24px;
      border-top: 1px solid var(--od-row-divider);
      margin-top: 4px;
    }

    .toggle {
      flex: none;
    }

    .od-export-sheet--actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 24px 0;
    }

    .od-export-sheet--actions button {
      width: auto;
      min-height: 40px;
      padding: 0 20px;
      border-radius: 20px;
      border: none;
      font: inherit;
      font-size: 14px;
      font-weight: 600;
    }

    .od-export-sheet--text-button {
      background: none;
      color: var(--od-text);
    }

    .od-export-sheet--filled {
      background: var(--od-primary-action);
      color: var(--od-on-primary-action);
    }
  }
</style>
