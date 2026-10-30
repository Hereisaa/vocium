// voice-core public surface. Pure TypeScript: the only runtime dependency is a
// `fetch` implementation injected by the host (browser fetch, Node fetch, or
// Tauri's plugin-http fetch). No Node built-ins, no DOM, no filesystem.

export * from './state-machine.js';
export * from './pipeline.js';
export * from './config.js';
export * from './health.js';
export * from './zh-convert.js';
export * from './base64.js';

export * from './stt/types.js';
export * from './stt/models.js';
export * from './stt/resolve-active.js';
export * from './stt/stt-adapter.js';
export * from './stt/describe-error.js';
export * from './stt/with-timeout.js';
export { GroqSttAdapter } from './stt/groq-stt.js';
export { OpenAiSttAdapter } from './stt/openai-stt.js';
export { GeminiSttAdapter } from './stt/gemini-stt.js';
export { MockSttAdapter } from './stt/mock-stt.js';

export * from './polish/polish.js';
export * from './polish/prompts.js';

export * from './inject/types.js';
export * from './audio/trim-silence.js';
