// tests/pipeline.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createVoiceSession } from '../src/core/state-machine.js';
import { MockSttAdapter } from '../src/core/stt/mock-stt.js';
import { createPipeline } from '../src/sidecar/pipeline.js';

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

  it('failure goes error then auto RESET to idle', async () => {
    vi.useFakeTimers();
    const session = createVoiceSession({ onState: () => {} });
    const stt = new MockSttAdapter({ text: 'x', delayMs: 0, failMode: true });
    const injector = { inject: async () => ({ ok: true }) };
    const p = createPipeline({ session, stt, injector });
    p.toggle();
    await p.submitAudio({ audioBase64: 'AA==', mimeType: 'audio/webm' }).catch(() => {});
    expect(p.getState()).toBe('error');
    vi.advanceTimersByTime(1500);
    expect(p.getState()).toBe('idle');
    vi.useRealTimers();
  });
});
