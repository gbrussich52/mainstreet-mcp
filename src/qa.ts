// Pure question-answering logic behind the answer_question tool, split out
// so it's testable without spinning up an MCP server. Searches BOTH faqs and
// policies — a "what's your cancellation policy" question is exactly as
// likely to be answered by `policies.cancellation` as by an FAQ entry, and
// treating policies as a second-class source (or not searching them at all)
// produces false found:false answers.
import { search, type Searchable } from './search.js';
import type { Faq } from './config/schema.js';

export interface QaMatch {
  source: 'faq' | 'policy';
  question: string;
  answer: string;
  score: number;
}

export interface QaResult {
  found: boolean;
  matches: QaMatch[];
  message?: string;
}

interface QaItem extends Searchable {
  source: 'faq' | 'policy';
  question: string;
  answer: string;
}

// "cancellation" -> "Cancellation", "new_patient_forms" -> "New patient forms" —
// a readable label for a policy key, since policies are configured as a flat
// key/value map rather than a question/answer pair like faqs.
function labelizePolicyKey(key: string): string {
  const words = key.split(/[_-]+/).filter(Boolean);
  if (words.length === 0) return key;
  return [words[0].charAt(0).toUpperCase() + words[0].slice(1), ...words.slice(1)].join(' ');
}

export function answerQuestion(faqs: Faq[], policies: Record<string, string>, question: string, limit = 3): QaResult {
  const faqItems: QaItem[] = faqs.map((f) => ({
    source: 'faq',
    question: f.question,
    answer: f.answer,
    text: `${f.question} ${f.answer} ${f.tags.join(' ')}`,
  }));
  const policyItems: QaItem[] = Object.entries(policies).map(([key, value]) => {
    const label = labelizePolicyKey(key);
    return { source: 'policy', question: label, answer: value, text: `${label} ${key} ${value}` };
  });

  // Recall over precision (see search.ts): return every reasonably-scored
  // match up to `limit`, not just the single best one, so the calling
  // assistant — which can't scroll a results list — can pick the right one
  // itself rather than being handed only whichever scored a hair higher.
  const scored = search([...faqItems, ...policyItems], question, limit);
  if (scored.length === 0) {
    return {
      found: false,
      matches: [],
      message: "No confident match in the configured FAQs or policies. Do not guess — tell the user you don't have that information and suggest they contact the business directly.",
    };
  }
  const matches = scored.map(({ item, score }) => ({ source: item.source, question: item.question, answer: item.answer, score }));
  return { found: true, matches };
}
