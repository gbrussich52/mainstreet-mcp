#!/usr/bin/env node
import { existsSync, copyFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler, localhostHostValidation, localhostOriginValidation } from '@modelcontextprotocol/node';
import { loadConfigFromFile, ConfigError } from './config/load.js';
import { INDUSTRIES } from './config/schema.js';
import { createServer } from './server.js';

interface ParsedArgs {
  flags: Record<string, string | boolean>;
  positionals: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(arg);
    }
  }
  return { flags, positionals };
}

function printUsage(): void {
  console.error(
    [
      'Usage:',
      '  mainstreet-mcp [--config <path>]                serve over stdio (default)',
      '  mainstreet-mcp serve --http [--port N] [--config <path>]',
      '  mainstreet-mcp validate [--config <path>]',
      '  mainstreet-mcp init --industry <industry> [--out <path>]',
      '',
      `Industries: ${INDUSTRIES.join(', ')}`,
    ].join('\n'),
  );
}

async function runInit(flags: ParsedArgs['flags']): Promise<void> {
  const industry = flags.industry;
  if (typeof industry !== 'string' || !(INDUSTRIES as readonly string[]).includes(industry)) {
    console.error(`--industry is required and must be one of: ${INDUSTRIES.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  // Default to the same filename `serve` and `validate` look for, so `init` then
  // `serve` works with no flags — including from the plugin, whose .mcp.json
  // passes ${CLAUDE_PROJECT_DIR}/business.yaml.
  const out = typeof flags.out === 'string' ? flags.out : 'business.yaml';
  const examplesDir = fileURLToPath(new URL('../examples/', import.meta.url));
  const source = `${examplesDir}${industry}.business.yaml`;
  if (!existsSync(source)) {
    console.error(`No example template bundled for industry "${industry}" (expected ${source}).`);
    process.exitCode = 1;
    return;
  }
  if (existsSync(out)) {
    console.error(`Refusing to overwrite existing file: ${out}`);
    process.exitCode = 1;
    return;
  }
  copyFileSync(source, out);
  console.log(`Wrote ${out} from the "${industry}" template. Edit it, then run: mainstreet-mcp validate${out === 'business.yaml' ? '' : ` --config ${out}`}`);
}

function runValidate(flags: ParsedArgs['flags']): void {
  const configPath = typeof flags.config === 'string' ? flags.config : './business.yaml';
  try {
    const config = loadConfigFromFile(configPath);
    console.log(`OK: ${configPath} is valid (${config.business.name}, industry: ${config.business.industry}).`);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
    } else {
      console.error(`Unexpected error validating ${configPath}: ${(err as Error).message}`);
    }
    process.exitCode = 1;
  }
}

async function runServe(flags: ParsedArgs['flags']): Promise<void> {
  const configPath = typeof flags.config === 'string' ? flags.config : './business.yaml';
  const config = loadConfigFromFile(configPath);

  if (flags.http) {
    const port = typeof flags.port === 'string' ? Number(flags.port) : 3000;
    const mcpHandler = createMcpHandler(() => createServer(config));
    const nodeHandler = toNodeHandler(mcpHandler);
    const validateHost = localhostHostValidation();
    const validateOrigin = localhostOriginValidation();
    const httpServer = createHttpServer((req, res) => {
      if (!validateHost(req, res) || !validateOrigin(req, res)) return;
      void nodeHandler(req, res);
    });
    httpServer.listen(port, '127.0.0.1', () => {
      console.error(`mainstreet-mcp: HTTP (stateless) listening on http://127.0.0.1:${port}`);
    });
    return;
  }

  serveStdio(() => createServer(config));
}

async function main(): Promise<void> {
  const { flags, positionals } = parseArgs(process.argv.slice(2));
  const command = positionals[0];

  if (flags.help || command === 'help') {
    printUsage();
    return;
  }
  if (command === 'init') {
    await runInit(flags);
    return;
  }
  if (command === 'validate') {
    runValidate(flags);
    return;
  }
  if (command === 'serve') {
    await runServe(flags);
    return;
  }
  if (command !== undefined) {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exitCode = 1;
    return;
  }
  // Default: stdio serving, config path from --config or ./business.yaml.
  await runServe(flags);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
