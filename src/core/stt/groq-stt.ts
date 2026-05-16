// src/core/stt/groq-stt.ts
import type { SttAdapter, SttInput, SttResult } from './types.js';

const ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';

export interface GroqOpts { apiKey: string; model: string; }
export interface GroqDeps { fetch: typeof fetch; }

export class GroqSttAdapter implements SttAdapter {
  constructor(private opts: GroqOpts, private deps: GroqDeps) {}

  async transcribe(input: SttInput): Promise<SttResult> {
    if (!this.opts.apiKey) throw new Error('Groq API key not configured');
    const form = new FormData();
    // Uint8Array wrap required: Buffer is not assignable to BlobPart under TS strict + @types/node v22
    form.append('file', new Blob([new Uint8Array(input.audio)], { type: input.mimeType }), 'audio.webm');
    form.append('model', this.opts.model);
    form.append('response_format', 'json');
    if (input.language) form.append('language', input.language);

    const res = await this.deps.fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.opts.apiKey}` },
      body: form,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Groq STT failed: ${res.status} ${detail}`.trim());
    }
    const data = (await res.json()) as { text: string };
    return { text: data.text ?? '' };
  }
}
