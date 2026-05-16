// tests/stt.test.ts
import { describe, it, expect } from 'vitest';
import { GroqSttAdapter } from '../src/core/stt/groq-stt.js';
import { MockSttAdapter } from '../src/core/stt/mock-stt.js';
import { createSttAdapter } from '../src/core/stt/stt-adapter.js';

const audio = { audio: Buffer.from('fake-opus'), mimeType: 'audio/webm' };

describe('GroqSttAdapter', () => {
  it('posts multipart to groq endpoint and returns text', async () => {
    let captured: any = {};
    const fakeFetch = async (url: string, init: any) => {
      captured.url = url; captured.auth = init.headers.Authorization; captured.body = init.body;
      return { ok: true, status: 200, json: async () => ({ text: 'hello world' }) } as any;
    };
    const a = new GroqSttAdapter({ apiKey: 'k-1', model: 'whisper-large-v3-turbo' }, { fetch: fakeFetch as any });
    const r = await a.transcribe(audio);
    expect(r.text).toBe('hello world');
    expect(captured.url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    expect(captured.auth).toBe('Bearer k-1');
    expect(captured.body).toBeInstanceOf(FormData);
  });

  it('rejects when api key missing', async () => {
    const a = new GroqSttAdapter({ apiKey: '', model: 'm' }, { fetch: (async () => ({})) as any });
    await expect(a.transcribe(audio)).rejects.toThrow('Groq API key not configured');
  });

  it('rejects on non-2xx', async () => {
    const fakeFetch = async () => ({ ok: false, status: 401, text: async () => 'unauthorized' } as any);
    const a = new GroqSttAdapter({ apiKey: 'k', model: 'm' }, { fetch: fakeFetch as any });
    await expect(a.transcribe(audio)).rejects.toThrow('Groq STT failed: 401');
  });
});

describe('MockSttAdapter', () => {
  it('returns configured text', async () => {
    const a = new MockSttAdapter({ text: 'mock-out', delayMs: 0 });
    expect((await a.transcribe(audio)).text).toBe('mock-out');
  });
  it('failMode rejects', async () => {
    const a = new MockSttAdapter({ text: 'x', delayMs: 0, failMode: true });
    await expect(a.transcribe(audio)).rejects.toThrow('mock: forced failure');
  });
});

describe('createSttAdapter factory', () => {
  it('groq + key -> GroqSttAdapter', () => {
    const a = createSttAdapter({ sttProvider: 'groq', groqApiKey: 'k', groqModel: 'm', mockText: 't' } as any, { fetch: (() => {}) as any });
    expect(a).toBeInstanceOf(GroqSttAdapter);
  });
  it('groq without key -> falls back to MockSttAdapter', () => {
    const a = createSttAdapter({ sttProvider: 'groq', groqApiKey: '', groqModel: 'm', mockText: 't' } as any, { fetch: (() => {}) as any });
    expect(a).toBeInstanceOf(MockSttAdapter);
  });
  it('mock -> MockSttAdapter', () => {
    const a = createSttAdapter({ sttProvider: 'mock', groqApiKey: 'k', groqModel: 'm', mockText: 't' } as any, { fetch: (() => {}) as any });
    expect(a).toBeInstanceOf(MockSttAdapter);
  });
});
