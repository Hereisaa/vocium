import { describe, it, expect } from 'vitest';
import { STYLE_PROMPTS, SAFETY_SUFFIX, buildSystemPrompt } from '../src/core/polish/prompts.js';
import { polishText } from '../src/core/polish/polish.js';

describe('polish prompts', () => {
  it('light and full are distinct non-empty system prompts', () => {
    expect(STYLE_PROMPTS.light.length).toBeGreaterThan(10);
    expect(STYLE_PROMPTS.full.length).toBeGreaterThan(10);
    expect(STYLE_PROMPTS.light).not.toBe(STYLE_PROMPTS.full);
  });
  it('buildSystemPrompt(light|full) returns the preset + safety suffix', () => {
    expect(buildSystemPrompt('light', '')).toBe(`${STYLE_PROMPTS.light}\n${SAFETY_SUFFIX}`);
    expect(buildSystemPrompt('full', '')).toBe(`${STYLE_PROMPTS.full}\n${SAFETY_SUFFIX}`);
  });
  it('buildSystemPrompt(custom, prompt) uses the custom prompt + safety suffix', () => {
    expect(buildSystemPrompt('custom', 'make it formal')).toBe(`make it formal\n${SAFETY_SUFFIX}`);
  });
  it('buildSystemPrompt(custom, empty) falls back to light preset', () => {
    expect(buildSystemPrompt('custom', '   ')).toBe(`${STYLE_PROMPTS.light}\n${SAFETY_SUFFIX}`);
  });
});

describe('polishText (total)', () => {
  const resolved = { provider: 'groq' as const, model: 'm', style: 'light' as const, customPrompt: '', apiKey: 'k' };

  it('openai/groq: posts chat/completions and returns trimmed content', async () => {
    let captured: any = {};
    const fetch = async (url: string, init: any) => {
      captured = { url, body: JSON.parse(init.body), auth: init.headers.Authorization };
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '  polished.  ' } }] }) } as any;
    };
    const out = await polishText('raw text', resolved, { fetch: fetch as any });
    expect(out).toBe('polished.');
    expect(captured.url).toContain('groq.com');
    expect(captured.auth).toBe('Bearer k');
    expect(captured.body.messages[0].role).toBe('system');
    expect(captured.body.messages[1].content).toBe('raw text');
  });
  it('gemini: generateContent shape', async () => {
    let url = ''; let body: any = {};
    const fetch = async (u: string, init: any) => { url = u; body = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'g out' }] } }] }) } as any; };
    const out = await polishText('x', { ...resolved, provider: 'gemini', model: 'gemini-1.5-flash' }, { fetch: fetch as any });
    expect(out).toBe('g out');
    expect(url).toContain(':generateContent');
    expect(body.systemInstruction.parts[0].text).toBeTruthy();
    expect(body.contents[0].parts[0].text).toBe('x');
  });
  it('claude: messages API shape', async () => {
    let captured: any = {};
    const fetch = async (u: string, init: any) => { captured = { u, h: init.headers }; return { ok: true, status: 200,
      json: async () => ({ content: [{ type: 'text', text: 'c out' }] }) } as any; };
    const out = await polishText('x', { ...resolved, provider: 'claude', model: 'claude-3-5-haiku-latest' }, { fetch: fetch as any });
    expect(out).toBe('c out');
    expect(captured.u).toContain('/v1/messages');
    expect(captured.h['x-api-key']).toBe('k');
    expect(captured.h['anthropic-version']).toBeTruthy();
  });
  it('no api key → returns input unchanged (no fetch)', async () => {
    let called = false;
    const fetch = (async () => { called = true; }) as any;
    expect(await polishText('keep me', { ...resolved, apiKey: '' }, { fetch })).toBe('keep me');
    expect(called).toBe(false);
  });
  it('non-2xx → returns input', async () => {
    const fetch = async () => ({ ok: false, status: 429, text: async () => 'rate' } as any);
    expect(await polishText('orig', resolved, { fetch: fetch as any })).toBe('orig');
  });
  it('empty/whitespace response → returns input', async () => {
    const fetch = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '   ' } }] }) } as any);
    expect(await polishText('orig', resolved, { fetch: fetch as any })).toBe('orig');
  });
  it('throw/timeout → returns input', async () => {
    const fetch = async () => { throw new Error('boom'); };
    expect(await polishText('orig', resolved, { fetch: fetch as any })).toBe('orig');
  });
  it('openai: posts to openai.com', async () => {
    let url = '';
    const fetch = async (u: string, _init: any) => { url = u;
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) } as any; };
    await polishText('x', { ...resolved, provider: 'openai' }, { fetch: fetch as any });
    expect(url).toContain('openai.com');
  });
});
