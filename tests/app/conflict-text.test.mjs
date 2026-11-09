// The dive computer lines of a sync conflict, put into words.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareComputers, computerNames, parseComputers } from '../../app/src/lib/conflict-text.js';

const line = (model, serial, nickname) =>
  `"${model}" deviceid=abc123${serial ? ` serial="${serial}"` : ''}${nickname ? ` nickname="${nickname}"` : ''}`;

test('reads model, serial and nickname of a log line', () => {
  assert.deepEqual(parseComputers(line('Shearwater Petrel 3', 'bea9663b', 'Mine')), [
    { id: 'Shearwater Petrel 3\nbea9663b', model: 'Shearwater Petrel 3', serial: 'bea9663b', nickname: 'Mine' },
  ]);
});

test('a line without serial or nickname still gives the model', () => {
  const [c] = parseComputers(line('Perdix AI'));
  assert.equal(c.model, 'Perdix AI');
  assert.equal(c.serial, '');
  assert.equal(c.nickname, '');
});

test('tells apart different names, unchanged computers and computers on one side', () => {
  const device = [line('Petrel 3', 's1', 'Phone name'), line('Aladin', 's2', 'Same'), line('Only here', 's3')].join('\n');
  const cloud = [line('Petrel 3', 's1', 'Cloud name'), line('Aladin', 's2', 'Same'), line('Only there', 's4')].join('\n');
  const r = compareComputers(device, cloud);
  assert.deepEqual(r.differing, [{ model: 'Petrel 3', serial: 's1', device: ['Phone name'], cloud: ['Cloud name'] }]);
  assert.deepEqual(r.same.map((c) => c.model), ['Aladin']);
  assert.deepEqual(r.onlyDevice.map((c) => c.model), ['Only here']);
  assert.deepEqual(r.onlyCloud.map((c) => c.model), ['Only there']);
});

test('the same names in another order are not a difference', () => {
  const a = [line('Petrel', 's1', 'A'), line('Petrel', 's1', 'B')].join('\n');
  const b = [line('Petrel', 's1', 'B'), line('Petrel', 's1', 'A')].join('\n');
  const r = compareComputers(a, b);
  assert.equal(r.differing.length, 0);
  assert.equal(r.same.length, 1);
});

test('a name used several times is given once with its count, a missing name is the model', () => {
  assert.equal(
    computerNames([
      { model: 'Petrel 3', names: ['', ''] },
      { model: 'Perdix', names: ['Perdix AI'] },
    ]),
    'Petrel 3 (×2), Perdix AI',
  );
});
