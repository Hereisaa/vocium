// tests/pipeline.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createVoiceSession } from '../src/core/state-machine.js';
import { MockSttAdapter } from '../src/core/stt/mock-stt.js';
import { createPipeline } from '../src/sidecar/pipeline.js';
import { describeSttError, GUIDANCE_MSG } from '../src/core/stt/describe-error.js';

function setup(sttText = 'transcribed!') {
  const states: string[] = [];
  const session = createVoiceSession({ onState: (s) => states.push(s) });
  const stt = new MockSttAdapter({ text: sttText, delayMs: 0 });
  const injected: string[] = [];
  const injector = { inject: async (t: string) => { injected.push(t); return { ok: true }; } };
  const p = createPipeline({ session, stt, injector });
  return { p, states, injected };
}

describe('pipeline', () => {
  it('submitAudio runs transcribe→inject and ends idle', async () => {
    const { p, states, injected } = setup('hello');
    p.toggle();                       // idle->listening
    await p.submitAudio({ audioBase64: Buffer.from('a').toString('base64'), mimeType: 'audio/webm' });
    expect(injected).toEqual(['hello']);
    expect(p.getState()).toBe('idle');
    expect(states).toEqual(['listening', 'transcribing', 'injecting', 'idle']);
  });

  it('accepts GUI toggle-then-submit sequence (external toggle to transcribing)', async () => {
    const { p, states, injected } = setup('hi');
    p.toggle();                       // idle->listening
    p.toggle();                       // external toggle: listening->transcribing
    await p.submitAudio({ audioBase64: Buffer.from('a').toString('base64'), mimeType: 'audio/webm' });
    expect(injected).toEqual(['hi']);
    expect(p.getState()).toBe('idle');
    expect(states).toEqual(['listening', 'transcribing', 'injecting', 'idle']);
  });

  it('submitAudio rejects when called from injecting (no inject, throws)', async () => {
    const states: string[] = [];
    const session = createVoiceSession({ onState: (s) => states.push(s) });
    const stt = new MockSttAdapter({ text: 'x', delayMs: 0 });
    const injected: string[] = [];
    const injector = { inject: async (t: string) => { injected.push(t); return { ok: true }; } };
    const p = createPipeline({ session, stt, injector });
    session.send('TOGGLE'); session.send('TOGGLE'); session.send('TRANSCRIBED'); // -> injecting
    expect(p.getState()).toBe('injecting');
    await expect(
      p.submitAudio({ audioBase64: Buffer.from('a').toString('base64'), mimeType: 'audio/webm' }),
    ).rejects.toThrow('submitAudio called in unexpected state: injecting');
    expect(injected).toEqual([]);
  });

  it('submitAudio rejects when called from idle (state unchanged, no inject)', async () => {
    const { p, states, injected } = setup('hello');
    await expect(
      p.submitAudio({ audioBase64: Buffer.from('a').toString('base64'), mimeType: 'audio/webm' }),
    ).rejects.toThrow('submitAudio called in unexpected state: idle');
    expect(p.getState()).toBe('idle');
    expect(injected).toEqual([]);
    expect(states).toEqual([]);
  });

  it('transcribeClip returns text without injecting', async () => {
    const { p, injected } = setup('only-text');
    const r = await p.transcribeClip({ audioBase64: Buffer.from('a').toString('base64'), mimeType: 'audio/webm' });
    expect(r.text).toBe('only-text');
    expect(injected).toEqual([]);
  });

  it('injector failure resolves with text, goes error then auto RESET to idle', async () => {
    vi.useFakeTimers();
    const session = createVoiceSession({ onState: () => {} });
    const stt = new MockSttAdapter({ text: 'transcribed-on-fail', delayMs: 0 });
    const injector = { inject: async () => ({ ok: false, message: 'injection blocked' }) };
    const p = createPipeline({ session, stt, injector });
    p.toggle();                       // idle->listening
    const r = await p.submitAudio({ audioBase64: 'AA==', mimeType: 'audio/webm' });
    expect(r).toEqual({ text: 'transcribed-on-fail' });
    expect(p.getState()).toBe('error');
    vi.advanceTimersByTime(1500);
    expect(p.getState()).toBe('idle');
    vi.useRealTimers();
  });

  it('failure goes error then auto RESET to idle (no rethrow, injects message)', async () => {
    vi.useFakeTimers();
    const session = createVoiceSession({ onState: () => {} });
    const stt = new MockSttAdapter({ text: 'x', delayMs: 0, failMode: true });
    const injected: string[] = [];
    const injector = { inject: async (t: string) => { injected.push(t); return { ok: true }; } };
    const p = createPipeline({ session, stt, injector });
    p.toggle();
    const r = await p.submitAudio({ audioBase64: 'AA==', mimeType: 'audio/webm' });
    expect(r.text).toBe('（語音轉錄失敗：轉錄服務錯誤，請稍後再試）');
    expect(injected).toEqual(['（語音轉錄失敗：轉錄服務錯誤，請稍後再試）']);
    expect(p.getState()).toBe('error');
    vi.advanceTimersByTime(1500);
    expect(p.getState()).toBe('idle');
    vi.useRealTimers();
  });

  it('noKey: injects guidance via normal flow, no error animation', async () => {
    const states: string[] = [];
    const session = createVoiceSession({ onState: (s) => states.push(s) });
    const stt = new MockSttAdapter({ text: 'SHOULD-NOT-BE-USED', delayMs: 0 });
    const injected: string[] = [];
    const injector = { inject: async (t: string) => { injected.push(t); return { ok: true }; } };
    const p = createPipeline({ session, stt, injector, noKey: true });
    p.toggle();                       // idle->listening
    const r = await p.submitAudio({ audioBase64: 'AA==', mimeType: 'audio/webm' });
    expect(r).toEqual({ text: GUIDANCE_MSG });
    expect(injected).toEqual([GUIDANCE_MSG]);
    expect(p.getState()).toBe('idle');
    expect(states).toEqual(['listening', 'transcribing', 'injecting', 'idle']);
  });

  it('noKey: injector failure goes error then auto RESET to idle', async () => {
    vi.useFakeTimers();
    const session = createVoiceSession({ onState: () => {} });
    const stt = new MockSttAdapter({ text: 'unused', delayMs: 0 });
    const injector = { inject: async () => ({ ok: false, message: 'blocked' }) };
    const p = createPipeline({ session, stt, injector, noKey: true });
    p.toggle();
    const r = await p.submitAudio({ audioBase64: 'AA==', mimeType: 'audio/webm' });
    expect(r).toEqual({ text: GUIDANCE_MSG });
    expect(p.getState()).toBe('error');
    vi.advanceTimersByTime(1500);
    expect(p.getState()).toBe('idle');
    vi.useRealTimers();
  });

  it('noKey: transcribeClip returns guidance text instead of throwing', async () => {
    const session = createVoiceSession({ onState: () => {} });
    const stt = { transcribe: async () => { throw new Error('Groq API key not configured'); } };
    const injector = { inject: async () => ({ ok: true }) };
    const p = createPipeline({ session, stt, injector, noKey: true });
    const r = await p.transcribeClip({ audioBase64: 'AA==', mimeType: 'audio/webm' });
    expect(r).toEqual({ text: GUIDANCE_MSG });
  });

  it('STT error: injects categorized message, plays error animation, no rethrow', async () => {
    vi.useFakeTimers();
    const session = createVoiceSession({ onState: () => {} });
    const stt = { transcribe: async () => { throw new Error('Groq STT failed: 401 invalid_api_key'); } };
    const injected: string[] = [];
    const injector = { inject: async (t: string) => { injected.push(t); return { ok: true }; } };
    const p = createPipeline({ session, stt, injector });
    p.toggle();                       // idle->listening
    const r = await p.submitAudio({ audioBase64: 'AA==', mimeType: 'audio/webm' });
    expect(r).toEqual({ text: '（語音轉錄失敗：API Key 無效，請於設定檢查）' });
    expect(injected).toEqual(['（語音轉錄失敗：API Key 無效，請於設定檢查）']);
    expect(p.getState()).toBe('error');
    vi.advanceTimersByTime(1500);
    expect(p.getState()).toBe('idle');
    vi.useRealTimers();
  });

  it("getZhMode 'twp': submitAudio injects Traditional", async () => {
    const session = createVoiceSession({ onState: () => {} });
    const stt = { transcribe: async () => ({ text: '这是简体软件' }) };
    const injected: string[] = [];
    const injector = { inject: async (t: string) => { injected.push(t); return { ok: true }; } };
    const p = createPipeline({ session, stt, injector, getZhMode: () => 'twp' });
    p.toggle();
    const r = await p.submitAudio({ audioBase64: 'AA==', mimeType: 'audio/webm' });
    expect(r).toEqual({ text: '這是簡體軟體' });
    expect(injected).toEqual(['這是簡體軟體']);
  });
  it("getZhMode 'cn': submitAudio injects Simplified", async () => {
    const session = createVoiceSession({ onState: () => {} });
    const stt = { transcribe: async () => ({ text: '軟體與滑鼠' }) };
    const injected: string[] = [];
    const injector = { inject: async (t: string) => { injected.push(t); return { ok: true }; } };
    const p = createPipeline({ session, stt, injector, getZhMode: () => 'cn' });
    p.toggle();
    const r = await p.submitAudio({ audioBase64: 'AA==', mimeType: 'audio/webm' });
    expect(r).toEqual({ text: '软件与鼠标' });
    expect(injected).toEqual(['软件与鼠标']);
  });
  it("getZhMode 'cn': transcribeClip returns Simplified", async () => {
    const session = createVoiceSession({ onState: () => {} });
    const stt = { transcribe: async () => ({ text: '滑鼠' }) };
    const p = createPipeline({ session, stt, injector: { inject: async () => ({ ok: true }) }, getZhMode: () => 'cn' });
    const r = await p.transcribeClip({ audioBase64: 'AA==', mimeType: 'audio/webm' });
    expect(r.text).toBe('鼠标');
  });
  it("getZhMode 'twp': injector failure returns Traditional", async () => {
    vi.useFakeTimers();
    const session = createVoiceSession({ onState: () => {} });
    const stt = { transcribe: async () => ({ text: '软件' }) };
    const p = createPipeline({ session, stt, injector: { inject: async () => ({ ok: false, message: 'x' }) }, getZhMode: () => 'twp' });
    p.toggle();
    const r = await p.submitAudio({ audioBase64: 'AA==', mimeType: 'audio/webm' });
    expect(r.text).toBe('軟體');
    vi.useRealTimers();
  });
  it('zh-convert does NOT touch noKey guidance (submitAudio & transcribeClip)', async () => {
    const mk = () => createPipeline({
      session: createVoiceSession({ onState: () => {} }),
      stt: { transcribe: async () => ({ text: 'unused' }) },
      injector: { inject: async () => ({ ok: true }) },
      noKey: true, getZhMode: () => 'cn',
    });
    const p1 = mk(); p1.toggle();
    expect(await p1.submitAudio({ audioBase64: 'AA==', mimeType: 'audio/webm' })).toEqual({ text: GUIDANCE_MSG });
    // p2: a fresh pipeline instance (independent state machine; no toggle needed for transcribeClip)
    const p2 = mk();
    expect(await p2.transcribeClip({ audioBase64: 'AA==', mimeType: 'audio/webm' })).toEqual({ text: GUIDANCE_MSG });
  });

  it('submitAudio: polish enabled transforms text before inject', async () => {
    const states: string[] = [];
    const session = createVoiceSession({ onState: (s) => states.push(s) });
    const stt = { transcribe: async () => ({ text: 'um hello' }) };
    const injected: string[] = [];
    const injector = { inject: async (t: string) => { injected.push(t); return { ok: true }; } };
    const p = createPipeline({ session, stt, injector,
      polish: async (t: string) => t.replace('um ', '') });
    p.toggle();
    await p.submitAudio({ audioBase64: 'AA==', mimeType: 'audio/webm' });
    expect(injected).toEqual(['hello']);
  });
  it('submitAudio: default polish (none) leaves text unchanged', async () => {
    const { p, injected } = setup('plain');
    p.toggle();
    await p.submitAudio({ audioBase64: 'AA==', mimeType: 'audio/webm' });
    expect(injected).toEqual(['plain']);
  });
  it('transcribeClip is never polished', async () => {
    const stt = { transcribe: async () => ({ text: 'um raw' }) };
    const session = createVoiceSession({ onState: () => {} });
    const injector = { inject: async () => ({ ok: true }) };
    const p = createPipeline({ session, stt, injector,
      polish: async () => 'SHOULD-NOT-BE-USED' });
    const r = await p.transcribeClip({ audioBase64: 'AA==', mimeType: 'audio/webm' });
    expect(r.text).toBe('um raw');
  });
  it('polishOnly delegates to the injected polish closure with style', async () => {
    let seen: { t: string; style: string | undefined } | undefined;
    const p = createPipeline({
      session: createVoiceSession({ onState: () => {} }),
      stt: { transcribe: async () => ({ text: '' }) },
      injector: { inject: async () => ({ ok: true }) },
      polish: async (t: string, style?: string) => { seen = { t, style }; return `P:${t}`; },
    });
    // no-style path (style === undefined)
    expect(await p.polishOnly('hi')).toBe('P:hi');
    // with-style path
    expect(await p.polishOnly('hi', 'full')).toBe('P:hi');
    expect(seen).toEqual({ t: 'hi', style: 'full' });
  });

  it('submitAudio: throwing polish falls back to zh, no error state', async () => {
    const states: string[] = [];
    const session = createVoiceSession({ onState: (s) => states.push(s) });
    const stt = { transcribe: async () => ({ text: 'hello' }) };
    const injected: string[] = [];
    const injector = { inject: async (t: string) => { injected.push(t); return { ok: true }; } };
    const p = createPipeline({ session, stt, injector,
      polish: async () => { throw new Error('boom'); } });
    p.toggle();
    await p.submitAudio({ audioBase64: 'AA==', mimeType: 'audio/webm' });
    expect(injected).toEqual(['hello']);
    expect(states).toContain('idle');
    expect(states).not.toContain('error');
    expect(p.getState()).toBe('idle');
  });
});
