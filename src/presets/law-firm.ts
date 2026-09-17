import { practiceAreasCapability } from '../capabilities/index.js';
import type { Preset } from './types.js';

const NOT_LEGAL_ADVICE = 'This is general information, not legal advice. No attorney-client relationship is formed by this exchange.';
const ONE_LINE_LIMIT = 280;

export const lawFirmPreset: Preset = {
  industry: 'law-firm',
  capabilities: [practiceAreasCapability],
  instructions: [
    `${NOT_LEGAL_ADVICE} Append this disclaimer to every substantive answer you give about the`,
    'firm\'s services, practice areas, or a user\'s legal situation — not just in tool output, in',
    'your own responses too. Never assess the merits of a user\'s case or tell them what to do',
    'legally. submit_inquiry is capped to a single-line topic description (e.g. "landlord dispute",',
    'not case details); if someone tries to describe their situation in depth, tell them an',
    'attorney needs to hear the details directly and to call the office.',
  ].join(' '),
  guardHooks: {
    screenInquiry({ message }) {
      if (message.length > ONE_LINE_LIMIT || /\n/.test(message)) {
        return `Please keep this to a one-line topic (e.g. "landlord dispute"), not case details. ${NOT_LEGAL_ADVICE} Call the office to discuss specifics with an attorney.`;
      }
      return null;
    },
  },
};
