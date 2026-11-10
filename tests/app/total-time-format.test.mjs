// Totals of time under water: hours and minutes under 24 h, days and hours from 24 h.
// The interface language is fixed when the i18n module loads, so each language
// runs in its own node process with the language chosen in localStorage.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

const H = 3600;
const seconds = [23 * H + 59 * 60, 24 * H, 24 * H + 59 * 60, 80 * 24 * H + 16 * H + 120, 11 * H + 26 * 60];

function run(lang) {
  const script = `
    globalThis.localStorage = { getItem: () => JSON.stringify({ language: '${lang}' }) };
    const { formatTotalTime } = await import('../../app/src/lib/format.js');
    console.log(JSON.stringify(${JSON.stringify(seconds)}.map((s) => formatTotalTime(s).replace(/\\u00a0/g, ' '))));`;
  const out = execFileSync(process.execPath, ['--import', './register.mjs', '--input-type=module', '-e', script], {
    cwd: new URL('.', import.meta.url),
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

test('totals in French: 23 h 59, exactly 24 h, 24 h 59 (hours rounded down), a large total, 11 h 26', () => {
  assert.deepEqual(run('fr'), ['23 h 59', '1 j 0 h', '1 j 0 h', '80 j 16 h', '11 h 26']);
});

test('totals in English', () => {
  assert.deepEqual(run('en'), ['23:59', '1 d 0 h', '1 d 0 h', '80 d 16 h', '11:26']);
});
