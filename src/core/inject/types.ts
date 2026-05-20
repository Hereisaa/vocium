// src/core/inject/types.ts
export interface InjectResult { ok: boolean; message?: string; }
export interface Injector {
  inject(text: string): Promise<InjectResult>;
  /** Optional: pre-warm any heavyweight host (e.g. WinForms JIT, AppleScript
   *  runtime). Best-effort: never throws, never blocks the caller's critical
   *  path. */
  warmup?(): Promise<void>;
  /** Optional: run the permission-sensitive paste step (e.g. osascript
   *  System Events) WITHOUT writing to the clipboard or sending Cmd+V, then
   *  classify the result with the same {ok,message} shape as inject(). The
   *  webview calls this at boot so a stale macOS Accessibility entry (after
   *  rebuilding the .app) is surfaced immediately, instead of after the
   *  first voice attempt. Platforms without permission gating may omit. */
  probe?(): Promise<InjectResult>;
}

export type ExecFile = (
  cmd: string,
  args: string[],
  cb: (err: Error | null, stdout: string, stderr: string) => void,
) => void;

/** Minimal structural view of a spawned child (node:child_process.ChildProcess
 *  satisfies this) so a persistent host stays unit-testable via injection.
 *  `stdin.write` accepts `Uint8Array` so binary payloads (e.g. UTF-8 bytes
 *  to `pbcopy`) can be passed without round-tripping through a shell. */
export interface ChildLike {
  stdin: { write(data: string | Uint8Array): void; end(): void } | null;
  stdout: { on(ev: 'data', cb: (d: Buffer | string) => void): void } | null;
  stderr?: { on(ev: 'data', cb: (d: Buffer | string) => void): void } | null;
  on(ev: 'exit' | 'error', cb: (...a: unknown[]) => void): void;
  kill(): void;
  killed?: boolean;
}
export type SpawnFn = (cmd: string, args: string[]) => ChildLike;

/** Process-spawning dependencies shared by the Windows and macOS injectors,
 *  injected so unit tests never touch real powershell/pbcopy/osascript. */
export interface ProcDeps {
  execFile: ExecFile;
  /** Optional persistent host (Windows only today). When absent the injector
   *  uses the one-shot `execFile` path. */
  spawn?: SpawnFn;
  delayMs?: number;
  /** Per-command sentinel wait before declaring a persistent host dead. */
  hostTimeoutMs?: number;
}

export class NotImplementedError extends Error {
  constructor(platform: string) {
    super(`Text injection not implemented for platform: ${platform}`);
    this.name = 'NotImplementedError';
  }
}
