// System prompts for the optional post-transcription polish step (design §4).
// All styles MUST preserve meaning and language; output only revised text.
// An optional zh-script directive can be appended between the style prompt and
// SAFETY_SUFFIX to nudge the LLM toward the user's chosen Chinese script.
// This directive composes with (does NOT override) SAFETY_SUFFIX's
// "preserve the original language" guarantee — non-Chinese text is never
// translated into Chinese.
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

/** Script-specific directives keyed to the user's zh conversion mode.
 *  Only applies when the text is already Chinese; never forces Chinese on
 *  non-Chinese input (safe to compose with SAFETY_SUFFIX). */
export const ZH_SCRIPT_PROMPTS: Record<'twp' | 'cn', string> = {
  twp: 'If the text is Chinese, write the result in Traditional Chinese (Taiwan). Do NOT translate non-Chinese text into Chinese.',
  cn:  'If the text is Chinese, write the result in Simplified Chinese. Do NOT translate non-Chinese text into Chinese.',
};

/** Resolve the system prompt for a style. custom with blank prompt → light.
 *  If zhScript is provided, its directive is inserted between the style/custom
 *  prompt and SAFETY_SUFFIX (does not alter 2-arg callers — byte-identical). */
export function buildSystemPrompt(style: PolishStyle, customPrompt: string, zhScript?: 'twp' | 'cn'): string {
  let base: string;
  if (style === 'custom') {
    const c = customPrompt.trim();
    base = c.length ? c : STYLE_PROMPTS.light;
  } else {
    base = STYLE_PROMPTS[style];
  }
  if (zhScript !== undefined) {
    return `${base}\n${ZH_SCRIPT_PROMPTS[zhScript]}\n${SAFETY_SUFFIX}`;
  }
  return `${base}\n${SAFETY_SUFFIX}`;
}
