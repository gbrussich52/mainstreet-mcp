import { listingsCapability, serviceAreaCapability } from '../capabilities/index.js';
import type { Preset } from './types.js';

export const realEstateAgentPreset: Preset = {
  industry: 'real-estate-agent',
  capabilities: [listingsCapability, serviceAreaCapability],
  instructions: [
    'This is a real estate agent/office. Listing data (price, status, beds/baths) comes only from',
    'search_listings — it may be stale; always relay the tool\'s disclaimer and suggest confirming',
    'current status and price with the agent before a buyer acts on it. Never state a listing is',
    'available if its status field says otherwise. check_service_area covers the towns/zips this',
    'agent actively works, not property location — use it for "do you work in my area" questions.',
  ].join(' '),
};
