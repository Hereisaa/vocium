// tests/gemini-stt.test.ts
import { describe, it, expect } from 'vitest';
import { GeminiSttAdapter } from '../src/core/stt/gemini-stt.js';

const audio = { audio: Buffer.from('fake-opus'), mimeType: 'audio/webm' };

describe('GeminiSttAdapter', () => {
  it('posts generateContent with inline audio and parses text', async () => {
    let captured: any = {};
    const fakeFetch = async (url: string, init: any) => {
      captured = { url, body: JSON.parse(init.body) };
      return {
        ok: true, status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: '逐字內容' }] } }] }),
      } as any;
    };
    const a = new GeminiSttAdapter({ apiKey: 'AIza-x', model: 'gemini-1.5-flash' }, { fetch: fakeFetch as any });
    const r = await a.transcribe(audio);
    expect(r.text).toBe('逐字內容');
    expect(captured.url).toContain('/models/gemini-1.5-flash:generateContent');
    expect(captured.url).toContain('key=AIza-x');
    const parts = captured.body.contents[0].parts;
    expect(parts.some((p: any) => p.inline_data?.mime_type === 'audio/webm')).toBe(true);
    expect(parts.some((p: any) => typeof p.text === 'string')).toBe(true);
  });

  it('joins multiple text parts', async () => {
    const fakeFetch = async () => ({
      ok: true, status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] }),
    } as any);
    const a = new GeminiSttAdapter({ apiKey: 'k', model: 'm' }, { fetch: fakeFetch as any });
    expect((await a.transcribe(audio)).text).toBe('ab');
  });

  it('throws when key blank', async () => {
    const a = new GeminiSttAdapter({ apiKey: '', model: 'm' }, { fetch: (() => {}) as any });
    await expect(a.transcribe(audio)).rejects.toThrow('Gemini API key not configured');
  });

  it('rejects on non-2xx with status (describeSttError buckets it)', async () => {
    const fakeFetch = async () => ({ ok: false, status: 429, text: async () => 'rate' } as any);
    const a = new GeminiSttAdapter({ apiKey: 'k', model: 'm' }, { fetch: fakeFetch as any });
    await expect(a.transcribe(audio)).rejects.toThrow('Gemini STT failed: 429');
  });

  it('empty candidates -> empty string (no throw)', async () => {
    const fakeFetch = async () => ({ ok: true, status: 200, json: async () => ({}) } as any);
    const a = new GeminiSttAdapter({ apiKey: 'k', model: 'm' }, { fetch: fakeFetch as any });
    expect((await a.transcribe(audio)).text).toBe('');
  });
});
