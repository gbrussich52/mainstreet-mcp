import { z } from 'zod';
import { DAY_KEYS } from '../config/schema.js';
import type { Capability } from './types.js';

const ServiceSchema = z.object({
  id: z.string(),
  name: z.string(),
  day: z.enum(DAY_KEYS),
  start_time: z.string(),
  location: z.string().optional(),
  notes: z.string().optional(),
});

const ConfigSchema = z.object({
  services: z.array(ServiceSchema).default([]),
});
type Config = z.infer<typeof ConfigSchema>;

const InputSchema = z.object({
  day: z.enum(DAY_KEYS).optional().describe('Filter to a single day (mon..sun). Omit to return the full week.'),
});

const OutputSchema = z.object({
  services: z.array(ServiceSchema),
});

export const serviceTimesCapability: Capability<Config> = {
  name: 'service_times',
  configSchema: ConfigSchema,
  register(server, { capabilityConfig }) {
    server.registerTool(
      'get_service_times',
      {
        title: 'Get Service Times',
        description: 'Returns worship/service times, optionally filtered to one day of the week.',
        inputSchema: InputSchema,
        outputSchema: OutputSchema,
        annotations: { title: 'Get Service Times', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      async ({ day }) => {
        const services = day ? capabilityConfig.services.filter((s) => s.day === day) : capabilityConfig.services;
        const output = { services };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      },
    );
  },
};
