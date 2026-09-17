import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import { InquirySink } from '../inquiries.js';
import { dentalPreset } from '../presets/dental.js';
import { lawFirmPreset } from '../presets/law-firm.js';
import { salonSpaPreset } from '../presets/salon-spa.js';
import { fitnessStudioPreset } from '../presets/fitness-studio.js';
import type { InquiriesConfig } from '../config/schema.js';

function fileConfig(path: string): InquiriesConfig {
  return { mode: 'file', file_path: path, rate_limit_per_minute: 5 };
}

test('InquirySink: accepts a clean message and appends a JSONL record to disk', async () => {
  const path = `${process.env.TMPDIR ?? '/tmp'}/mainstreet-test-inquiries-${Date.now()}.jsonl`;
  try {
    const sink = new InquirySink(fileConfig(path));
    const result = await sink.submit({ name: 'Alex', message: 'What are your holiday hours?' });
    assert.equal(result.accepted, true);
    assert.ok(result.id);
    const lines = readFileSync(path, 'utf-8').trim().split('\n');
    assert.equal(lines.length, 1);
    const record = JSON.parse(lines[0]);
    assert.equal(record.name, 'Alex');
    assert.equal(record.message, 'What are your holiday hours?');
  } finally {
    if (existsSync(path)) rmSync(path);
  }
});

test('InquirySink: rejects an empty message without writing anything', async () => {
  const path = `${process.env.TMPDIR ?? '/tmp'}/mainstreet-test-inquiries-${Date.now()}-empty.jsonl`;
  const sink = new InquirySink(fileConfig(path));
  const result = await sink.submit({ message: '   ' });
  assert.equal(result.accepted, false);
  assert.ok(!existsSync(path));
});

test('InquirySink: strips HTML tags and control characters, truncates long fields', async () => {
  const path = `${process.env.TMPDIR ?? '/tmp'}/mainstreet-test-inquiries-${Date.now()}-sanitize.jsonl`;
  try {
    const sink = new InquirySink(fileConfig(path));
    const longMessage = 'x'.repeat(5000);
    const result = await sink.submit({ name: '<b>Bob</b>', message: `<script>evil()</script>${longMessage}` });
    assert.equal(result.accepted, true);
    const record = JSON.parse(readFileSync(path, 'utf-8').trim());
    assert.equal(record.name, 'Bob');
    assert.ok(!record.message.includes('<script>'));
    assert.ok(record.message.length <= 4000);
  } finally {
    if (existsSync(path)) rmSync(path);
  }
});

test('InquirySink: rate limiter rejects beyond the configured per-minute cap', async () => {
  const path = `${process.env.TMPDIR ?? '/tmp'}/mainstreet-test-inquiries-${Date.now()}-ratelimit.jsonl`;
  try {
    const sink = new InquirySink({ mode: 'file', file_path: path, rate_limit_per_minute: 2 });
    const r1 = await sink.submit({ message: 'first' });
    const r2 = await sink.submit({ message: 'second' });
    const r3 = await sink.submit({ message: 'third' });
    assert.equal(r1.accepted, true);
    assert.equal(r2.accepted, true);
    assert.equal(r3.accepted, false);
    assert.match(r3.reason ?? '', /Rate limit/);
  } finally {
    if (existsSync(path)) rmSync(path);
  }
});

test('dental guardHooks: rejects a message containing an SSN pattern', async () => {
  const path = `${process.env.TMPDIR ?? '/tmp'}/mainstreet-test-inquiries-${Date.now()}-dental-ssn.jsonl`;
  const sink = new InquirySink(fileConfig(path), dentalPreset.guardHooks);
  const result = await sink.submit({ message: 'My SSN is 123-45-6789, please update my file.' });
  assert.equal(result.accepted, false);
  assert.match(result.reason ?? '', /Social Security/);
  assert.ok(!existsSync(path));
});

test('dental guardHooks: rejects a long clinical-detail message but allows a short logistics one', async () => {
  const path = `${process.env.TMPDIR ?? '/tmp'}/mainstreet-test-inquiries-${Date.now()}-dental-clinical.jsonl`;
  try {
    const sink = new InquirySink(fileConfig(path), dentalPreset.guardHooks);
    const longClinical = `I have a bad infection and need medication. ${'Please help me. '.repeat(15)}`;
    const rejected = await sink.submit({ message: longClinical });
    assert.equal(rejected.accepted, false);

    const shortLogistics = await sink.submit({ message: 'Can I reschedule my Thursday cleaning appointment?' });
    assert.equal(shortLogistics.accepted, true);
  } finally {
    if (existsSync(path)) rmSync(path);
  }
});

test('law-firm guardHooks: rejects a message over the one-line cap or containing a newline', async () => {
  const path = `${process.env.TMPDIR ?? '/tmp'}/mainstreet-test-inquiries-${Date.now()}-lawfirm.jsonl`;
  try {
    const sink = new InquirySink(fileConfig(path), lawFirmPreset.guardHooks);
    const tooLong = await sink.submit({ message: 'x'.repeat(281) });
    assert.equal(tooLong.accepted, false);

    const multiline = await sink.submit({ message: 'line one\nline two' });
    assert.equal(multiline.accepted, false);

    const oneLine = await sink.submit({ message: 'landlord dispute' });
    assert.equal(oneLine.accepted, true);
  } finally {
    if (existsSync(path)) rmSync(path);
  }
});

test('salon-spa guardHooks: rejects health/medical detail keywords', async () => {
  const path = `${process.env.TMPDIR ?? '/tmp'}/mainstreet-test-inquiries-${Date.now()}-salon.jsonl`;
  try {
    const sink = new InquirySink(fileConfig(path), salonSpaPreset.guardHooks);
    const rejected = await sink.submit({ message: 'I am pregnant, is the facial still safe?' });
    assert.equal(rejected.accepted, false);

    const allowed = await sink.submit({ message: 'Can I move my Friday appointment to Saturday?' });
    assert.equal(allowed.accepted, true);
  } finally {
    if (existsSync(path)) rmSync(path);
  }
});

test('fitness-studio guardHooks: rejects health/medical detail keywords', async () => {
  const path = `${process.env.TMPDIR ?? '/tmp'}/mainstreet-test-inquiries-${Date.now()}-fitness.jsonl`;
  try {
    const sink = new InquirySink(fileConfig(path), fitnessStudioPreset.guardHooks);
    const rejected = await sink.submit({ message: 'I have a heart condition, is HIIT class safe for me?' });
    assert.equal(rejected.accepted, false);

    const allowed = await sink.submit({ message: 'What time does the 6am class start?' });
    assert.equal(allowed.accepted, true);
  } finally {
    if (existsSync(path)) rmSync(path);
  }
});
