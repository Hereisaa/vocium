// src/core/stt/models.ts
// Single source of truth for the model dropdown (design D7). Maintained by
// release/PR — NO runtime fetch. The "自訂…" escape hatch (Settings UI) means
// a stale list never blocks anyone: any current/future model id can be typed.
// `label` carries zh-TW speed/cost/quality hints; `labelEn` is the English
// equivalent. `app-tauri/ui/settings.js` mirrors this shape. Verified: 2026-05.
export type CloudProvider = 'groq' | 'openai' | 'gemini';
export interface ModelOption { id: string; label: string; labelEn: string; }

export const STT_MODELS: Record<CloudProvider, ModelOption[]> = {
  groq: [
    { id: 'whisper-large-v3-turbo', label: 'whisper-large-v3-turbo（預設・快）', labelEn: 'whisper-large-v3-turbo (default · fast)' },
    { id: 'whisper-large-v3', label: 'whisper-large-v3（較慢・較準）', labelEn: 'whisper-large-v3 (slower · more accurate)' },
  ],
  openai: [
    { id: 'whisper-1', label: 'whisper-1（預設・便宜）', labelEn: 'whisper-1 (default · cheap)' },
    { id: 'gpt-4o-transcribe', label: 'gpt-4o-transcribe（最準・較貴）', labelEn: 'gpt-4o-transcribe (most accurate · pricier)' },
    { id: 'gpt-4o-mini-transcribe', label: 'gpt-4o-mini-transcribe（快・平價）', labelEn: 'gpt-4o-mini-transcribe (fast · value)' },
  ],
  gemini: [
    { id: 'gemini-3.5-flash', label: 'gemini-3.5-flash（預設・快）', labelEn: 'gemini-3.5-flash (default · fast)' },
    { id: 'gemini-3.1-flash-lite', label: 'gemini-3.1-flash-lite（最快・最便宜）', labelEn: 'gemini-3.1-flash-lite (fastest · cheapest)' },
    { id: 'gemini-3.1-pro-preview', label: 'gemini-3.1-pro-preview（最準・較貴）', labelEn: 'gemini-3.1-pro-preview (most accurate · pricier)' },
  ],
};

export const DEFAULT_MODEL: Record<CloudProvider, string> = {
  groq: 'whisper-large-v3-turbo',
  openai: 'whisper-1',
  gemini: 'gemini-3.5-flash',
};

// ---- Polish (LLM) models (design §7.1; same single-source rule as STT_MODELS) ----
export type PolishProvider = 'groq' | 'openai' | 'gemini' | 'claude';

export const POLISH_MODELS: Record<PolishProvider, ModelOption[]> = {
  groq: [
    { id: 'llama-3.3-70b-versatile', label: 'llama-3.3-70b-versatile（預設・品質佳）', labelEn: 'llama-3.3-70b-versatile (default · good quality)' },
    { id: 'llama-3.1-8b-instant', label: 'llama-3.1-8b-instant（最快・最便宜）', labelEn: 'llama-3.1-8b-instant (fastest · cheapest)' },
    { id: 'openai/gpt-oss-120b', label: 'openai/gpt-oss-120b（高品質・較慢）', labelEn: 'openai/gpt-oss-120b (high quality · slower)' },
    { id: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'meta-llama/llama-4-scout-17b-16e-instruct（新・快）', labelEn: 'meta-llama/llama-4-scout-17b-16e-instruct (new · fast)' },
  ],
  openai: [
    { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini（預設・快・平價）', labelEn: 'gpt-5.4-mini (default · fast · value)' },
    { id: 'gpt-5.5', label: 'gpt-5.5（最佳・較貴）', labelEn: 'gpt-5.5 (best · pricier)' },
    { id: 'gpt-5.4-nano', label: 'gpt-5.4-nano（最快・最便宜）', labelEn: 'gpt-5.4-nano (fastest · cheapest)' },
  ],
  gemini: [
    { id: 'gemini-3.5-flash', label: 'gemini-3.5-flash（預設・快）', labelEn: 'gemini-3.5-flash (default · fast)' },
    { id: 'gemini-3.1-pro-preview', label: 'gemini-3.1-pro-preview（最準・較貴）', labelEn: 'gemini-3.1-pro-preview (most accurate · pricier)' },
    { id: 'gemini-3.1-flash-lite', label: 'gemini-3.1-flash-lite（最快・最便宜）', labelEn: 'gemini-3.1-flash-lite (fastest · cheapest)' },
  ],
  claude: [
    { id: 'claude-haiku-4-5', label: 'claude-haiku-4-5（預設・快・便宜）', labelEn: 'claude-haiku-4-5 (default · fast · cheap)' },
    { id: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6（平衡）', labelEn: 'claude-sonnet-4-6 (balanced)' },
    { id: 'claude-opus-4-7', label: 'claude-opus-4-7（最佳・最貴）', labelEn: 'claude-opus-4-7 (best · priciest)' },
  ],
};

export const DEFAULT_POLISH_MODEL: Record<PolishProvider, string> = {
  groq: 'llama-3.3-70b-versatile',
  openai: 'gpt-5.4-mini',
  gemini: 'gemini-3.5-flash',
  claude: 'claude-haiku-4-5',
};
