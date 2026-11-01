// src/stt/models.ts
// Single source of truth for the model dropdown. Maintained by
// release/PR — NO runtime fetch by default. The "自訂…" escape hatch (Settings
// UI) means a stale list never blocks anyone: any current/future model id can
// be typed, and the Settings "refresh model list" button can pull the live
// list from each provider on demand (see list-models.ts).
//
// `label` carries zh-TW speed/cost/quality hints; `labelEn` is the English
// equivalent. The Settings webview imports these lists directly.
//
// MODEL_LIST_VERIFIED_AT records, per provider, the day the lists below were
// last checked against the provider's own docs or /models endpoint. Bump it
// whenever you touch that provider's entries.
export type CloudProvider = 'groq' | 'openai' | 'gemini';
export interface ModelOption { id: string; label: string; labelEn: string; }

// ---- Polish (LLM) providers are a superset of the STT ones ----------------
export type PolishProvider = 'groq' | 'openai' | 'gemini' | 'claude';

/** ISO date (YYYY-MM-DD) of the last manual verification, per provider.
 *  Shown in Settings next to the model dropdown so users can tell how old
 *  the static list is. */
export const MODEL_LIST_VERIFIED_AT: Record<PolishProvider, string> = {
  // Live GET /openai/v1/models with a real key + console.groq.com/docs/deprecations.
  groq: '2026-11-01',
  // developers.openai.com/api/docs/models, /docs/pricing, /docs/guides/speech-to-text.
  openai: '2026-11-01',
  // ai.google.dev/gemini-api/docs/models, /docs/pricing, /docs/deprecations.
  gemini: '2026-11-01',
  // Anthropic model table (claude-haiku-5-5 / claude-sonnet-5-5 / claude-opus-5-5).
  claude: '2026-11-01',
};

/** Model ids a provider has shut down, mapped to the provider's stated
 *  replacement. normalizeConfig() applies this so a config file saved before
 *  the retirement keeps working instead of failing every request. Keep only
 *  ids that hard-fail (silently auto-routed ids like gemini-3.5-flash don't
 *  need an entry). */
export const RETIRED_MODEL_REPLACEMENTS: Readonly<Record<string, string>> = {
  // Groq, retired 2026-07..09 (console.groq.com/docs/deprecations)
  'llama-3.3-70b-versatile': 'openai/gpt-oss-120b',
  'llama-3.1-8b-instant': 'openai/gpt-oss-20b',
  'meta-llama/llama-4-scout-17b-16e-instruct': 'openai/gpt-oss-120b',
  'meta-llama/llama-4-maverick-17b-128e-instruct': 'openai/gpt-oss-120b',
  'qwen/qwen3-32b': 'openai/gpt-oss-120b',
  'qwen/qwen3.6-27b': 'qwen/qwen3.8-27b',
};

/** Return the replacement for a retired id, or the id unchanged. */
export function resolveRetiredModel(id: string): string {
  return RETIRED_MODEL_REPLACEMENTS[id] ?? id;
}

export const STT_MODELS: Record<CloudProvider, ModelOption[]> = {
  groq: [
    { id: 'whisper-large-v3-turbo', label: 'whisper-large-v3-turbo（預設・快）', labelEn: 'whisper-large-v3-turbo (default · fast)' },
    { id: 'whisper-large-v3', label: 'whisper-large-v3（較慢・較準）', labelEn: 'whisper-large-v3 (slower · more accurate)' },
  ],
  openai: [
    // gpt-transcribe is OpenAI's recommended file-transcription model;
    // whisper-1 / gpt-4o-*-transcribe are deprecated (shutdown 2027-02-26).
    { id: 'gpt-transcribe', label: 'gpt-transcribe（預設・準・便宜）', labelEn: 'gpt-transcribe (default · accurate · cheap)' },
    { id: 'gpt-4o-mini-transcribe', label: 'gpt-4o-mini-transcribe（舊・2027-02 停用）', labelEn: 'gpt-4o-mini-transcribe (legacy · retires 2027-02)' },
    { id: 'whisper-1', label: 'whisper-1（舊・2027-02 停用）', labelEn: 'whisper-1 (legacy · retires 2027-02)' },
  ],
  gemini: [
    // gemini-3.5-flash now silently routes to 3.6; Google recommends 3.8 Flash
    // or 3.5 Flash-Lite for new projects. All three accept inline audio via
    // generateContent, which is what gemini-stt.ts uses.
    { id: 'gemini-3.8-flash', label: 'gemini-3.8-flash（預設・快・有免費額度）', labelEn: 'gemini-3.8-flash (default · fast · free tier)' },
    { id: 'gemini-3.5-flash-lite', label: 'gemini-3.5-flash-lite（最快・最便宜）', labelEn: 'gemini-3.5-flash-lite (fastest · cheapest)' },
    { id: 'gemini-4-argon', label: 'gemini-4-argon（最準・較貴・無免費額度）', labelEn: 'gemini-4-argon (most accurate · pricier · no free tier)' },
  ],
};

export const DEFAULT_MODEL: Record<CloudProvider, string> = {
  groq: 'whisper-large-v3-turbo',
  openai: 'gpt-transcribe',
  gemini: 'gemini-3.8-flash',
};

// ---- Polish (LLM) models (same single-source rule as STT_MODELS) ----------
export const POLISH_MODELS: Record<PolishProvider, ModelOption[]> = {
  groq: [
    // llama-3.3-70b-versatile / llama-3.1-8b-instant were retired 2026-08-16;
    // Groq's stated replacements are gpt-oss-120b / gpt-oss-20b.
    { id: 'openai/gpt-oss-120b', label: 'openai/gpt-oss-120b（預設・品質佳）', labelEn: 'openai/gpt-oss-120b (default · good quality)' },
    { id: 'openai/gpt-oss-20b', label: 'openai/gpt-oss-20b（最快・最便宜）', labelEn: 'openai/gpt-oss-20b (fastest · cheapest)' },
    { id: 'qwen/qwen3.8-27b', label: 'qwen/qwen3.8-27b（預覽・中文佳）', labelEn: 'qwen/qwen3.8-27b (preview · strong Chinese)' },
  ],
  openai: [
    // GPT-6 generation; all three support /v1/chat/completions (polish.ts).
    { id: 'gpt-6.1-terra', label: 'gpt-6.1-terra（預設・快・平價）', labelEn: 'gpt-6.1-terra (default · fast · value)' },
    { id: 'gpt-6-luna', label: 'gpt-6-luna（最快・最便宜）', labelEn: 'gpt-6-luna (fastest · cheapest)' },
    { id: 'gpt-6.1-sol', label: 'gpt-6.1-sol（品質佳・較貴）', labelEn: 'gpt-6.1-sol (higher quality · pricier)' },
  ],
  gemini: [
    { id: 'gemini-3.8-flash', label: 'gemini-3.8-flash（預設・快・有免費額度）', labelEn: 'gemini-3.8-flash (default · fast · free tier)' },
    { id: 'gemini-3.5-flash-lite', label: 'gemini-3.5-flash-lite（最快・最便宜）', labelEn: 'gemini-3.5-flash-lite (fastest · cheapest)' },
    { id: 'gemini-4-argon', label: 'gemini-4-argon（最佳・較貴・無免費額度）', labelEn: 'gemini-4-argon (best · pricier · no free tier)' },
  ],
  claude: [
    { id: 'claude-haiku-5-5', label: 'claude-haiku-5-5（預設・快・便宜）', labelEn: 'claude-haiku-5-5 (default · fast · cheap)' },
    { id: 'claude-sonnet-5-5', label: 'claude-sonnet-5-5（平衡）', labelEn: 'claude-sonnet-5-5 (balanced)' },
    { id: 'claude-opus-5-5', label: 'claude-opus-5-5（最佳・最貴）', labelEn: 'claude-opus-5-5 (best · priciest)' },
  ],
};

export const DEFAULT_POLISH_MODEL: Record<PolishProvider, string> = {
  groq: 'openai/gpt-oss-120b',
  openai: 'gpt-6.1-terra',
  gemini: 'gemini-3.8-flash',
  claude: 'claude-haiku-5-5',
};
