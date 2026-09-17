import { z } from 'zod';
import type { Capability } from './types.js';

const ConfigSchema = z.object({
  disclaimer: z
    .string()
    .default('This is general information about our practice areas, not legal advice. Consult an attorney about your specific situation.'),
});
type Config = z.infer<typeof ConfigSchema>;

const OutputSchema = z.object({
  practice_areas: z.array(
    z.object({ id: z.string(), name: z.string(), description: z.string().optional(), tags: z.array(z.string()) }),
  ),
  disclaimer: z.string(),
});

export const practiceAreasCapability: Capability<Config> = {
  name: 'practice_areas',
  configSchema: ConfigSchema,
  register(server, { config, capabilityConfig }) {
    server.registerTool(
      'list_practice_areas',
      {
        title: 'List Practice Areas',
        description: 'Lists the firm\'s practice areas. Every response must carry the not-legal-advice disclaimer.',
        inputSchema: z.object({}),
        outputSchema: OutputSchema,
        annotations: { title: 'List Practice Areas', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      },
      async () => {
        const practice_areas = config.offerings
          .filter((o) => o.active)
          .map((o) => ({ id: o.id, name: o.name, description: o.description, tags: o.tags }));
        const output = { practice_areas, disclaimer: capabilityConfig.disclaimer };
        return {
          content: [{ type: 'text' as const, text: `${JSON.stringify(output, null, 2)}\n\n${capabilityConfig.disclaimer}` }],
          structuredContent: output,
        };
      },
    );
  },
};
