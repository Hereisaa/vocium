// src/core/stt/stt-adapter.ts
import type { SttAdapter, SttDeps } from './types.js';
import { GroqSttAdapter } from './groq-stt.js';
import { OpenAiSttAdapter } from './openai-stt.js';
import { GeminiSttAdapter } from './gemini-stt.js';
import { MockSttAdapter } from './mock-stt.js';
import { resolveActive } from './resolve-active.js';
import type { ActiveSlice } from './resolve-active.js';
import type { VociumConfig } from '../config.js';

export type { SttDeps };

type Slice = ActiveSlice & Pick<VociumConfig, 'mockText'>;

export function createSttAdapter(cfg: Slice, deps: SttDeps): SttAdapter {
  const a = resolveActive(cfg);
  if (a.provider === 'mock') return new MockSttAdapter({ text: cfg.mockText });
  if (a.provider === 'openai') {
    return new OpenAiSttAdapter({ apiKey: a.apiKey, model: a.model, baseUrl: a.baseUrl }, deps);
  }
  if (a.provider === 'gemini') {
    return new GeminiSttAdapter({ apiKey: a.apiKey, model: a.model }, deps);
  }
  // 'groq' (incl. blank key — pipeline injects guidance via noKey, no mock).
  return new GroqSttAdapter({ apiKey: a.apiKey, model: a.model }, deps);
}
