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
  import { Page, Navbar, Link, Button, theme, f7 } from 'framework7-svelte';
  import { showSnackbar } from '../lib/snackbar.js';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from '../components/Icon.svelte';
  import ChoiceDialog from '../components/ChoiceDialog.svelte';
  import ProfileThumbnail from '../components/ProfileThumbnail.svelte';
  import LoadingIndicator from '../components/LoadingIndicator.svelte';
  import LinearWavyProgress from '../components/LinearWavyProgress.svelte';
  import { navigation } from '../lib/navigation.svelte.js';
  import { afterDownload, logbook } from '../lib/logbook.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { downloadSalinity } from '../lib/tools.js';
  import { offerUndo } from '../lib/undo.js';
  import { errorCode } from '../lib/account.js';
  import { addressFor, keepReceived, lastAttempt, macOf } from '../lib/download.js';
  import { ProgressSmoother } from '../lib/progress-smoothing.js';
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
  /** Bluetooth Low Energy failed: the second attempt, over Classic. */
  let retrying = $state(false);
  /** Cancel pressed: the core finishes the dive it is reading first. */
  let stopping = $state(false);
  /** The fraction shown, smoothed. */
  let fraction = $state(0);
  const smoother = new ProgressSmoother();
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
      download(withClassic({ vendor, product, name: d.name, address: addressFor(d, transportsOf(vendor, product)) }));
    } else {
      choosing = { step: 'vendor', device: d, vendor: '' };
    }
  }

  /**
   * Over Bluetooth Low Energy, a device also paired as Bluetooth Classic is
   * tried once over Classic when the BLE link fails (Christian's choice):
   * its MAC goes with the request when the model has Classic.
   * @param {Computer} c
   * @returns {Computer}
   */
  function withClassic(c) {
    const d = found[macOf(c.address)];
    const classic = c.address.startsWith('LE:') && d?.classic && transportsOf(c.vendor, c.product)?.classic;
    return classic ? { ...c, classicAddress: d.mac } : c;
  }

  /** @param {Computer} c */
  async function download(c) {
    c = withClassic(c);
    computer = c;
    retrying = false;
    lastAttempt.computer = c;
    lastAttempt.forceDownload = forceDownload;
    connected = false;
    stopping = false;
    fraction = 0;
    smoother.reset();
    received = [];
    phase = 'downloading';
    scanning = false;
    console.info('Download from', c.vendor, c.product, c.address);
    try {
      const result = await OpenDivesCore.downloadDives({ ...c, forceDownload, defaultSalinity: downloadSalinity(settings.downloadWater) });
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
      // The dives received before the failure, offered as Subsurface-mobile does.
      let kept = 0;
      if (code === 'CANCELLED' || code === 'NOT_FOUND' || code === 'FAILED') {
        try {
          kept = (await OpenDivesCore.downloadPartial({ action: 'count' })).dives;
        } catch (err) {
          console.error('Dives received', err);
        }
      }
      if (leaving) {
        if (kept) OpenDivesCore.downloadPartial({ action: 'discard' }).catch(() => {});
        return;
      }
      if (code === 'CANCELLED') {
        leaving = true;
        f7router.back();
        if (kept) offerPartial(kept);
        else toast(t('download.cancelled'));
      } else if (code === 'NOT_FOUND' || code === 'FAILED') {
        leaving = true;
        const reason = code === 'NOT_FOUND' ? 'notFound' : 'lost';
        f7router.navigate(
          `/download/failed?computer=${encodeURIComponent(c.product)}&reason=${reason}&received=${kept}`,
          { reloadCurrent: true },
        );
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

  /** Cancelled after some dives arrived: keep them or not (MD3 dialog). @param {number} n */
  function offerPartial(n) {
    f7.dialog
      .create({
        title: t('download.cancelledTitle'),
        text: t('download.cancelledKeep', { n }),
        buttons: [
          {
            text: t('download.dropReceived'),
            onClick: () => {
              OpenDivesCore.downloadPartial({ action: 'discard' }).catch(() => {});
              toast(t('download.cancelled'));
            },
          },
          { text: t('download.keepReceived', { n }), onClick: () => keepReceived() },
        ],
      })
      .open();
  }

  /** @param {string} text */
  function toast(text) {
    showSnackbar(text);
  }

  function close() {
    if (phase === 'downloading') {
      // The core stops at its next step (up to a dive's read); the screen
      // closes once it has.
      stopping = true;
      OpenDivesCore.cancelDownload().catch(() => {});
      return;
    }
    leaving = true;
    f7router.back();
  }

  onMount(async () => {
    navigation.downloadPanes++;
    listeners.push(
      await OpenDivesCore.addListener('bluetoothDevice', (/** @type {BluetoothDevice} */ d) => {
        found = { ...found, [d.mac]: d };
      }),
      await OpenDivesCore.addListener('bluetoothScanStopped', () => {
        scanning = false;
      }),
      await OpenDivesCore.addListener('downloadProgress', (/** @type {import('opendives-core').DownloadProgress} */ p) => {
        if (p.state === 'retrying') {
          // BLE failed: the dives of the first attempt are read again over Classic.
          retrying = true;
          received = [];
          fraction = 0;
          smoother.reset();
          return;
        }
        connected = p.state === 'connected';
        const now = Date.now();
        smoother.report(p.fraction, now);
        for (let i = 0; i < p.newDives.length; i++) smoother.diveReceived(now);
        fraction = smoother.tick(now);
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

  // The bar moves on between the core's reports (lib/progress-smoothing.js).
  $effect(() => {
    if (phase !== 'downloading') return;
    const timer = setInterval(() => (fraction = smoother.tick(Date.now())), 250);
    return () => clearInterval(timer);
  });

  onDestroy(() => {
    // Left with Back or the menu while downloading: the download stops.
    const running = phase === 'downloading' && !leaving;
    navigation.downloadPanes--;
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
  /** Android: each computer is a card (the iOS look keeps its grouped rows). */
  const card = $derived(!theme.ios);
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
    <div class="od-download--state" aria-busy="true"></div>
  {:else if phase === 'none' || phase === 'permission' || phase === 'denied' || phase === 'off'}
    <div class="od-download--state">
      <div class="od-download--state-icon" aria-hidden="true"><Icon name="bluetooth" size={32} /></div>
      <h1>{t(`download.${phase}.title`)}</h1>
      <p>{t(`download.${phase}.text`)}</p>
      <div class="od-download--state-actions">
        {#if phase === 'permission'}
          <button type="button" class="od-download--filled" onclick={askPermission}>{t('download.permission.button')}</button>
        {:else if phase === 'denied'}
          <button type="button" class="od-text-button" onclick={askPermission}>{t('download.denied.again')}</button>
          <button type="button" class="od-download--filled" onclick={() => OpenDivesCore.openAppSettings()}>{t('download.denied.button')}</button>
        {:else if phase === 'off'}
          <button type="button" class="od-download--filled" onclick={turnOn}>{t('download.off.button')}</button>
        {/if}
      </div>
    </div>
  {:else if phase === 'choose'}
    <p class="od-download--intro">{t('download.intro')} {t('download.pairingNote')}</p>

    {#if remembered.length}
      <h2 class="od-download--subheader">{t('download.remembered')}</h2>
      <ul class="od-download--rows od-download--cards" class:od-download--card-list={card}>
        {#each remembered as c (c.address)}
          <li>
            <button type="button" class="od-download--row" class:od-download--card={card} onclick={() => download(c)}>
              <span class="od-download--avatar" aria-hidden="true"><Icon name="bluetooth" size={22} /></span>
              <span class="od-download--texts">
                <span class="od-download--headline">{c.product}</span>
                <span class="od-download--supporting">{subtitle(c)}</span>
              </span>
              {#if found[macOf(c.address)]}<span class="od-download--trailing">{t('download.seen')}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    <h2 class="od-download--subheader">
      {t('download.nearby')}
      {#if scanning}{#if theme.ios}<span class="od-download--spinner" role="status" aria-label={t('download.searching')}></span>{:else}<LoadingIndicator size={20} label={t('download.searching')} />{/if}{/if}
    </h2>
    {#if nearby.length}
      <ul class="od-download--rows od-download--cards" class:od-download--card-list={card}>
        {#each nearby as d (d.mac)}
          <li>
            <button type="button" class="od-download--row" class:od-download--card={card} onclick={() => pick(d)}>
              <span class="od-download--avatar" aria-hidden="true"><Icon name="bluetooth" size={22} /></span>
              <span class="od-download--texts">
                <span class="od-download--headline">{d.computer ? d.computer.product : d.name}</span>
                <span class="od-download--supporting">
                  {d.computer ? t('download.vendorBluetooth', { vendor: d.computer.vendor }) : t('download.unknownModel')}
                </span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="od-download--empty">{scanning ? t('download.searching') : t('download.noneFound')}</p>
    {/if}
    {#if !scanning}
      <div class="od-download--again"><button type="button" class="od-outlined-button" onclick={scan}>{t('download.searchAgain')}</button></div>
    {/if}

    <label class="od-download--switch-row">
      <span class="od-download--texts">
        <span class="od-download--headline">{t('download.forceAll')}</span>
        <span class="od-download--supporting">{t('download.forceAllText')}</span>
      </span>
      <span class="toggle">
        <input type="checkbox" bind:checked={forceDownload} />
        <span class="toggle-icon"></span>
      </span>
    </label>
  {:else if phase === 'downloading' && computer}
    <h2 class="od-download--subheader">{t('download.computer')}</h2>
    <div class="od-download--computer" class:od-download--card={card}>
      <span class="od-download--avatar" aria-hidden="true"><Icon name="bluetooth" size={22} /></span>
      <span class="od-download--texts">
        <span class="od-download--headline">{computer.product}</span>
        <span class="od-download--supporting">{subtitle(computer)}</span>
      </span>
      {#if connected}
        <span class="od-download--connected"><Icon name="check" size={16} weight={2.4} />{t('download.connected')}</span>
      {:else}
        <span class="od-download--trailing">{t('download.connecting')}</span>
      {/if}
    </div>
    {#if retrying}<p class="od-download--retrying" role="status">{t('download.retryingClassic')}</p>{/if}

    <div class="od-download--progress">
      <div class="od-download--progress-head">
        <span class="od-download--headline">{forceDownload ? t('download.readingAll') : t('download.reading')}</span>
        {#if fraction > 0}<span class="od-download--percent">{t('download.percent', { n: percent })}</span>{/if}
      </div>
      {#if theme.ios}
      <div
        class="od-download--bar"
        class:od-download--indeterminate={fraction <= 0}
        role="progressbar"
        aria-label={t('download.progressLabel')}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={fraction > 0 ? percent : undefined}
      >
        <div class="od-download--fill" style:width={fraction > 0 ? `${percent}%` : undefined}></div>
      </div>
      {:else}
        <LinearWavyProgress value={fraction} indeterminate={fraction <= 0} label={t('download.progressLabel')} />
      {/if}
      <p class="od-download--hint">{t('download.keepNear')}{forceDownload ? '' : ` ${t('download.notAgain')}`}</p>
    </div>

    <div class="od-download--stop">
      <Button outline disabled={stopping} onClick={close}>{stopping ? t('download.stopping') : t('download.stop')}</Button>
    </div>

    {#if received.length}
      <h2 class="od-download--subheader">{t('download.received')}</h2>
      <ul class="od-download--rows od-dive-list">
        {#each received as d, i (`${d.date}-${i}`)}
          <li class="od-download--dive">
            <ProfileThumbnail profile={d.profile} maxDepthMm={d.maxDepthMm} prefs={logbook.prefs} />
            <span class="od-download--texts">
              <span class="od-download--headline">{t('download.newDive')}</span>
              <span class="od-download--supporting">{formatDateTime(d.date)}</span>
            </span>
            <span class="od-download--values">
              {#if theme.ios}
                <span class="od-download--depth">{formatDepth(d.maxDepthMm, logbook.prefs)}</span>
                <span class="od-download--supporting">{formatDuration(d.durationSeconds)}</span>
              {:else}
                <!-- Android: the duration above the depth, as in the dive rows. -->
                <span class="od-download--depth">{formatDuration(d.durationSeconds)}</span>
                {#if d.maxDepthMm}<span class="od-download--supporting">{formatDepth(d.maxDepthMm, logbook.prefs)}</span>{/if}
              {/if}
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
    .od-download--intro {
      margin: 16px 16px 8px;
      font-size: 16px;
      line-height: 24px;
      color: var(--od-text-2);

      :global(.ios) & {
        font-size: 15px;
        line-height: 20px;
      }
    }

    .od-download--subheader {
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

    .od-download--rows {
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

    .od-download--row,
    .od-download--computer,
    .od-download--dive,
    .od-download--switch-row {
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

    .od-download--row {
      cursor: pointer;
    }

    .od-download--avatar {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 20px;
      background: var(--od-surface-2);
      color: var(--od-text);
      display: flex;
      align-items: center;
      justify-content: center;

      /* Android: the computer icon in tertiary. */
      :global(.md) & {
        background: var(--od-tertiary-container);
        color: var(--od-tertiary);
      }
    }

    .od-download--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-download--headline {
      font-size: 16px;
      line-height: 24px;

      :global(.ios) & {
        font-size: 17px;
      }
    }

    .od-download--computer .od-download--headline {
      font-weight: 600;
    }

    .od-download--supporting {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);

      :global(.ios) & {
        font-size: 13px;
        line-height: 18px;
      }
    }

    .od-download--trailing {
      flex: none;
      font-size: 12px;
      line-height: 16px;
      font-weight: 500;
      color: var(--od-text-2);
    }

    .od-download--connected {
      flex: none;
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 14px;
      color: var(--od-oxygen);
    }

    /* Android: a computer is a card, remembered, nearby or connected. */
    .od-download--card {
      width: auto;
      margin: 0 16px;
      padding: 12px 16px;
      border-radius: 16px;
      background: var(--od-surface);
    }

    /* 8 dp between cards. Two columns when the pane itself is wide (container
       query below), one column on a phone and in portrait. */
    .od-download--card-list {
      margin: 0 16px;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;

      > li {
        display: flex;
      }

      .od-download--card {
        width: auto;
        flex: 1;
        margin: 0;
      }
    }

    /* The page is the container: the width left beside the list decides, not the orientation. */
    :global(.od-download .page-content) {
      container-type: inline-size;
    }

    @container (min-width: 720px) {
      .od-download--card-list {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      /* The connected computer is one column wide, like the cards of the choice. */
      .od-download--computer.od-download--card {
        width: calc((100cqw - 40px) / 2);
      }
    }

    .od-download--computer {
      :global(.ios) & {
        margin: 0 16px;
        width: auto;
        border-radius: 10px;
        background: var(--od-surface);
      }
    }

    .od-download--retrying {
      margin: 8px 16px 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .od-download--empty {
      margin: 0 16px;
      font-size: 14px;
      color: var(--od-text-2);
    }

    .od-download--again {
      margin: 12px 16px 0;
    }

    .od-download--switch-row {
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

    .od-download--spinner {
      width: 16px;
      height: 16px;
      border: 2px solid var(--od-separator);
      border-top-color: var(--od-text);
      border-radius: 50%;
      animation: od-download-spin 0.9s linear infinite;
    }

    .od-download--progress {
      margin: 24px 16px 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .od-download--progress-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;

      .od-download--headline {
        font-weight: 500;
      }
    }

    .od-download--percent {
      font-size: 16px;
      color: var(--od-text-2);
      font-variant-numeric: tabular-nums;
    }

    /* MD3 linear progress indicator: 4 dp track; 8 pt on iOS (mock-up). */
    .od-download--bar {
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

    .od-download--fill {
      height: 100%;
      border-radius: inherit;
      background: var(--od-action);
      transition: width 0.3s;
    }

    .od-download--indeterminate .od-download--fill {
      position: absolute;
      width: 40%;
      animation: od-download-slide 1.4s ease-in-out infinite;
    }

    .od-download--stop {
      margin: 16px 16px 8px;
    }

    .od-download--hint {
      margin: 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);

      :global(.ios) & {
        font-size: 15px;
      }
    }

    .od-download--values {
      flex: none;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 2px;
      font-variant-numeric: tabular-nums;
    }

    .od-download--depth {
      font-size: 16px;
      font-weight: 600;
    }

    /* Empty and error states (spec, section 6). */
    .od-download--state {
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

    .od-download--state-icon {
      color: var(--od-text-2);
    }

    .od-download--state-actions {
      margin-top: 24px;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    /* MD3 filled button; iOS large filled button. */
    .od-download--filled {
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
