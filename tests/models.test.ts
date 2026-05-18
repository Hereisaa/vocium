// tests/models.test.ts
import { describe, it, expect } from 'vitest';
import { STT_MODELS, DEFAULT_MODEL } from '../src/core/stt/models.js';

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
    expect(DEFAULT_MODEL.openai).toBe('whisper-1');
    expect(DEFAULT_MODEL.gemini).toBe('gemini-1.5-flash');
  });
});
