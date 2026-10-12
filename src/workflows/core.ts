// PUBLIC. Canonical browser-safe, stateless workflow rules. No provider actions.
export const workflowRecipes = ['quote-followup', 'invoice-discrepancies', 'order-handoff'] as const;
export type WorkflowRecipe = typeof workflowRecipes[number];
export interface WorkflowResult {
  state: 'ready' | 'needs_review' | 'no_action';
  summary: string;
  findings: { label: string; detail: string; source: string }[];
  draft: string | null;
  asOf: string;
  simulation: true;
}
export const workflowMetadata: Record<WorkflowRecipe, { title: string; description: string }> = {
  'quote-followup': { title: 'Quote follow-up', description: 'Review an open quote against an explicit follow-up interval; prepare an unsent review draft.' },
  'invoice-discrepancies': { title: 'Invoice discrepancies', description: 'Compare supplied integer-cent totals and currencies; flag differences without refunding or collecting money.' },
  'order-handoff': { title: 'Order handoff', description: 'Reconcile supplied payment, production and shipment statuses; prepare an internal review handoff without updating fulfillment.' },
};
const day = 86_400_000;
type Data = Record<string, unknown>;
const fields: Record<WorkflowRecipe, string[]> = {
  'quote-followup': ['asOf', 'observedAt', 'quoteId', 'currency', 'amountCents', 'status', 'validUntil', 'lastContactAt', 'followupAfterDays'],
  'invoice-discrepancies': ['asOf', 'observedAt', 'invoiceId', 'currency', 'expectedCurrency', 'expectedCents', 'invoicedCents', 'paidCents'],
  'order-handoff': ['asOf', 'observedAt', 'orderId', 'paymentStatus', 'productionStatus', 'shipmentStatus'],
};
/** Only unambiguous UTC ISO seconds/milliseconds, with calendar round-trip validation. */
export function workflowTimestamp(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  const normalized = value.length === 20 ? value.replace('Z', '.000Z') : value;
  return new Date(time).toISOString() === normalized ? time : null;
}
function label(value: unknown): boolean {
  // IDs are source labels, never instructions. Permit international letters but no controls/markup.
  return typeof value === 'string' && value.length <= 80 && /^[\p{L}\p{N}][\p{L}\p{N} ._/-]*$/u.test(value);
}
function cents(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 10_000_000_000; }
export const workflowCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'] as const;
function currency(value: unknown): value is string { return typeof value === 'string' && (workflowCurrencies as readonly string[]).includes(value); }
function member(value: unknown, values: string[]): boolean { return typeof value === 'string' && values.includes(value); }

/** Missing/invalid facts return review, never zero/default amounts or guessed dates. */
export function analyzeWorkflow(recipe: WorkflowRecipe, input: unknown): WorkflowResult {
  const result: WorkflowResult = { state: 'needs_review', summary: 'Check the source data before proceeding.', findings: [], draft: null, asOf: '', simulation: true };
  const finding = (detail: string, source: string, title = 'Source review') => result.findings.push({ label: title, detail, source });
  if (!workflowRecipes.includes(recipe) || !input || typeof input !== 'object' || Array.isArray(input)) {
    finding('Select a supported recipe and supply a bounded object.', 'input'); return result;
  }
  const data = input as Data;
  if (Object.getPrototypeOf(data) !== Object.prototype && Object.getPrototypeOf(data) !== null) {
    finding('Supply a plain source object.', 'input'); return result;
  }
  if (Object.keys(data).some(key => !fields[recipe].includes(key)) || fields[recipe].some(key => !Object.prototype.hasOwnProperty.call(data, key))) {
    finding('Required source fields are missing or unexpected fields were supplied.', 'input'); return result;
  }
  const asOf = workflowTimestamp(data.asOf), observed = workflowTimestamp(data.observedAt);
  if (asOf !== null) result.asOf = data.asOf as string;
  if (asOf === null || observed === null) {
    finding('Use valid UTC ISO timestamps for asOf and observedAt.', 'asOf / observedAt'); return result;
  }
  if (observed > asOf || asOf - observed > 7 * day) {
    finding('The snapshot is future-dated or older than the seven-day sample freshness policy.', 'observedAt'); return result;
  }
  const id = recipe === 'quote-followup' ? 'quoteId' : recipe === 'invoice-discrepancies' ? 'invoiceId' : 'orderId';
  if (!label(data[id])) { finding('Supply a short plain identifier without control characters or markup.', id); return result; }
  if (recipe === 'quote-followup') {
    const until = workflowTimestamp(data.validUntil), contact = workflowTimestamp(data.lastContactAt);
    if (!currency(data.currency) || !cents(data.amountCents) || !member(data.status, ['open', 'accepted', 'declined']) || until === null || contact === null || !Number.isInteger(data.followupAfterDays) || (data.followupAfterDays as number) < 1 || (data.followupAfterDays as number) > 30) {
      finding('Quote amount, supported currency (USD/EUR/GBP/CAD/AUD), status, dates and follow-up interval must be known and valid.', 'quote source'); return result;
    }
    if (contact > observed || until < contact) { finding('Quote dates contradict the snapshot or each other.', 'lastContactAt / validUntil'); return result; }
    if (data.status !== 'open') { result.state = 'no_action'; result.summary = 'This quote is already accepted or declined.'; }
    else if (until <= asOf) { finding('The quote has expired. Confirm current terms before any follow-up.', 'validUntil'); return result; }
    else if (asOf - contact < (data.followupAfterDays as number) * day) { result.state = 'no_action'; result.summary = 'The supplied follow-up interval has not elapsed.'; }
    else { result.state = 'ready'; result.summary = 'An open, unexpired quote is due for a reviewable follow-up draft.'; }
    finding(`Applied the supplied ${data.followupAfterDays}-day sample follow-up policy; this is not a CRM setting or a promise.`, 'lastContactAt / followupAfterDays', 'Follow-up timing');
  } else if (recipe === 'invoice-discrepancies') {
    if (!currency(data.currency) || !currency(data.expectedCurrency) || !cents(data.expectedCents) || !cents(data.invoicedCents) || !cents(data.paidCents)) {
      finding('All three totals and both supported currencies (USD/EUR/GBP/CAD/AUD) must be known; missing amounts are not zero.', 'invoice source'); return result;
    }
    if (data.currency !== data.expectedCurrency) { finding('Currencies differ. No conversion or comparison was inferred.', 'currency / expectedCurrency'); return result; }
    if (data.paidCents > data.invoicedCents) { finding('Payment exceeds the invoice total. Confirm credits, duplicate payments or source errors manually.', 'paidCents / invoicedCents'); return result; }
    const difference = data.invoicedCents - data.expectedCents;
    if (difference === 0) { result.state = 'no_action'; result.summary = 'Invoice and expected totals match; payment collection is outside this recipe.'; }
    else { result.state = 'ready'; result.summary = 'The invoice total differs from the expected total; an internal clarification draft can be prepared.'; }
    finding(`Invoiced minus expected: ${difference} integer cents in the supplied matching currency.`, 'invoicedCents / expectedCents', 'Total comparison');
    finding(`Supplied unpaid balance: ${data.invoicedCents - data.paidCents} integer cents. No collection or refund is authorized.`, 'invoicedCents / paidCents', 'Payment context');
  } else {
    if (!member(data.paymentStatus, ['paid', 'unpaid', 'unknown']) || !member(data.productionStatus, ['queued', 'in_progress', 'complete', 'failed', 'unknown']) || !member(data.shipmentStatus, ['not_created', 'in_transit', 'delivered', 'unknown'])) {
      finding('Provide the documented payment, production and shipment statuses.', 'order source'); return result;
    }
    if ([data.paymentStatus, data.productionStatus, data.shipmentStatus].includes('unknown')) { finding('At least one handoff source is unknown; check it before proceeding.', 'order source'); return result; }
    if (data.productionStatus === 'failed' || (data.paymentStatus === 'unpaid' && (data.productionStatus !== 'queued' || data.shipmentStatus !== 'not_created')) || (data.shipmentStatus !== 'not_created' && data.productionStatus !== 'complete')) {
      finding('The source statuses conflict with the sample paid-before-production and completed-before-shipping policy, or production failed.', 'paymentStatus / productionStatus / shipmentStatus'); return result;
    }
    if (data.shipmentStatus === 'delivered' || data.paymentStatus === 'unpaid') { result.state = 'no_action'; result.summary = data.shipmentStatus === 'delivered' ? 'The supplied order statuses indicate delivery is complete.' : 'The unpaid queued order is waiting; no production handoff is suggested.'; }
    else { result.state = 'ready'; result.summary = 'Known, consistent source statuses can be included in an internal handoff draft.'; }
    finding(`Payment: ${data.paymentStatus}; production: ${data.productionStatus}; shipment: ${data.shipmentStatus}.`, 'paymentStatus / productionStatus / shipmentStatus', 'Supplied status snapshot');
  }
  return result;
}
export function prepareWorkflowDraft(recipe: WorkflowRecipe, input: unknown): WorkflowResult {
  const result = analyzeWorkflow(recipe, input);
  if (result.state !== 'ready') return result;
  const drafts: Record<WorkflowRecipe, string> = {
    'quote-followup': 'UNSENT DRAFT — human review required. Hello, would you like to discuss the open quote referenced in the source record? Please let us know if you have questions. Confirm the recipient and current quote terms before sending.',
    'invoice-discrepancies': 'INTERNAL DRAFT — human review required. The supplied invoice and expected totals differ. Please compare the original invoice, agreed scope and payment records, and confirm the correct amount. No adjustment, refund or collection has been made.',
    'order-handoff': 'INTERNAL DRAFT — human review required. Please review the payment, production and shipment snapshot listed in the findings and confirm the next owner and step. No inventory has been reserved, shipment created or fulfillment status changed.',
  };
  result.draft = drafts[recipe];
  return result;
}
const dates = { asOf: '2026-10-12T12:00:00Z', observedAt: '2026-10-12T11:00:00Z' };
const quote = { ...dates, quoteId: 'FICTIONAL-Q-1', currency: 'USD', amountCents: 125000, status: 'open', validUntil: '2026-10-20T12:00:00Z', lastContactAt: '2026-10-07T12:00:00Z', followupAfterDays: 3 };
const invoice = { ...dates, invoiceId: 'FICTIONAL-I-1', currency: 'USD', expectedCurrency: 'USD', expectedCents: 100000, invoicedCents: 110000, paidCents: 0 };
const order = { ...dates, orderId: 'FICTIONAL-O-1', paymentStatus: 'paid', productionStatus: 'complete', shipmentStatus: 'not_created' };
export const workflowExamples: Record<WorkflowRecipe, Record<'ready' | 'uncertain' | 'no_action', Record<string, unknown>>> = {
  'quote-followup': { ready: quote, uncertain: { ...quote, amountCents: null }, no_action: { ...quote, status: 'accepted' } },
  'invoice-discrepancies': { ready: invoice, uncertain: { ...invoice, expectedCurrency: 'EUR' }, no_action: { ...invoice, invoicedCents: 100000 } },
  'order-handoff': { ready: order, uncertain: { ...order, productionStatus: 'unknown' }, no_action: { ...order, shipmentStatus: 'delivered' } },
};
