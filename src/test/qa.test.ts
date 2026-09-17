import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion } from '../qa.js';
import type { Faq } from '../config/schema.js';

const FAQS: Faq[] = [
  { question: 'What are your hours?', answer: 'We are open daily, see check_open_status for exact times.', tags: ['hours'] },
  { question: 'Do you take reservations?', answer: 'Yes, call ahead for parties of 6 or more.', tags: ['reservations'] },
];

const POLICIES: Record<string, string> = {
  cancellation: 'Please cancel reservations at least 2 hours in advance.',
  private_events: 'We host private events for parties of 20+; contact us for details.',
};

test('answerQuestion: still matches a plain FAQ (no regression)', () => {
  const result = answerQuestion(FAQS, POLICIES, 'what are your hours');
  assert.equal(result.found, true);
  assert.equal(result.matches[0]?.source, 'faq');
  assert.match(result.matches[0]?.answer ?? '', /check_open_status/);
});

// Regression for a live-model bug report: "what's the cancellation policy for
// a party of 8" returned found:false even though policies.cancellation
// exists — answer_question only searched faqs, never policies. The spec
// requires both.
test('answerQuestion: matches a policy by key/content when no FAQ covers it', () => {
  const result = answerQuestion(FAQS, POLICIES, "what's the cancellation policy for a party of 8");
  assert.equal(result.found, true);
  const policyMatch = result.matches.find((m) => m.source === 'policy');
  assert.ok(policyMatch, `expected a policy match, got ${JSON.stringify(result.matches)}`);
  assert.equal(policyMatch?.answer, POLICIES.cancellation);
  assert.match(policyMatch?.question ?? '', /Cancellation/i);
});

test('answerQuestion: returns up to 3 ranked matches instead of only the single best one', () => {
  const manyFaqs: Faq[] = [
    { question: 'Do you offer parking?', answer: 'Yes, free lot parking in the back.', tags: ['parking'] },
    { question: 'Is parking validated?', answer: 'No validation needed, parking is free.', tags: ['parking'] },
    { question: 'Do you have valet parking?', answer: 'No valet, self-park only.', tags: ['parking'] },
    { question: 'Do you deliver?', answer: 'No delivery, pickup and dine-in only.', tags: ['delivery'] },
  ];
  const result = answerQuestion(manyFaqs, {}, 'parking');
  assert.equal(result.found, true);
  assert.ok(result.matches.length > 1, `expected multiple matches, got ${result.matches.length}`);
  assert.ok(result.matches.length <= 3);
  for (let i = 1; i < result.matches.length; i++) {
    assert.ok(result.matches[i - 1].score >= result.matches[i].score, 'matches should be sorted by score descending');
  }
});

test('answerQuestion: found:false when nothing meaningful matches faqs or policies', () => {
  const result = answerQuestion(FAQS, POLICIES, 'do you sell gift cards');
  assert.equal(result.found, false);
  assert.equal(result.matches.length, 0);
  assert.ok(result.message);
});
