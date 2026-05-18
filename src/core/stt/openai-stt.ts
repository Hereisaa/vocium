// src/core/stt/openai-stt.ts
import type { SttAdapter, SttInput, SttResult, SttDeps } from './types.js';

export interface OpenAiOpts { apiKey: string; model: string; baseUrl: string; }

export class OpenAiSttAdapter implements SttAdapter {
  constructor(private opts: OpenAiOpts, private deps: SttDeps) {}

  async transcribe(input: SttInput): Promise<SttResult> {
    if (!this.opts.apiKey.trim()) throw new Error('OpenAI API key not configured');
    const base = this.opts.baseUrl.replace(/\/+$/, '');
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(input.audio)], { type: input.mimeType }), 'audio.webm');
    form.append('model', this.opts.model);
    form.append('response_format', 'json');
    if (input.language) form.append('language', input.language);

    const res = await this.deps.fetch(`${base}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.opts.apiKey}` },
      body: form,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`OpenAI STT failed: ${res.status} ${detail}`.trim());
    }
    const data = (await res.json()) as { text?: string };
    return { text: data.text ?? '' };
  }
}
