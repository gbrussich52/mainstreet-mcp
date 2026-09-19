import { z } from 'zod';

// The 10 industries the design spec covers. Presets key off this enum.
export const INDUSTRIES = [
  'restaurant',
  'dental',
  'law-firm',
  'home-services',
  'salon-spa',
  'fitness-studio',
  'real-estate-agent',
  'auto-repair',
  'insurance-agency',
  'church',
] as const;
export type Industry = (typeof INDUSTRIES)[number];

// How to say each industry id to a business owner, who should never have to
// guess that a plumber picks "home-services". Lives here beside INDUSTRIES so
// the ids and their plain-language labels stay one list, not two.
export const INDUSTRY_LABELS: Record<Industry, string> = {
  restaurant: 'Restaurant, cafe, bar, or food truck',
  dental: 'Dental practice or orthodontist',
  'law-firm': 'Law firm or solo attorney',
  'home-services': 'Home services — plumbing, electrical, HVAC, roofing, landscaping',
  'salon-spa': 'Hair salon, barber, nail salon, or day spa',
  'fitness-studio': 'Gym, yoga or pilates studio, or personal training',
  'real-estate-agent': 'Real-estate agent or brokerage',
  'auto-repair': 'Auto repair shop, body shop, or tire shop',
  'insurance-agency': 'Insurance agency',
  church: 'Church, parish, or other place of worship',
};

const AddressSchema = z
  .object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
  })
  .partial()
  .default({});

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const TimeRangeSchema = z.object({
  open: z.string().regex(TIME_RE, 'expected 24h HH:MM, e.g. "09:00"'),
  close: z.string().regex(TIME_RE, 'expected 24h HH:MM, e.g. "17:00"'),
});
export type TimeRange = z.infer<typeof TimeRangeSchema>;

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

const HoursSchema = z.object({
  // IANA zone (e.g. "America/New_York") — required so open/closed checks are
  // computed in the business's local time, not the server's.
  timezone: z.string().min(1, 'IANA timezone required, e.g. "America/New_York"'),
  schedule: z.partialRecord(z.enum(DAY_KEYS), z.array(TimeRangeSchema)).default({}),
  exceptions: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD'),
        closed: z.boolean().optional(),
        ranges: z.array(TimeRangeSchema).optional(),
        note: z.string().optional(),
      }),
    )
    .default([]),
});
export type HoursConfig = z.infer<typeof HoursSchema>;
export type HoursException = HoursConfig['exceptions'][number];

// Offerings are deliberately generic — menu items, practice areas, class
// listings, coverage lines, etc. all fit this shape. Capability modules read
// whichever extra fields they care about via `.catchall`.
const OfferingSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).default([]),
    price: z.union([z.number(), z.string()]).optional(),
    unit: z.string().optional(),
    active: z.boolean().default(true),
  })
  .catchall(z.unknown());
export type Offering = z.infer<typeof OfferingSchema>;

const FaqSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  tags: z.array(z.string()).default([]),
});
export type Faq = z.infer<typeof FaqSchema>;

const StaffSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
  bio: z.string().optional(),
  credentials: z.array(z.string()).default([]),
});
export type StaffMember = z.infer<typeof StaffSchema>;

const BookingSchema = z
  .object({
    methods: z.array(z.enum(['phone', 'online', 'walk-in', 'email'])).default([]),
    url: z.url().optional(),
    phone: z.string().optional(),
    notes: z.string().optional(),
  })
  // The object's own field defaults (e.g. methods: []) don't make {} assignable
  // to its *output* type — zod's .default() argument type is post-parse output,
  // where defaulted fields are required-and-present, not optional. Spell out
  // the resolved shape explicitly rather than relying on the inner defaults.
  .default({ methods: [] });
export type BookingConfig = z.infer<typeof BookingSchema>;

const InquiriesConfigSchema = z
  .object({
    mode: z.enum(['file', 'webhook']).default('file'),
    file_path: z.string().default('./inquiries.jsonl'),
    webhook_url: z.url().optional(),
    rate_limit_per_minute: z.number().int().positive().default(5),
  })
  // Same reasoning as BookingSchema above: spell out the resolved defaults.
  .default({ mode: 'file', file_path: './inquiries.jsonl', rate_limit_per_minute: 5 })
  .superRefine((val, ctx) => {
    if (val.mode === 'webhook' && !val.webhook_url) {
      ctx.addIssue({ code: 'custom', message: 'inquiries.webhook_url is required when inquiries.mode is "webhook"' });
    }
    if (val.mode === 'webhook' && val.webhook_url && !val.webhook_url.startsWith('https://')) {
      ctx.addIssue({ code: 'custom', message: 'inquiries.webhook_url must use https:// (plaintext http is rejected)' });
    }
  });
export type InquiriesConfig = z.infer<typeof InquiriesConfigSchema>;

export const BusinessConfigSchema = z.object({
  business: z.object({
    name: z.string().min(1),
    industry: z.enum(INDUSTRIES),
    description: z.string().optional(),
    phone: z.string().optional(),
    email: z.email().optional(),
    website: z.url().optional(),
    address: AddressSchema,
  }),
  hours: HoursSchema,
  offerings: z.array(OfferingSchema).default([]),
  faqs: z.array(FaqSchema).default([]),
  policies: z.record(z.string(), z.string()).default({}),
  staff: z.array(StaffSchema).default([]),
  booking: BookingSchema,
  inquiries: InquiriesConfigSchema,
  // Per-capability config blobs, keyed by capability name. Each capability
  // module validates its own slice with its own configSchema.
  capabilities: z.record(z.string(), z.unknown()).default({}),
});
export type BusinessConfig = z.infer<typeof BusinessConfigSchema>;

export function formatZodError(err: z.ZodError): string {
  return err.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n');
}
