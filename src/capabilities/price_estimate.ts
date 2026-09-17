import { z } from 'zod';
import type { Capability } from './types.js';

const ConfigSchema = z.object({
  disclaimer: z
    .string()
    .default('This is a rough estimate only, not a quote. Final pricing depends on an in-person assessment.'),
  variance_pct: z.number().min(0).max(1).default(0.2),
});
type Config = z.infer<typeof ConfigSchema>;

const InputSchema = z.object({
  offering_id: z.string().optional().describe('The offerings[].id to estimate, if known.'),
  query: z.string().optional().describe('A free-text description of the job/service if the exact offering id is unknown.'),
});

const OutputSchema = z.object({
  is_estimate: z.literal(true),
  matched_offering_id: z.string().nullable(),
  low: z.number().nullable(),
  high: z.number().nullable(),
  currency: z.string(),
  disclaimer: z.string(),
});

export const priceEstimateCapability: Capability<Config> = {
  name: 'price_estimate',
  configSchema: ConfigSchema,
  register(server, { config, capabilityConfig }) {
    server.registerTool(
      'get_price_estimate',
      {
        title: 'Get Price Estimate',
        description:
          'Returns a ROUGH price range for a service, always flagged is_estimate:true. Never present this as a firm quote — always relay the disclaimer to the end user.',
        inputSchema: InputSchema,
        outputSchema: OutputSchema,
        annotations: { title: 'Get Price Estimate', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      },
      async ({ offering_id, query }) => {
        let match = offering_id ? config.offerings.find((o) => o.id === offering_id) : undefined;
        if (!match && query) {
          const q = query.toLowerCase();
          match = config.offerings.find((o) => o.name.toLowerCase().includes(q) || (o.description ?? '').toLowerCase().includes(q));
        }
        const base = match && typeof match.price === 'number' ? match.price : null;
        const variance = capabilityConfig.variance_pct;
        const output = {
          is_estimate: true as const,
          matched_offering_id: match?.id ?? null,
          low: base !== null ? Math.round(base * (1 - variance) * 100) / 100 : null,
          high: base !== null ? Math.round(base * (1 + variance) * 100) / 100 : null,
          currency: 'USD',
          disclaimer: capabilityConfig.disclaimer,
        };
        const text =
          base !== null
            ? `Estimated range: $${output.low}–$${output.high}. ${capabilityConfig.disclaimer}`
            : `No priced offering matched that request. ${capabilityConfig.disclaimer}`;
        return { content: [{ type: 'text' as const, text }], structuredContent: output };
      },
    );
  },
};
