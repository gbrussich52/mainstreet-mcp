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

// Directories (OpenAI's, M8ven's trust index) score a tool down when any of
// the four behaviour hints is missing, so every tool must declare all four.
const REQUIRED_HINTS = ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'] as const;
function assertAllHints(tools: { name: string; annotations?: Record<string, unknown> }[], label: string): void {
  for (const tool of tools) {
    for (const hint of REQUIRED_HINTS) {
      assert.equal(typeof tool.annotations?.[hint], 'boolean', `${label}: tool ${tool.name} is missing annotations.${hint}`);
    }
  }
}

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
      assertAllHints(tools, industry);
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

// Regression (live Haiku test 2026-09-17): "front brake pads" found no priced offering.
test('e2e: auto-repair — get_price_estimate matches loose wording', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliPath, '--config', join(examplesDir, 'auto-repair.business.yaml')],
  });
  const client = new Client({ name: 'mainstreet-e2e-estimate', version: '0.0.0' });
  try {
    await client.connect(transport);
    for (const query of ['front brake pads', 'brakes', 'oil change']) {
      const result = await client.callTool({ name: 'get_price_estimate', arguments: { query } });
      const out = result.structuredContent as { low: number | null; matched_offering_id: string | null };
      assert.ok(out.matched_offering_id, `${query}: no offering matched`);
      assert.ok(typeof out.low === 'number', `${query}: no price range`);
    }
    const none = await client.callTool({ name: 'get_price_estimate', arguments: { query: 'sushi platter' } });
    assert.equal((none.structuredContent as { low: number | null }).low, null, 'unrelated query must not invent a price');
  } finally {
    await client.close();
  }
});

// The plugin's .mcp.json points at ${CLAUDE_PROJECT_DIR}/business.yaml, and `serve`
// and `validate` both default to ./business.yaml. `init` used to write
// <industry>.business.yaml, so following the plugin's own instructions produced a
// server that could not find its config. This pins the three to one filename.
test('init writes business.yaml, and validate finds it with no flags', async () => {
  const { mkdtempSync, existsSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { execFileSync } = await import('node:child_process');

  const dir = mkdtempSync(join(tmpdir(), 'mainstreet-init-'));
  try {
    execFileSync(process.execPath, [cliPath, 'init', '--industry', 'salon-spa'], {
      cwd: dir,
      encoding: 'utf8',
    });
    assert.ok(existsSync(join(dir, 'business.yaml')), 'init should write ./business.yaml');

    const out = execFileSync(process.execPath, [cliPath, 'validate'], {
      cwd: dir,
      encoding: 'utf8',
    });
    assert.match(out, /valid/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// The desktop bundle (.mcpb) asks the owner for a FOLDER and passes it as
// --config-dir, because a file picker cannot point at a business.yaml that does
// not exist yet — which is every fresh install. The install dialog was a dead
// end before this: no file meant no way to finish. These three pin the whole
// path: empty folder serves setup, setup writes the file, the file then serves
// the real business from the same folder the owner already picked.
test('e2e: --config-dir with no business.yaml serves the setup server', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');

  const dir = mkdtempSync(join(tmpdir(), 'mainstreet-setup-'));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliPath, 'serve', '--config-dir', dir],
  });
  const client = new Client({ name: 'mainstreet-e2e-setup', version: '0.0.0' });
  try {
    await client.connect(transport);
    const setupTools = (await client.listTools()).tools;
    assertAllHints(setupTools, 'setup');
    const names = setupTools.map((t) => t.name).sort();
    assert.deepEqual(names, ['create_business_config', 'list_industries']);

    const listed = await client.callTool({ name: 'list_industries', arguments: {} });
    const industries = (listed.structuredContent as { industries: { id: string; description: string }[] })
      .industries;
    assert.equal(industries.length, 10);
    // A plumber must be able to find themselves without knowing the id.
    const homeServices = industries.find((i) => i.id === 'home-services');
    assert.match(homeServices?.description ?? '', /plumb/i);
  } finally {
    await client.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

// The Claude Code plugin passes --config ${CLAUDE_PROJECT_DIR}/business.yaml,
// which does not exist until setup runs. That used to crash the server, so the
// plugin showed as failed in every project. A missing business.yaml now serves
// setup from its folder; any other missing file name is still an error.
test('e2e: --config pointing at a missing business.yaml serves the setup server', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');

  const dir = mkdtempSync(join(tmpdir(), 'mainstreet-config-missing-'));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliPath, '--config', join(dir, 'business.yaml')],
  });
  const client = new Client({ name: 'mainstreet-e2e-config-missing', version: '0.0.0' });
  try {
    await client.connect(transport);
    const created = await client.callTool({
      name: 'create_business_config',
      arguments: { industry: 'salon-spa' },
    });
    assert.equal((created.structuredContent as { path: string }).path, join(dir, 'business.yaml'));
  } finally {
    await client.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('e2e: --config pointing at a missing non-business.yaml file still fails', async () => {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [cliPath, '--config', '/nonexistent/other.yaml'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ENOENT/);
});

test('e2e: create_business_config writes into the folder and refuses to overwrite', async () => {
  const { mkdtempSync, existsSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');

  const dir = mkdtempSync(join(tmpdir(), 'mainstreet-setup-write-'));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliPath, 'serve', '--config-dir', dir],
  });
  const client = new Client({ name: 'mainstreet-e2e-setup-write', version: '0.0.0' });
  try {
    await client.connect(transport);
    const created = await client.callTool({
      name: 'create_business_config',
      arguments: { industry: 'dental' },
    });
    assert.equal((created.structuredContent as { path: string }).path, join(dir, 'business.yaml'));
    assert.ok(existsSync(join(dir, 'business.yaml')), 'setup should write business.yaml into the folder');

    const again = await client.callTool({
      name: 'create_business_config',
      arguments: { industry: 'restaurant' },
    });
    assert.equal(again.isError, true, 'a second call must not clobber the owner\'s edited file');
  } finally {
    await client.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('e2e: --config-dir serves the real business once business.yaml exists', async () => {
  const { mkdtempSync, copyFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');

  const dir = mkdtempSync(join(tmpdir(), 'mainstreet-dir-live-'));
  copyFileSync(join(examplesDir, 'dental.business.yaml'), join(dir, 'business.yaml'));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliPath, 'serve', '--config-dir', dir],
  });
  const client = new Client({ name: 'mainstreet-e2e-dir-live', version: '0.0.0' });
  try {
    await client.connect(transport);
    const names = (await client.listTools()).tools.map((t) => t.name);
    assert.ok(names.includes('get_business_profile'), 'real tools should replace the setup tools');
    assert.ok(!names.includes('create_business_config'), 'setup tools should be gone');

    const profile = await client.callTool({ name: 'get_business_profile', arguments: {} });
    assert.equal((profile.structuredContent as { industry: string }).industry, 'dental');
  } finally {
    await client.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
