<script>
  // @ts-check
  // Download from the dive computer (docs/mockups/ios-telechargement.dc.html;
  // spec, section 5, "Download": pairing the first time, then one gesture,
  // progress, failure explained). Android for now, over Bluetooth Low Energy
  // and Bluetooth Classic, as Subsurface-mobile on Android.
  //
  // 1. Bluetooth and its permission, asked here and only here.
  // 2. The computers: the remembered ones (Settings, dive computers) and the
  //    devices found by the scan whose name is a dive computer (all of them
  //    with "Show all Bluetooth devices"; their model is then chosen).
  // 3. The download (OpenDivesCore.downloadDives, Subsurface's own code):
  //    the computer, the progress and the dives received so far. Closing
  //    the screen cancels it.
  // 4. The new dives are one undoable step: back to the logbook with "3
  //    dives downloaded" and "Annuler". A failure opens "Download failed".
  import { onDestroy, onMount } from 'svelte';
  import { Page, Navbar, Link, theme, f7 } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from '../components/Icon.svelte';
  import ChoiceDialog from '../components/ChoiceDialog.svelte';
  import ProfileThumbnail from '../components/ProfileThumbnail.svelte';
  import { afterDownload, logbook } from '../lib/logbook.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { offerUndo } from '../lib/undo.js';
  import { errorCode } from '../lib/account.js';
  import { addressFor, lastAttempt, macOf } from '../lib/download.js';
  import { formatDateTime, formatDepth, formatDuration } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /** @typedef {import('../lib/download.js').Computer} Computer */
  /** @typedef {import('opendives-core').BluetoothDevice} BluetoothDevice */
  /** @typedef {import('opendives-core').ReceivedDive} ReceivedDive */

  /** @type {{ f7router: any, retry?: boolean }} */
  let { f7router, retry = false } = $props();
  // "Réessayer" of the failure screen: the last attempt again, at once.
  // svelte-ignore state_referenced_locally
  let retryPending = retry;

  /**
   * checking; none (no Bluetooth on this device); permission (to ask),
   * denied, off (Bluetooth off); choose (scan and list); downloading.
   * @type {'checking'|'none'|'permission'|'denied'|'off'|'choose'|'downloading'}
   */
  let phase = $state('checking');
  let scanning = $state(false);
  /** Found devices by MAC address. @type {Record<string, BluetoothDevice>} */
  let found = $state({});
  // svelte-ignore state_referenced_locally
  let forceDownload = $state(retryPending ? lastAttempt.forceDownload : false);
  /** @type {import('opendives-core').BluetoothVendor[]} */
  let models = $state([]);

  /** The download running. @type {Computer|null} */
  let computer = $state(null);
  let connected = $state(false);
  let fraction = $state(0);
  /** @type {ReceivedDive[]} */
  let received = $state([]);
  let leaving = false;

  /** Choice of the model of a device whose name says nothing. */
  let choosing = $state(/** @type {{ step: 'vendor'|'product', device: BluetoothDevice, vendor: string }|null} */ (null));

  /** @type {{ remove: () => Promise<void> }[]} */
  const listeners = [];

  /** The model's transports, from the core's list. @param {string} vendor @param {string} product */
  function transportsOf(vendor, product) {
    return models.find((m) => m.vendor === vendor)?.products.find((p) => p.name === product) ?? null;
  }

  const remembered = $derived(
    (logbook.prefs.diveComputers ?? [])
      .filter((dc) => dc.vendor && dc.product && dc.device)
      .map((dc) => ({ vendor: dc.vendor, product: dc.product, address: dc.device, name: dc.name })),
  );
  const rememberedMacs = $derived(new Set(remembered.map((c) => macOf(c.address))));
  const nearby = $derived(
    Object.values(found)
      .filter((d) => !rememberedMacs.has(d.mac))
      .filter((d) => d.computer || (settings.showAllBluetooth && d.name))
      .sort((a, b) => Number(!!b.computer) - Number(!!a.computer) || a.name.localeCompare(b.name)),
  );

  /** Bluetooth and its permission, then the scan. */
  async function check() {
    phase = 'checking';
    try {
      const status = await OpenDivesCore.bluetoothStatus();
      if (status.permission !== 'granted') {
        phase = status.permission === 'denied' ? 'denied' : 'permission';
        return;
      }
      if (status.bluetooth === 'none') phase = 'none';
      else if (status.bluetooth === 'off') phase = 'off';
      else {
        phase = 'choose';
        if (retryPending && lastAttempt.computer) {
          retryPending = false;
          download(lastAttempt.computer);
        } else {
          scan();
        }
      }
    } catch (e) {
      console.error('Bluetooth status', e);
      phase = 'none';
    }
  }

  async function askPermission() {
    try {
      const status = await OpenDivesCore.requestBluetoothPermission();
      if (status.permission === 'granted') check();
      else phase = 'denied';
    } catch (e) {
      console.error('Bluetooth permission', e);
      phase = 'denied';
    }
  }

  async function turnOn() {
    try {
      await OpenDivesCore.enableBluetooth();
    } catch (e) {
      console.error('Turning Bluetooth on', e);
    }
    check();
  }

  async function scan() {
    found = {};
    try {
      await OpenDivesCore.startBluetoothScan({ durationMs: 60000 });
      scanning = true;
    } catch (e) {
      const code = errorCode(e);
      console.error('Bluetooth scan', code);
      scanning = false;
      if (code === 'BLUETOOTH_OFF') phase = 'off';
      else if (code === 'PERMISSION') phase = 'permission';
      else if (code === 'NO_BLUETOOTH') phase = 'none';
    }
  }

  /** A found device: its model when the name tells it, else chosen by the diver. @param {BluetoothDevice} d */
  function pick(d) {
    if (d.computer) {
      const { vendor, product } = d.computer;
      download({ vendor, product, name: d.name, address: addressFor(d, transportsOf(vendor, product)) });
    } else {
      choosing = { step: 'vendor', device: d, vendor: '' };
    }
  }

  /** @param {Computer} c */
  async function download(c) {
    computer = c;
    lastAttempt.computer = c;
    lastAttempt.forceDownload = forceDownload;
    connected = false;
    fraction = 0;
    received = [];
    phase = 'downloading';
    scanning = false;
    console.info('Download from', c.vendor, c.product, c.address);
    try {
      const result = await OpenDivesCore.downloadDives({ ...c, forceDownload });
      await afterDownload(result);
      if (leaving) return;
      leaving = true;
      f7router.back();
      if (result.downloaded) offerUndo(t('download.done', { n: result.downloaded }));
      else toast(t('download.noneNew', { computer: result.product || c.product }));
    } catch (e) {
      const code = errorCode(e);
      console.error('Download', code, /** @type {any} */ (e)?.message);
      await afterDownload(null);
      if (leaving) return;
      if (code === 'CANCELLED') {
        leaving = true;
        f7router.back();
        toast(t('download.cancelled'));
      } else if (code === 'NOT_FOUND' || code === 'FAILED') {
        leaving = true;
        const reason = code === 'NOT_FOUND' ? 'notFound' : 'lost';
        f7router.navigate(`/download/failed/?computer=${encodeURIComponent(c.product)}&reason=${reason}`, {
          reloadCurrent: true,
        });
      } else if (code === 'BLUETOOTH_OFF' || code === 'PERMISSION') {
        check();
      } else {
        phase = 'choose';
        const key = code === 'WRITE_LOCKED' ? 'edit.writeLocked' : 'download.cannotAdd';
        f7.dialog.create({ title: t('download.title'), text: t(key), buttons: [{ text: t('dialog.ok') }] }).open();
        scan();
      }
    }
  }

  /** @param {string} text */
  function toast(text) {
    f7.toast.create({ text, closeTimeout: 4000, position: 'bottom' }).open();
  }

  function close() {
    if (phase === 'downloading') {
      // The core stops at its next step; the screen closes once it has.
      OpenDivesCore.cancelDownload().catch(() => {});
      return;
    }
    leaving = true;
    f7router.back();
  }

  onMount(async () => {
    listeners.push(
      await OpenDivesCore.addListener('bluetoothDevice', (/** @type {BluetoothDevice} */ d) => {
        found = { ...found, [d.mac]: d };
      }),
      await OpenDivesCore.addListener('bluetoothScanStopped', () => {
        scanning = false;
      }),
      await OpenDivesCore.addListener('downloadProgress', (/** @type {import('opendives-core').DownloadProgress} */ p) => {
        connected = p.state === 'connected';
        if (p.fraction > 0) fraction = Math.min(1, p.fraction);
        if (p.newDives.length) received = [...p.newDives.slice().reverse(), ...received];
      }),
    );
    try {
      models = await OpenDivesCore.bluetoothModels();
      // The remembered computers as the core holds them now.
      logbook.prefs = await OpenDivesCore.getPrefs();
    } catch (e) {
      console.error('Bluetooth models', e);
    }
    check();
  });

  onDestroy(() => {
    // Left with Back or the menu while downloading: the download stops.
    const running = phase === 'downloading' && !leaving;
    leaving = true;
    for (const l of listeners) l.remove();
    OpenDivesCore.stopBluetoothScan().catch(() => {});
    if (running) OpenDivesCore.cancelDownload().catch(() => {});
  });

  const vendorOptions = $derived(models.map((m) => ({ value: m.vendor, label: m.vendor })));
  const chosenVendor = $derived(choosing ? choosing.vendor : '');
  const productOptions = $derived(
    (models.find((m) => m.vendor === chosenVendor)?.products ?? []).map((p) => ({ value: p.name, label: p.name })),
  );
  const percent = $derived(Math.round(fraction * 100));
  /** @param {Computer} c */
  const subtitle = (c) => t('download.vendorBluetooth', { vendor: c.vendor });
</script>

<Page class="od-download">
  <Navbar title={t('download.title')}>
    {#snippet left()}
      {#if theme.ios}
        <Link onClick={close}>{phase === 'downloading' ? t('download.cancel') : t('download.close')}</Link>
      {:else}
        <Link iconOnly onClick={close}>
          <Icon name="close" /><span class="od-sr-only">{phase === 'downloading' ? t('download.cancel') : t('download.close')}</span>
        </Link>
      {/if}
    {/snippet}
  </Navbar>

  {#if phase === 'checking'}
    <div class="state" aria-busy="true"></div>
  {:else if phase === 'none' || phase === 'permission' || phase === 'denied' || phase === 'off'}
    <div class="state">
      <div class="state-icon" aria-hidden="true"><Icon name="bluetooth" size={32} /></div>
      <h1>{t(`download.${phase}.title`)}</h1>
      <p>{t(`download.${phase}.text`)}</p>
      <div class="state-actions">
        {#if phase === 'permission'}
          <button type="button" class="filled" onclick={askPermission}>{t('download.permission.button')}</button>
        {:else if phase === 'denied'}
          <button type="button" class="od-text-button" onclick={askPermission}>{t('download.denied.again')}</button>
          <button type="button" class="filled" onclick={() => OpenDivesCore.openAppSettings()}>{t('download.denied.button')}</button>
        {:else if phase === 'off'}
          <button type="button" class="filled" onclick={turnOn}>{t('download.off.button')}</button>
        {/if}
      </div>
    </div>
  {:else if phase === 'choose'}
    <p class="intro">{t('download.intro')} {t('download.pairingNote')}</p>

    {#if remembered.length}
      <h2 class="subheader">{t('download.remembered')}</h2>
      <ul class="rows">
        {#each remembered as c (c.address)}
          <li>
            <button type="button" class="row" onclick={() => download(c)}>
              <span class="avatar" aria-hidden="true"><Icon name="bluetooth" size={22} /></span>
              <span class="texts">
                <span class="headline">{c.product}</span>
                <span class="supporting">{subtitle(c)}</span>
              </span>
              {#if found[macOf(c.address)]}<span class="trailing">{t('download.seen')}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    <h2 class="subheader">
      {t('download.nearby')}
      {#if scanning}<span class="spinner" role="status" aria-label={t('download.searching')}></span>{/if}
    </h2>
    {#if nearby.length}
      <ul class="rows">
        {#each nearby as d (d.mac)}
          <li>
            <button type="button" class="row" onclick={() => pick(d)}>
              <span class="avatar" aria-hidden="true"><Icon name="bluetooth" size={22} /></span>
              <span class="texts">
                <span class="headline">{d.computer ? d.computer.product : d.name}</span>
                <span class="supporting">
                  {d.computer ? t('download.vendorBluetooth', { vendor: d.computer.vendor }) : t('download.unknownModel')}
                </span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="empty">{scanning ? t('download.searching') : t('download.noneFound')}</p>
    {/if}
    {#if !scanning}
      <div class="again"><button type="button" class="od-outlined-button" onclick={scan}>{t('download.searchAgain')}</button></div>
    {/if}

    <label class="switch-row">
      <span class="texts">
        <span class="headline">{t('download.forceAll')}</span>
        <span class="supporting">{t('download.forceAllText')}</span>
      </span>
      <span class="toggle">
        <input type="checkbox" bind:checked={forceDownload} />
        <span class="toggle-icon"></span>
      </span>
    </label>
  {:else if phase === 'downloading' && computer}
    <h2 class="subheader">{t('download.computer')}</h2>
    <div class="computer">
      <span class="avatar" aria-hidden="true"><Icon name="bluetooth" size={22} /></span>
      <span class="texts">
        <span class="headline">{computer.product}</span>
        <span class="supporting">{subtitle(computer)}</span>
      </span>
      {#if connected}
        <span class="connected"><Icon name="check" size={16} weight={2.4} />{t('download.connected')}</span>
      {:else}
        <span class="trailing">{t('download.connecting')}</span>
      {/if}
    </div>

    <div class="progress">
      <div class="progress-head">
        <span class="headline">{forceDownload ? t('download.readingAll') : t('download.reading')}</span>
        {#if fraction > 0}<span class="percent">{t('download.percent', { n: percent })}</span>{/if}
      </div>
      <div
        class="bar"
        class:indeterminate={fraction <= 0}
        role="progressbar"
        aria-label={t('download.progressLabel')}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={fraction > 0 ? percent : undefined}
      >
        <div class="fill" style:width={fraction > 0 ? `${percent}%` : undefined}></div>
      </div>
      <p class="hint">{t('download.keepNear')}{forceDownload ? '' : ` ${t('download.notAgain')}`}</p>
    </div>

    {#if received.length}
      <h2 class="subheader">{t('download.received')}</h2>
      <ul class="rows dives">
        {#each received as d, i (`${d.date}-${i}`)}
          <li class="dive">
            <ProfileThumbnail profile={d.profile} maxDepthMm={d.maxDepthMm} prefs={logbook.prefs} />
            <span class="texts">
              <span class="headline">{t('download.newDive')}</span>
              <span class="supporting">{formatDateTime(d.date)}</span>
            </span>
            <span class="values">
              <span class="depth">{formatDepth(d.maxDepthMm, logbook.prefs)}</span>
              <span class="supporting">{formatDuration(d.durationSeconds)}</span>
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</Page>

{#if choosing?.step === 'vendor'}
  <ChoiceDialog
    title={t('download.chooseVendor')}
    options={vendorOptions}
    value=""
    oncancel={() => (choosing = null)}
    onselect={(vendor) => {
      if (choosing && vendor) choosing = { ...choosing, step: 'product', vendor };
    }}
  />
{:else if choosing?.step === 'product'}
  <ChoiceDialog
    title={t('download.chooseProduct', { vendor: choosing.vendor })}
    options={productOptions}
    value=""
    oncancel={() => (choosing = null)}
    onselect={(product) => {
      const c = choosing;
      choosing = null;
      if (c && product)
        download({ vendor: c.vendor, product, name: c.device.name, address: addressFor(c.device, transportsOf(c.vendor, product)) });
    }}
  />
{/if}

<style>
  @layer od.components {
    /* MD3 lists (Android): 14 sp subheaders, two-line 72 dp items with a
       40 dp leading avatar; iOS keeps the same order with its sizes. */
    .intro {
      margin: 16px 16px 8px;
      font-size: 16px;
      line-height: 24px;
      color: var(--od-text-2);

      :global(.ios) & {
        font-size: 15px;
        line-height: 20px;
      }
    }

    .subheader {
      margin: 16px 0 0;
      padding: 0 16px;
      min-height: 48px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.1px;
      color: var(--od-text-2);

      :global(.ios) & {
        min-height: 0;
        margin: 24px 16px 6px;
        font-size: 13px;
        font-weight: 400;
      }
    }

    .rows {
      margin: 0;
      padding: 0;
      list-style: none;

      :global(.ios) & {
        margin: 0 16px;
        border-radius: 10px;
        background: var(--od-surface);
        overflow: hidden;
      }
    }

    .row,
    .computer,
    .dive,
    .switch-row {
      box-sizing: border-box;
      width: 100%;
      min-height: 72px;
      padding: 8px 24px 8px 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      border: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      text-align: start;
    }

    .row {
      cursor: pointer;
    }

    .avatar {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 20px;
      background: var(--od-surface-2);
      color: var(--od-text);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .headline {
      font-size: 16px;
      line-height: 24px;

      :global(.ios) & {
        font-size: 17px;
      }
    }

    .computer .headline {
      font-weight: 600;
    }

    .supporting {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);

      :global(.ios) & {
        font-size: 13px;
        line-height: 18px;
      }
    }

    .trailing {
      flex: none;
      font-size: 12px;
      line-height: 16px;
      font-weight: 500;
      color: var(--od-text-2);
    }

    .connected {
      flex: none;
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 14px;
      color: var(--od-oxygen);
    }

    .computer {
      :global(.ios) & {
        margin: 0 16px;
        width: auto;
        border-radius: 10px;
        background: var(--od-surface);
      }
    }

    .empty {
      margin: 0 16px;
      font-size: 14px;
      color: var(--od-text-2);
    }

    .again {
      margin: 12px 16px 0;
    }

    .switch-row {
      margin-top: 16px;
      cursor: pointer;

      :global(.ios) & {
        margin: 24px 16px 0;
        width: auto;
        min-height: 44px;
        border-radius: 10px;
        background: var(--od-surface);
      }
    }

    .toggle {
      flex: none;
    }

    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid var(--od-separator);
      border-top-color: var(--od-text);
      border-radius: 50%;
      animation: od-download-spin 0.9s linear infinite;
    }

    .progress {
      margin: 24px 16px 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .progress-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;

      .headline {
        font-weight: 500;
      }
    }

    .percent {
      font-size: 16px;
      color: var(--od-text-2);
      font-variant-numeric: tabular-nums;
    }

    /* MD3 linear progress indicator: 4 dp track; 8 pt on iOS (mock-up). */
    .bar {
      position: relative;
      height: 4px;
      border-radius: 2px;
      background: var(--od-surface-2);
      overflow: hidden;

      :global(.ios) & {
        height: 8px;
        border-radius: 4px;
      }
    }

    .fill {
      height: 100%;
      border-radius: inherit;
      background: var(--od-action);
      transition: width 0.3s;
    }

    .indeterminate .fill {
      position: absolute;
      width: 40%;
      animation: od-download-slide 1.4s ease-in-out infinite;
    }

    .hint {
      margin: 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);

      :global(.ios) & {
        font-size: 15px;
      }
    }

    .values {
      flex: none;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 2px;
      font-variant-numeric: tabular-nums;
    }

    .depth {
      font-size: 16px;
      font-weight: 600;
    }

    /* Empty and error states (spec, section 6). */
    .state {
      margin: 24px 24px 0;

      h1 {
        margin: 16px 0 8px;
        font-size: 24px;
        line-height: 32px;
        font-weight: 400;

        :global(.ios) & {
          font-size: 28px;
          line-height: 34px;
          font-weight: 700;
        }
      }

      p {
        margin: 0;
        font-size: 16px;
        line-height: 24px;
        color: var(--od-text-2);
      }
    }

    .state-icon {
      color: var(--od-text-2);
    }

    .state-actions {
      margin-top: 24px;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    /* MD3 filled button; iOS large filled button. */
    .filled {
      flex: none;
      width: auto;
      height: 40px;
      padding: 0 24px;
      border: none;
      border-radius: 20px;
      background: var(--od-primary-action);
      color: var(--od-on-primary-action);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;

      :global(.ios) & {
        height: 50px;
        border-radius: 12px;
        font-size: 17px;
        font-weight: 600;
      }
    }

    @keyframes od-download-spin {
      to {
        transform: rotate(360deg);
      }
    }

    @keyframes od-download-slide {
      from {
        left: -40%;
      }
      to {
        left: 100%;
      }
    }
  }
</style>
