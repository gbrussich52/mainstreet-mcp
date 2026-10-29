// Discover both delivery modes over real MCP stdio without submitting an inquiry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

for (const mode of ['file', 'webhook'] as const) {
  test(`submit_inquiry: ${mode} sink advertises its outbound capability over stdio`, { timeout: 15000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mainstreet-annotations-'));
    const config = parse(readFileSync(new URL('../../examples/restaurant.business.yaml', import.meta.url), 'utf8'));
    config.inquiries = {
      mode,
      file_path: join(dir, 'inquiries.jsonl'),
      // Even when a URL exists, only webhook mode can send to it.
      webhook_url: 'https://inquiries.invalid/discovery-only',
    };
    const configPath = join(dir, 'business.yaml');
    writeFileSync(configPath, stringify(config));
    const client = new Client({ name: 'mainstreet-annotation-test', version: '1.0.0' });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL('../cli.js', import.meta.url)), '--config', configPath],
      stderr: 'pipe',
    });
    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      const inquiry = tools.find((tool) => tool.name === 'submit_inquiry');
      assert.ok(inquiry, 'business server must expose submit_inquiry');
      assert.deepEqual(inquiry.annotations, {
        title: 'Submit Inquiry',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: mode === 'webhook',
      });
      for (const tool of tools.filter((tool) => tool.name !== 'submit_inquiry')) {
        assert.equal(tool.annotations?.openWorldHint, false, `${tool.name} stays closed-world`);
      }
      assert.deepEqual(readdirSync(dir), ['business.yaml'], 'discovery must not write an inquiry');
    } finally {
      await client.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
