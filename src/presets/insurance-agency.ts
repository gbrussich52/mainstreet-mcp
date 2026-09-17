import { coverageLinesCapability, serviceAreaCapability } from '../capabilities/index.js';
import type { Preset } from './types.js';

export const insuranceAgencyPreset: Preset = {
  industry: 'insurance-agency',
  capabilities: [coverageLinesCapability, serviceAreaCapability],
  instructions: [
    'This is an independent insurance agency. list_coverage_lines shows the lines this agency',
    'writes and the carriers it represents — never quote a premium or bind coverage through this',
    'server; those require talking to a licensed agent. Direct rate/coverage questions to',
    'get_booking_options or submit_inquiry so an agent can follow up. check_service_area covers',
    'the states/counties this agency is licensed to write policies in.',
  ].join(' '),
};
