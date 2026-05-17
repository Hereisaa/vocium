// src/core/stt/describe-error.ts
//
// User-facing messages injected when transcription cannot produce real text.
// describeSttError is a TOTAL pure function: any input -> a string, never throws.

export const GUIDANCE_MSG =
  '（尚未設定 API Key，請開啟 Vocium 設定填入 Groq API Key）';

const MSG_INVALID_KEY = '（語音轉錄失敗：API Key 無效，請於設定檢查）';
const MSG_RATE_LIMIT  = '（語音轉錄失敗：請求過於頻繁，請稍後再試）';
const MSG_NETWORK     = '（語音轉錄失敗：網路異常，請檢查連線）';
const MSG_TIMEOUT     = '（語音轉錄失敗：請求逾時，請稍後再試）';
const MSG_SERVICE     = '（語音轉錄失敗：轉錄服務錯誤，請稍後再試）';

export function describeSttError(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  const m = raw.toLowerCase();
  if (m.includes('401') || m.includes('invalid api key') || m.includes('invalid_api_key')) {
    return MSG_INVALID_KEY;
  }
  if (m.includes('429') || m.includes('rate limit') || m.includes('rate_limit')) {
    return MSG_RATE_LIMIT;
  }
  if (m.includes('timeout') || m.includes('aborterror') || m.includes('etimedout')) {
    return MSG_TIMEOUT;
  }
  if (
    m.includes('fetch failed') || m.includes('enotfound') ||
    m.includes('econnrefused') || m.includes('eai_again') || m.includes('network')
  ) {
    return MSG_NETWORK;
  }
  return MSG_SERVICE;
}
