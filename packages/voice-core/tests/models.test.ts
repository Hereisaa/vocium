// tests/models.test.ts
import { describe, it, expect } from 'vitest';
import { STT_MODELS, DEFAULT_MODEL, POLISH_MODELS, DEFAULT_POLISH_MODEL, MODEL_LIST_VERIFIED_AT, RETIRED_MODEL_REPLACEMENTS, resolveRetiredModel } from '../src/stt/models.js';

describe('STT_MODELS', () => {
  it('every cloud provider has >=1 model and a default that is in its list', () => {
    for (const p of ['groq', 'openai', 'gemini'] as const) {
      const ids = STT_MODELS[p].map((m) => m.id);
      expect(ids.length).toBeGreaterThan(0);
      expect(ids).toContain(DEFAULT_MODEL[p]);
    }
  });
  it('matches config defaults', () => {
    expect(DEFAULT_MODEL.groq).toBe('whisper-large-v3-turbo');
    expect(DEFAULT_MODEL.openai).toBe('gpt-transcribe');
    expect(DEFAULT_MODEL.gemini).toBe('gemini-3.8-flash');
  });
});

describe('POLISH_MODELS', () => {
  it('each provider has >=1 model and a default in its list', () => {
    for (const p of ['groq', 'openai', 'gemini', 'claude'] as const) {
      const ids = POLISH_MODELS[p].map((m) => m.id);
      expect(ids.length).toBeGreaterThan(0);
      expect(ids).toContain(DEFAULT_POLISH_MODEL[p]);
    }
  });
  it('groq default matches config DEFAULTS.polishModel', () => {
    expect(DEFAULT_POLISH_MODEL.groq).toBe('openai/gpt-oss-120b');
  });
});

describe('RETIRED_MODEL_REPLACEMENTS', () => {
  it('maps retired ids to a current preset and leaves others alone', () => {
    expect(resolveRetiredModel('llama-3.3-70b-versatile')).toBe('openai/gpt-oss-120b');
    expect(resolveRetiredModel('openai/gpt-oss-120b')).toBe('openai/gpt-oss-120b');
    expect(resolveRetiredModel('my-custom-model')).toBe('my-custom-model');
    const groqIds = POLISH_MODELS.groq.map((m) => m.id);
    for (const to of Object.values(RETIRED_MODEL_REPLACEMENTS)) expect(groqIds).toContain(to);
  });
});

describe('MODEL_LIST_VERIFIED_AT', () => {
  it('has an ISO date for every polish provider (superset of STT providers)', () => {
    for (const p of ['groq', 'openai', 'gemini', 'claude'] as const) {
      expect(MODEL_LIST_VERIFIED_AT[p]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(MODEL_LIST_VERIFIED_AT[p]))).toBe(false);
    }
  });
});
