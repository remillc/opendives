<script>
  // @ts-check
  // "Exporter au format…" of the logbook's selection
  // (docs/mockups/carnet-export-android.dc.html; spec, section 4, "Logbook
  // selection and export"): an MD3 modal bottom sheet with the formats as a
  // radio list (64 dp rows with a description), the "Anonymiser" switch (off
  // by default) and Annuler / Exporter. The last format is remembered on the
  // device.
  import { Sheet } from 'framework7-svelte';
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
  <div class="sheet" role="dialog" aria-labelledby="od-export-title">
    <div class="handle" aria-hidden="true"></div>
    <h2 id="od-export-title" class="title">{t('export.title', { n: count })}</h2>
    <p class="text">{t('export.text')}</p>
    <div class="formats" role="radiogroup" aria-labelledby="od-export-title">
      {#each FORMATS as f (f)}
        <label class="format">
          <input type="radio" name="od-export-format" value={f} bind:group={format} />
          <span class="texts">
            <span class="headline">{t(`export.formats.${f}`)}</span>
            <span class="supporting">{t(`export.formatTexts.${f}`)}</span>
          </span>
        </label>
      {/each}
    </div>
    <label class="switch-row">
      <span class="texts">
        <span class="headline">{t('export.anonymize')}</span>
        <span class="supporting">{t('export.anonymizeText')}</span>
      </span>
      <span class="toggle">
        <input type="checkbox" bind:checked={anonymize} />
        <span class="toggle-icon"></span>
      </span>
    </label>
    <div class="actions">
      <button type="button" class="text-button" onclick={() => (opened = false)}>{t('dialog.cancel')}</button>
      <button type="button" class="filled" onclick={submit}>{t('export.action')}</button>
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

    .sheet {
      max-height: 85vh;
      overflow-y: auto;
      padding: 8px 0 calc(16px + var(--f7-safe-area-bottom, 0px));
    }

    .handle {
      width: 32px;
      height: 4px;
      margin: 8px auto 12px;
      border-radius: 2px;
      background: var(--od-text-2);
      opacity: 0.4;
    }

    .title {
      margin: 0 24px 4px;
      font-size: 22px;
      line-height: 28px;
      font-weight: 400;
      color: var(--od-text);
    }

    .text {
      margin: 0 24px 8px;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .format,
    .switch-row {
      min-height: 64px;
      padding: 8px 24px 8px 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      color: var(--od-text);
    }

    .format input {
      flex: none;
      width: 20px;
      height: 20px;
      margin: 0 2px;
      accent-color: var(--od-primary-action);
    }

    .texts {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .headline {
      font-size: 16px;
      line-height: 24px;
    }

    .supporting {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .switch-row {
      padding-left: 24px;
      border-top: 1px solid var(--od-row-divider);
      margin-top: 4px;
    }

    .toggle {
      flex: none;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 24px 0;
    }

    .actions button {
      width: auto;
      min-height: 40px;
      padding: 0 20px;
      border-radius: 20px;
      border: none;
      font: inherit;
      font-size: 14px;
      font-weight: 600;
    }

    .text-button {
      background: none;
      color: var(--od-text);
    }

    .filled {
      background: var(--od-primary-action);
      color: var(--od-on-primary-action);
    }
  }
</style>
