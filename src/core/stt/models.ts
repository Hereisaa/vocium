// src/core/stt/models.ts
// Single source of truth for the model dropdown (design D7). Maintained by
// release/PR — NO runtime fetch. The "自訂…" escape hatch (Settings UI) means
// a stale list never blocks anyone: any current/future model id can be typed.
export type CloudProvider = 'groq' | 'openai' | 'gemini';
export interface ModelOption { id: string; label: string; }

export const STT_MODELS: Record<CloudProvider, ModelOption[]> = {
  groq: [
    { id: 'whisper-large-v3-turbo', label: 'whisper-large-v3-turbo（預設）' },
    { id: 'whisper-large-v3', label: 'whisper-large-v3' },
    { id: 'distil-whisper-large-v3-en', label: 'distil-whisper-large-v3-en（英文）' },
  ],
  openai: [
    { id: 'whisper-1', label: 'whisper-1（預設）' },
    { id: 'gpt-4o-transcribe', label: 'gpt-4o-transcribe' },
    { id: 'gpt-4o-mini-transcribe', label: 'gpt-4o-mini-transcribe' },
  ],
  gemini: [
    { id: 'gemini-1.5-flash', label: 'gemini-1.5-flash（預設）' },
    { id: 'gemini-1.5-pro', label: 'gemini-1.5-pro' },
    { id: 'gemini-2.0-flash', label: 'gemini-2.0-flash' },
  ],
};

export const DEFAULT_MODEL: Record<CloudProvider, string> = {
  groq: 'whisper-large-v3-turbo',
  openai: 'whisper-1',
  gemini: 'gemini-1.5-flash',
};

// ---- Polish (LLM) models (design §7.1; same single-source rule as STT_MODELS) ----
export type PolishProvider = 'groq' | 'openai' | 'gemini' | 'claude';

export const POLISH_MODELS: Record<PolishProvider, ModelOption[]> = {
  groq: [
    { id: 'llama-3.3-70b-versatile', label: 'llama-3.3-70b-versatile（預設）' },
    { id: 'llama-3.1-8b-instant', label: 'llama-3.1-8b-instant（快）' },
  ],
  openai: [
    { id: 'gpt-4o-mini', label: 'gpt-4o-mini（預設）' },
    { id: 'gpt-4o', label: 'gpt-4o' },
  ],
  gemini: [
    { id: 'gemini-1.5-flash', label: 'gemini-1.5-flash（預設）' },
    { id: 'gemini-1.5-pro', label: 'gemini-1.5-pro' },
  ],
  claude: [
    { id: 'claude-3-5-haiku-latest', label: 'claude-3-5-haiku（預設）' },
    { id: 'claude-3-5-sonnet-latest', label: 'claude-3-5-sonnet' },
  ],
};

export const DEFAULT_POLISH_MODEL: Record<PolishProvider, string> = {
  groq: 'llama-3.3-70b-versatile',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-1.5-flash',
  claude: 'claude-3-5-haiku-latest',
};
