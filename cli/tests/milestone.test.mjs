import assert from 'node:assert/strict';
import test from 'node:test';

import {
  milestoneDateRule,
  reminderOffsets,
} from '../src/milestone.mjs';

test('parses one-time and recurring milestone dates', () => {
  assert.deepEqual(milestoneDateRule({ date: '2026-09-12' }), {
    calendar: 'solar',
    year: 2026,
    month: 9,
    day: 12,
    leapDayPolicy: 'feb-28',
  });
  assert.deepEqual(
    milestoneDateRule({
      date: '08-15',
      leapMonth: true,
      lunar: true,
      yearly: true,
    }),
    {
      calendar: 'lunar',
      year: null,
      month: 8,
      day: 15,
      isLeapMonth: true,
      missingLeapMonthPolicy: 'regular-month',
    },
  );
  assert.deepEqual(
    milestoneDateRule({
      date: '2025-02-29',
      leapDayPolicy: 'mar-1',
    }),
    {
      calendar: 'solar',
      year: 2025,
      month: 2,
      day: 29,
      leapDayPolicy: 'mar-1',
    },
  );
});

test('rejects impossible solar dates', () => {
  assert.throws(
    () => milestoneDateRule({ date: '2026-02-31' }),
    /invalid/,
  );
});

test('normalizes reminder offsets', () => {
  assert.deepEqual(reminderOffsets('7,1,1,0'), [0, 1, 7]);
  assert.deepEqual(reminderOffsets(''), []);
  assert.equal(reminderOffsets(undefined), undefined);
  assert.throws(() => reminderOffsets('366'), /day counts/);
});
