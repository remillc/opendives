// The causes of a sync failure (spec, "Sync failures").
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { failureCause, isRefused, retryDelay } from '../../app/src/lib/sync-failure.js';

test('no network at all is not a failure', () => {
  assert.equal(failureCause({ online: false, gitMode: false, refused: true }), null);
  assert.equal(failureCause({ online: false, gitMode: true, refused: false }), null);
});

test('the cloud refusing the credentials is a password failure', () => {
  assert.equal(failureCause({ online: true, gitMode: false, refused: true }), 'auth');
});

test('the cloud not answering while the network works', () => {
  assert.equal(failureCause({ online: true, gitMode: false, refused: false }), 'server');
});

test('any failure of an own repository goes to its form', () => {
  assert.equal(failureCause({ online: true, gitMode: true, refused: true }), 'repository');
  assert.equal(failureCause({ online: true, gitMode: true, refused: false }), 'repository');
});

test('only the core\'s AUTH prefix counts as refused', () => {
  assert.equal(isRefused('AUTH: Credentials rejected by the server'), true);
  assert.equal(isRefused('failed to resolve address'), false);
  assert.equal(isRefused(undefined), false);
});

test('retries every 5 minutes, then less often', () => {
  assert.deepEqual([0, 1, 2, 3, 9].map(retryDelay), [5, 15, 30, 60, 60]);
});
