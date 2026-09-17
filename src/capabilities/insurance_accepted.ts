import { z } from 'zod';
import type { Capability } from './types.js';

const ConfigSchema = z.object({
  accepted_insurers: z.array(z.string()).default([]),
  notes: z.string().optional(),
});
type Config = z.infer<typeof ConfigSchema>;

const InputSchema = z.object({
  insurer: z.string().min(1).describe('The insurance carrier name to check, e.g. "Delta Dental".'),
});

const OutputSchema = z.object({
  accepted: z.boolean(),
  matched_name: z.string().nullable(),
  notes: z.string().optional(),
  accepted_insurers: z.array(z.string()),
});

export const insuranceAcceptedCapability: Capability<Config> = {
  name: 'insurance_accepted',
  configSchema: ConfigSchema,
  register(server, { capabilityConfig }) {
    server.registerTool(
      'check_insurance_accepted',
      {
        title: 'Check Insurance Accepted',
        description: 'Checks whether a named insurance carrier is accepted. Returns the full accepted list for reference.',
        inputSchema: InputSchema,
        outputSchema: OutputSchema,
        annotations: { title: 'Check Insurance Accepted', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      },
      async ({ insurer }) => {
        const q = insurer.trim().toLowerCase();
        const match = capabilityConfig.accepted_insurers.find((i) => i.toLowerCase() === q || i.toLowerCase().includes(q));
        const output = {
          accepted: Boolean(match),
          matched_name: match ?? null,
          notes: capabilityConfig.notes,
          accepted_insurers: capabilityConfig.accepted_insurers,
        };
        return {
          content: [
            {
              type: 'text' as const,
              text: match
                ? `Yes, ${match} is accepted.`
                : `${insurer} was not found on the accepted list. Recommend the patient/client call to confirm — carrier names and plan tiers vary.`,
            },
          ],
          structuredContent: output,
        };
      },
    );
  },
};
