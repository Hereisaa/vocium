// tests/config.test.ts
import { describe, it, expect, vi } from 'vitest';
import { loadConfig, saveConfig, DEFAULTS, readZhMode } from '../src/core/config.js';

function fakeFs(initial?: string) {
  const store = new Map<string, string>();
  if (initial !== undefined) store.set('/cfg/vocium-config.json', initial);
  return {
    store,
    existsSync: (p: string) => store.has(p),
    readFileSync: (p: string) => { const v = store.get(p); if (v === undefined) throw new Error('ENOENT'); return v; },
    writeFileSync: (p: string, d: string) => { store.set(p, d); },
    mkdirSync: () => {},
  };
}
const path = { join: (...xs: string[]) => xs.join('/') };

describe('config', () => {
  it('returns DEFAULTS and writes file when missing', () => {
    const fs = fakeFs();
    const cfg = loadConfig(fs as any, path as any, '/cfg');
    expect(cfg).toEqual(DEFAULTS);
    expect(cfg.sttProvider).toBe('groq');
    expect(fs.store.has('/cfg/vocium-config.json')).toBe(true);
  });

  it('falls back to DEFAULTS on broken JSON without overwriting the corrupt file', () => {
    const fs = fakeFs('{ not json');
    const cfg = loadConfig(fs as any, path as any, '/cfg');
    expect(cfg).toEqual(DEFAULTS);
    expect(fs.store.get('/cfg/vocium-config.json')).toBe('{ not json');
  });

  it('shallow-merges partial config over DEFAULTS', () => {
    const fs = fakeFs(JSON.stringify({ groqApiKey: 'k-123', maxListenMs: 5000 }));
    const cfg = loadConfig(fs as any, path as any, '/cfg');
    expect(cfg.groqApiKey).toBe('k-123');
    expect(cfg.maxListenMs).toBe(5000);
    expect(cfg.sttProvider).toBe('groq');
  });

  it('saveConfig writes correct path and content', () => {
    const fs = fakeFs();
    saveConfig(fs as any, path as any, '/cfg', { ...DEFAULTS, iconOffsetX: 12 });
    expect(JSON.parse(fs.store.get('/cfg/vocium-config.json')!).iconOffsetX).toBe(12);
  });

  it('defaults dragLocked to false and is included in DEFAULTS', () => {
    expect(DEFAULTS.dragLocked).toBe(false);
    const fs = fakeFs();
    const cfg = loadConfig(fs as any, path as any, '/cfg');
    expect(cfg.dragLocked).toBe(false);
  });

  it('merges old config file lacking dragLocked to false, keeping other fields', () => {
    const fs = fakeFs(JSON.stringify({ hotkey: 'Ctrl+Alt+V' }));
    const cfg = loadConfig(fs as any, path as any, '/cfg');
    expect(cfg.dragLocked).toBe(false);
    expect(cfg.hotkey).toBe('Ctrl+Alt+V');
  });

  it('round-trips dragLocked:true through save then load', () => {
    const fs = fakeFs();
    saveConfig(fs as any, path as any, '/cfg', { ...DEFAULTS, dragLocked: true });
    const cfg = loadConfig(fs as any, path as any, '/cfg');
    expect(cfg.dragLocked).toBe(true);
  });

  it('defaults: new provider/inputMode/vad fields', () => {
    const fs = fakeFs();
    const cfg = loadConfig(fs as any, path as any, '/cfg');
    expect(cfg.openaiApiKey).toBe('');
    expect(cfg.openaiModel).toBe('whisper-1');
    expect(cfg.openaiBaseUrl).toBe('https://api.openai.com/v1');
    expect(cfg.geminiApiKey).toBe('');
    expect(cfg.geminiModel).toBe('gemini-1.5-flash');
    expect(cfg.inputMode).toBe('toggle');
    expect(cfg.vadTrim).toBe(false);
  });

  it("normalizes unknown/'local' sttProvider to 'groq' on load", () => {
    const fs = fakeFs(JSON.stringify({ sttProvider: 'local' }));
    expect(loadConfig(fs as any, path as any, '/cfg').sttProvider).toBe('groq');
    const fs2 = fakeFs(JSON.stringify({ sttProvider: 'wat' }));
    expect(loadConfig(fs2 as any, path as any, '/cfg').sttProvider).toBe('groq');
  });

  it("keeps a valid new provider value", () => {
    const fs = fakeFs(JSON.stringify({ sttProvider: 'openai' }));
    expect(loadConfig(fs as any, path as any, '/cfg').sttProvider).toBe('openai');
  });

  it('normalizes non-string sttProvider to groq', () => {
    const fs = fakeFs(JSON.stringify({ sttProvider: 42 }));
    expect(loadConfig(fs as any, path as any, '/cfg').sttProvider).toBe('groq');
  });

  it('coerces bad inputMode/vadTrim and round-trips valid ones', () => {
    const bad = fakeFs(JSON.stringify({ inputMode: 'garbage', vadTrim: 'true' }));
    const c1 = loadConfig(bad as any, path as any, '/cfg');
    expect(c1.inputMode).toBe('toggle');
    expect(c1.vadTrim).toBe(false);
    const good = fakeFs(JSON.stringify({ inputMode: 'ptt', vadTrim: true }));
    const c2 = loadConfig(good as any, path as any, '/cfg');
    expect(c2.inputMode).toBe('ptt');
    expect(c2.vadTrim).toBe(true);
  });
});

describe('zhConvert mode', () => {
  const path = { join: (...xs: string[]) => xs.join('/') };
  it("loadConfig defaults zhConvert to 'twp'", () => {
    const fs = { existsSync: () => false, readFileSync: () => '', writeFileSync: () => {}, mkdirSync: () => {} };
    expect(loadConfig(fs as any, path as any, '/d').zhConvert).toBe('twp');
  });
  it('readZhMode: missing file → twp, NO write side-effect', () => {
    let wrote = false;
    const fs = { existsSync: () => false, readFileSync: () => { throw new Error('x'); },
      writeFileSync: () => { wrote = true; }, mkdirSync: () => { wrote = true; } };
    expect(readZhMode(fs as any, path as any, '/d')).toBe('twp');
    expect(wrote).toBe(false);
  });
  it('readZhMode: corrupt JSON → twp, never throws', () => {
    const fs = { existsSync: () => true, readFileSync: () => '{ broken', writeFileSync: () => {}, mkdirSync: () => {} };
    expect(readZhMode(fs as any, path as any, '/d')).toBe('twp');
  });
  it('readZhMode: file containing JSON null → twp', () => {
    const fs = { existsSync: () => true, readFileSync: () => 'null', writeFileSync: () => {}, mkdirSync: () => {} };
    expect(readZhMode(fs as any, path as any, '/d')).toBe('twp');
  });
  it("readZhMode: explicit 'cn' → cn", () => {
    const fs = { existsSync: () => true, readFileSync: () => JSON.stringify({ zhConvert: 'cn' }), writeFileSync: () => {}, mkdirSync: () => {} };
    expect(readZhMode(fs as any, path as any, '/d')).toBe('cn');
  });
  it("readZhMode: explicit 'twp' → twp", () => {
    const fs = { existsSync: () => true, readFileSync: () => JSON.stringify({ zhConvert: 'twp' }), writeFileSync: () => {}, mkdirSync: () => {} };
    expect(readZhMode(fs as any, path as any, '/d')).toBe('twp');
  });
  it('readZhMode: invalid value or absent key → twp', () => {
    const bad = { existsSync: () => true, readFileSync: () => JSON.stringify({ zhConvert: 'xx' }), writeFileSync: () => {}, mkdirSync: () => {} };
    expect(readZhMode(bad as any, path as any, '/d')).toBe('twp');
    const absent = { existsSync: () => true, readFileSync: () => JSON.stringify({ hotkey: 'X' }), writeFileSync: () => {}, mkdirSync: () => {} };
    expect(readZhMode(absent as any, path as any, '/d')).toBe('twp');
  });
});
