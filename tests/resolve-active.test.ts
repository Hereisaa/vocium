// tests/resolve-active.test.ts
import { describe, it, expect } from 'vitest';
import { resolveActive } from '../src/core/stt/resolve-active.js';
import { DEFAULTS } from '../src/core/config.js';

const base = { ...DEFAULTS };

describe('resolveActive', () => {
  it('groq + key -> provider groq, not noKey', () => {
    const r = resolveActive({ ...base, sttProvider: 'groq', groqApiKey: 'k' });
    expect(r).toMatchObject({ provider: 'groq', apiKey: 'k', model: 'whisper-large-v3-turbo', mockMode: false, noKey: false });
  });
  it('groq + blank key -> noKey true (not mock)', () => {
    const r = resolveActive({ ...base, sttProvider: 'groq', groqApiKey: '  ' });
    expect(r.mockMode).toBe(false);
    expect(r.noKey).toBe(true);
  });
  it('openai picks openai fields incl baseUrl', () => {
    const r = resolveActive({ ...base, sttProvider: 'openai', openaiApiKey: 'sk', openaiModel: 'whisper-1', openaiBaseUrl: 'https://b/v1' });
    expect(r).toMatchObject({ provider: 'openai', apiKey: 'sk', model: 'whisper-1', baseUrl: 'https://b/v1', noKey: false });
  });
  it('gemini blank key -> noKey', () => {
    const r = resolveActive({ ...base, sttProvider: 'gemini', geminiApiKey: '' });
    expect(r).toMatchObject({ provider: 'gemini', noKey: true, mockMode: false });
  });
  it('mock -> mockMode true, noKey false', () => {
    const r = resolveActive({ ...base, sttProvider: 'mock' });
    expect(r).toMatchObject({ provider: 'mock', mockMode: true, noKey: false });
  });
});
