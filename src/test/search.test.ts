import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, search } from '../search.js';

test('tokenize lowercases, strips punctuation, and drops stopwords', () => {
  assert.deepEqual(tokenize('Do you have Gluten-Free options?'), ['gluten', 'free', 'options']);
});

test('search: exact token match ranks above partial/substring-only match', () => {
  const items = [
    { text: 'Herb-Roasted Chicken with seasonal vegetables' },
    { text: 'Wild Mushroom Risotto' },
  ];
  const results = search(items, 'chicken', 10);
  assert.equal(results.length, 1);
  assert.equal(results[0].item.text, 'Herb-Roasted Chicken with seasonal vegetables');
  assert.ok(results[0].score >= 3);
});

test('search: whole-query substring gets a bonus on top of token score', () => {
  const items = [{ text: 'Deep Tissue Massage, 60 minutes' }];
  const results = search(items, 'deep tissue', 10);
  assert.equal(results.length, 1);
  // 2 exact tokens (3+3) + whole-query substring bonus (2) = 8
  assert.equal(results[0].score, 8);
});

test('search: no query tokens (all stopwords) returns items unscored, in original order', () => {
  const items = [{ text: 'Alpha' }, { text: 'Beta' }];
  const results = search(items, 'the a', 10);
  assert.deepEqual(results.map((r) => r.item.text), ['Alpha', 'Beta']);
  assert.ok(results.every((r) => r.score === 0));
});

test('search: respects the limit', () => {
  const items = Array.from({ length: 5 }, (_, i) => ({ text: `widget ${i}` }));
  const results = search(items, 'widget', 2);
  assert.equal(results.length, 2);
});

test('search: no match returns empty', () => {
  const items = [{ text: 'Oil Change' }];
  const results = search(items, 'zzz-nonexistent-term', 10);
  assert.equal(results.length, 0);
});
