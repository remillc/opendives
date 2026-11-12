// SPDX-License-Identifier: GPL-2.0
// Offline maps scenario, run inside the app in the simulator (tests/ios/run-maps.sh
// adds this file to a copy of the app). It calls the native plugin as the
// pages do and prints "MAPS-TEST ..." lines; the last one is
// "MAPS-TEST END passed=<n> failed=<n>".
// window.OD_MAPS_LIMIT_TEST (set by run-maps.sh) adds the 50 MiB stop, which
// downloads about 50 MiB from the tile server: on request only.
(() => {
  const log = (...a) => console.log('MAPS-TEST', ...a);
  let passed = 0;
  let failed = 0;
  const check = (ok, what, detail = '') => {
    if (ok) passed++;
    else failed++;
    log(ok ? 'PASS' : 'FAIL', what, detail);
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Every mapsDownload event, in order. */
  const events = [];

  async function rejectCode(promise) {
    try {
      await promise;
      return 'resolved';
    } catch (e) {
      return e?.code ?? String(e);
    }
  }

  async function download(core, id) {
    const { downloads } = await core.mapsDownloads();
    return downloads.find((d) => d.id === id);
  }

  async function waitFor(core, id, test, seconds) {
    for (let i = 0; i < seconds * 2; i++) {
      const d = await download(core, id);
      if (test(d)) return d;
      await sleep(500);
    }
    return download(core, id);
  }

  async function run() {
    const core = window.Capacitor?.Plugins?.OpenDivesCore;
    if (!core) return log('FAIL no plugin');
    await core.addListener('mapsDownload', (e) => events.push(e));

    const net = await core.networkStatus();
    log('network', JSON.stringify(net));
    const space = await core.mapsFreeSpace();
    check(space.freeBytes > 0 && space.totalBytes >= space.freeBytes, 'mapsFreeSpace', JSON.stringify(space));

    const tilejson = await (await fetch('https://tiles.openfreemap.org/planet')).json();
    const urlTemplate = tilejson.tiles[0];
    const version = String(tilejson.version ?? tilejson.tiles[0]);
    log('tiles', urlTemplate);
    const request = (id, bbox, maxZoom, extra = {}) => ({ id, bbox, maxZoom, urlTemplate, version, allowCellular: false, title: id, ...extra });

    // Malformed requests and the tile limit, counted by the native code.
    check((await rejectCode(core.mapsTilesStart(request('../x', [5.3, 43.2, 5.4, 43.3], 12)))) === 'BAD_ARGUMENT', 'bad id');
    check((await rejectCode(core.mapsTilesStart(request('t', [5.3, 43.3, 5.4, 43.2], 12)))) === 'BAD_ARGUMENT', 'south above north');
    check((await rejectCode(core.mapsTilesStart(request('t', [5.3, 43.2, 5.4, 43.3], 13)))) === 'BAD_ARGUMENT', 'maxZoom 13');
    check((await rejectCode(core.mapsTilesStart(request('t', [5.3, 43.2, 5.4, 43.3], 12, { urlTemplate: 'http://x/{z}/{x}/{y}' })))) === 'BAD_ARGUMENT', 'not https');
    check((await rejectCode(core.mapsTilesStart(request('t', [-5, 41, 9, 51], 14)))) === 'TOO_MANY_TILES', 'France at zoom 14');
    // Across the antimeridian (Fiji): accepted, two blocks a zoom.
    check((await rejectCode(core.mapsTilesStart(request('fiji', [179.5, -17, -179.5, -16], 12)))) === 'resolved', 'antimeridian accepted');
    const fiji = await waitFor(core, 'fiji', (d) => d && d.tilesTotal > 0, 5);
    log('fiji', JSON.stringify(fiji));
    await core.mapsDownloadCancel({ id: 'fiji' });

    // A small region, downloaded to the end.
    const small = request('test-small', [5.35, 43.2, 5.45, 43.25], 12);
    check((await rejectCode(core.mapsTilesStart(small))) === 'resolved', 'small region started');
    const done = await waitFor(core, 'test-small', (d) => d?.status === 'ready' || d?.status === 'failed', 120);
    check(done?.status === 'ready' && done.tilesDone === done.tilesTotal, 'small region ready', JSON.stringify(done));
    const { files } = await core.mapsFiles();
    const file = files.find((f) => f.id === 'test-small');
    check(file && file.sizeBytes > 0 && file.maxZoom === 12 && file.version === version, 'mapsFiles', JSON.stringify(files));
    const world = await core.mapsReadTile({ id: 'test-small', z: 0, x: 0, y: 0 }).catch((e) => e);
    check(typeof world.base64 === 'string' && world.base64.length > 100, 'tile 0/0/0 read', String(world.base64?.length ?? world.code));
    check((await rejectCode(core.mapsReadTile({ id: 'test-small', z: 12, x: 0, y: 0 }))) === 'NOT_FOUND', 'tile outside the region');
    // The same request again: already up to date, nothing downloads.
    const before = events.length;
    await core.mapsTilesStart(small);
    await sleep(1000);
    check(events.length === before && (await download(core, 'test-small'))?.status === 'ready', 'same request keeps the ready region');

    // Pause, resume, cancel on a larger region.
    const big = request('test-big', [5.2, 43.15, 5.6, 43.4], 14);
    check((await rejectCode(core.mapsTilesStart(big))) === 'resolved', 'large region started');
    let d = await waitFor(core, 'test-big', (x) => x?.status === 'downloading' && x.tilesDone > 50, 60);
    check(d?.status === 'downloading', 'large region downloading', JSON.stringify(d));
    await core.mapsDownloadPause({ id: 'test-big' });
    await sleep(2000);
    const paused = await download(core, 'test-big');
    await sleep(3000);
    const still = await download(core, 'test-big');
    check(paused?.status === 'paused' && still?.tilesDone === paused.tilesDone, 'pause stops the download', `${paused?.tilesDone} then ${still?.tilesDone}`);
    await core.mapsDownloadResume({ id: 'test-big', allowCellular: false });
    d = await waitFor(core, 'test-big', (x) => x?.status === 'downloading' && x.tilesDone > (still?.tilesDone ?? 0), 30);
    check(d?.tilesDone >= (still?.tilesDone ?? 0), 'resume keeps the tiles already there', `${still?.tilesDone} then ${d?.tilesDone}`);
    await core.mapsDownloadCancel({ id: 'test-big' });
    await sleep(1000);
    check(!(await download(core, 'test-big')) && !(await core.mapsFiles()).files.some((f) => f.id === 'test-big'), 'cancel removes the download');

    // Progress events: at most about two a second (allowing for the status changes).
    const progress = events.filter((e) => e.id === 'test-big' && e.status === 'downloading');
    log('progress events', progress.length);

    if (window.OD_MAPS_LIMIT_TEST) {
      // A dense area at zoom 14, under 3,000 tiles but over 50 MiB.
      const heavy = request('test-limit', [2.1, 48.7, 2.6, 49.0], 14);
      check((await rejectCode(core.mapsTilesStart(heavy))) === 'resolved', 'heavy region started');
      const end = await waitFor(core, 'test-limit', (x) => x?.status === 'failed' || x?.status === 'ready', 900);
      check(end?.status === 'failed' && end.error === 'limit', 'stop at 50 MiB', JSON.stringify(end));
      check(!(await core.mapsFiles()).files.some((f) => f.id === 'test-limit'), 'tiles over the limit removed');
      await core.mapsDelete({ id: 'test-limit' });
    }

    await core.mapsDelete({ id: 'test-small' });
    check(!(await core.mapsFiles()).files.length && !(await core.mapsDownloads()).downloads.length, 'delete leaves nothing');
  }

  const start = () =>
    run()
      .catch((e) => {
        failed++;
        log('FAIL exception', e?.message ?? String(e));
      })
      .finally(() => log(`END passed=${passed} failed=${failed}`));
  // After the app's own start-up.
  setTimeout(start, 8000);
})();
