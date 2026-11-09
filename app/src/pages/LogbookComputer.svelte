<script>
  // @ts-check
  // "Modifier l'ordinateur" (reglages-ordinateur-modifier-android.dc.html and
  // reglages-ordinateur-fusion-android.dc.html; spec, "Settings, logbook dive
  // computers"). Only the name can be changed here; a computer's data stays.
  import { onMount } from 'svelte';
  import { Page, Navbar, Link, f7 } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from '../components/Icon.svelte';
  import TextField from '../components/TextField.svelte';
  import ChoiceDialog from '../components/ChoiceDialog.svelte';
  import { computerName, computerChange, duplicatesOf, mergeTargets, sameRecordings } from '../lib/dive-computers.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { offerUndo } from '../lib/undo.js';
  import { formatNumber } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /** @typedef {import('opendives-core').LogbookComputer} LogbookComputer */

  /** @type {{ f7route: { query: { model?: string, serial?: string } }, f7router: any }} */
  let { f7route, f7router } = $props();

  // svelte-ignore state_referenced_locally
  const model = f7route.query?.model ?? '';
  // svelte-ignore state_referenced_locally
  const serial = f7route.query?.serial ?? '';

  /** @type {LogbookComputer[]} */
  let all = $state([]);
  const computer = $derived(all.find((c) => c.model === model && c.serial === serial) ?? null);
  const candidates = $derived(computer ? mergeTargets(computer, all) : []);
  /** This entry is the one to keep: the duplicates are merged from their own sheet. */
  const duplicates = $derived(computer ? duplicatesOf(computer, all) : []);
  let name = $state('');
  let busy = $state(false);
  let choosing = $state(false);

  onMount(async () => {
    try {
      all = await OpenDivesCore.diveComputers();
      name = computer?.nickname || model;
    } catch (e) {
      console.error('Logbook computer', e);
    }
  });

  /** @param {Parameters<typeof computerChange>[0]} options @param {string} text */
  async function change(options, text) {
    if (busy) return;
    busy = true;
    try {
      await computerChange(options);
      f7router.back();
      offerUndo(text);
    } catch (e) {
      const code = String(/** @type {any} */ (e)?.message ?? '');
      console.error('Logbook computer', code);
      f7.toast.show({ text: code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('edit.failed'), closeTimeout: 4000 });
    } finally {
      busy = false;
    }
  }

  function save() {
    if (!computer) return;
    const typed = name.trim();
    const nickname = typed === computer.model ? '' : typed;
    if (!serial || nickname === computer.nickname) {
      f7router.back();
      return;
    }
    change({ action: 'rename', model, serial, value: nickname }, t('edit.saved'));
  }

  /** @param {LogbookComputer} c */
  const describe = (c) => (c.serial ? `${c.model}, ${t('settings.logbookComputers.serialShort', { serial: c.serial })}` : c.model);

  /** @param {LogbookComputer} other */
  function confirmMerge(other) {
    if (!computer) return;
    const target = computerName(other);
    const common = sameRecordings(computer, other);
    const text = [
      t('settings.logbookComputers.mergeText', { n: computer.dives, name: computerName(computer), target, details: describe(other) }),
      common ? t('settings.logbookComputers.mergeCommon', { n: common }) : '',
    ]
      .filter(Boolean)
      .join(' ');
    confirmAction({
      title: t('settings.logbookComputers.mergeTitle', { name: target }),
      text,
      action: t('settings.logbookComputers.mergeAction'),
      onConfirm: () =>
        change({ action: 'merge', model, serial, intoModel: other.model, intoSerial: other.serial }, t('settings.logbookComputers.merged', { name: target })),
    });
  }
</script>

<Page>
  <Navbar title={t('settings.logbookComputers.editTitle')}>
    {#snippet left()}
      <Link back iconOnly><Icon name="close" /><span class="od-sr-only">{t('dialog.cancel')}</span></Link>
    {/snippet}
    {#snippet right()}
      <Link onClick={save} class={busy ? 'disabled' : ''}>{t('edit.save')}</Link>
    {/snippet}
  </Navbar>

  {#if computer}
    <!-- Subsurface keeps a nickname by serial number: without one there is nothing to attach it to. -->
    <TextField
      label={t('settings.logbookComputers.name')}
      bind:value={name}
      disabled={!serial}
      supporting={serial ? t('settings.logbookComputers.nameHelp') : t('settings.logbookComputers.nameNoSerial')}
    />

    <div class="facts" role="list">
      <div class="fact" role="listitem"><span>{t('settings.logbookComputers.model')}</span><span class="value od-value">{computer.model}</span></div>
      <div class="fact" role="listitem"><span>{t('settings.logbookComputers.serial')}</span><span class="value od-value">{computer.serial || t('settings.logbookComputers.unknown')}</span></div>
      <div class="fact" role="listitem"><span>{t('settings.logbookComputers.firmware')}</span><span class="value od-value">{computer.firmware || t('settings.logbookComputers.unknown')}</span></div>
      <div class="fact" role="listitem"><span>{t('settings.logbookComputers.divesLabel')}</span><span class="value od-value">{formatNumber(computer.dives, 0)}</span></div>
    </div>

    {#if candidates.length}
      <p class="about">
        {candidates.length === 1
          ? t('settings.logbookComputers.possible', { name: computerName(candidates[0]), details: describe(candidates[0]) })
          : t('settings.logbookComputers.possibleMany', { n: candidates.length })}
      </p>
      <div class="action">
        <button type="button" class="filled" disabled={busy} onclick={() => (candidates.length === 1 ? confirmMerge(candidates[0]) : (choosing = true))}>
          {candidates.length === 1 ? t('settings.logbookComputers.mergeWith', { name: computerName(candidates[0]) }) : t('settings.logbookComputers.mergeWithMany')}
        </button>
        <p>
          {candidates.length === 1
            ? t('settings.logbookComputers.mergeHelp', { n: computer.dives, name: computerName(candidates[0]) })
            : t('settings.logbookComputers.mergeHelpMany', { n: computer.dives })}
        </p>
      </div>
    {/if}
    {#if !candidates.length && duplicates.length}
      <p class="about">
        {t('settings.logbookComputers.hasDuplicateText')}
        {#each duplicates as other, i (`${other.model}\n${other.serial}`)}{i ? ', ' : ' '}<a href="/settings/computers/edit?model={encodeURIComponent(other.model)}&serial={encodeURIComponent(other.serial)}">{computerName(other)}</a>{/each}
      </p>
    {/if}
    {#if computer.listed}
      <div class="action">
        <button type="button" class="od-outlined-button" disabled={busy} onclick={() => change({ action: 'remove', model, serial }, t('settings.logbookComputers.removed'))}>
          {t('settings.logbookComputers.remove')}
        </button>
        <p>{t('settings.logbookComputers.removeHelp')}</p>
      </div>
    {/if}
  {/if}
</Page>

{#if choosing}
  <ChoiceDialog
    title={t('settings.logbookComputers.mergeWithMany')}
    options={candidates.map((c, i) => ({ value: String(i), label: computerName(c), example: c.serial }))}
    value="0"
    onselect={(v) => {
      choosing = false;
      confirmMerge(candidates[Number(v)]);
    }}
    oncancel={() => (choosing = false)}
  />
{/if}

<style>
  @layer od.components {
    .facts {
      margin: 20px 16px 0;
      padding: 4px 0;
      border-radius: 20px;
      background: var(--od-surface);
    }

    .fact {
      min-height: 48px;
      padding: 6px 16px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-size: 16px;
      color: var(--od-text);

      .value {
        color: var(--od-text-2);
        text-align: right;
        overflow-wrap: anywhere;
      }
    }

    .about {
      --f7-theme-color: var(--od-text);
      margin: 16px 20px 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);

      a {
        font-weight: 600;
      }
    }

    .action {
      margin: 16px 16px 0;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;

      p {
        margin: 0;
        font-size: 12px;
        line-height: 16px;
        color: var(--od-text-2);
      }
    }

    .filled {
      width: auto;
      height: 40px;
      padding: 0 24px;
      border: none;
      border-radius: 20px;
      background: var(--od-primary-action);
      color: var(--od-on-primary-action);
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.1px;
      white-space: nowrap;
    }
  }
</style>
