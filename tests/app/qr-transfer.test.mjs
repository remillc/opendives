import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CHUNK_BYTES,
  decodeTexts,
  decodeTransfer,
  encodeTransfer,
  missing,
  newReceiver,
  parseChunk,
  receive,
  restart,
} from '../../app/src/lib/qr-transfer.js';
import { labelOf, readPreview, startKey } from '../../app/src/lib/qr-preview.js';

const diveXml = readFileSync(new URL('../../third_party/subsurface/dives/TestDiveDivelogsDE.xml', import.meta.url), 'utf8');

/** A long dive: 600 samples with a varying profile, so that it takes several codes. */
function longDiveXml() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const samples = [];
  for (let i = 0; i < 600; i++) {
    const s = i * 10;
    samples.push(`  <sample time='${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min' depth='${(20 + rnd() * 10).toFixed(2)} m' temp='${(8 + rnd()).toFixed(1)} C' pressure0='${(200 - i / 4).toFixed(3)} bar' />`);
  }
  return `<divelog program='subsurface' version='3'>
<divesites>
<site uuid='abc12345' name='Lake Coleridge' gps='-43.3 171.5'>
  <geo cat='2' origin='0' value='New Zealand'/>
</site>
</divesites>
<dives>
<dive number='12' divesiteid='abc12345' date='2014-04-02' time='10:12:00' duration='100:00 min'>
  <buddy>Taylor, Michael</buddy>
  <notes>Caf&#233; &amp; wreck</notes>
  <cylinder size='24 l' o2='16.0%' he='45.0%' />
  <cylinder size='11 l' o2='100.0%' />
  <divecomputer model='Test'>
  <depth max='39.0 m' mean='25 m' />
  <temperature water='4.3 C' />
${samples.join('\n')}
  </divecomputer>
</dive>
</dives>
</divelog>
`;
}

/** A plan as the core exports it: a dive whose computer is "planned dive". */
const planXml = `<divelog program='subsurface' version='3'>
<dives>
<dive number='1' date='2026-12-01' time='09:00:00' duration='45:00 min'>
  <cylinder size='11.1 l' workpressure='207.0 bar' description='AL80' o2='32.0%' />
  <divecomputer model='planned dive'>
  <depth max='30.0 m' mean='20.0 m' />
  <extradata key='OpenDives title' value='Wreck trip' />
  <sample time='0:00 min' depth='0.0 m' />
  <sample time='2:00 min' depth='30.0 m' />
  <sample time='25:00 min' depth='30.0 m' />
  <sample time='30:00 min' depth='5.0 m' />
  </divecomputer>
</dive>
</dives>
</divelog>
`;

/** Fisher-Yates with a fixed seed. @param {any[]} list */
function shuffled(list) {
  const a = [...list];
  let seed = 42;
  for (let i = a.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

test('a real dive file makes the round trip, byte for byte', async () => {
  const { chunks } = await encodeTransfer({ kind: 'd', label: labelOf(diveXml), xml: diveXml });
  assert.ok(chunks.length >= 1);
  const back = await decodeTexts(chunks);
  assert.equal(back.kind, 'd');
  assert.equal(back.label, 'USA, Hoodsport, WA / Sund Rock');
  assert.equal(back.xml, diveXml);
});

test('every code is printable ASCII and about 1 KB at most', async () => {
  const { chunks } = await encodeTransfer({ kind: 'd', label: 'Lake Coleridge', xml: longDiveXml() });
  assert.ok(chunks.length > 3);
  for (const c of chunks) {
    assert.match(c, /^[\x20-\x7e]+$/);
    assert.ok(c.length <= CHUNK_BYTES * 1.4 + 120, `a code of ${c.length} characters`);
  }
  assert.match(chunks[0], /^OD1~d~[0-9a-z]{6}~1~\d+~[0-9a-f]{8}~/);
});

test('a plan makes the round trip, in one code when it is short', async () => {
  const { chunks } = await encodeTransfer({ kind: 'p', label: 'Wreck trip', xml: planXml });
  assert.equal(chunks.length, 1);
  const back = await decodeTexts(chunks);
  assert.equal(back.kind, 'p');
  assert.equal(back.xml, planXml);
});

test('a long dive in several codes, read in any order, with repeats', async () => {
  const xml = longDiveXml();
  const { chunks } = await encodeTransfer({ kind: 'd', label: 'Lake Coleridge', xml });
  const mixed = shuffled([...chunks, chunks[0], chunks[2]]);
  const receiver = newReceiver();
  let last;
  let again = 0;
  for (const text of mixed) {
    last = receive(receiver, text);
    if (last.status === 'again') again++;
  }
  assert.equal(again, 2);
  assert.equal(receiver.total, chunks.length);
  assert.equal(receiver.parts.size, chunks.length);
  assert.deepEqual(missing(receiver), []);
  const back = await decodeTransfer(receiver);
  assert.equal(back.xml, xml);
  assert.equal(back.label, 'Lake Coleridge');
});

test('a missing code: not complete, the missing index is known, decoding refuses', async () => {
  const { chunks } = await encodeTransfer({ kind: 'd', label: 'x', xml: longDiveXml() });
  const receiver = newReceiver();
  const results = chunks.filter((_, i) => i !== 2).map((c) => receive(receiver, c));
  assert.ok(results.every((r) => !r.complete));
  assert.deepEqual(missing(receiver), [3]);
  await assert.rejects(decodeTransfer(receiver), /INCOMPLETE/);
  // The next pass brings it.
  assert.equal(receive(receiver, chunks[2]).complete, true);
  assert.equal((await decodeTransfer(receiver)).xml, longDiveXml());
});

test('a code from another transfer is reported, then restarts the count when the diver agrees', async () => {
  const a = await encodeTransfer({ kind: 'd', label: 'A', xml: longDiveXml() });
  const b = await encodeTransfer({ kind: 'p', label: 'B', xml: planXml });
  const receiver = newReceiver();
  receive(receiver, a.chunks[0]);
  assert.equal(receive(receiver, b.chunks[0]).status, 'other');
  assert.equal(receiver.parts.size, 1);
  assert.equal(receiver.transfer, a.transfer);
  restart(receiver);
  const r = receive(receiver, b.chunks[0]);
  assert.equal(r.status, 'added');
  assert.equal(r.complete, true);
  assert.equal(receiver.kind, 'p');
});

test('a foreign code is not an OpenDives code', () => {
  for (const text of ['https://example.org', 'WIFI:S:home;T:WPA;P:secret;;', '', 'OD1~d~abc', 'OD1~x~abcdef~1~1~00000000~eA~eA', 'OD1~d~ABCDEF~1~1~00000000~eA~eA', 'OD1~d~abcdef~2~1~00000000~eA~eA', 'OD1~d~abcdef~1~1~00000000~e$~eA']) {
    assert.deepEqual(parseChunk(text), { ok: false, reason: 'foreign' }, text);
  }
  const receiver = newReceiver();
  assert.equal(receive(receiver, 'https://example.org').status, 'foreign');
  assert.equal(receiver.transfer, '');
  assert.deepEqual(parseChunk('OD2~d~abcdef~1~1~00000000~eA~eA'), { ok: false, reason: 'version' });
});

test('a damaged code is caught by the checksum', async () => {
  const { chunks } = await encodeTransfer({ kind: 'd', label: 'x', xml: longDiveXml() });
  const parts = chunks[1].split('~');
  parts[7] = parts[7].slice(0, 10) + (parts[7][10] === 'A' ? 'B' : 'A') + parts[7].slice(11);
  const damaged = [chunks[0], parts.join('~'), ...chunks.slice(2)];
  await assert.rejects(decodeTexts(damaged), /CORRUPT/);
});

test('the label keeps accents and is cut at 40 characters', async () => {
  const { chunks } = await encodeTransfer({ kind: 'd', label: 'Côte d’Azur, plongée de nuit à la Gabinière — épave du Donator', xml: planXml });
  const back = await decodeTexts(chunks);
  assert.equal([...back.label].length, 40);
  assert.ok(back.label.startsWith('Côte d’Azur'));
});

test('the preview of a real dive', () => {
  const p = readPreview(diveXml);
  assert.ok(p);
  assert.equal(startKey(p), '2011-05-17T11:01:00');
  assert.equal(p.site, 'USA, Hoodsport, WA / Sund Rock');
  assert.equal(p.maxDepthMm, 24700);
  assert.equal(p.durationSeconds, 32 * 60);
  assert.equal(p.minTempMk, 283150);
  assert.equal(p.samples, 65);
  assert.deepEqual(p.gases, [{ o2Permille: 320, hePermille: 0 }]);
  assert.deepEqual(p.people, ['Linus']);
  assert.equal(p.profile.length % 2, 0);
});

test('the preview of a long dive: country, people, gases, thinned profile', () => {
  const p = readPreview(longDiveXml());
  assert.ok(p);
  assert.equal(p.country, 'New Zealand');
  assert.equal(p.site, 'Lake Coleridge');
  assert.deepEqual(p.people, ['Taylor', 'Michael']);
  assert.deepEqual(p.gases, [
    { o2Permille: 160, hePermille: 450 },
    { o2Permille: 1000, hePermille: 0 },
  ]);
  assert.equal(p.samples, 600);
  assert.ok(p.profile.length / 2 <= 60);
  assert.equal(readPreview('<divelog></divelog>'), null);
});
