import { serviceAreaCapability, priceEstimateCapability } from '../capabilities/index.js';
import type { Preset } from './types.js';

export const homeServicesPreset: Preset = {
  industry: 'home-services',
  capabilities: [serviceAreaCapability, priceEstimateCapability],
  instructions: [
    'This is a home services business (e.g. plumbing, HVAC, electrical, landscaping). Always run',
    'check_service_area before implying the business can come to a customer\'s address. Any',
    'price you give MUST come from get_price_estimate and MUST be relayed as an estimate, not a',
    'firm quote — final pricing depends on an on-site assessment.',
  ].join(' '),
};
