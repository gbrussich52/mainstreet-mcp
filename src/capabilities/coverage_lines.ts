import { z } from 'zod';
import type { Capability } from './types.js';

const ConfigSchema = z.object({
  carrier_names: z.array(z.string()).default([]),
});
type Config = z.infer<typeof ConfigSchema>;

const OutputSchema = z.object({
  coverage_lines: z.array(
    z.object({ id: z.string(), name: z.string(), description: z.string().optional(), tags: z.array(z.string()) }),
  ),
  carrier_names: z.array(z.string()),
});

export const coverageLinesCapability: Capability<Config> = {
  name: 'coverage_lines',
  configSchema: ConfigSchema,
  register(server, { config, capabilityConfig }) {
    server.registerTool(
      'list_coverage_lines',
      {
        title: 'List Coverage Lines',
        description: 'Lists the insurance coverage lines this agency writes (e.g. auto, home, life) and the carriers represented.',
        inputSchema: z.object({}),
        outputSchema: OutputSchema,
        annotations: { title: 'List Coverage Lines', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      },
      async () => {
        const coverage_lines = config.offerings
          .filter((o) => o.active)
          .map((o) => ({ id: o.id, name: o.name, description: o.description, tags: o.tags }));
        const output = { coverage_lines, carrier_names: capabilityConfig.carrier_names };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      },
    );
  },
};
