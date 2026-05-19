// src/core/inject/macos.ts
import type { Injector, InjectResult, ProcDeps, ExecFile } from './types.js';

/** osascript / Apple-events "not trusted for Accessibility" signatures. */
const ACCESS_DENIED = /-1719|not allowed assistive access|not authorized to send Apple events/i;

/** One-shot `/bin/sh -c`. Rejects with an Error whose message includes stderr
 *  (osascript reports the Accessibility denial on stderr, not in err.message). */
function sh(execFile: ExecFile, command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('/bin/sh', ['-c', command], (err, _stdout, stderr) => {
      if (err) reject(new Error(`${err.message}${stderr ? ` ${stderr}` : ''}`));
      else resolve();
    });
  });
}

export class MacInjector implements Injector {
  // Serialize: at most one paste in flight (parity with WindowsInjector).
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private deps: ProcDeps) {}

  async inject(text: string): Promise<InjectResult> {
    const delay = Math.max(0, Math.round(this.deps.delayMs ?? 120));
    const b64 = Buffer.from(text, 'utf8').toString('base64');
    const sec = (delay / 1000).toString();
    // base64 alphabet (A-Za-z0-9+/=) contains no shell-special chars and never
    // a single quote, so single-quoting it is safe and keeps CJK out of argv.
    const cmd =
      `printf '%s' '${b64}' | base64 -D | pbcopy; ` +
      `sleep ${sec}; ` +
      `osascript -e 'tell application "System Events" to keystroke "v" using command down'`;

    const run = this.queue.then(async (): Promise<InjectResult> => {
      try {
        await sh(this.deps.execFile, cmd);
        return { ok: true };
      } catch (e) {
        const m = (e as Error).message ?? '';
        if (ACCESS_DENIED.test(m)) {
          return {
            ok: false,
            message: '請到 系統設定 ▸ 隱私權與安全性 ▸ 輔助使用 開啟 Vocium 後再試（文字已複製，可手動貼上）',
          };
        }
        return { ok: false, message: `已複製，請手動貼上（${m}）` };
      }
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Best-effort prime: JIT the AppleScript runtime so the first real
   *  inject() call does not pay the cold-start cost.
   *  Serialized on the same queue; never throws. */
  async warmup(): Promise<void> {
    const run = this.queue.then(async () => {
      try { await sh(this.deps.execFile, "osascript -e 'return'"); }
      catch { /* best-effort — one-shot inject path still intact */ }
    });
    this.queue = run.catch(() => undefined);
    return run.catch(() => undefined);
  }
}
