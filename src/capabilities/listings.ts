import { z } from 'zod';
import { search } from '../search.js';
import type { Capability } from './types.js';

const ConfigSchema = z.object({
  mls_disclaimer: z.string().default('Listing data may not reflect the current status; confirm with an agent.'),
});
type Config = z.infer<typeof ConfigSchema>;

const InputSchema = z.object({
  query: z.string().optional().describe('Free-text search, e.g. "3 bed downtown condo".'),
  max_price: z.number().optional(),
  min_beds: z.number().optional(),
  status: z.string().optional().describe('e.g. "active", "pending", "sold" — matched against the listing\'s status field.'),
});

const ListingSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  price: z.union([z.number(), z.string()]).optional(),
  address: z.string().optional(),
  beds: z.number().optional(),
  baths: z.number().optional(),
  sqft: z.number().optional(),
  status: z.string().optional(),
});

const OutputSchema = z.object({
  listings: z.array(ListingSchema),
  disclaimer: z.string(),
});

export const listingsCapability: Capability<Config> = {
  name: 'listings',
  configSchema: ConfigSchema,
  register(server, { config, capabilityConfig }) {
    server.registerTool(
      'search_listings',
      {
        title: 'Search Listings',
        description: 'Searches property listings by free text, price, beds, and status.',
        inputSchema: InputSchema,
        outputSchema: OutputSchema,
        annotations: { title: 'Search Listings', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      async ({ query, max_price, min_beds, status }) => {
        let pool = config.offerings.filter((o) => o.active);
        if (max_price !== undefined) pool = pool.filter((o) => typeof o.price === 'number' && o.price <= max_price);
        if (min_beds !== undefined) pool = pool.filter((o) => typeof o.beds === 'number' && (o.beds as number) >= min_beds);
        if (status) pool = pool.filter((o) => typeof o.status === 'string' && (o.status as string).toLowerCase() === status.toLowerCase());

        const items = query
          ? search(
              pool.map((o) => ({ ...o, text: `${o.name} ${o.description ?? ''} ${o.tags.join(' ')}` })),
              query,
              20,
            ).map((r) => r.item)
          : pool;

        const listings = items.map((i) => {
          // `search()`'s generic result type doesn't carry the offering's
          // catchall index signature through, so read extra fields via a
          // loosely-typed view rather than direct property access.
          const extra = i as unknown as Record<string, unknown>;
          return {
            id: i.id,
            name: i.name,
            description: i.description,
            price: i.price,
            address: typeof extra.address === 'string' ? extra.address : undefined,
            beds: typeof extra.beds === 'number' ? extra.beds : undefined,
            baths: typeof extra.baths === 'number' ? extra.baths : undefined,
            sqft: typeof extra.sqft === 'number' ? extra.sqft : undefined,
            status: typeof extra.status === 'string' ? extra.status : undefined,
          };
        });
        const output = { listings, disclaimer: capabilityConfig.mls_disclaimer };
        return {
          content: [{ type: 'text' as const, text: `${listings.length} listing(s) found. ${capabilityConfig.mls_disclaimer}` }],
          structuredContent: output,
        };
      },
    );
  },
};
