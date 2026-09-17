import { insuranceAcceptedCapability, priceEstimateCapability } from '../capabilities/index.js';
import type { Preset } from './types.js';

const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/;
// Word stems get \w* so inflections match too — a bare \bdiagnos\b/\bsymptom\b
// never match the real words "diagnosed"/"symptoms" (no boundary before the suffix).
// Any health detail next to a name/contact is PHI, so there is no length threshold — a
// short "I'm pregnant and my tooth hurts" leaked through the old >200-char rule (live test 2026-09-17).
const HEALTH_DETAIL_RE = /\b(diagnos\w*|symptom\w*|medication\w*|medicine\w*|prescription\w*|x-?rays?|infect\w*|allerg(y|ic|ies)|medical (history|condition\w*)|pregnan\w*|toothache\w*|pain\w*|hurt\w*|ach(e|es|ing)|bleed\w*|swell\w*|swollen|abscess\w*|fever\w*|diabet\w*|cancer|heart condition|blood pressure|surgery|chipped|cracked|broken tooth)\b/i;

export const dentalPreset: Preset = {
  industry: 'dental',
  capabilities: [insuranceAcceptedCapability, priceEstimateCapability],
  instructions: [
    'This is a dental practice. Never ask patients for protected health information (PHI) —',
    'symptoms, diagnoses, medical history, SSNs — through this server. submit_inquiry is for',
    'scheduling, insurance, and logistics questions only; for anything clinical, tell the patient',
    'to call the office directly. check_insurance_accepted reflects only the configured carrier',
    'list — if a carrier is not on it, say you are not sure rather than declining on the patient\'s',
    'behalf, and suggest they call to confirm plan-level details. get_price_estimate is always a',
    'rough range (is_estimate:true) — final cost depends on the in-person exam and the patient\'s',
    'insurance, and the tool\'s disclaimer says so; never present it as a firm quote.',
  ].join(' '),
  guardHooks: {
    screenInquiry({ message }) {
      if (SSN_RE.test(message)) {
        return 'This message appears to contain a Social Security Number. For privacy, please call the office instead of submitting that here.';
      }
      if (HEALTH_DETAIL_RE.test(message)) {
        return 'This message looks like it includes health details. For privacy, please call the office directly for anything medical (including dental pain or emergencies) — this form is for scheduling, insurance, and logistics only.';
      }
      return null;
    },
  },
};
