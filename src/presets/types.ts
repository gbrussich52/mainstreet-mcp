import type { Industry } from '../config/schema.js';
import type { Capability } from '../capabilities/types.js';

export interface GuardHooks {
  /**
   * Screens a submit_inquiry payload before it's persisted. Return a
   * rejection message to block the write (and hand it back to the caller as
   * `accepted: false`), or `null` to allow it through.
   */
  screenInquiry?(input: { topic?: string; message: string }): string | null;
}

export interface Preset {
  industry: Industry;
  // Capability modules this industry may enable. A business.yaml for this
  // industry may only turn on capabilities from this list.
  capabilities: Capability[];
  // Guardrail text appended to the server's `instructions` field — read by
  // the connecting AI assistant, not just documentation.
  instructions: string;
  guardHooks?: GuardHooks;
}
