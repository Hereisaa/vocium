// tests/groq-stt.test.ts
import { describe, it, expect } from 'vitest';
import { GroqSttAdapter } from '../src/core/stt/groq-stt.js';

const audio = { audio: Buffer.from('fake-opus'), mimeType: 'audio/webm' };

describe('GroqSttAdapter', () => {
  it('posts multipart to the Groq endpoint and returns text', async () => {
    let captured: any = {};
    const fakeFetch = async (url: string, init: any) => {
      captured = { url, auth: init.headers.Authorization, body: init.body };
      return { ok: true, status: 200, json: async () => ({ text: 'hello groq' }) } as any;
    };
    const a = new GroqSttAdapter(
      { apiKey: 'gsk-1', model: 'whisper-large-v3-turbo' },
      { fetch: fakeFetch as any },
    );
    const r = await a.transcribe(audio);
    expect(r.text).toBe('hello groq');
    expect(captured.url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    expect(captured.auth).toBe('Bearer gsk-1');
    expect(captured.body).toBeInstanceOf(FormData);
  });

  it('throws when key blank', async () => {
    const a = new GroqSttAdapter({ apiKey: '  ', model: 'm' }, { fetch: (() => {}) as any });
    await expect(a.transcribe(audio)).rejects.toThrow('Groq API key not configured');
  });

  it('rejects on non-2xx with status (describeSttError buckets it)', async () => {
    const fakeFetch = async () => ({ ok: false, status: 401, text: async () => 'invalid_api_key' } as any);
    const a = new GroqSttAdapter({ apiKey: 'k', model: 'm' }, { fetch: fakeFetch as any });
    await expect(a.transcribe(audio)).rejects.toThrow('Groq STT failed: 401');
  });

  it('routes through the timeout wrapper (fetch receives an AbortSignal)', async () => {
    let sig: unknown;
    const fakeFetch = async (_u: string, init: any) => {
      sig = init.signal;
      return { ok: true, status: 200, json: async () => ({ text: '' }) } as any;
    };
    const a = new GroqSttAdapter({ apiKey: 'k', model: 'm' }, { fetch: fakeFetch as any });
    await a.transcribe(audio);
    expect(sig).toBeInstanceOf(AbortSignal);
  });
});
