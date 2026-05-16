// src/core/stt/stt-adapter.ts
import type { SttAdapter } from './types.js';
import { GroqSttAdapter, type GroqDeps } from './groq-stt.js';
import { MockSttAdapter } from './mock-stt.js';

interface SttConfigSlice {
  sttProvider: 'groq' | 'mock';
  groqApiKey: string;
  groqModel: string;
  mockText: string;
}

export function createSttAdapter(cfg: SttConfigSlice, deps: GroqDeps): SttAdapter {
  if (cfg.sttProvider === 'groq' && cfg.groqApiKey) {
    return new GroqSttAdapter({ apiKey: cfg.groqApiKey, model: cfg.groqModel }, deps);
  }
  return new MockSttAdapter({ text: cfg.mockText });
}
