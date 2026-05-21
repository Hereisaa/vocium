// src/core/stt/describe-error.ts
//
// User-facing messages injected when transcription cannot produce real text.
// describeSttError is a TOTAL pure function: any input -> a string, never throws.

export type Lang = 'zh-TW' | 'en';

/** Backwards-compatible no-key constant: Traditional Chinese, Groq provider.
 *  Retained so existing callers/tests that import GUIDANCE_MSG keep working.
 *  New call sites should prefer guidanceMsg(lang, provider) for provider/lang
 *  awareness. */
export const GUIDANCE_MSG =
  '（尚未設定 API Key，請開啟 Vocium 設定填入 Groq API Key）';

/** Human-readable provider label used inside the no-key guidance message. */
function providerLabel(provider: string): string {
  switch (provider) {
    case 'openai': return 'OpenAI';
    case 'gemini': return 'Gemini';
    case 'groq':
    default:       return 'Groq';
  }
}

/** Localized no-key guidance: "you haven't set an API key yet". Default lang is
 *  'zh-TW' and default provider 'groq', so guidanceMsg() === GUIDANCE_MSG. */
export function guidanceMsg(lang: Lang = 'zh-TW', provider = 'groq'): string {
  const label = providerLabel(provider);
  if (lang === 'en') {
    return `(No API key set — open Vocium Settings and enter your ${label} API key)`;
  }
  return `（尚未設定 API Key，請開啟 Vocium 設定填入 ${label} API Key）`;
}

const MSG_INVALID_KEY = '（語音轉錄失敗：API Key 無效，請於設定檢查）';
const MSG_RATE_LIMIT  = '（語音轉錄失敗：請求過於頻繁，請稍後再試）';
const MSG_NETWORK     = '（語音轉錄失敗：網路異常，請檢查連線）';
const MSG_TIMEOUT     = '（語音轉錄失敗：請求逾時，請稍後再試）';
const MSG_SERVICE     = '（語音轉錄失敗：轉錄服務錯誤，請稍後再試）';

const EN_INVALID_KEY = 'Invalid API key';
const EN_RATE_LIMIT  = 'Rate limited — too many requests';
const EN_NETWORK     = 'Network error';
const EN_TIMEOUT     = 'Request timed out';
const EN_SERVICE     = 'STT service error';

export function describeSttError(e: unknown, lang: Lang = 'zh-TW'): string {
  const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  const m = raw.toLowerCase();
  const en = lang === 'en';
  if (m.includes('401') || m.includes('invalid api key') || m.includes('invalid_api_key')) {
    return en ? EN_INVALID_KEY : MSG_INVALID_KEY;
  }
  if (m.includes('429') || m.includes('rate limit') || m.includes('rate_limit')) {
    return en ? EN_RATE_LIMIT : MSG_RATE_LIMIT;
  }
  if (m.includes('timeout') || m.includes('aborterror') || m.includes('etimedout')) {
    return en ? EN_TIMEOUT : MSG_TIMEOUT;
  }
  if (
    m.includes('fetch failed') || m.includes('enotfound') ||
    m.includes('econnrefused') || m.includes('eai_again') || m.includes('network')
  ) {
    return en ? EN_NETWORK : MSG_NETWORK;
  }
  return en ? EN_SERVICE : MSG_SERVICE;
}
