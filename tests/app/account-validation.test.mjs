// The account and git repository rules checked as the diver types
// (app/src/lib/account-validation.js). The e-mail and password cases are those of
// tests/account_test.cpp, which checks the façade's own copy of the same rules.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normaliseGitUrl,
  validCloudEmail,
  validCloudPassword,
  validGitBranch,
  validGitToken,
  validGitUsername,
} from '../../app/src/lib/account-validation.js';

test('e-mail: the cases of account_test.cpp', () => {
  assert.equal(validCloudEmail('diver.one+log@example.org'), true);
  assert.equal(validCloudEmail('diver@example'), false, 'no dot in the domain');
  assert.equal(validCloudEmail('a b@example.org'), false, 'a space');
  assert.equal(validCloudEmail('a@example.o'), false, 'a one-letter TLD');
  assert.equal(validCloudEmail(`${'a'.repeat(65)}@example.org`), false, 'local part over 64');
  assert.equal(validCloudEmail(`${'a'.repeat(64)}@example.org`), true, 'local part of 64');
  assert.equal(validCloudEmail(`a@${'b'.repeat(250)}.org`), false, 'over 254 characters');
});

test('password: the cases of account_test.cpp', () => {
  assert.equal(validCloudPassword('Abc.123_x-y+z@'), true);
  assert.equal(validCloudPassword(''), false, 'empty');
  assert.equal(validCloudPassword('pass word'), false, 'a space');
  assert.equal(validCloudPassword('café'), false, 'an accent');
});

test('git address: https, a host and a path; trimmed, trailing slashes dropped', () => {
  assert.deepEqual(normaliseGitUrl('  https://github.com/diver/logbook/  '), { url: 'https://github.com/diver/logbook', host: 'github.com' });
  assert.deepEqual(normaliseGitUrl('https://git.example.org:8443/a/b.git'), { url: 'https://git.example.org:8443/a/b.git', host: 'git.example.org:8443' });
  for (const bad of ['', '   ', 'http://github.com/a/b', 'github.com/a/b', 'https://github.com', 'https://github.com/', 'https:///a/b', 'https://user@github.com/a/b', 'https://github.com/a/b?x=1', 'https://github.com/a/b#x', 'https://github.com/a b', 'https://github.com/a[b]', 'https://git_hub.com/a/b', 'https://github.com\\a\\b']) {
    assert.equal(normaliseGitUrl(bad), null, JSON.stringify(bad));
  }
});

test('git address: another scheme only with the debug setting', () => {
  assert.equal(normaliseGitUrl('file:///tmp/repo'), null);
  assert.equal(normaliseGitUrl('ssh://host/path/repo'), null);
  assert.deepEqual(normaliseGitUrl('ssh://host/path/repo', true), { url: 'ssh://host/path/repo', host: 'host' });
  assert.equal(normaliseGitUrl('://host/a', true), null);
});

test('git user name: 1 to 100 letters, digits, . _ -', () => {
  assert.equal(validGitUsername('diver-one_2.x'), true);
  assert.equal(validGitUsername(''), false);
  assert.equal(validGitUsername('a b'), false);
  assert.equal(validGitUsername('é'), false);
  assert.equal(validGitUsername('a'.repeat(100)), true);
  assert.equal(validGitUsername('a'.repeat(101)), false);
});

test('git token: 1 to 1000 printable ASCII characters', () => {
  assert.equal(validGitToken('ghp_AbC123-._~+/='), true);
  assert.equal(validGitToken(''), false);
  assert.equal(validGitToken('a b'), false);
  assert.equal(validGitToken('tokén'), false);
  assert.equal(validGitToken('a\tb'), false);
  assert.equal(validGitToken('a'.repeat(1000)), true);
  assert.equal(validGitToken('a'.repeat(1001)), false);
});

test('git branch: the same rules as the façade', () => {
  for (const good of ['main', 'feature/logbook', 'v1.2', 'a-b_c']) assert.equal(validGitBranch(good), true, good);
  for (const bad of ['', '-main', '/main', 'main/', 'main.', 'a..b', 'a//b', 'a b', 'a[b]', 'a~b', 'a^b', 'a:b', 'a?b', 'a*b', 'a\\b', 'a'.repeat(201)]) {
    assert.equal(validGitBranch(bad), false, JSON.stringify(bad));
  }
});
