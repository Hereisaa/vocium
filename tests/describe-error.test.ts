// tests/describe-error.test.ts
import { describe, it, expect } from 'vitest';
import { describeSttError, GUIDANCE_MSG } from '../src/core/stt/describe-error.js';

describe('describeSttError', () => {
  it('401 / invalid key -> API Key 無效', () => {
    expect(describeSttError(new Error('Groq STT failed: 401 {"error":{"code":"invalid_api_key"}}')))
      .toBe('（語音轉錄失敗：API Key 無效，請於設定檢查）');
  });
  it('429 / rate limit -> 請求過於頻繁', () => {
    expect(describeSttError(new Error('Groq STT failed: 429 rate limit reached')))
      .toBe('（語音轉錄失敗：請求過於頻繁，請稍後再試）');
  });
  it('network errors -> 網路異常', () => {
    expect(describeSttError(new Error('fetch failed')))
      .toBe('（語音轉錄失敗：網路異常，請檢查連線）');
    expect(describeSttError(new Error('getaddrinfo ENOTFOUND api.groq.com')))
      .toBe('（語音轉錄失敗：網路異常，請檢查連線）');
  });
  it('timeout / abort -> 請求逾時', () => {
    expect(describeSttError(new Error('The operation was aborted (AbortError)')))
      .toBe('（語音轉錄失敗：請求逾時，請稍後再試）');
  });
  it('tie-break: message with both timeout and network substrings -> timeout wins', () => {
    expect(describeSttError(new Error('fetch failed: timeout')))
      .toBe('（語音轉錄失敗：請求逾時，請稍後再試）');
  });
  it('other 5xx / unknown -> 轉錄服務錯誤', () => {
    expect(describeSttError(new Error('Groq STT failed: 503 service unavailable')))
      .toBe('（語音轉錄失敗：轉錄服務錯誤，請稍後再試）');
  });
  it('total: null / non-error never throws -> default branch', () => {
    expect(describeSttError(null)).toBe('（語音轉錄失敗：轉錄服務錯誤，請稍後再試）');
    expect(describeSttError('weird')).toBe('（語音轉錄失敗：轉錄服務錯誤，請稍後再試）');
    expect(describeSttError(undefined)).toBe('（語音轉錄失敗：轉錄服務錯誤，請稍後再試）');
  });
  it('string input that matches a branch is classified (not just default)', () => {
    expect(describeSttError('401 unauthorized')).toBe('（語音轉錄失敗：API Key 無效，請於設定檢查）');
  });
  it('exports the no-key guidance constant', () => {
    expect(GUIDANCE_MSG).toBe('（尚未設定 API Key，請開啟 Vocium 設定填入 Groq API Key）');
  });
  it('describeSttError never returns GUIDANCE_MSG (errors are not the no-key case)', () => {
    expect(describeSttError(null)).not.toBe(GUIDANCE_MSG);
    expect(describeSttError(new Error('401'))).not.toBe(GUIDANCE_MSG);
  });
});
