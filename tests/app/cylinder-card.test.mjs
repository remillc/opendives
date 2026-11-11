// The cylinder cards of "Edit dive": gas name, HP/LP, pressure used, reordering.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canMove, dropIndex, gasKind, gasName, HP_MBAR, LP_MBAR, moveItem, pressureClass, pressureUsed, typeHelper } from '../../app/src/lib/cylinder-card.js';

const words = { air: 'Air', oxygen: 'Oxygen', nitrox: 'EAN{o2}', trimix: 'Trimix {o2}/{he}' };
const psi = (v) => Math.round(v * 68.947572932);

test('the gas in plain words', () => {
  assert.equal(gasName(160, 450, words), 'Trimix 16/45');
  assert.equal(gasName(320, 0, words), 'EAN32');
  assert.equal(gasName(1000, 0, words), 'Oxygen');
  assert.equal(gasName(210, 0, words), 'Air');
  assert.equal(gasName(0, 0, words), 'Air', 'the core stores air as 0');
  assert.equal(gasName(500, 100, words), 'Trimix 50/10');
});

test('gas kind rounds to whole per cent', () => {
  assert.deepEqual(gasKind(209, 0), { kind: 'air', o2: 21, he: 0 });
  assert.equal(gasKind(995, 0).kind, 'oxygen');
});

test('the thresholds are the psi values converted exactly', () => {
  assert.equal(HP_MBAR, 227527);
  assert.equal(LP_MBAR, 182022);
});

test('HP from 3 300 psi, LP up to 2 640 psi, nothing between', () => {
  assert.equal(pressureClass(psi(3300)), 'HP');
  assert.equal(pressureClass(psi(3442)), 'HP');
  assert.equal(pressureClass(232000), 'HP');
  assert.equal(pressureClass(psi(3299)), '');
  assert.equal(pressureClass(psi(3000)), '');
  assert.equal(pressureClass(200000), '');
  assert.equal(pressureClass(psi(2640)), 'LP');
  assert.equal(pressureClass(182000), 'LP');
  assert.equal(pressureClass(psi(2641)), '');
  assert.equal(pressureClass(0), '', 'unknown pressure');
});

test('the helper text under the Type', () => {
  assert.equal(typeHelper('16 cuft', psi(3442)), '16 cuft HP');
  assert.equal(typeHelper('80 cuft', psi(3000)), '80 cuft');
  assert.equal(typeHelper('11,1 L', 182000), '11,1 L LP');
  assert.equal(typeHelper(null, 232000), '');
});

test('the pressure used is start minus end', () => {
  assert.equal(Math.round(pressureUsed(psi(2683), psi(1885)) / 68.947572932), 798);
  assert.equal(pressureUsed(200000, 50000), 150000);
  assert.equal(pressureUsed(0, 50000), 0);
  assert.equal(pressureUsed(200000, 0), 0);
  assert.equal(pressureUsed(100000, 150000), 0);
});

test('moving a card: the numbers follow the new order', () => {
  const list = ['a', 'b', 'c'];
  assert.deepEqual(moveItem(list, 1, 0), ['b', 'a', 'c']);
  assert.deepEqual(moveItem(list, 0, 2), ['b', 'c', 'a']);
  assert.deepEqual(list, ['a', 'b', 'c'], 'the list is not changed');
});

test('a new cylinder stays after the cylinders of the dive', () => {
  const list = [{ index: 0 }, { index: 1 }, { index: -1 }];
  assert.equal(canMove(list, 1, 0), true);
  assert.equal(canMove(list, 1, 2), false);
  assert.equal(canMove(list, 2, 0), false);
  assert.equal(canMove(list, 0, 0), false);
  assert.equal(canMove(list, 0, 3), false);
  assert.equal(canMove([{ index: -1 }, { index: -1 }], 1, 0), true);
});

test('the drop position from the centre of the dragged card', () => {
  const centers = [100, 300, 500];
  assert.equal(dropIndex(centers, 1, 300), 1);
  assert.equal(dropIndex(centers, 1, 50), 0);
  assert.equal(dropIndex(centers, 1, 450), 1, 'not past the next centre yet');
  assert.equal(dropIndex(centers, 0, 520), 2);
  assert.equal(dropIndex(centers, 2, 90), 0);
});
