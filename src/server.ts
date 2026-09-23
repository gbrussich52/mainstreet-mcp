import { McpServer } from '@modelcontextprotocol/server';
import type { BusinessConfig } from './config/schema.js';
import { getPreset } from './presets/index.js';
import { registerUniversalTools } from './tools/universal.js';
import { InquirySink } from './inquiries.js';

const UNIVERSAL_INSTRUCTIONS = [
  'This server describes ONE small business via a set of read-mostly tools. Universal tools',
  '(get_business_profile, check_open_status, search_offerings, answer_question, list_staff,',
  'get_booking_options, submit_inquiry) are always available; industry-specific tools depend on',
  'which capabilities this business configured. Never invent facts about the business (hours,',
  'prices, offerings, staff) beyond what these tools return — if a tool says it doesn\'t know,',
  'say so rather than guessing.',
].join(' ');

export function createServer(config: BusinessConfig): McpServer {
  const preset = getPreset(config.business.industry);
  const instructions = `${UNIVERSAL_INSTRUCTIONS}\n\n${preset.instructions}`;

  const server = new McpServer(
    { name: 'mainstreet-mcp', version: '0.1.3', title: `${config.business.name} — Main Street MCP` },
    { capabilities: { tools: {} }, instructions },
  );

  const inquirySink = new InquirySink(config.inquiries, preset.guardHooks);
  registerUniversalTools(server, { config, inquirySink });

  for (const capability of preset.capabilities) {
    const raw = config.capabilities[capability.name];
    if (raw === undefined) continue; // business.yaml didn't turn this capability on
    const capabilityConfig = capability.configSchema.parse(raw);
    capability.register(server, { config, capabilityConfig });
  }

  return server;
}
