import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { BusinessConfig } from '../config/schema.js';
import { getOpenStatus, zonedTimeToUtc, getZonedParts } from '../hours.js';
import { search } from '../search.js';
import { answerQuestion } from '../qa.js';
import { InquirySink } from '../inquiries.js';

export interface UniversalContext {
  config: BusinessConfig;
  inquirySink: InquirySink;
}

const READ_ONLY = { readOnlyHint: true, idempotentHint: true, openWorldHint: false } as const;

export function registerUniversalTools(server: McpServer, { config, inquirySink }: UniversalContext): void {
  server.registerTool(
    'get_business_profile',
    {
      title: 'Get Business Profile',
      description: 'Returns the business\'s name, industry, description, contact info, address, and policies. Start here for "tell me about this business" style questions.',
      inputSchema: z.object({}),
      outputSchema: z.object({
        name: z.string(),
        industry: z.string(),
        description: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        website: z.string().optional(),
        address: z.object({
          street: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          zip: z.string().optional(),
        }),
        policies: z.record(z.string(), z.string()),
      }),
      annotations: { title: 'Get Business Profile', ...READ_ONLY },
    },
    async () => {
      const output = {
        name: config.business.name,
        industry: config.business.industry,
        description: config.business.description,
        phone: config.business.phone,
        email: config.business.email,
        website: config.business.website,
        address: config.business.address,
        policies: config.policies,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }], structuredContent: output };
    },
  );

  server.registerTool(
    'check_open_status',
    {
      title: 'Check Open Status',
      description:
        'Reports whether the business is open at a given LOCAL date/time in the business\'s own timezone (or right now, if neither is given), including when it next opens or closes. Prefer `date`/`time` — they are interpreted directly in the business\'s timezone, so no UTC conversion is needed. `at` (a full ISO 8601 timestamp) is available as an alternative for callers that already have one, but is easy to get wrong (e.g. a naive "just append Z" conversion silently produces the wrong instant) — `date`/`time` avoids that class of mistake entirely.',
      inputSchema: z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('LOCAL date in the business\'s timezone, YYYY-MM-DD. Defaults to today (business\'s timezone) if omitted.'),
        time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().describe('LOCAL time in the business\'s timezone, 24h HH:MM. Defaults to the current time (business\'s timezone) if omitted.'),
        at: z.iso.datetime({ offset: true }).optional().describe('Alternative to date/time: a full ISO 8601 timestamp with UTC offset, e.g. "2026-09-20T18:00:00Z". Ignored if date or time is given.'),
      }),
      outputSchema: z.object({
        open: z.boolean(),
        timezone: z.string(),
        local_time: z.string(),
        day_of_week: z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
        hours_today: z.array(z.object({ open: z.string(), close: z.string() })),
        next_change: z.object({ type: z.enum(['opens', 'closes']), date: z.string(), time: z.string() }).nullable(),
      }),
      annotations: { title: 'Check Open Status', ...READ_ONLY },
    },
    async ({ date, time, at }) => {
      const zone = config.hours.timezone;
      let when: Date;
      if (date !== undefined || time !== undefined) {
        // Fill in whichever piece wasn't given from "now" in the business's
        // own timezone — never from the server's local time or from UTC.
        const nowParts = getZonedParts(new Date(), zone);
        const dateStr = date ?? `${nowParts.year}-${String(nowParts.month).padStart(2, '0')}-${String(nowParts.day).padStart(2, '0')}`;
        const timeStr = time ?? `${String(nowParts.hour).padStart(2, '0')}:${String(nowParts.minute).padStart(2, '0')}`;
        when = zonedTimeToUtc(dateStr, timeStr, zone);
      } else {
        when = at ? new Date(at) : new Date();
      }
      const status = getOpenStatus(config.hours, when);
      const output = {
        open: status.open,
        timezone: status.timezone,
        local_time: status.localTime,
        day_of_week: status.dayOfWeek,
        hours_today: status.todayRanges,
        next_change: status.nextChange,
      };
      const text = status.open
        ? `Open now (${status.localTime} ${status.timezone}, ${status.dayOfWeek}).${status.nextChange ? ` Closes ${status.nextChange.time} today/tonight.` : ''}`
        : `Closed right now (${status.localTime} ${status.timezone}, ${status.dayOfWeek}).${status.nextChange ? ` Opens ${status.nextChange.date} at ${status.nextChange.time}.` : ''}`;
      return { content: [{ type: 'text' as const, text }], structuredContent: output };
    },
  );

  server.registerTool(
    'search_offerings',
    {
      title: 'Search Offerings',
      description: 'Searches the business\'s offerings (menu items, services, listings, etc. — whatever this industry configured) by free text.',
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().positive().max(50).default(10),
      }),
      outputSchema: z.object({
        results: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            description: z.string().optional(),
            category: z.string().optional(),
            tags: z.array(z.string()),
            price: z.union([z.number(), z.string()]).optional(),
          }),
        ),
      }),
      annotations: { title: 'Search Offerings', ...READ_ONLY },
    },
    async ({ query, limit }) => {
      const active = config.offerings.filter((o) => o.active);
      const scored = search(
        active.map((o) => ({ ...o, text: `${o.name} ${o.description ?? ''} ${o.tags.join(' ')} ${o.category ?? ''}` })),
        query,
        limit,
      );
      const results = scored.map(({ item }) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        category: item.category,
        tags: item.tags,
        price: item.price,
      }));
      return { content: [{ type: 'text' as const, text: JSON.stringify({ results }, null, 2) }], structuredContent: { results } };
    },
  );

  server.registerTool(
    'answer_question',
    {
      title: 'Answer Question',
      description:
        'Looks up an answer to a customer question in the business\'s configured FAQs AND policies, returning up to 3 ranked matches (each tagged source: "faq" or "policy") so you can pick the right one — it can\'t guess which of several plausible matches you meant. Returns found:false rather than a guess when nothing matches well — never fabricate an answer this tool didn\'t return.',
      inputSchema: z.object({ question: z.string().min(1) }),
      outputSchema: z.object({
        found: z.boolean(),
        matches: z.array(
          z.object({
            source: z.enum(['faq', 'policy']),
            question: z.string(),
            answer: z.string(),
            score: z.number(),
          }),
        ),
        message: z.string().optional(),
      }),
      annotations: { title: 'Answer Question', ...READ_ONLY },
    },
    async ({ question }) => {
      const output = answerQuestion(config.faqs, config.policies, question);
      const text = output.found
        ? output.matches.map((m) => `[${m.source}] ${m.question}: ${m.answer}`).join('\n')
        : (output.message ?? 'No match found.');
      return { content: [{ type: 'text' as const, text }], structuredContent: output };
    },
  );

  server.registerTool(
    'list_staff',
    {
      title: 'List Staff',
      description: 'Lists configured staff members with role, bio, and credentials.',
      inputSchema: z.object({}),
      outputSchema: z.object({
        staff: z.array(z.object({ name: z.string(), role: z.string().optional(), bio: z.string().optional(), credentials: z.array(z.string()) })),
      }),
      annotations: { title: 'List Staff', ...READ_ONLY },
    },
    async () => {
      const output = { staff: config.staff };
      return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }], structuredContent: output };
    },
  );

  server.registerTool(
    'get_booking_options',
    {
      title: 'Get Booking Options',
      description: 'Returns how a customer can book/schedule with this business (phone, online link, walk-in, email) — use this instead of inventing a booking flow.',
      inputSchema: z.object({}),
      outputSchema: z.object({
        methods: z.array(z.string()),
        url: z.string().optional(),
        phone: z.string().optional(),
        notes: z.string().optional(),
      }),
      annotations: { title: 'Get Booking Options', ...READ_ONLY },
    },
    async () => {
      const output = {
        methods: config.booking.methods,
        url: config.booking.url,
        phone: config.booking.phone,
        notes: config.booking.notes,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }], structuredContent: output };
    },
  );

  server.registerTool(
    'submit_inquiry',
    {
      title: 'Submit Inquiry',
      description: 'Submits a customer inquiry/message to the business (logged to file or forwarded to a webhook, depending on configuration). Subject to rate limiting and content screening — check the `accepted` field; a false value means it was rejected, not silently dropped.',
      inputSchema: z.object({
        name: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        topic: z.string().optional(),
        message: z.string().min(1),
      }),
      outputSchema: z.object({
        accepted: z.boolean(),
        reason: z.string().optional(),
        id: z.string().optional(),
      }),
      annotations: { title: 'Submit Inquiry', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (input) => {
      const result = await inquirySink.submit(input);
      const text = result.accepted ? `Inquiry submitted (id: ${result.id}).` : `Inquiry not accepted: ${result.reason}`;
      return { content: [{ type: 'text' as const, text }], structuredContent: result };
    },
  );
}
