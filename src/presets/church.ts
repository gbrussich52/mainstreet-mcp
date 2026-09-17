import { serviceTimesCapability } from '../capabilities/index.js';
import type { Preset } from './types.js';

export const churchPreset: Preset = {
  industry: 'church',
  capabilities: [serviceTimesCapability],
  instructions: [
    'This is a church or house of worship. get_service_times is the source of truth for worship',
    'times — do not guess a schedule from general knowledge of denominational norms. Keep',
    'answers welcoming and denomination-accurate to what is configured; if asked about beliefs or',
    'doctrine beyond what\'s in faqs/policies, suggest speaking with clergy directly.',
  ].join(' '),
};
