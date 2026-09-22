import { existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/server';
import { INDUSTRIES, INDUSTRY_LABELS, type Industry } from './config/schema.js';

/**
 * The server a business gets before it has a business.yaml.
 *
 * The desktop bundle asks the owner for a folder, not a file, because a file
 * picker cannot point at a file that does not exist yet — which left the
 * install dialog with no way out for anyone who had never run the CLI. When
 * the folder has no business.yaml, we serve this instead of failing: it can
 * list the industries and write the starter file into that same folder, so
 * the setting the owner already chose keeps working once they are set up.
 */
export interface SetupServerOptions {
  /** Folder the owner picked. business.yaml goes here. */
  dir: string;
  /** Set when a business.yaml exists but does not parse, so we can explain it. */
  configError?: string;
}

function setupInstructions({ dir, configError }: SetupServerOptions): string {
  const lines = [
    'This business has not been set up yet, so none of the usual tools (hours, services,',
    'prices, staff, booking) exist on this server. Do not answer questions about the',
    'business from memory or guesswork — there is no data to answer them from.',
    '',
    `Setup writes one file: ${join(dir, 'business.yaml')}`,
    '',
    'Walk the owner through it:',
    '1. Ask which of the supported industries fits their business (list_industries).',
    '2. Call create_business_config with that industry. It writes a starter business.yaml',
    '   into the folder above, pre-filled with example content for that industry.',
    '3. Read the file, then interview the owner and replace the example values with their',
    '   real name, hours, services and prices, FAQs, staff, and booking details.',
    '4. Tell them to turn this extension off and on again (or restart the app). The server',
    '   reads business.yaml at startup, so their real tools appear after a reconnect.',
  ];
  if (configError) {
    lines.push(
      '',
      'A business.yaml is already in that folder but it could not be loaded. Show the owner',
      'this error in plain language and offer to fix the file:',
      configError,
    );
  }
  return lines.join('\n');
}

export function createSetupServer(options: SetupServerOptions): McpServer {
  const { dir } = options;

  const server = new McpServer(
    { name: 'mainstreet-mcp', version: '0.1.2', title: 'Main Street MCP — setup needed' },
    { capabilities: { tools: {} }, instructions: setupInstructions(options) },
  );

  server.registerTool(
    'list_industries',
    {
      title: 'List Industries',
      description:
        'Lists the industry starter kits this server can generate. Use this first, then pass the chosen id to create_business_config.',
      inputSchema: z.object({}),
      outputSchema: z.object({
        industries: z.array(z.object({ id: z.string(), description: z.string() })),
      }),
      annotations: {
        title: 'List Industries',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const industries = INDUSTRIES.map((id) => ({ id, description: INDUSTRY_LABELS[id] }));
      return {
        content: [{ type: 'text' as const, text: industries.map((i) => `${i.id} — ${i.description}`).join('\n') }],
        structuredContent: { industries },
      };
    },
  );

  server.registerTool(
    'create_business_config',
    {
      title: 'Create Business Config',
      description:
        "Writes a starter business.yaml for the chosen industry into the folder this server was pointed at. Refuses to overwrite an existing file. After this, edit the file with the owner's real details and have them reconnect the extension.",
      inputSchema: z.object({
        industry: z
          .enum(INDUSTRIES)
          .describe('Industry id from list_industries, e.g. "dental" or "home-services".'),
      }),
      outputSchema: z.object({
        path: z.string(),
        industry: z.string(),
        next_step: z.string(),
      }),
      annotations: {
        title: 'Create Business Config',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ industry }: { industry: Industry }) => {
      const target = join(dir, 'business.yaml');
      if (existsSync(target)) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `${target} already exists. Read and edit that file instead — this tool will not overwrite it.`,
            },
          ],
        };
      }

      const source = fileURLToPath(new URL(`../examples/${industry}.business.yaml`, import.meta.url));
      if (!existsSync(source)) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `No starter template is bundled for industry "${industry}".` }],
        };
      }

      mkdirSync(dir, { recursive: true });
      copyFileSync(source, target);

      const next_step =
        'Read this file, interview the owner, and replace the example values with their real details. Then have them turn the extension off and on again so the business tools load.';
      return {
        content: [{ type: 'text' as const, text: `Wrote ${target} from the "${industry}" starter kit. ${next_step}` }],
        structuredContent: { path: target, industry, next_step },
      };
    },
  );

  return server;
}
