import type { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { BusinessConfig } from '../config/schema.js';

export interface CapabilityContext<TConfig> {
  config: BusinessConfig;
  capabilityConfig: TConfig;
}

// A capability is a pluggable MCP tool bundle. Presets declare which
// capabilities an industry supports; the server only registers a capability's
// tools when the business.yaml under test actually configures it.
export interface Capability<TConfig = unknown> {
  name: string;
  configSchema: z.ZodType<TConfig>;
  register(server: McpServer, ctx: CapabilityContext<TConfig>): void;
}
