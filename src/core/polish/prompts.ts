// System prompts for the optional post-transcription polish step (design §4).
// All styles MUST preserve meaning and language; output only revised text.
export type PolishStyle = 'light' | 'full' | 'custom';

export const STYLE_PROMPTS: Record<'light' | 'full', string> = {
  light:
    'You lightly clean a speech transcript: fix punctuation and obvious ' +
    'mis-recognitions, remove filler words (um, uh, 嗯, 那個, 就是), but do ' +
    'NOT rephrase, reorder, or change wording.',
  full:
    'You polish a speech transcript so it reads smoothly: correct ' +
    'punctuation, make sentences fluent and tone consistent, but do NOT ' +
    'change the meaning.',
};

export const SAFETY_SUFFIX =
  'Preserve the original meaning and the original language. Output ONLY the ' +
  'revised text — no preamble, no explanation, no quotes.';

/** Resolve the system prompt for a style. custom with blank prompt → light. */
export function buildSystemPrompt(style: PolishStyle, customPrompt: string): string {
  if (style === 'custom') {
    const c = customPrompt.trim();
    return `${c.length ? c : STYLE_PROMPTS.light}\n${SAFETY_SUFFIX}`;
  }
  return `${STYLE_PROMPTS[style]}\n${SAFETY_SUFFIX}`;
}
