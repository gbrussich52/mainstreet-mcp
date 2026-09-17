import { classScheduleCapability, priceEstimateCapability } from '../capabilities/index.js';
import type { Preset } from './types.js';

// Word stems get \w* so inflections match too — a bare \bpregnan\b never
// matches the real word "pregnant" (no boundary between "pregnan" and "t").
const HEALTH_DETAIL_RE = /\b(pregnan\w*|allerg(y|ic)|medical condition|injur\w*|skin condition|medication\w*)\b/i;

export const salonSpaPreset: Preset = {
  industry: 'salon-spa',
  capabilities: [priceEstimateCapability, classScheduleCapability],
  instructions: [
    'This is a salon/spa. get_class_schedule lists sessions (classes, group appointments); it is',
    'not a booking system — use get_booking_options to tell the customer how to actually book.',
    'get_price_estimate is always a rough range (is_estimate:true) — relay the disclaimer, never',
    'present it as a firm quote. Do not collect health/medical details (allergies, skin',
    'conditions, pregnancy, medications) through submit_inquiry — tell the customer to share',
    'those with staff directly at booking or check-in so they can be handled appropriately in',
    'person.',
  ].join(' '),
  guardHooks: {
    screenInquiry({ message }) {
      if (HEALTH_DETAIL_RE.test(message)) {
        return 'Please don\'t share health/medical details through this form — mention them to staff directly when you book or check in.';
      }
      return null;
    },
  },
};
