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
