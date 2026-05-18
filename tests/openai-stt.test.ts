// tests/openai-stt.test.ts
import { describe, it, expect } from 'vitest';
import { OpenAiSttAdapter } from '../src/core/stt/openai-stt.js';

const audio = { audio: Buffer.from('fake-opus'), mimeType: 'audio/webm' };

describe('OpenAiSttAdapter', () => {
  it('posts multipart to {baseUrl}/audio/transcriptions and returns text', async () => {
    let captured: any = {};
    const fakeFetch = async (url: string, init: any) => {
      captured = { url, auth: init.headers.Authorization, body: init.body };
      return { ok: true, status: 200, json: async () => ({ text: 'hello openai' }) } as any;
    };
    const a = new OpenAiSttAdapter(
      { apiKey: 'sk-1', model: 'whisper-1', baseUrl: 'https://api.openai.com/v1' },
      { fetch: fakeFetch as any },
    );
    const r = await a.transcribe(audio);
    expect(r.text).toBe('hello openai');
    expect(captured.url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(captured.auth).toBe('Bearer sk-1');
    expect(captured.body).toBeInstanceOf(FormData);
  });

  it('trims trailing slash on baseUrl', async () => {
    let url = '';
    const fakeFetch = async (u: string) => { url = u; return { ok: true, status: 200, json: async () => ({ text: '' }) } as any; };
    const a = new OpenAiSttAdapter({ apiKey: 'k', model: 'm', baseUrl: 'https://x/v1/' }, { fetch: fakeFetch as any });
    await a.transcribe(audio);
    expect(url).toBe('https://x/v1/audio/transcriptions');
  });

  it('throws "no api key" when key blank', async () => {
    const a = new OpenAiSttAdapter({ apiKey: '  ', model: 'm', baseUrl: 'b' }, { fetch: (() => {}) as any });
    await expect(a.transcribe(audio)).rejects.toThrow('OpenAI API key not configured');
  });

  it('rejects on non-2xx with status in message (describeSttError buckets it)', async () => {
    const fakeFetch = async () => ({ ok: false, status: 401, text: async () => 'invalid_api_key' } as any);
    const a = new OpenAiSttAdapter({ apiKey: 'k', model: 'm', baseUrl: 'b' }, { fetch: fakeFetch as any });
    await expect(a.transcribe(audio)).rejects.toThrow('OpenAI STT failed: 401');
  });
});
