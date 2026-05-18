// src/core/stt/types.ts
export interface SttInput { audio: Buffer; mimeType: string; language?: string; }
export interface SttResult { text: string; durationMs?: number; }
export interface SttAdapter { transcribe(input: SttInput): Promise<SttResult>; }
export interface SttDeps { fetch: typeof fetch; }
