import { z } from 'zod';
import type { Capability } from './types.js';

const ConfigSchema = z.object({
  currency: z.string().default('USD'),
  show_prices: z.boolean().default(true),
});
type Config = z.infer<typeof ConfigSchema>;

const OutputSchema = z.object({
  currency: z.string(),
  categories: z.array(
    z.object({
      category: z.string(),
      items: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          description: z.string().optional(),
          price: z.union([z.number(), z.string()]).optional(),
          tags: z.array(z.string()),
        }),
      ),
    }),
  ),
});

export const menuCapability: Capability<Config> = {
  name: 'menu',
  configSchema: ConfigSchema,
  register(server, { config, capabilityConfig }) {
    server.registerTool(
      'get_menu',
      {
        title: 'Get Menu',
        description:
          'Returns the full menu, grouped by category, with prices and dietary/allergen tags. Use this for "what do you serve" style questions instead of guessing.',
        inputSchema: z.object({}),
        outputSchema: OutputSchema,
        annotations: { title: 'Get Menu', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      async () => {
        const active = config.offerings.filter((o) => o.active);
        const byCategory = new Map<string, typeof active>();
        for (const item of active) {
          const cat = item.category ?? 'Menu';
          if (!byCategory.has(cat)) byCategory.set(cat, []);
          byCategory.get(cat)!.push(item);
        }
        const categories = [...byCategory.entries()].map(([category, items]) => ({
          category,
          items: items.map((i) => ({
            id: i.id,
            name: i.name,
            description: i.description,
            price: capabilityConfig.show_prices ? i.price : undefined,
            tags: i.tags,
          })),
        }));
        const output = { currency: capabilityConfig.currency, categories };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      },
    );
  },
};
