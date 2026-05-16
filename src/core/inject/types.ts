// src/core/inject/types.ts
export interface InjectResult { ok: boolean; message?: string; }
export interface Injector {
  inject(text: string): Promise<InjectResult>;
  /** Optional: pre-warm any heavyweight host (e.g. WinForms JIT). Best-effort:
   *  never throws, never blocks the caller's critical path. */
  warmup?(): Promise<void>;
}

export class NotImplementedError extends Error {
  constructor(platform: string) {
    super(`Text injection not implemented for platform: ${platform}`);
    this.name = 'NotImplementedError';
  }
}
