import { z } from 'zod';
import type { Capability } from './types.js';

const ConfigSchema = z.object({
  zip_codes: z.array(z.string()).default([]),
  cities: z.array(z.string()).default([]),
  radius_miles: z.number().positive().optional(),
  base_location: z.string().optional(),
  notes: z.string().optional(),
});
type Config = z.infer<typeof ConfigSchema>;

const InputSchema = z.object({
  location: z.string().min(1).describe('A zip code or city/town name to check.'),
});

const OutputSchema = z.object({
  served: z.boolean(),
  matched_on: z.enum(['zip', 'city', 'unknown']),
  base_location: z.string().optional(),
  radius_miles: z.number().optional(),
  notes: z.string().optional(),
});

export const serviceAreaCapability: Capability<Config> = {
  name: 'service_area',
  configSchema: ConfigSchema,
  register(server, { capabilityConfig }) {
    server.registerTool(
      'check_service_area',
      {
        title: 'Check Service Area',
        description:
          'Checks whether a zip code or city is within this business\'s service area. Use before promising on-site service.',
        inputSchema: InputSchema,
        outputSchema: OutputSchema,
        annotations: { title: 'Check Service Area', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      },
      async ({ location }) => {
        const trimmed = location.trim();
        const isZip = /^\d{5}(-\d{4})?$/.test(trimmed);
        let served = false;
        let matchedOn: 'zip' | 'city' | 'unknown' = 'unknown';
        if (isZip) {
          const zip5 = trimmed.slice(0, 5);
          served = capabilityConfig.zip_codes.some((z) => z.slice(0, 5) === zip5);
          matchedOn = 'zip';
        } else {
          served = capabilityConfig.cities.some((c) => c.toLowerCase() === trimmed.toLowerCase());
          matchedOn = 'city';
        }
        const output = {
          served,
          matched_on: matchedOn,
          base_location: capabilityConfig.base_location,
          radius_miles: capabilityConfig.radius_miles,
          notes: capabilityConfig.notes,
        };
        return {
          content: [
            {
              type: 'text' as const,
              text: served
                ? `Yes, ${trimmed} is within the service area.`
                : `${trimmed} was not found in the configured service area (${matchedOn} match). Confirm with staff before ruling it out.`,
            },
          ],
          structuredContent: output,
        };
      },
    );
  },
};
