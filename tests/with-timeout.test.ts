// tests/with-timeout.test.ts
import { describe, it, expect, vi } from 'vitest';
import { fetchWithTimeout, STT_TIMEOUT_MS } from '../src/core/stt/with-timeout.js';

describe('fetchWithTimeout', () => {
  it('rejects (AbortError) when the fetch never settles, after the timeout', async () => {
    // A fetch that only ever rejects when its AbortSignal fires — models a
    // hung STT provider connection (no response, no error).
    const hangingFetch = ((_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      })) as unknown as typeof fetch;

    await expect(
      fetchWithTimeout(hangingFetch, 'https://x', { method: 'POST' }, 20),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('resolves normally and does NOT abort when the fetch is fast', async () => {
    let aborted = false;
    const fastFetch = ((_url: string, init: RequestInit) => {
      init.signal?.addEventListener('abort', () => { aborted = true; });
      return Promise.resolve(new Response('ok'));
    }) as unknown as typeof fetch;

    const res = await fetchWithTimeout(fastFetch, 'https://x', { method: 'GET' }, 50);
    expect(await res.text()).toBe('ok');
    // give any (incorrectly-still-armed) timer a chance to fire
    await new Promise((r) => setTimeout(r, 70));
    expect(aborted).toBe(false); // timer must have been cleared on success
  });

  it('passes an AbortSignal through to the underlying fetch init', async () => {
    let sawSignal = false;
    const probe = ((_url: string, init: RequestInit) => {
      sawSignal = init.signal instanceof AbortSignal;
      return Promise.resolve(new Response('ok'));
    }) as unknown as typeof fetch;
    await fetchWithTimeout(probe, 'https://x', { method: 'GET' });
    expect(sawSignal).toBe(true);
  });

  it('defaults the timeout to a generous bound (>= 20s, <= 60s)', () => {
    expect(STT_TIMEOUT_MS).toBeGreaterThanOrEqual(20_000);
    expect(STT_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
    expect(STT_TIMEOUT_MS).toBe(30_000);
  });
});
