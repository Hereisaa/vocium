// src/core/polish/polish.ts
// Optional post-transcription LLM polish (design §4). Total: any failure,
// non-2xx, timeout, empty response, or missing key → returns the input text
// unchanged, never throws (mirrors zh-convert.ts contract).
import { buildSystemPrompt, wrapTranscript, type PolishStyle } from './prompts.js';
import type { PolishProvider } from '../stt/models.js';

// Re-export so callers that import PolishProvider from this module continue to work.
export type { PolishProvider } from '../stt/models.js';
export interface PolishDeps { fetch: typeof fetch; }

export interface ResolvedPolish {
  provider: PolishProvider;
  model: string;
  style: PolishStyle;
  customPrompt: string;
  apiKey: string;
  zhScript?: 'twp' | 'cn';
}

interface KeySlice {
  polishProvider: PolishProvider;
  polishApiKey: string;
  claudeApiKey: string;
  groqApiKey: string;
  openaiApiKey: string;
  geminiApiKey: string;
}

/** Same-provider key reuse with optional override (design E1). */
export function resolvePolishKey(c: KeySlice): string {
  if (c.polishProvider === 'claude') return c.claudeApiKey.trim();
  if (c.polishApiKey.trim()) return c.polishApiKey.trim();
  const shared =
    c.polishProvider === 'openai' ? c.openaiApiKey
    : c.polishProvider === 'gemini' ? c.geminiApiKey
    : c.groqApiKey;
  return shared.trim();
}

const POLISH_TIMEOUT_MS = 10_000;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

/** Strip a single echoed leading <transcript> and trailing </transcript> wrapper (anchored, case-insensitive). */
function stripTranscriptTags(s: string): string {
  return s
    .replace(/^\s*<transcript>\s*/i, '')
    .replace(/\s*<\/transcript>\s*$/i, '')
    .trim();
}

export async function polishText(
  text: string,
  r: ResolvedPolish,
  deps: PolishDeps,
): Promise<string> {
  if (!text.trim() || !r.apiKey.trim()) return text;
  const userContent = wrapTranscript(text);
  const system = buildSystemPrompt(r.style, r.customPrompt, r.zhScript);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), POLISH_TIMEOUT_MS);
  try {
    let out = '';
    if (r.provider === 'groq' || r.provider === 'openai') {
      const res = await deps.fetch(r.provider === 'groq' ? GROQ_URL : OPENAI_URL, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${r.apiKey}` },
        body: JSON.stringify({
          model: r.model,
          messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }],
        }),
      });
      if (!res.ok) return text;
      const d = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      out = d.choices?.[0]?.message?.content ?? '';
    } else if (r.provider === 'gemini') {
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${r.model}` +
        `:generateContent?key=${encodeURIComponent(r.apiKey)}`;
      const res = await deps.fetch(url, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ parts: [{ text: userContent }] }],
        }),
      });
      if (!res.ok) return text;
      const d = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      out = (d.candidates?.[0]?.content?.parts ?? []).map((x) => x.text ?? '').join('');
    } else {
      // claude
      const res = await deps.fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': r.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: r.model, max_tokens: 2048, system,
          messages: [{ role: 'user', content: userContent }],
        }),
      });
      if (!res.ok) return text;
      const d = (await res.json()) as { content?: { type: string; text?: string }[] };
      out = (d.content ?? []).map((x) => x.text ?? '').join('');
    }
    const cleaned = stripTranscriptTags(out.trim());
    return cleaned ? cleaned : text;
  } catch {
    return text;
  } finally {
    clearTimeout(timer);
  }
}
