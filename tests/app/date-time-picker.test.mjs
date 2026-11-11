// Material 3 date and time pickers: month grid, week start, typed date, 12/24 h, dial geometry.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  daysInMonth, weekday, weekStart, monthGrid, weekdayOrder, addMonths, addDays, dateInputPattern, formatDateInput,
  parseDateInput, to12Hour, to24Hour, pointAngle, dialValue, valueAngle, isInnerHour, parseHour, parseMinute, localeUses12Hour,
} from '../../app/src/lib/date-time-picker.js';

test('days in month, leap years', () => {
  assert.equal(daysInMonth(2024, 1), 29);
  assert.equal(daysInMonth(2026, 1), 28);
  assert.equal(daysInMonth(2026, 10), 30);
  assert.equal(daysInMonth(2026, 11), 31);
});

test('week start by locale', () => {
  assert.equal(weekStart('en-US'), 0);
  assert.equal(weekStart('fr-FR'), 1);
  assert.equal(weekStart('de-DE'), 1);
  assert.deepEqual(weekdayOrder(1), [1, 2, 3, 4, 5, 6, 0]);
});

test('month grid: leading days and rows of 7', () => {
  // November 2026 starts on a Sunday.
  assert.equal(weekday(2026, 10, 1), 0);
  const monday = monthGrid(2026, 10, 1);
  assert.deepEqual(monday[0], [null, null, null, null, null, null, 1]);
  const sunday = monthGrid(2026, 10, 0);
  assert.deepEqual(sunday[0], [1, 2, 3, 4, 5, 6, 7]);
  assert.ok(monday.every((r) => r.length === 7));
  assert.equal(monday.flat().filter((d) => d !== null).length, 30);
  assert.equal(monday.flat().filter((d) => d !== null).at(-1), 30);
  // February 2027 starts on a Monday: no leading cell, four full rows.
  const feb = monthGrid(2027, 1, 1);
  assert.equal(feb.length, 4);
  assert.equal(feb[0][0], 1);
});

test('month and day arithmetic', () => {
  assert.deepEqual(addMonths(2026, 11, 1), { year: 2027, month: 0 });
  assert.deepEqual(addMonths(2026, 0, -1), { year: 2025, month: 11 });
  assert.deepEqual(addMonths(2026, 5, -17), { year: 2025, month: 0 });
  assert.deepEqual(addDays(2026, 10, 30, 1), { year: 2026, month: 11, day: 1 });
  assert.deepEqual(addDays(2026, 0, 1, -1), { year: 2025, month: 11, day: 31 });
  assert.deepEqual(addDays(2026, 10, 5, 7), { year: 2026, month: 10, day: 12 });
});

test('typed date in the device format', () => {
  assert.deepEqual(dateInputPattern('fr-FR').order, ['d', 'm', 'y']);
  assert.deepEqual(dateInputPattern('en-US').order, ['m', 'd', 'y']);
  assert.equal(formatDateInput({ year: 2026, month: 10, day: 5 }, 'fr-FR'), '05/11/2026');
  assert.equal(formatDateInput({ year: 2026, month: 10, day: 5 }, 'en-US'), '11/05/2026');
  assert.deepEqual(parseDateInput('05/11/2026', 'fr-FR', 1950, 2030), { year: 2026, month: 10, day: 5 });
  assert.deepEqual(parseDateInput('11/05/2026', 'en-US', 1950, 2030), { year: 2026, month: 10, day: 5 });
  assert.deepEqual(parseDateInput('5.11.2026', 'fr-FR', 1950, 2030), { year: 2026, month: 10, day: 5 });
  assert.equal(parseDateInput('31/11/2026', 'fr-FR', 1950, 2030), null);
  assert.equal(parseDateInput('29/02/2025', 'fr-FR', 1950, 2030), null);
  assert.deepEqual(parseDateInput('29/02/2024', 'fr-FR', 1950, 2030), { year: 2024, month: 1, day: 29 });
  assert.equal(parseDateInput('05/11/26', 'fr-FR', 1950, 2030), null);
  assert.equal(parseDateInput('05/11/2031', 'fr-FR', 1950, 2030), null);
  assert.equal(parseDateInput('', 'fr-FR', 1950, 2030), null);
  assert.equal(parseDateInput('05/11', 'fr-FR', 1950, 2030), null);
});

test('12 and 24 hour conversion', () => {
  assert.deepEqual(to12Hour(0), { hour: 12, pm: false });
  assert.deepEqual(to12Hour(12), { hour: 12, pm: true });
  assert.deepEqual(to12Hour(13), { hour: 1, pm: true });
  assert.deepEqual(to12Hour(23), { hour: 11, pm: true });
  assert.equal(to24Hour(12, false), 0);
  assert.equal(to24Hour(12, true), 12);
  assert.equal(to24Hour(1, true), 13);
  assert.equal(to24Hour(11, false), 11);
  for (let h = 0; h < 24; h++) assert.equal(to24Hour(to12Hour(h).hour, to12Hour(h).pm), h);
  assert.equal(localeUses12Hour('en-US'), true);
  assert.equal(localeUses12Hour('fr-FR'), false);
});

test('dial: angle of a point', () => {
  assert.equal(pointAngle(0, -10), 0);
  assert.equal(pointAngle(10, 0), 90);
  assert.equal(pointAngle(0, 10), 180);
  assert.equal(pointAngle(-10, 0), 270);
});

test('dial: values from angles', () => {
  assert.equal(dialValue('minute', 0), 0);
  assert.equal(dialValue('minute', 90), 15);
  assert.equal(dialValue('minute', 93), 16); // step 1: 93 / 6 = 15.5 rounds up
  assert.equal(dialValue('minute', 359), 0);
  assert.equal(dialValue('hour', 0), 12);
  assert.equal(dialValue('hour', 90), 3);
  assert.equal(dialValue('hour', 14), 12);
  assert.equal(dialValue('hour', 16), 1);
  assert.equal(dialValue('hour', 0, { twentyFour: true, inner: true }), 0);
  assert.equal(dialValue('hour', 0, { twentyFour: true }), 12);
  assert.equal(dialValue('hour', 30, { twentyFour: true, inner: true }), 13);
  assert.equal(dialValue('hour', 330, { twentyFour: true, inner: true }), 23);
  assert.equal(dialValue('hour', 330, { twentyFour: true }), 11);
});

test('dial: angle of a value and round trip', () => {
  assert.equal(valueAngle('minute', 15), 90);
  assert.equal(valueAngle('hour', 3), 90);
  assert.equal(valueAngle('hour', 15), 90);
  assert.equal(valueAngle('hour', 12), 0);
  for (let m = 0; m < 60; m++) assert.equal(dialValue('minute', valueAngle('minute', m)), m);
  for (let h = 0; h < 24; h++) assert.equal(dialValue('hour', valueAngle('hour', h), { twentyFour: true, inner: isInnerHour(h) }), h);
  assert.equal(isInnerHour(0), true);
  assert.equal(isInnerHour(12), false);
  assert.equal(isInnerHour(13), true);
});

test('typed hours and minutes', () => {
  assert.equal(parseHour('0', false), 0);
  assert.equal(parseHour('23', false), 23);
  assert.equal(parseHour('24', false), null);
  assert.equal(parseHour('0', true), null);
  assert.equal(parseHour('12', true), 12);
  assert.equal(parseHour('13', true), null);
  assert.equal(parseHour('', false), null);
  assert.equal(parseHour('ab', false), null);
  assert.equal(parseMinute('59'), 59);
  assert.equal(parseMinute('60'), null);
  assert.equal(parseMinute('5'), 5);
});
