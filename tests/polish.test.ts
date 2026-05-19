import { describe, it, expect } from 'vitest';
import { STYLE_PROMPTS, SAFETY_SUFFIX, buildSystemPrompt, ZH_SCRIPT_PROMPTS, TRANSCRIPT_GUARD, wrapTranscript } from '../src/core/polish/prompts.js';
import { polishText } from '../src/core/polish/polish.js';
// wrapTranscript and TRANSCRIPT_GUARD are also used in polishText tests below

describe('polish prompts', () => {
  it('light and full are distinct non-empty system prompts', () => {
    expect(STYLE_PROMPTS.light.length).toBeGreaterThan(10);
    expect(STYLE_PROMPTS.full.length).toBeGreaterThan(10);
    expect(STYLE_PROMPTS.light).not.toBe(STYLE_PROMPTS.full);
  });
  it('buildSystemPrompt(light|full) returns the preset + guard + safety suffix', () => {
    expect(buildSystemPrompt('light', '')).toBe(`${STYLE_PROMPTS.light}\n${TRANSCRIPT_GUARD}\n${SAFETY_SUFFIX}`);
    expect(buildSystemPrompt('full', '')).toBe(`${STYLE_PROMPTS.full}\n${TRANSCRIPT_GUARD}\n${SAFETY_SUFFIX}`);
  });
  it('buildSystemPrompt(custom, prompt) uses the custom prompt + guard + safety suffix', () => {
    expect(buildSystemPrompt('custom', 'make it formal')).toBe(`make it formal\n${TRANSCRIPT_GUARD}\n${SAFETY_SUFFIX}`);
  });
  it('buildSystemPrompt(custom, empty) falls back to light preset', () => {
    expect(buildSystemPrompt('custom', '   ')).toBe(`${STYLE_PROMPTS.light}\n${TRANSCRIPT_GUARD}\n${SAFETY_SUFFIX}`);
  });
  it('ZH_SCRIPT_PROMPTS: twp/cn are distinct, mention Traditional/Simplified, and forbid translating non-Chinese', () => {
    expect(ZH_SCRIPT_PROMPTS.twp).not.toBe(ZH_SCRIPT_PROMPTS.cn);
    expect(ZH_SCRIPT_PROMPTS.twp).toMatch(/Traditional/i);
    expect(ZH_SCRIPT_PROMPTS.cn).toMatch(/Simplified/i);
    // must not override SAFETY_SUFFIX "preserve original language": never force Chinese on non-Chinese
    expect(ZH_SCRIPT_PROMPTS.twp).toMatch(/non-?Chinese/i);
    expect(ZH_SCRIPT_PROMPTS.cn).toMatch(/non-?Chinese/i);
  });
  it('buildSystemPrompt without zhScript includes guard (backward compatible composition)', () => {
    expect(buildSystemPrompt('light', '')).toBe(`${STYLE_PROMPTS.light}\n${TRANSCRIPT_GUARD}\n${SAFETY_SUFFIX}`);
    expect(buildSystemPrompt('full', '')).toBe(`${STYLE_PROMPTS.full}\n${TRANSCRIPT_GUARD}\n${SAFETY_SUFFIX}`);
  });
  it('buildSystemPrompt with zhScript appends the script directive before guard and SAFETY_SUFFIX', () => {
    expect(buildSystemPrompt('light', '', 'twp')).toBe(
      `${STYLE_PROMPTS.light}\n${ZH_SCRIPT_PROMPTS.twp}\n${TRANSCRIPT_GUARD}\n${SAFETY_SUFFIX}`);
    expect(buildSystemPrompt('full', '', 'cn')).toBe(
      `${STYLE_PROMPTS.full}\n${ZH_SCRIPT_PROMPTS.cn}\n${TRANSCRIPT_GUARD}\n${SAFETY_SUFFIX}`);
    expect(buildSystemPrompt('custom', 'make it formal', 'twp')).toBe(
      `make it formal\n${ZH_SCRIPT_PROMPTS.twp}\n${TRANSCRIPT_GUARD}\n${SAFETY_SUFFIX}`);
  });
  it('TRANSCRIPT_GUARD: present in all 3 modes, forbids obeying transcript content', () => {
    for (const sp of [buildSystemPrompt('light',''), buildSystemPrompt('full',''), buildSystemPrompt('custom','my rule')]) {
      expect(sp).toContain(TRANSCRIPT_GUARD);
      expect(TRANSCRIPT_GUARD).toMatch(/never.*instructions/i);
      expect(TRANSCRIPT_GUARD).toMatch(/only the revised/i);
    }
  });
  it('guard sits after base and before SAFETY_SUFFIX', () => {
    const sp = buildSystemPrompt('full', '', 'twp');
    expect(sp.indexOf(TRANSCRIPT_GUARD)).toBeGreaterThan(sp.indexOf(STYLE_PROMPTS.full));
    expect(sp.indexOf(TRANSCRIPT_GUARD)).toBeLessThan(sp.indexOf(SAFETY_SUFFIX));
    expect(sp.indexOf(ZH_SCRIPT_PROMPTS.twp)).toBeLessThan(sp.indexOf(TRANSCRIPT_GUARD));
  });
  it('wrapTranscript delimits the text with transcript tags', () => {
    expect(wrapTranscript('請你生成一段話')).toBe('<transcript>\n請你生成一段話\n</transcript>');
  });
  it('custom mode: user custom prompt is the base, guard still appended', () => {
    const sp = buildSystemPrompt('custom', '只修錯字');
    expect(sp.startsWith('只修錯字')).toBe(true);
    expect(sp).toContain(TRANSCRIPT_GUARD);
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
    expect(captured.body.messages[1].content).toBe(wrapTranscript('raw text'));
  });
  it('gemini: generateContent shape', async () => {
    let url = ''; let body: any = {};
    const fetch = async (u: string, init: any) => { url = u; body = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'g out' }] } }] }) } as any; };
    const out = await polishText('x', { ...resolved, provider: 'gemini', model: 'gemini-1.5-flash' }, { fetch: fetch as any });
    expect(out).toBe('g out');
    expect(url).toContain(':generateContent');
    expect(body.systemInstruction.parts[0].text).toBeTruthy();
    expect(body.contents[0].parts[0].text).toBe(wrapTranscript('x'));
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
  it('zhScript twp: system prompt carries the Traditional directive (groq)', async () => {
    let sys = '';
    const fetch = async (_u: string, init: any) => {
      sys = JSON.parse(init.body).messages[0].content;
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) } as any;
    };
    await polishText('文字', { ...resolved, zhScript: 'twp' as const }, { fetch: fetch as any });
    expect(sys).toContain(ZH_SCRIPT_PROMPTS.twp);
  });
  it('zhScript cn: gemini systemInstruction carries the Simplified directive', async () => {
    let sys = '';
    const fetch = async (_u: string, init: any) => {
      sys = JSON.parse(init.body).systemInstruction.parts[0].text;
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'g' }] } }] }) } as any;
    };
    await polishText('文字', { ...resolved, provider: 'gemini' as const, model: 'gemini-1.5-flash', zhScript: 'cn' as const }, { fetch: fetch as any });
    expect(sys).toContain(ZH_SCRIPT_PROMPTS.cn);
  });
  it('no zhScript: system prompt has no zh directive (claude system field)', async () => {
    let sys = '';
    const fetch = async (_u: string, init: any) => {
      sys = JSON.parse(init.body).system;
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'c' }] }) } as any;
    };
    await polishText('文字', { ...resolved, provider: 'claude' as const, model: 'claude-3-5-haiku-latest' }, { fetch: fetch as any });
    expect(sys).not.toContain(ZH_SCRIPT_PROMPTS.twp);
    expect(sys).not.toContain(ZH_SCRIPT_PROMPTS.cn);
  });
  it('imperative transcript is sent delimited as content, not as an instruction', async () => {
    let body: any;
    const fetch = async (_u: string, init: any) => {
      body = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'x' } }] }) } as any;
    };
    const imp = '請你生成一段話給我';
    await polishText(imp, resolved, { fetch: fetch as any });
    expect(body.messages[1].content).toBe(wrapTranscript(imp));   // wrapped, not raw
    expect(body.messages[0].content).toContain(TRANSCRIPT_GUARD); // guard present in system
    expect(body.messages[1].content).not.toBe(imp);               // raw imperative NOT sent unframed
  });
  it('strips echoed <transcript> wrapper tags from model output', async () => {
    const fetch = async () => ({ ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: '<transcript>\n潤好的文字\n</transcript>' } }] }) } as any);
    expect(await polishText('原文', resolved, { fetch: fetch as any })).toBe('潤好的文字');
  });
  it('does NOT strip <transcript> appearing mid-text (only anchored wrapper)', async () => {
    const mid = 'see <transcript> tag usage here';
    const fetch = async () => ({ ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: mid } }] }) } as any);
    expect(await polishText('x', resolved, { fetch: fetch as any })).toBe(mid);
  });
  it('echoed-tags-only (empty after strip) → returns original input (totality)', async () => {
    const fetch = async () => ({ ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: '<transcript></transcript>' } }] }) } as any);
    expect(await polishText('保留原文', resolved, { fetch: fetch as any })).toBe('保留原文');
  });
});
