// tests/inject.test.ts
import { describe, it, expect } from 'vitest';
import { WindowsInjector } from '../src/core/inject/windows.js';
import { MacInjector } from '../src/core/inject/macos.js';
import { LinuxInjector } from '../src/core/inject/linux.js';
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

describe('stub injectors', () => {
  it('Mac inject throws NotImplementedError', async () => {
    await expect(new MacInjector().inject('x')).rejects.toBeInstanceOf(NotImplementedError);
  });
  it('Linux inject throws NotImplementedError', async () => {
    await expect(new LinuxInjector().inject('x')).rejects.toBeInstanceOf(NotImplementedError);
  });
});

describe('createInjector factory', () => {
  it('win32 -> WindowsInjector', () => {
    expect(createInjector('win32', { execFile: (() => {}) as any })).toBeInstanceOf(WindowsInjector);
  });
  it('darwin -> MacInjector', () => {
    expect(createInjector('darwin', { execFile: (() => {}) as any })).toBeInstanceOf(MacInjector);
  });
  it('linux -> LinuxInjector', () => {
    expect(createInjector('linux', { execFile: (() => {}) as any })).toBeInstanceOf(LinuxInjector);
  });
});
