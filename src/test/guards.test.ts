import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dentalPreset } from '../presets/dental.js';
import { salonSpaPreset } from '../presets/salon-spa.js';
import { fitnessStudioPreset } from '../presets/fitness-studio.js';
import type { Preset } from '../presets/types.js';

const screen = (p: Preset, message: string) =>
  p.guardHooks?.screenInquiry?.({ topic: 'appointment', message }) ?? null;

// Regression: live Haiku test 2026-09-17 submitted this short message through the dental server.
test('dental rejects short health details (no length threshold)', () => {
  for (const m of [
    "I'm pregnant and have a bad toothache",
    'My gums are bleeding',
    'I think I have an abscess',
    'Tooth pain since Monday',
    'SSN 123-45-6789',
  ]) {
    assert.ok(screen(dentalPreset, m), `should reject: ${m}`);
  }
});

test('dental accepts scheduling/logistics messages', () => {
  for (const m of [
    'Can I book a cleaning next Tuesday afternoon?',
    'Do you have parking near the office?',
    'I need to reschedule my appointment to Friday.',
  ]) {
    assert.equal(screen(dentalPreset, m), null, `should accept: ${m}`);
  }
});

test('salon and fitness reject health details', () => {
  assert.ok(screen(salonSpaPreset, 'I am pregnant, is a massage ok?'));
  assert.ok(screen(salonSpaPreset, 'I have a skin condition'));
  assert.ok(screen(fitnessStudioPreset, 'I injured my knee last week'));
  assert.ok(screen(fitnessStudioPreset, 'I take medication for my heart condition'));
  assert.equal(screen(fitnessStudioPreset, 'Is there a class Saturday morning?'), null);
});
