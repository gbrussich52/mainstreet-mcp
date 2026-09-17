import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getOpenStatus, zonedTimeToUtc } from '../hours.js';
import type { HoursConfig } from '../config/schema.js';

// All timestamps below fall in September 2026 (EDT, UTC-4) — well clear of
// the US DST transition (Nov 1, 2026), so the -04:00 offset is unambiguous.
const BASE: HoursConfig = {
  timezone: 'America/New_York',
  schedule: {
    mon: [{ open: '09:00', close: '17:00' }],
    tue: [{ open: '09:00', close: '17:00' }],
    wed: [{ open: '09:00', close: '17:00' }],
    thu: [{ open: '09:00', close: '17:00' }],
    fri: [{ open: '17:00', close: '02:00' }], // overnight range
    sat: [],
    sun: [],
  },
  exceptions: [],
};

test('open status: inside a normal daytime range', () => {
  // Wed 2026-09-16, 13:00 EDT = 17:00Z
  const status = getOpenStatus(BASE, new Date('2026-09-16T17:00:00Z'));
  assert.equal(status.open, true);
  assert.deepEqual(status.nextChange, { type: 'closes', date: '2026-09-16', time: '17:00' });
});

test('open status: before opening, next change is "opens" today', () => {
  // Wed 2026-09-16, 08:00 EDT = 12:00Z
  const status = getOpenStatus(BASE, new Date('2026-09-16T12:00:00Z'));
  assert.equal(status.open, false);
  assert.deepEqual(status.nextChange, { type: 'opens', date: '2026-09-16', time: '09:00' });
});

test('open status: after closing, next change scans forward to the next open day', () => {
  // Wed 2026-09-16, 18:00 EDT (after 17:00 close) = 22:00Z; next scheduled day is Thu
  const status = getOpenStatus(BASE, new Date('2026-09-16T22:00:00Z'));
  assert.equal(status.open, false);
  assert.deepEqual(status.nextChange, { type: 'opens', date: '2026-09-17', time: '09:00' });
});

test('open status: overnight range is open late Friday night', () => {
  // Fri 2026-09-18, 23:00 EDT = Sat 03:00Z
  const status = getOpenStatus(BASE, new Date('2026-09-19T03:00:00Z'));
  assert.equal(status.open, true);
  assert.equal(status.nextChange?.type, 'closes');
  assert.equal(status.nextChange?.time, '02:00');
});

test('open status: overnight range bleeds into Saturday morning until close', () => {
  // Sat 2026-09-19, 01:00 EDT = 05:00Z — after midnight, still within Friday's overnight range
  const status = getOpenStatus(BASE, new Date('2026-09-19T05:00:00Z'));
  assert.equal(status.open, true);
  assert.deepEqual(status.nextChange, { type: 'closes', date: '2026-09-19', time: '02:00' });
});

test('open status: overnight range has ended by mid-Saturday', () => {
  // Sat 2026-09-19, 10:00 EDT = 14:00Z — well after the 02:00 overnight close, and Saturday has no hours
  const status = getOpenStatus(BASE, new Date('2026-09-19T14:00:00Z'));
  assert.equal(status.open, false);
});

test('open status: date exception marks a normally-open day fully closed', () => {
  const withException: HoursConfig = {
    ...BASE,
    exceptions: [{ date: '2026-09-16', closed: true, note: 'Staff training' }],
  };
  const status = getOpenStatus(withException, new Date('2026-09-16T17:00:00Z'));
  assert.equal(status.open, false);
});

test('open status: date exception overrides with custom ranges', () => {
  const withException: HoursConfig = {
    ...BASE,
    exceptions: [{ date: '2026-09-16', ranges: [{ open: '10:00', close: '12:00' }] }],
  };
  // 11:00 EDT = 15:00Z, inside the exception range but outside the normal 09:00-17:00 schedule check
  const status = getOpenStatus(withException, new Date('2026-09-16T15:00:00Z'));
  assert.equal(status.open, true);
  assert.deepEqual(status.nextChange, { type: 'closes', date: '2026-09-16', time: '12:00' });
});

test('open status: closed all week returns null nextChange after exhausting the forward scan', () => {
  const alwaysClosed: HoursConfig = { timezone: 'America/New_York', schedule: {}, exceptions: [] };
  const status = getOpenStatus(alwaysClosed, new Date('2026-09-16T15:00:00Z'));
  assert.equal(status.open, false);
  assert.equal(status.nextChange, null);
});

test('open status: exposes dayOfWeek so a caller can sanity-check which day was evaluated', () => {
  // Wed 2026-09-16, 13:00 EDT
  const status = getOpenStatus(BASE, new Date('2026-09-16T17:00:00Z'));
  assert.equal(status.dayOfWeek, 'wed');
});

// Regression for a live-model bug report: a restaurant open Sun 10:00-20:00
// America/New_York was asked "open this Sunday (2026-09-20) at 11am?" and the
// tool answered CLOSED / next-opens-Tuesday. getOpenStatus itself was correct
// for every `at` instant it was given (verified below) — the actual defect
// was forcing the caller to do UTC-offset arithmetic to express "11am,
// business's own time", which an LLM gets wrong in ways that produce a
// plausible-looking but silently incorrect instant. zonedTimeToUtc removes
// that arithmetic from the caller entirely.
test('zonedTimeToUtc: 11am America/New_York on 2026-09-20 (Sunday, EDT) converts to 15:00 UTC', () => {
  const utc = zonedTimeToUtc('2026-09-20', '11:00', 'America/New_York');
  assert.equal(utc.toISOString(), '2026-09-20T15:00:00.000Z');
});

test('zonedTimeToUtc round-trips through getOpenStatus to the correct open Sunday result', () => {
  const restaurantHours: HoursConfig = {
    timezone: 'America/New_York',
    schedule: {
      mon: [],
      tue: [{ open: '11:30', close: '21:00' }],
      wed: [{ open: '11:30', close: '21:00' }],
      thu: [{ open: '11:30', close: '21:00' }],
      fri: [{ open: '11:30', close: '22:00' }],
      sat: [{ open: '10:00', close: '22:00' }],
      sun: [{ open: '10:00', close: '20:00' }],
    },
    exceptions: [],
  };
  const at = zonedTimeToUtc('2026-09-20', '11:00', 'America/New_York');
  const status = getOpenStatus(restaurantHours, at);
  assert.equal(status.open, true);
  assert.equal(status.dayOfWeek, 'sun');
  assert.deepEqual(status.nextChange, { type: 'closes', date: '2026-09-20', time: '20:00' });
});

// The naive-but-plausible mistake an LLM makes: treating a local wall-clock
// time as if "Z" (UTC) applied directly, without converting. Documented here
// as the actual mechanism behind the live bug report, not a hypothesis.
test('regression: naively appending Z to a local wall-clock time silently produces the wrong instant', () => {
  const restaurantHours: HoursConfig = {
    timezone: 'America/New_York',
    schedule: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [{ open: '10:00', close: '20:00' }] },
    exceptions: [],
  };
  const naive = getOpenStatus(restaurantHours, new Date('2026-09-20T11:00:00Z')); // wrong: still 07:00 local
  assert.equal(naive.open, false); // looks plausible, but 11am local was intended and should be open
  const correct = getOpenStatus(restaurantHours, zonedTimeToUtc('2026-09-20', '11:00', 'America/New_York'));
  assert.equal(correct.open, true);
});
