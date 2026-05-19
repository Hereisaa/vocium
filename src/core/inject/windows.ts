// src/core/inject/windows.ts
import type { Injector, InjectResult, ExecFile, ChildLike, ProcDeps } from './types.js';

const HOST_ARGS = ['-NoProfile', '-NoLogo', '-Command', '-'];

/** One-shot fallback: identical behaviour to the original implementation. */
function ps(execFile: ExecFile, command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', command],
      (err) => (err ? reject(err) : resolve()));
  });
}

function injectScript(b64: string, delay: number, token: string): string {
  // Single line piped to the persistent host's stdin. Add-Type is cached after
  // the first call, so the only recurring cost is the (intentional) focus delay.
  return [
    `$t=[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64}'))`,
    `Set-Clipboard -Value $t`,
    `Add-Type -AssemblyName System.Windows.Forms`,
    `Start-Sleep -Milliseconds ${delay}`,
    `[System.Windows.Forms.SendKeys]::SendWait('^v')`,
    `Write-Output '${token}'`,
  ].join('; ') + '\n';
}

export class WindowsInjector implements Injector {
  private child: ChildLike | null = null;
  private childBroken = false;
  private buf = '';
  private waiter: { token: string; resolve: () => void; reject: (e: Error) => void } | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private seq = 0;

  constructor(private deps: ProcDeps) {}

  private ensureHost(): ChildLike | null {
    if (!this.deps.spawn || this.childBroken) return null;
    if (this.child) return this.child;
    let c: ChildLike;
    try {
      c = this.deps.spawn('powershell.exe', HOST_ARGS);
    } catch {
      this.childBroken = true;
      return null;
    }
    if (!c.stdin || !c.stdout) { this.childBroken = true; try { c.kill(); } catch { /* ignore */ } return null; }
    c.stdout.on('data', (d) => {
      this.buf += typeof d === 'string' ? d : d.toString('utf8');
      if (this.waiter && this.buf.includes(this.waiter.token)) {
        const w = this.waiter;
        this.waiter = null;
        this.buf = '';
        w.resolve();
      }
    });
    const die = () => {
      this.childBroken = true;
      this.child = null;
      if (this.waiter) { const w = this.waiter; this.waiter = null; w.reject(new Error('powershell host exited')); }
    };
    c.on('exit', die);
    c.on('error', die);
    this.child = c;
    return c;
  }

  private runOnHost(script: string, token: string): Promise<void> {
    const host = this.child;
    if (!host || !host.stdin) return Promise.reject(new Error('no host'));
    const timeoutMs = this.deps.hostTimeoutMs ?? 4000;
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.waiter && this.waiter.token === token) this.waiter = null;
        // A wedged host poisons every later call — tear it down so the next
        // inject either respawns a fresh host or uses the one-shot fallback.
        this.childBroken = true;
        this.child = null;
        try { host.kill(); } catch { /* ignore */ }
        reject(new Error('powershell host timed out'));
      }, timeoutMs);
      this.waiter = {
        token,
        resolve: () => { clearTimeout(timer); resolve(); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      };
      try {
        host.stdin!.write(script);
      } catch (e) {
        clearTimeout(timer);
        this.waiter = null;
        reject(e as Error);
      }
    });
  }

  /** Pre-load the PowerShell host + JIT WinForms so the FIRST real inject is
   *  warm (~ms) instead of ~4.6s. Best-effort: serialized on the same queue,
   *  never throws. No-op when spawn is unavailable (unit-test path). */
  async warmup(): Promise<void> {
    const run = this.queue.then(async () => {
      if (!this.ensureHost()) return;
      const token = `VOCIUM_WARM_${++this.seq}`;
      try {
        await this.runOnHost(
          `Add-Type -AssemblyName System.Windows.Forms; Write-Output '${token}'\n`,
          token,
        );
      } catch { /* lazy host / execFile fallback still intact */ }
    });
    this.queue = run.catch(() => undefined);
    return run.catch(() => undefined);
  }

  async inject(text: string): Promise<InjectResult> {
    const delay = this.deps.delayMs ?? 120;
    const b64 = Buffer.from(text, 'utf8').toString('base64');

    // Serialize: at most one paste in flight (the pipeline awaits anyway, but
    // this also protects the shared stdout buffer / single waiter slot).
    const run = this.queue.then(async (): Promise<InjectResult> => {
      // Fast path: reuse the long-lived host.
      if (this.ensureHost()) {
        const token = `VOCIUM_DONE_${++this.seq}`;
        try {
          await this.runOnHost(injectScript(b64, delay, token), token);
          return { ok: true };
        } catch {
          // fall through to the one-shot path for this call
        }
      }
      // Fallback path: per-call powershell.exe (also the unit-test path).
      try {
        await ps(this.deps.execFile,
          `Set-Clipboard -Value ([System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64}')))`);
        await ps(this.deps.execFile,
          `Add-Type -AssemblyName System.Windows.Forms; Start-Sleep -Milliseconds ${delay}; [System.Windows.Forms.SendKeys]::SendWait('^v')`);
        return { ok: true };
      } catch (e) {
        return { ok: false, message: `已複製，請手動貼上（${(e as Error).message}）` };
      }
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}
