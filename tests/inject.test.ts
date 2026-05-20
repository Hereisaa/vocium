// tests/inject.test.ts
import { describe, it, expect } from 'vitest';
import { WindowsInjector } from '../src/core/inject/windows.js';
import { MacInjector } from '../src/core/inject/macos.js';
import { createInjector } from '../src/core/inject/injector.js';
import { NotImplementedError } from '../src/core/inject/types.js';

describe('WindowsInjector', () => {
  it('writes clipboard then sends paste, returns ok', async () => {
    const calls: string[] = [];
    const execFile = (_cmd: string, args: string[], cb: Function) => {
      calls.push(args.join(' ')); cb(null, '', '');
    };
    const inj = new WindowsInjector({ execFile: execFile as any, delayMs: 0 });
    const r = await inj.inject('hello');
    expect(r.ok).toBe(true);
    expect(calls.some((c) => c.includes('Set-Clipboard'))).toBe(true);
    expect(calls.some((c) => c.includes('SendKeys'))).toBe(true);
  });

  it('returns ok:false when powershell fails', async () => {
    const execFile = (_c: string, _a: string[], cb: Function) => cb(new Error('not found'));
    const inj = new WindowsInjector({ execFile: execFile as any, delayMs: 0 });
    const r = await inj.inject('x');
    expect(r.ok).toBe(false);
  });
});

describe('WindowsInjector persistent PowerShell host', () => {
  function fakeHost(opts: { echo: boolean }) {
    const dataCbs: Array<(d: string) => void> = [];
    let exitCb: (() => void) | null = null;
    const child = {
      stdin: {
        write(s: string) {
          if (!opts.echo) return;
          const m = s.match(/VOCIUM_[A-Z]+_\d+/);
          if (m) setImmediate(() => dataCbs.forEach((cb) => cb(m[0] + '\r\n')));
        },
      },
      stdout: { on(_ev: 'data', cb: (d: string) => void) { dataCbs.push(cb); } },
      on(ev: 'exit' | 'error', cb: () => void) { if (ev === 'exit') exitCb = cb; },
      kill() { exitCb?.(); },
    };
    return child;
  }

  it('reuses the host (fast path) and does NOT spawn powershell.exe per call', async () => {
    let execFileCalls = 0;
    const execFile = (_c: string, _a: string[], cb: Function) => { execFileCalls++; cb(null, '', ''); };
    let spawnCalls = 0;
    const spawn = () => { spawnCalls++; return fakeHost({ echo: true }) as any; };
    const inj = new WindowsInjector({ execFile: execFile as any, spawn, delayMs: 0 });

    expect((await inj.inject('one')).ok).toBe(true);
    expect((await inj.inject('two')).ok).toBe(true);
    expect(spawnCalls).toBe(1);     // host spawned once, reused
    expect(execFileCalls).toBe(0);  // never fell back to per-call powershell
  });

  it('falls back to one-shot execFile when the host never answers (timeout)', async () => {
    const calls: string[] = [];
    const execFile = (_c: string, a: string[], cb: Function) => { calls.push(a.join(' ')); cb(null, '', ''); };
    const spawn = () => fakeHost({ echo: false }) as any; // never emits sentinel
    const inj = new WindowsInjector({ execFile: execFile as any, spawn, delayMs: 0, hostTimeoutMs: 20 });

    const r = await inj.inject('hi');
    expect(r.ok).toBe(true);
    expect(calls.some((c) => c.includes('Set-Clipboard'))).toBe(true);
    expect(calls.some((c) => c.includes('SendKeys'))).toBe(true);
  });

  it('falls back to one-shot execFile when spawn throws', async () => {
    const calls: string[] = [];
    const execFile = (_c: string, a: string[], cb: Function) => { calls.push(a.join(' ')); cb(null, '', ''); };
    const spawn = () => { throw new Error('ENOENT powershell'); };
    const inj = new WindowsInjector({ execFile: execFile as any, spawn: spawn as any, delayMs: 0 });

    const r = await inj.inject('x');
    expect(r.ok).toBe(true);
    expect(calls.some((c) => c.includes('SendKeys'))).toBe(true);
  });

  it('warmup starts the host once and a later inject reuses it', async () => {
    let spawnCalls = 0;
    const execFile = (_c: string, _a: string[], cb: Function) => cb(null, '', '');
    const spawn = () => { spawnCalls++; return fakeHost({ echo: true }) as any; };
    const inj = new WindowsInjector({ execFile: execFile as any, spawn, delayMs: 0 });
    await inj.warmup();
    expect(spawnCalls).toBe(1);
    expect((await inj.inject('hi')).ok).toBe(true);
    expect(spawnCalls).toBe(1); // reused, not respawned
  });

  it('warmup is a silent no-op when spawn is unavailable', async () => {
    const execFile = (_c: string, _a: string[], cb: Function) => cb(null, '', '');
    const inj = new WindowsInjector({ execFile: execFile as any });
    await expect(inj.warmup!()).resolves.toBeUndefined();
  });

  it('warmup swallows a spawn that throws', async () => {
    const execFile = (_c: string, _a: string[], cb: Function) => cb(null, '', '');
    const spawn = () => { throw new Error('ENOENT powershell'); };
    const inj = new WindowsInjector({ execFile: execFile as any, spawn: spawn as any });
    await expect(inj.warmup!()).resolves.toBeUndefined();
  });
});

describe('MacInjector', () => {
  // Fake spawn factory. Each spawned process records its program/args and
  // any stdin writes; exit is fired on next tick with the per-program code.
  // A `stderrFor` map can pre-load stderr that gets delivered before exit.
  function makeSpawn(opts: { exitCodeFor?: Record<string, number>; stderrFor?: Record<string, string> } = {}) {
    const spawns: Array<{ program: string; args: string[]; stdinWrites: Array<Uint8Array | string> }> = [];
    const spawn = ((program: string, args: string[]) => {
      const stdinWrites: Array<Uint8Array | string> = [];
      spawns.push({ program, args, stdinWrites });
      const stderrCbs: Array<(d: Buffer | string) => void> = [];
      let exitCb: ((code: number) => void) | null = null;
      const child = {
        stdin: { write(d: Uint8Array | string) { stdinWrites.push(d); }, end() {} },
        stdout: { on() {} },
        stderr: { on(_ev: 'data', cb: (d: Buffer | string) => void) { stderrCbs.push(cb); } },
        on(ev: 'exit' | 'error', cb: (...a: unknown[]) => void) {
          if (ev === 'exit') exitCb = cb as (c: number) => void;
        },
        kill() {},
      } as const;
      setImmediate(() => {
        const stderr = opts.stderrFor?.[program];
        if (stderr) stderrCbs.forEach((cb) => cb(stderr));
        const code = opts.exitCodeFor?.[program] ?? 0;
        exitCb?.(code);
      });
      return child;
    }) as any;
    return { spawn, spawns };
  }

  it('writes UTF-8 bytes to pbcopy stdin, then sends Cmd+V via osascript key code (not keystroke), returns ok', async () => {
    const { spawn, spawns } = makeSpawn();
    const inj = new MacInjector({ execFile: (() => {}) as any, spawn, delayMs: 0 });
    const r = await inj.inject('哈囉 hello');

    expect(r.ok).toBe(true);
    expect(spawns).toHaveLength(2);

    // Step 1: pbcopy with no args, fed UTF-8 bytes via stdin (NO shell, NO base64).
    expect(spawns[0].program).toBe('pbcopy');
    expect(spawns[0].args).toEqual([]);
    expect(spawns[0].stdinWrites).toHaveLength(1);
    const expected = new TextEncoder().encode('哈囉 hello');
    expect(Array.from(spawns[0].stdinWrites[0] as Uint8Array)).toEqual(Array.from(expected));

    // Step 2: osascript Cmd+V via `key code 9 using {command down}` (NOT
    // `keystroke "v"`, the form with the modifier double-fire quirk).
    expect(spawns[1].program).toBe('osascript');
    expect(spawns[1].args[0]).toBe('-e');
    expect(spawns[1].args[1]).toContain('key code 9');
    expect(spawns[1].args[1]).toContain('using {command down}');
    expect(spawns[1].args[1]).not.toContain('keystroke "v"');
  });

  it('returns ok:false with the clipboard-fallback message on generic failure', async () => {
    const { spawn } = makeSpawn({ exitCodeFor: { pbcopy: 127 } });
    const inj = new MacInjector({ execFile: (() => {}) as any, spawn, delayMs: 0 });
    const r = await inj.inject('x');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('已複製，請手動貼上');
    expect(r.message).toContain('pbcopy exit 127');
  });

  it('returns the Accessibility guidance message when osascript is not trusted', async () => {
    // pbcopy succeeds (clipboard set); osascript fails with -1719 on stderr.
    const { spawn } = makeSpawn({
      exitCodeFor: { osascript: 1 },
      stderrFor: {
        osascript:
          'execution error: System Events got an error: osascript is not allowed assistive access. (-1719)',
      },
    });
    const inj = new MacInjector({ execFile: (() => {}) as any, spawn, delayMs: 0 });
    const r = await inj.inject('x');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('輔助使用');
    expect(r.message).toContain('文字已複製');
  });

  it('returns clear ok:false when spawn is unavailable (defensive)', async () => {
    const inj = new MacInjector({ execFile: (() => {}) as any, delayMs: 0 });
    const r = await inj.inject('x');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('已複製，請手動貼上');
  });
});

describe('createInjector factory', () => {
  it('win32 -> WindowsInjector', () => {
    expect(createInjector('win32', { execFile: (() => {}) as any })).toBeInstanceOf(WindowsInjector);
  });
  it('darwin -> MacInjector wired with the passed spawn deps', async () => {
    let pbcopySpawned = false;
    const spawn = ((program: string) => {
      if (program === 'pbcopy') pbcopySpawned = true;
      let exitCb: ((c: number) => void) | null = null;
      const child = {
        stdin: { write() {}, end() {} },
        stdout: { on() {} },
        stderr: { on() {} },
        on(ev: 'exit' | 'error', cb: (...a: unknown[]) => void) {
          if (ev === 'exit') exitCb = cb as (c: number) => void;
        },
        kill() {},
      } as const;
      setImmediate(() => exitCb?.(0));
      return child;
    }) as any;
    const inj = createInjector('darwin', { execFile: (() => {}) as any, spawn, delayMs: 0 });
    expect(inj).toBeInstanceOf(MacInjector);
    const r = await inj.inject('x');     // must reach the injected spawn for pbcopy
    expect(r.ok).toBe(true);
    expect(pbcopySpawned).toBe(true);
  });
  it('unsupported platform throws NotImplementedError', () => {
    expect(() => createInjector('freebsd' as NodeJS.Platform, { execFile: (() => {}) as any }))
      .toThrow(NotImplementedError);
  });
});
