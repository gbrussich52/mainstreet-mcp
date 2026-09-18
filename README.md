# Main Street MCP

A free, industry-specific MCP server that gives a small business's AI assistants
(ChatGPT, Claude, etc.) reliable answers about the business itself — hours, menu/services,
FAQs, staff, and how to book — instead of hallucinating them. One `business.yaml` file per
business; no code changes required to run it.

## Quickstart (business owner)

1. Install Node.js 20+ (or use the version already on your machine — check with `node -v`).
2. Generate a starter config for your industry:

   ```
   npx -y mainstreet-mcp init --industry restaurant
   ```

   Replace `restaurant` with your industry. Supported industries: `restaurant`, `dental`,
   `law-firm`, `home-services`, `salon-spa`, `fitness-studio`, `real-estate-agent`,
   `auto-repair`, `insurance-agency`, `church`.

   This writes `business.yaml` in the current directory — edit it with your business's
   real name, hours, menu/services, FAQs, etc. (Use `--out <path>` for a different name;
   every other command then needs `--config <path>`.)

3. Check your edits are valid:

   ```
   npx -y mainstreet-mcp validate
   ```

   A broken file (bad YAML, a typo'd industry, a field that doesn't fit) prints a specific,
   readable error instead of a stack trace.

4. Point your AI assistant at it. For a local MCP client (e.g. Claude Desktop) that spawns
   stdio servers, add an entry like:

   ```json
   {
     "mcpServers": {
       "my-business": {
         "command": "npx",
         "args": ["-y", "mainstreet-mcp", "--config", "/absolute/path/to/business.yaml"]
       }
     }
   }
   ```

   To serve over HTTP instead (e.g. for a hosted deployment), run:

   ```
   npx -y mainstreet-mcp serve --http --port 3000
   ```

   The HTTP server only binds to `127.0.0.1` and validates the `Host`/`Origin` headers on
   every request — put a reverse proxy in front of it for anything beyond local testing.

## What it gives an AI assistant

Every business gets 7 **universal tools** regardless of industry:

- `get_business_profile` — name, description, contact info, address, policies
- `check_open_status` — open/closed right now (or at a given time), in the business's own
  timezone, including overnight hours and holiday/exception overrides
- `search_offerings` — free-text search over whatever the business sells/offers
- `answer_question` — looks up configured FAQs; returns `found: false` rather than a guess
  when nothing matches confidently
- `list_staff` — configured staff, roles, bios, credentials
- `get_booking_options` — how to actually book (phone/online/walk-in/email)
- `submit_inquiry` — lets a customer leave a message; rate-limited, sanitized, and screened
  by industry-specific guardrails before it's accepted

On top of that, each **industry preset** turns on a handful of **capabilities** — pluggable
tool modules — matched to that industry:

| Industry | Capabilities / tools |
|---|---|
| restaurant | `menu` → `get_menu` |
| dental | `insurance_accepted` → `check_insurance_accepted` |
| law-firm | `practice_areas` → `list_practice_areas` (always carries a not-legal-advice disclaimer) |
| home-services | `service_area` → `check_service_area`, `price_estimate` → `get_price_estimate` |
| salon-spa | `class_schedule` → `get_class_schedule` |
| fitness-studio | `class_schedule` → `get_class_schedule` |
| real-estate-agent | `listings` → `search_listings` |
| auto-repair | `service_area`, `price_estimate`, `insurance_accepted` |
| insurance-agency | `coverage_lines` → `list_coverage_lines` |
| church | `service_times` → `get_service_times` |

Every tool ships an `outputSchema` and returns `structuredContent`, so a calling agent gets
typed data back, not just prose to parse.

### Guardrails

Some presets screen `submit_inquiry` messages before accepting them, on top of the universal
sanitization (HTML/control-char stripping, length caps, rate limiting):

- **dental** — rejects messages containing an SSN-shaped pattern, and long messages with
  clinical/health detail keywords (tells the patient to call the office instead).
- **law-firm** — caps the message to one line / 280 characters (a topic, not case details).
- **salon-spa** / **fitness-studio** — rejects messages containing health/medical detail
  keywords (pregnancy, injury, medication, etc.), directing the customer to tell staff
  in person instead.

`price_estimate` outputs always carry `is_estimate: true` plus a disclaimer — never present
as a firm quote.

## Install

### Claude Desktop (one-click, no terminal)

Download the latest `mainstreet-mcp.mcpb` from the [releases page](https://github.com/gbrussich52/mainstreet-mcp/releases)
(or build it yourself — see `mcpb/` below), then double-click it. Claude Desktop opens it as
a Desktop Extension install prompt; it asks for one thing — the path to your
`business.yaml` — then installs. No Node.js install or terminal needed.

To build the `.mcpb` yourself:

```
npx @anthropic-ai/mcpb pack mcpb build/mainstreet-mcp.mcpb
```

### Claude Code (plugin)

Install the bundled plugin, which registers the MCP server and adds a `setup-my-business`
skill that interviews you and writes `business.yaml` for you:

```
claude plugin install ./plugin
```

The plugin's MCP config expects `business.yaml` at your project root
(`${CLAUDE_PROJECT_DIR}/business.yaml`), which is exactly what `init` writes — run the
`setup-my-business` skill, or `npx -y mainstreet-mcp init --industry <yours>`,
from that directory.

### Claude Code (direct MCP add, no plugin)

```
claude mcp add mainstreet -- npx -y mainstreet-mcp --config /absolute/path/to/business.yaml
```

### Generic JSON config (any MCP client)

For any client that spawns stdio servers from a JSON config (Claude Desktop's manual config,
other MCP clients):

```json
{
  "mcpServers": {
    "my-business": {
      "command": "npx",
      "args": ["-y", "mainstreet-mcp", "--config", "/absolute/path/to/business.yaml"]
    }
  }
}
```

## Example configs

`examples/` has one working `<industry>.business.yaml` per supported industry — the same
files `init` copies from and the E2E test suite runs against.

## Development

```
npm install
npm run build     # tsc -> dist/
npm test          # builds, then runs node --test against dist/test/*.test.js
```

Stack: `@modelcontextprotocol/server@2.0.0` (MCP spec 2026-07-28), TypeScript strict/ESM,
Zod for all schemas and config validation, `yaml` for parsing `business.yaml`. All
dependencies are pinned to exact versions (no `^`).

### Project layout

- `src/config/schema.ts` — the `business.yaml` Zod schema (`BusinessConfigSchema`) and types.
- `src/config/load.ts` — loads + validates a config file, including per-capability config and
  the industry/capability compatibility check.
- `src/hours.ts` — timezone-aware open/closed logic (`Intl`-based), overnight ranges, date
  exceptions, forward-scanning for the next open/close time.
- `src/search.ts` — the recall-first free-text search used by `search_offerings` and
  `answer_question`.
- `src/inquiries.ts` — `InquirySink`: sanitization, rate limiting, guardrail hook, and
  file/webhook delivery for `submit_inquiry`.
- `src/capabilities/*` — the 9 pluggable capability modules (config schema + tool registration
  each).
- `src/presets/*` — the 10 industry presets: which capabilities are on, the instructions text
  injected into the server, and any `guardHooks`.
- `src/tools/universal.ts` — the 7 universal tools every business gets.
- `src/server.ts` — `createServer(config)`: builds the `McpServer` for a loaded config.
- `src/cli.ts` — `mainstreet-mcp` entry point (stdio default, `init`, `validate`,
  `serve --http`).
- `src/test/*.test.js` (compiled from `.ts`) — unit tests (schema, search, hours, inquiries/
  guardrails) plus an E2E suite that spawns the built stdio server for every example config
  and drives it with the real MCP client SDK.

### Testing notes

- `npm test` runs both unit tests and the E2E suite (`src/test/e2e.test.ts`), which spawns
  `dist/cli.js` as a child process via `StdioClientTransport` for every file in `examples/`,
  calls `tools/list`, then calls every registered tool and asserts it returns
  `structuredContent` without `isError`.
- `serve --http` binds a local port, which some sandboxed shells block by default; test it
  outside such a sandbox if `EPERM`/`listen` errors appear.

## Status

Presets, capabilities, universal tools, CLI, and all 10 example configs are built and
verified (build, unit tests, E2E stdio tests, CLI validate success/failure paths, and an
HTTP smoke test all pass — see the build's final report for exact output). This is a
first build, not yet published or deployed anywhere.
