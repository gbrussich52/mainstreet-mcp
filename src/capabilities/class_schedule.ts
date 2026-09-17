import { z } from 'zod';
import { DAY_KEYS } from '../config/schema.js';
import type { Capability } from './types.js';

const ClassSchema = z.object({
  id: z.string(),
  name: z.string(),
  day: z.enum(DAY_KEYS),
  start_time: z.string(),
  end_time: z.string(),
  instructor: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  location: z.string().optional(),
});

const ConfigSchema = z.object({
  classes: z.array(ClassSchema).default([]),
});
type Config = z.infer<typeof ConfigSchema>;

const InputSchema = z.object({
  day: z.enum(DAY_KEYS).optional().describe('Filter to a single day (mon..sun). Omit to return the full week.'),
});

const OutputSchema = z.object({
  classes: z.array(ClassSchema),
});

export const classScheduleCapability: Capability<Config> = {
  name: 'class_schedule',
  configSchema: ConfigSchema,
  register(server, { capabilityConfig }) {
    server.registerTool(
      'get_class_schedule',
      {
        title: 'Get Class Schedule',
        description: 'Returns the class/session schedule, optionally filtered to one day of the week.',
        inputSchema: InputSchema,
        outputSchema: OutputSchema,
        annotations: { title: 'Get Class Schedule', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      },
      async ({ day }) => {
        const classes = day ? capabilityConfig.classes.filter((c) => c.day === day) : capabilityConfig.classes;
        const output = { classes };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      },
    );
  },
};
