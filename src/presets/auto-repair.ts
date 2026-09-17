import { serviceAreaCapability, priceEstimateCapability, insuranceAcceptedCapability } from '../capabilities/index.js';
import type { Preset } from './types.js';

export const autoRepairPreset: Preset = {
  industry: 'auto-repair',
  capabilities: [serviceAreaCapability, priceEstimateCapability, insuranceAcceptedCapability],
  instructions: [
    'This is an auto repair shop. check_service_area covers mobile/tow service range if',
    'configured. Any price MUST come from get_price_estimate and be relayed as an estimate — real',
    'repair costs depend on diagnosis. check_insurance_accepted here refers to auto insurance',
    'carriers this shop works with for collision/claims work, not health insurance.',
  ].join(' '),
};
