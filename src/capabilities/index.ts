import { menuCapability } from './menu.js';
import { serviceAreaCapability } from './service_area.js';
import { priceEstimateCapability } from './price_estimate.js';
import { classScheduleCapability } from './class_schedule.js';
import { listingsCapability } from './listings.js';
import { insuranceAcceptedCapability } from './insurance_accepted.js';
import { practiceAreasCapability } from './practice_areas.js';
import { coverageLinesCapability } from './coverage_lines.js';
import { serviceTimesCapability } from './service_times.js';
import type { Capability } from './types.js';

export const ALL_CAPABILITIES: Capability[] = [
  menuCapability,
  serviceAreaCapability,
  priceEstimateCapability,
  classScheduleCapability,
  listingsCapability,
  insuranceAcceptedCapability,
  practiceAreasCapability,
  coverageLinesCapability,
  serviceTimesCapability,
];

export {
  menuCapability,
  serviceAreaCapability,
  priceEstimateCapability,
  classScheduleCapability,
  listingsCapability,
  insuranceAcceptedCapability,
  practiceAreasCapability,
  coverageLinesCapability,
  serviceTimesCapability,
};
export type { Capability } from './types.js';
