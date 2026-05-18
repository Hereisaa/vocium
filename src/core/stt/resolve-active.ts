// src/core/stt/resolve-active.ts
// Single TS source of truth for "which provider/key/model is effectively
// active" (mirrors the Rust derive_active helper; D1/D4). Pure, no I/O.
import type { VociumConfig } from '../config.js';

export interface ActiveStt {
  provider: 'groq' | 'openai' | 'gemini' | 'mock';
  apiKey: string;
  model: string;
  baseUrl: string; // only meaningful for openai; '' otherwise
  mockMode: boolean;
  noKey: boolean;
}

export type ActiveSlice = Pick<
  VociumConfig,
  | 'sttProvider' | 'groqApiKey' | 'groqModel'
  | 'openaiApiKey' | 'openaiModel' | 'openaiBaseUrl'
  | 'geminiApiKey' | 'geminiModel'
>;

export function resolveActive(cfg: ActiveSlice): ActiveStt {
  if (cfg.sttProvider === 'mock') {
    return { provider: 'mock', apiKey: '', model: '', baseUrl: '', mockMode: true, noKey: false };
  }
  let apiKey = '', model = '', baseUrl = '';
  if (cfg.sttProvider === 'openai') {
    apiKey = cfg.openaiApiKey; model = cfg.openaiModel; baseUrl = cfg.openaiBaseUrl;
  } else if (cfg.sttProvider === 'gemini') {
    apiKey = cfg.geminiApiKey; model = cfg.geminiModel;
  } else {
    apiKey = cfg.groqApiKey; model = cfg.groqModel;
  }
  return {
    provider: cfg.sttProvider,
    apiKey, model, baseUrl,
    mockMode: false,
    noKey: apiKey.trim() === '',
  };
}
