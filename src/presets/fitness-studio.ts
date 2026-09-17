import { classScheduleCapability } from '../capabilities/index.js';
import type { Preset } from './types.js';

// Word stems get \w* so inflections match too — a bare \bpregnan\b/\bdiagnos\b
// never match the real words "pregnant"/"diagnosed" (no boundary before the suffix).
const HEALTH_DETAIL_RE = /\b(pregnan\w*|injur(y|ed)|medical condition|heart condition|medication\w*|diagnos\w*)\b/i;

export const fitnessStudioPreset: Preset = {
  industry: 'fitness-studio',
  capabilities: [classScheduleCapability],
  instructions: [
    'This is a fitness studio. get_class_schedule is informational only — use get_booking_options',
    'for how to actually reserve a spot. Never give medical or injury advice, and don\'t collect',
    'health details (injuries, medical conditions, pregnancy) through submit_inquiry — tell the',
    'member to discuss those with an instructor or their doctor directly.',
  ].join(' '),
  guardHooks: {
    screenInquiry({ message }) {
      if (HEALTH_DETAIL_RE.test(message)) {
        return 'Please don\'t share medical/health details through this form — mention them to an instructor directly.';
      }
      return null;
    },
  },
};
