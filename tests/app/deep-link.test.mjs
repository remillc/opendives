// Deep links: what an address means, the links the app shares, and which shared
// files are imported (app/src/lib/deep-link.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSharedFile, diveLink, importErrorKey, isSubsurfaceXml, parseLink, siteLink } from '../../app/src/lib/deep-link.js';

test('both forms of an address mean the same thing', () => {
  for (const [custom, https] of [
    ['opendives://sites/12', 'https://opendives.app/sites/12'],
    ['opendives://plan/new', 'https://opendives.app/plan/new'],
    ['opendives://tools/', 'https://opendives.app/tools/'],
    ['opendives://dives/at/20121105T101500', 'https://opendives.app/dives/at/20121105T101500'],
  ]) {
    assert.deepEqual(parseLink(custom), parseLink(https), custom);
    assert.notEqual(parseLink(custom).kind, 'unknown', custom);
  }
});

test('a dive is found by its local start time', () => {
  assert.deepEqual(parseLink('https://opendives.app/dives/at/20121105T101500'), { kind: 'dive', stamp: '20121105T101500', date: '2012-11-05T10:15:00' });
  assert.equal(parseLink('https://opendives.app/dives/42').kind, 'unknown');
  assert.equal(parseLink('https://opendives.app/dives/at/2012-11-05').kind, 'unknown');
});

test('the links the app shares come back as the same dive and site', () => {
  const link = diveLink('2012-11-05T10:15:00');
  assert.equal(link, 'https://opendives.app/dives/at/20121105T101500');
  assert.equal(parseLink(link ?? '').kind, 'dive');
  assert.equal(diveLink('garbage'), null);
  assert.deepEqual(parseLink(siteLink(305419896)), { kind: 'site', uuid: 305419896 });
});

test('sites, tools, planner and sections', () => {
  assert.deepEqual(parseLink('opendives://sites/7'), { kind: 'site', uuid: 7 });
  assert.deepEqual(parseLink('opendives://sites/'), { kind: 'route', section: 'sites', path: '/sites/' });
  assert.deepEqual(parseLink('opendives://sites'), { kind: 'route', section: 'sites', path: '/sites/' });
  assert.deepEqual(parseLink('opendives://tools/ead-mod'), { kind: 'route', section: 'tools', path: '/tools/ead-mod' });
  assert.deepEqual(parseLink('opendives://tools/ead-mod/'), { kind: 'route', section: 'tools', path: '/tools/ead-mod' });
  assert.deepEqual(parseLink('opendives://plan/new'), { kind: 'route', section: 'tools', path: '/plan/new' });
  assert.deepEqual(parseLink('opendives:///statistics/?x=1#y'), { kind: 'route', section: 'statistics', path: '/statistics/' });
  assert.deepEqual(parseLink('opendives://'), { kind: 'route', section: 'logbook', path: '/' });
  assert.deepEqual(parseLink('opendives://settings/planner'), { kind: 'route', section: 'account', path: '/settings/planner', over: true });
});

test('only listed screens open: no editor, account or delete', () => {
  for (const path of ['/dives/new', '/sites/new', '/sites/7/edit', '/account/delete', '/account', '/welcome', '/settings/computers/edit', '/download', '/plan/3', '/sites/abc', '/sites/-1'])
    assert.equal(parseLink('opendives:/' + path).kind, 'unknown', path);
});

test('another host, another scheme and http are not ours', () => {
  assert.equal(parseLink('https://example.com/sites/12').kind, 'unknown');
  assert.equal(parseLink('https://opendives.app.evil.com/sites/12').kind, 'unknown');
  assert.equal(parseLink('http://opendives.app/sites/12').kind, 'unknown');
  assert.equal(parseLink('https://user@opendives.app/sites/12').kind, 'unknown');
  assert.equal(parseLink('').kind, 'unknown');
  assert.equal(parseLink(/** @type {any} */ (undefined)).kind, 'unknown');
  assert.equal(parseLink('opendives://sites/%E0%A4%A').kind, 'unknown');
});

test('a file received from another app', () => {
  assert.deepEqual(parseLink('content://com.android.providers.downloads.documents/document/12'), { kind: 'file', uri: 'content://com.android.providers.downloads.documents/document/12' });
  assert.equal(parseLink('file:///var/mobile/Inbox/dives.ssrf').kind, 'file');
});

const SSRF = '<divelog program=\'subsurface\' version=\'3\'>\n<settings/>\n<dives>';

test('Subsurface XML is told by its root element', () => {
  assert.ok(isSubsurfaceXml(SSRF));
  assert.ok(isSubsurfaceXml('﻿<?xml version="1.0"?>\n<!-- <html> -->\n<divelog program="subsurface">'));
  assert.ok(isSubsurfaceXml('<?xml version="1.0"?><dives>'));
  assert.ok(!isSubsurfaceXml('<?xml version="1.0"?><uddf version="3.2.0">'));
  assert.ok(!isSubsurfaceXml('<html><divelog>'));
  assert.ok(!isSubsurfaceXml('Date,Depth\n2012-11-05,20'));
  assert.ok(!isSubsurfaceXml(''));
});

test('a shared file: contents decide, the name only gives the extension', () => {
  assert.deepEqual(checkSharedFile('dives.ssrf', SSRF, 1000), { ok: true, name: 'dives.ssrf' });
  assert.deepEqual(checkSharedFile('Export.XML', SSRF, 1000), { ok: true, name: 'Export.XML' });
  // Opaque or foreign name: the core needs an extension to read the format.
  assert.deepEqual(checkSharedFile('document 12', SSRF, 1000), { ok: true, name: 'document 12.ssrf' });
  assert.deepEqual(checkSharedFile('log.txt', SSRF, 1000), { ok: true, name: 'log.ssrf' });
  assert.deepEqual(checkSharedFile('', SSRF, 1000), { ok: true, name: 'import.ssrf' });
  assert.deepEqual(checkSharedFile('a/b\\c.ssrf', SSRF, 1000), { ok: true, name: 'c.ssrf' });
  // A good name does not save a wrong content.
  assert.deepEqual(checkSharedFile('dives.ssrf', '<html>', 1000), { ok: false, reason: 'NOT_A_LOGBOOK' });
  assert.deepEqual(checkSharedFile('dives.ssrf', SSRF, 0), { ok: false, reason: 'EMPTY' });
  assert.deepEqual(checkSharedFile('dives.ssrf', SSRF, 200 * 1024 * 1024), { ok: false, reason: 'TOO_BIG' });
});

test('import errors keep their message', () => {
  assert.equal(importErrorKey('NO_NEW_DIVES: x'), 'logbook.importNothingNew');
  assert.equal(importErrorKey('NO_DIVES'), 'logbook.importNoDives');
  assert.equal(importErrorKey('WRITE_LOCKED'), 'edit.writeLocked');
  assert.equal(importErrorKey('IMPORT_FAILED'), 'logbook.importFailed');
});
