// tests/config.test.ts
import { describe, it, expect, vi } from 'vitest';
import { loadConfig, saveConfig, DEFAULTS } from '../src/core/config.js';

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
});
