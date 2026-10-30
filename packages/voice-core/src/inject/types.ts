// src/inject/types.ts
// The injector contract. voice-core never touches the OS itself: the host
// (Vocium's Rust shell, or any other embedder) supplies an implementation.
export interface InjectResult { ok: boolean; message?: string; }
export interface Injector {
  inject(text: string): Promise<InjectResult>;
  /** Optional: pre-warm any heavyweight host. Best-effort: never throws. */
  warmup?(): Promise<void>;
  /** Optional: run the permission-sensitive paste step WITHOUT writing to the
   *  clipboard or pasting, then classify the result with the same
   *  {ok,message} shape as inject(). Platforms without permission gating
   *  may omit. */
  probe?(): Promise<InjectResult>;
}
