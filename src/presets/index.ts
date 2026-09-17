import type { Industry } from '../config/schema.js';
import type { Preset } from './types.js';
import { restaurantPreset } from './restaurant.js';
import { dentalPreset } from './dental.js';
import { lawFirmPreset } from './law-firm.js';
import { homeServicesPreset } from './home-services.js';
import { salonSpaPreset } from './salon-spa.js';
import { fitnessStudioPreset } from './fitness-studio.js';
import { realEstateAgentPreset } from './real-estate-agent.js';
import { autoRepairPreset } from './auto-repair.js';
import { insuranceAgencyPreset } from './insurance-agency.js';
import { churchPreset } from './church.js';

const REGISTRY: Record<Industry, Preset> = {
  restaurant: restaurantPreset,
  dental: dentalPreset,
  'law-firm': lawFirmPreset,
  'home-services': homeServicesPreset,
  'salon-spa': salonSpaPreset,
  'fitness-studio': fitnessStudioPreset,
  'real-estate-agent': realEstateAgentPreset,
  'auto-repair': autoRepairPreset,
  'insurance-agency': insuranceAgencyPreset,
  church: churchPreset,
};

export function getPreset(industry: Industry): Preset {
  const preset = REGISTRY[industry];
  if (!preset) throw new Error(`No preset registered for industry "${industry}"`);
  return preset;
}

export function listPresets(): Preset[] {
  return Object.values(REGISTRY);
}
