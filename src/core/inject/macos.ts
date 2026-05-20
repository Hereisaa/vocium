// src/core/inject/macos.ts
import type { Injector, InjectResult, ProcDeps, SpawnFn, ChildLike } from './types.js';

/** osascript / Apple-events "not trusted for Accessibility" signatures. */
const ACCESS_DENIED = /-1719|not allowed assistive access|not authorized to send Apple events/i;

/** macOS virtual key code for the `V` key (kVK_ANSI_V). Layout-independent
 *  (it refers to the physical key position, not the character). We use
 *  `key code` rather than `keystroke "v"` because the latter is the form
 *  with the documented modifier double-fire quirk. */
const KEY_CODE_V = 9;
const PASTE_APPLESCRIPT =
  `tell application "System Events" to key code ${KEY_CODE_V} using {command down}`;

/** Spawn a process, optionally feed `stdinBytes` to its stdin, and resolve
 *  on a 0 exit (or reject with an Error whose message includes stderr — used
 *  by the ACCESS_DENIED regex on the osascript path). */
function spawnAndWait(
  spawn: SpawnFn,
  program: string,
  args: string[],
  stdinBytes?: Uint8Array,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let child: ChildLike;
    try {
      child = spawn(program, args);
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    let stderr = '';
    let done = false;
    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      err ? reject(err) : resolve();
    };
    child.stderr?.on('data', (d) => {
      stderr += typeof d === 'string' ? d : d.toString('utf8');
    });
    child.on('exit', (code) => {
      const c = typeof code === 'number' ? code : 0;
      if (c === 0) finish();
      else finish(new Error(`${program} exit ${c}${stderr ? `: ${stderr.trim()}` : ''}`));
    });
    child.on('error', (err) => {
      finish(err instanceof Error ? err : new Error(String(err)));
    });
    if (stdinBytes && child.stdin) {
      try {
        child.stdin.write(stdinBytes);
        child.stdin.end();
      } catch (e) {
        finish(e instanceof Error ? e : new Error(String(e)));
      }
    }
  });
}

/** macOS text injector. UTF-8 text → `pbcopy` (direct stdin, no shell, no
 *  base64, no `printf`) → focus delay → `osascript` Cmd+V via explicit
 *  modifier down/up (sidesteps the `using {command down}` double-fire quirk).
 *
 *  Important: pbcopy reads its stdin under the process's LC_CTYPE / LANG. In
 *  the C/POSIX locale it tags the pasteboard with a non-UTF-8 plain-text
 *  type, which a UTF-8 paste target then decodes via Big5/CP950 — producing
 *  the "皜祈岫" mojibake first observed in bundled Vocium.app launched from
 *  Finder (launchd-derived env has no LANG). The shell (lib.rs) is what sets
 *  LANG/LC_CTYPE on the sidecar process; this injector inherits it.
 *
 *  Requires the injected `spawn` (sidecar wires `node:child_process.spawn`).
 *  `execFile` is no longer used. */
export class MacInjector implements Injector {
  // Serialize: at most one paste in flight (parity with WindowsInjector).
  private queue: Promise<unknown> = Promise.resolve();
  private callSeq = 0;

  constructor(private deps: ProcDeps) {}

  async inject(text: string): Promise<InjectResult> {
    const delay = Math.max(0, Math.round(this.deps.delayMs ?? 120));
    const spawn = this.deps.spawn;
    const seq = ++this.callSeq;
    // Quiet on the happy path; only the failure branch writes to sidecar.log.
    // The full inject pipeline (pbcopy → osascript) runs maybe 10s of times
    // per session and we don't want to spam the log every voice round-trip.
    const logErr = (msg: string) => {
      try { process.stderr.write(`[inject#${seq}] ${msg}\n`); } catch { /* best-effort */ }
    };
    if (!spawn) {
      return {
        ok: false,
        message: '已複製，請手動貼上（spawn unavailable; pbcopy/osascript cannot run）',
      };
    }
    // TextEncoder is a Web standard: produces deterministic UTF-8 bytes,
    // independent of any Node-vs-Bun Buffer default-encoding differences.
    const bytes = new TextEncoder().encode(text);

    const run = this.queue.then(async (): Promise<InjectResult> => {
      try {
        // Step 1: put UTF-8 bytes on the clipboard via pbcopy stdin.
        await spawnAndWait(spawn, 'pbcopy', [], bytes);

        // Step 2: focus delay — give the previously-focused app time to
        // settle before we synthesize the paste keystroke.
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));

        // Step 3: synthesize Cmd+V via `key code 9 using {command down}`.
        await spawnAndWait(spawn, 'osascript', ['-e', PASTE_APPLESCRIPT]);

        return { ok: true };
      } catch (e) {
        const m = (e as Error).message ?? '';
        logErr(
          `inject failed text-len=${text.length} bytes=${bytes.length} ` +
          `LC_CTYPE=${process.env.LC_CTYPE ?? '<unset>'} :: ` +
          m.replace(/\n/g, ' | '),
        );
        if (ACCESS_DENIED.test(m)) {
          return {
            ok: false,
            message:
              '請到 系統設定 ▸ 隱私權與安全性 ▸ 輔助使用 開啟 Vocium 後再試（文字已複製，可手動貼上）',
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
    const spawn = this.deps.spawn;
    if (!spawn) return;
    const run = this.queue.then(async () => {
      try {
        await spawnAndWait(spawn, 'osascript', ['-e', 'return']);
      } catch {
        /* best-effort — inject path still works regardless */
      }
    });
    this.queue = run.catch(() => undefined);
    return run.catch(() => undefined);
  }
}
