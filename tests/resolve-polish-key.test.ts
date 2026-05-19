// tests/resolve-polish-key.test.ts
import { describe, it, expect } from 'vitest';
import { resolvePolishKey } from '../src/core/polish/polish.js';

const base = {
  polishProvider: 'groq' as const, polishApiKey: '', claudeApiKey: '',
  groqApiKey: '', openaiApiKey: '', geminiApiKey: '',
};

describe('resolvePolishKey', () => {
  it('claude → claudeApiKey', () => {
    expect(resolvePolishKey({ ...base, polishProvider: 'claude', claudeApiKey: 'ck' })).toBe('ck');
  });
  it('same-provider reuse: openai → openaiApiKey when no override', () => {
    expect(resolvePolishKey({ ...base, polishProvider: 'openai', openaiApiKey: 'sk' })).toBe('sk');
  });
  it('explicit polishApiKey overrides the shared key', () => {
    expect(resolvePolishKey({ ...base, polishProvider: 'openai', openaiApiKey: 'sk', polishApiKey: 'ov' })).toBe('ov');
  });
  it('blank → empty string', () => {
    expect(resolvePolishKey({ ...base, polishProvider: 'gemini' })).toBe('');
  });
  it('claude: claudeApiKey always wins; polishApiKey is NOT an override (design E1)', () => {
    expect(resolvePolishKey({ ...base, polishProvider: 'claude', claudeApiKey: 'ck', polishApiKey: 'override' })).toBe('ck');
  });
});
