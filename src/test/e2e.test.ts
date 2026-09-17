// End-to-end test: for every bundled example business.yaml, spawn the built
// stdio server as a real child process and drive it with the real MCP v2
// client SDK — this is the only test that proves the server actually speaks
// MCP over stdio, not just that the TypeScript compiles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const here = dirname(fileURLToPath(import.meta.url));
// dist/test/e2e.test.js -> dist/cli.js and ../examples/*.yaml (sibling of dist/)
const cliPath = join(here, '..', 'cli.js');
const examplesDir = join(here, '..', '..', 'examples');

const exampleFiles = readdirSync(examplesDir).filter((f) => f.endsWith('.business.yaml'));

// Universal tools every industry preset registers regardless of capabilities.
const UNIVERSAL_TOOLS = [
  'get_business_profile',
  'check_open_status',
  'search_offerings',
  'answer_question',
  'list_staff',
  'get_booking_options',
  'submit_inquiry',
];

// Exact capability tool names each industry preset must register, per the
// design doc's capability-to-preset mapping. Pins the mapping down so a
// preset silently losing (or gaining) a capability fails a test instead of
// drifting unnoticed — see docs/superpowers/specs/2026-09-17-mainstreet-mcp-design.md.
const EXPECTED_CAPABILITY_TOOLS: Record<string, string[]> = {
  restaurant: ['get_menu'],
  dental: ['check_insurance_accepted', 'get_price_estimate'],
  'law-firm': ['list_practice_areas'],
  'home-services': ['check_service_area', 'get_price_estimate'],
  'salon-spa': ['get_price_estimate', 'get_class_schedule'],
  'fitness-studio': ['get_class_schedule'],
  'real-estate-agent': ['search_listings', 'check_service_area'],
  'auto-repair': ['check_service_area', 'get_price_estimate', 'check_insurance_accepted'],
  'insurance-agency': ['list_coverage_lines', 'check_service_area'],
  church: ['get_service_times'],
};

// Minimal valid arguments per tool name, covering every tool across all 9
// capability modules plus the 7 universal tools. Missing an entry here for a
// tool that gets registered is a test bug, not a server bug — caught below.
const SAMPLE_ARGS: Record<string, Record<string, unknown>> = {
  get_business_profile: {},
  check_open_status: {},
  search_offerings: { query: 'a' },
  answer_question: { question: 'hours' },
  list_staff: {},
  get_booking_options: {},
  submit_inquiry: { message: 'Test inquiry from the mainstreet-mcp e2e suite.' },
  get_menu: {},
  check_service_area: { location: '10562' },
  get_price_estimate: { query: 'oil change' },
  get_class_schedule: {},
  search_listings: {},
  check_insurance_accepted: { insurer: 'Delta Dental' },
  list_practice_areas: {},
  list_coverage_lines: {},
  get_service_times: {},
};

for (const file of exampleFiles) {
  const industry = file.replace('.business.yaml', '');

  test(`e2e: ${industry} — stdio server responds to tools/list and every tool`, async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [cliPath, '--config', join(examplesDir, file)],
      stderr: 'pipe',
    });
    const client = new Client({ name: 'mainstreet-e2e-test', version: '0.0.0' });

    let stderrOutput = '';
    transport.stderr?.on('data', (chunk) => {
      stderrOutput += chunk.toString();
    });

    try {
      await client.connect(transport);

      const { tools } = await client.listTools();
      assert.ok(tools.length >= UNIVERSAL_TOOLS.length, `${industry}: expected at least the universal tools, got ${tools.map((t) => t.name).join(', ')}`);

      const toolNames = tools.map((t) => t.name);
      for (const name of UNIVERSAL_TOOLS) {
        assert.ok(toolNames.includes(name), `${industry}: missing universal tool ${name}`);
      }

      const expectedCapabilityTools = EXPECTED_CAPABILITY_TOOLS[industry];
      assert.ok(expectedCapabilityTools, `${industry}: no entry in EXPECTED_CAPABILITY_TOOLS — add one so the preset mapping can't drift silently`);
      for (const name of expectedCapabilityTools) {
        assert.ok(toolNames.includes(name), `${industry}: missing expected capability tool ${name} (preset capability mapping drifted)`);
      }
      const extraCapabilityTools = toolNames.filter((n) => !UNIVERSAL_TOOLS.includes(n) && !expectedCapabilityTools.includes(n));
      assert.equal(extraCapabilityTools.length, 0, `${industry}: unexpected extra capability tool(s) ${extraCapabilityTools.join(', ')} not in EXPECTED_CAPABILITY_TOOLS`);

      for (const tool of tools) {
        const args = SAMPLE_ARGS[tool.name];
        assert.ok(args !== undefined, `${industry}: no sample args registered for tool ${tool.name} — add one to SAMPLE_ARGS`);

        const result = await client.callTool({ name: tool.name, arguments: args });
        assert.ok(!result.isError, `${industry}: tool ${tool.name} returned isError with content ${JSON.stringify(result.content)}`);
        assert.ok(result.structuredContent !== undefined, `${industry}: tool ${tool.name} did not return structuredContent`);
      }
    } finally {
      await client.close();
      if (stderrOutput.trim()) {
        // Non-fatal: the CLI doesn't log to stderr in stdio mode under
        // normal operation, so any output here is worth surfacing.
        console.error(`[${industry} stderr]`, stderrOutput.trim());
      }
    }
  });
}

// Regression (live Haiku test 2026-09-17): a short PHI message went through the dental
// server. The model may refuse on its own, so the code guard is proven over the real transport.
test('e2e: dental — submit_inquiry refuses health details over stdio', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliPath, '--config', join(examplesDir, 'dental.business.yaml')],
  });
  const client = new Client({ name: 'mainstreet-e2e-guard', version: '0.0.0' });
  try {
    await client.connect(transport);
    const result = await client.callTool({
      name: 'submit_inquiry',
      arguments: { message: "I'm pregnant and have a bad toothache" },
    });
    const out = result.structuredContent as { accepted?: boolean; reason?: string } | undefined;
    assert.equal(out?.accepted, false, `PHI inquiry was accepted: ${JSON.stringify(result)}`);
    assert.match(out?.reason ?? '', /call the office/i);
  } finally {
    await client.close();
  }
});
