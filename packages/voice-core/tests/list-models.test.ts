// tests/list-models.test.ts
import { describe, it, expect } from 'vitest';
import { listModels, classifyModels } from '../src/stt/list-models.js';

type Captured = { url: string; init: RequestInit };

function okFetch(body: unknown, captured: Captured[] = []) {
  return (async (url: string, init: RequestInit) => {
    captured.push({ url, init });
    return { ok: true, status: 200, json: async () => body, text: async () => '' } as any;
  }) as any;
}

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('listModels — Groq', () => {
  it('GETs /models with Bearer key and buckets whisper vs chat vs other', async () => {
    const cap: Captured[] = [];
    const fetch = okFetch({
      object: 'list',
      data: [
        { id: 'whisper-large-v3-turbo' }, { id: 'whisper-large-v3' },
        { id: 'llama-3.3-70b-versatile' }, { id: 'openai/gpt-oss-120b' },
        { id: 'playai-tts' }, { id: 'llama-guard-4-12b' }, { id: 'mystery-model-7' },
      ],
    }, cap);
    const r = await listModels('groq', { apiKey: 'gsk_x' }, { fetch });
    expect(cap[0].url).toBe('https://api.groq.com/openai/v1/models');
    expect(cap[0].init.method).toBe('GET');
    expect((cap[0].init.headers as any).Authorization).toBe('Bearer gsk_x');
    expect(ids(r.stt)).toEqual(['whisper-large-v3', 'whisper-large-v3-turbo']);
    expect(ids(r.polish)).toEqual(['llama-3.3-70b-versatile', 'openai/gpt-oss-120b']);
    expect(ids(r.other)).toEqual(['llama-guard-4-12b', 'mystery-model-7', 'playai-tts']);
  });

  it('labels fall back to the id (no static hints for fetched models)', async () => {
    const r = await listModels('groq', { apiKey: 'k' }, { fetch: okFetch({ data: [{ id: 'whisper-1' }] }) });
    expect(r.stt[0]).toEqual({ id: 'whisper-1', label: 'whisper-1', labelEn: 'whisper-1' });
  });
});

describe('listModels — OpenAI-compatible', () => {
  it('uses the default base URL when none is given', async () => {
    const cap: Captured[] = [];
    await listModels('openai', { apiKey: 'sk' }, { fetch: okFetch({ data: [] }, cap) });
    expect(cap[0].url).toBe('https://api.openai.com/v1/models');
  });

  it('honours a custom base URL (trailing slash trimmed) and classifies transcribe/tts', async () => {
    const cap: Captured[] = [];
    const fetch = okFetch({
      data: [
        { id: 'gpt-4o-transcribe' }, { id: 'whisper-1' }, { id: 'gpt-5.4-mini' }, { id: 'o3' },
        { id: 'gpt-4o-mini-tts' }, { id: 'text-embedding-3-small' }, { id: 'dall-e-3' },
        { id: 'gpt-4o-realtime-preview' }, { id: 'omni-moderation-latest' },
      ],
    }, cap);
    const r = await listModels('openai', { apiKey: 'sk', baseUrl: 'https://proxy.example/v1/' }, { fetch });
    expect(cap[0].url).toBe('https://proxy.example/v1/models');
    expect(ids(r.stt)).toEqual(['gpt-4o-transcribe', 'whisper-1']);
    expect(ids(r.polish)).toEqual(['gpt-5.4-mini', 'o3']);
    expect(ids(r.other)).toEqual([
      'dall-e-3', 'gpt-4o-mini-tts', 'gpt-4o-realtime-preview',
      'omni-moderation-latest', 'text-embedding-3-small',
    ]);
  });
});

describe('listModels — Gemini', () => {
  it('passes the key as a query param, strips "models/" and needs generateContent', async () => {
    const cap: Captured[] = [];
    const fetch = okFetch({
      models: [
        { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent', 'countTokens'] },
        { name: 'models/gemini-3.1-pro-preview', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
        { name: 'models/gemini-2.5-flash-preview-tts', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/imagen-4.0-generate-001', supportedGenerationMethods: ['predict'] },
      ],
    }, cap);
    const r = await listModels('gemini', { apiKey: 'AIza/x' }, { fetch });
    expect(cap[0].url.startsWith('https://generativelanguage.googleapis.com/v1beta/models?key=AIza%2Fx')).toBe(true);
    expect((cap[0].init.headers as any).Authorization).toBeUndefined();
    // multimodal chat models serve both roles
    expect(ids(r.stt)).toEqual(['gemini-3.1-pro-preview', 'gemini-3.5-flash']);
    expect(ids(r.polish)).toEqual(['gemini-3.1-pro-preview', 'gemini-3.5-flash']);
    expect(ids(r.other)).toEqual(['gemini-2.5-flash-preview-tts', 'imagen-4.0-generate-001', 'text-embedding-004']);
  });
});

describe('listModels — Claude', () => {
  it('sends x-api-key + anthropic-version and lists everything as polish', async () => {
    const cap: Captured[] = [];
    const fetch = okFetch({ data: [{ id: 'claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6' }, { id: 'claude-haiku-4-5' }] }, cap);
    const r = await listModels('claude', { apiKey: 'sk-ant' }, { fetch });
    expect(cap[0].url.startsWith('https://api.anthropic.com/v1/models')).toBe(true);
    const h = cap[0].init.headers as any;
    expect(h['x-api-key']).toBe('sk-ant');
    expect(h['anthropic-version']).toBe('2023-06-01');
    expect(ids(r.polish)).toEqual(['claude-haiku-4-5', 'claude-sonnet-4-6']);
    expect(r.stt).toEqual([]);
  });
});

describe('listModels — failure paths', () => {
  it('rejects before fetching when the key is blank', async () => {
    let called = false;
    const fetch = (async () => { called = true; }) as any;
    await expect(listModels('groq', { apiKey: '  ' }, { fetch })).rejects.toThrow('groq API key not configured');
    expect(called).toBe(false);
  });

  it('rejects on non-2xx with status and body', async () => {
    const fetch = (async () => ({ ok: false, status: 401, text: async () => 'invalid key' })) as any;
    await expect(listModels('openai', { apiKey: 'k' }, { fetch })).rejects.toThrow('OpenAI models failed: 401 invalid key');
  });

  it('rejects on an unexpected response shape', async () => {
    await expect(listModels('groq', { apiKey: 'k' }, { fetch: okFetch({ error: 'nope' }) }))
      .rejects.toThrow('unexpected response shape');
    await expect(listModels('gemini', { apiKey: 'k' }, { fetch: okFetch({ data: [] }) }))
      .rejects.toThrow('unexpected response shape');
  });

  it('propagates network errors from fetch', async () => {
    const fetch = (async () => { throw new TypeError('Failed to fetch'); }) as any;
    await expect(listModels('gemini', { apiKey: 'k' }, { fetch })).rejects.toThrow('Failed to fetch');
  });
});

describe('classifyModels', () => {
  it('dedupes ids and skips blanks', () => {
    const r = classifyModels('groq', [{ id: 'whisper-1' }, { id: 'whisper-1' }, { id: '' }]);
    expect(ids(r.stt)).toEqual(['whisper-1']);
    expect(r.other).toEqual([]);
  });
});
