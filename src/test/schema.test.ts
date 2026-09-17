import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BusinessConfigSchema, formatZodError } from '../config/schema.js';
import { loadConfigFromString, ConfigError } from '../config/load.js';

const MINIMAL_VALID = {
  business: { name: 'Test Co', industry: 'restaurant' },
  hours: { timezone: 'America/New_York' },
};

test('BusinessConfigSchema accepts a minimal config and fills in defaults', () => {
  const result = BusinessConfigSchema.safeParse(MINIMAL_VALID);
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.data.offerings, []);
    assert.deepEqual(result.data.faqs, []);
    assert.equal(result.data.inquiries.mode, 'file');
    assert.equal(result.data.booking.methods.length, 0);
  }
});

test('BusinessConfigSchema rejects an unknown industry with a readable message', () => {
  const result = BusinessConfigSchema.safeParse({
    business: { name: 'Test Co', industry: 'spaceship-repair' },
    hours: { timezone: 'America/New_York' },
  });
  assert.equal(result.success, false);
  if (!result.success) {
    const msg = formatZodError(result.error);
    assert.match(msg, /business\.industry/);
  }
});

test('BusinessConfigSchema rejects a bad time-of-day format in schedule', () => {
  const result = BusinessConfigSchema.safeParse({
    ...MINIMAL_VALID,
    hours: { timezone: 'America/New_York', schedule: { mon: [{ open: '9am', close: '17:00' }] } },
  });
  assert.equal(result.success, false);
});

test('InquiriesConfigSchema requires an https webhook_url when mode is webhook', () => {
  const httpResult = BusinessConfigSchema.safeParse({
    ...MINIMAL_VALID,
    inquiries: { mode: 'webhook', webhook_url: 'http://insecure.example/hook' },
  });
  assert.equal(httpResult.success, false);

  const missingUrlResult = BusinessConfigSchema.safeParse({
    ...MINIMAL_VALID,
    inquiries: { mode: 'webhook' },
  });
  assert.equal(missingUrlResult.success, false);

  const httpsResult = BusinessConfigSchema.safeParse({
    ...MINIMAL_VALID,
    inquiries: { mode: 'webhook', webhook_url: 'https://secure.example/hook' },
  });
  assert.equal(httpsResult.success, true);
});

test('loadConfigFromString rejects a capability not available for the configured industry', () => {
  const yaml = [
    'business:',
    '  name: "Test Restaurant"',
    '  industry: restaurant',
    'hours:',
    '  timezone: "America/New_York"',
    'capabilities:',
    '  insurance_accepted:',
    '    accepted_insurers: ["Delta Dental"]',
  ].join('\n');
  assert.throws(() => loadConfigFromString(yaml, 'test.yaml'), (err: unknown) => {
    assert.ok(err instanceof ConfigError);
    assert.match((err as ConfigError).message, /capabilities\.insurance_accepted is not available for industry "restaurant"/);
    return true;
  });
});

test('loadConfigFromString rejects invalid YAML syntax with a readable error', () => {
  const badYaml = 'business:\n  name: "Unterminated\n  industry: [oops\n';
  assert.throws(() => loadConfigFromString(badYaml, 'bad.yaml'), (err: unknown) => {
    assert.ok(err instanceof ConfigError);
    assert.match((err as ConfigError).message, /invalid YAML/);
    return true;
  });
});

test('loadConfigFromString validates a capability config against its own schema', () => {
  const yaml = [
    'business:',
    '  name: "Test Dental"',
    '  industry: dental',
    'hours:',
    '  timezone: "America/New_York"',
    'capabilities:',
    '  insurance_accepted:',
    '    accepted_insurers: "not-an-array"',
  ].join('\n');
  assert.throws(() => loadConfigFromString(yaml, 'test.yaml'), (err: unknown) => {
    assert.ok(err instanceof ConfigError);
    assert.match((err as ConfigError).message, /capabilities\.insurance_accepted is invalid/);
    return true;
  });
});
