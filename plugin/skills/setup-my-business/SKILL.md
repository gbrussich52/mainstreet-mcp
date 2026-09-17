---
name: setup-my-business
description: Interview a small-business owner and generate their business.yaml for the Main Street MCP server — industry, contact info, hours, services/prices, FAQs, policies, staff, and booking. Use when the user says "set up my business", "configure mainstreet", "create my business.yaml", or right after installing the mainstreet plugin with no business.yaml present yet.
---

# Setup My Business

Interviews a small-business owner in plain language and produces a valid `business.yaml`
for the Main Street MCP server (`mainstreet-mcp`), so their AI assistant can answer
customer questions about the business instead of guessing.

## Steps

1. **Ask which industry**, offering the 10 supported options in plain terms: restaurant,
   dental practice, law firm, home services (plumber/electrician/HVAC/etc.), salon or spa,
   fitness studio, real-estate agent, auto repair shop, insurance agency, or church.

2. **Generate the starter template** for that industry:

   ```
   npx -y github:gbrussich52/mainstreet-mcp init --industry <industry>
   ```

   This writes `<industry>.business.yaml` in the current directory. Rename or copy it to
   `business.yaml` at the project root (the path the plugin's MCP config points at).

3. **Interview the owner** for each section, in plain language — don't show them YAML,
   just ask the questions and fill the file yourself:
   - **Basics**: legal/DBA business name, one-line description, phone, email, website,
     street address, city, state, zip.
   - **Hours**: which days they're open, opening/closing time each day (24h or convert
     from "9 to 5"), their timezone (city is enough — map it to an IANA zone like
     `America/New_York`), and any known upcoming closures (holidays) or exceptions.
   - **Services/menu/offerings**: name, short description, category, and price for each
     item they sell or offer. This is the `offerings` list — call it "menu items" for a
     restaurant, "services" for everyone else.
   - **FAQs**: the 5-10 questions customers ask most. Plain question + plain answer.
   - **Policies**: cancellation policy, payment methods accepted, parking, pets, etc. —
     whatever is relevant to their industry.
   - **Staff**: names, roles, and (if they want it public) short bios or credentials.
   - **Booking**: how customers actually book — phone, an online booking URL, walk-in,
     email — and any booking notes (e.g. "24-hour notice required").
   - **Industry-specific capability config**, only if their industry has one (see table
     below) — ask only the fields that capability needs.

4. **Fill `business.yaml`** with their answers, preserving the schema's structure
   (`business:`, `hours:`, `offerings:`, `faqs:`, `policies:`, `staff:`, `booking:`,
   `inquiries:`, `capabilities:`).

5. **Validate**:

   ```
   npx -y github:gbrussich52/mainstreet-mcp validate --config business.yaml
   ```

   If it fails, read the specific field-level error back to the owner in plain language,
   fix it, and re-run validate until it passes.

6. **Explain the privacy guardrails** relevant to their industry before finishing, so they
   know what the server will and won't do with customer messages:
   - **Dental / salon-spa / fitness-studio**: the `submit_inquiry` tool rejects messages
     containing health/medical details (symptoms, medications, injuries, pregnancy, an
     SSN-shaped pattern) — it tells the customer to call the office instead of accepting
     that detail in writing. This protects the business from handling PHI/PII it isn't
     set up to secure.
   - **Law firm**: `list_practice_areas` always carries a "this is not legal advice"
     disclaimer, and inquiries are capped to a one-line topic (280 characters, no case
     details) — the assistant should never draft or imply legal advice.
   - **Insurance agency**: nothing this server returns is a binding quote or coverage
     confirmation — `get_price_estimate` (if configured) always returns `is_estimate: true`
     with a disclaimer, and coverage-line info is informational only.
   - **All industries**: inquiries are rate-limited and sanitized (HTML/control chars
     stripped, length capped) before being written or sent to a webhook.

## Industry → capability config quick reference

| Industry | Ask about |
|---|---|
| restaurant | menu items with prices |
| dental | which insurance plans are accepted |
| law-firm | practice areas |
| home-services, auto-repair | service area (towns/zip radius), rough price ranges |
| salon-spa, fitness-studio | class schedule |
| real-estate-agent | active listings to surface |
| insurance-agency | coverage lines offered |
| church | service times |

## When done

Tell the owner: `business.yaml` is ready, their AI assistant (Claude Desktop, Claude Code,
or any MCP client) can now answer questions about their business, and they can re-run this
skill any time hours/menu/staff change — just re-answer the sections that changed.
