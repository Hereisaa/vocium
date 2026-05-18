// src/core/stt/gemini-stt.ts
import type { SttAdapter, SttInput, SttResult, SttDeps } from './types.js';

export interface GeminiOpts { apiKey: string; model: string; }

const PROMPT =
  'Transcribe the following audio verbatim. Output only the spoken words, ' +
  'with no commentary, labels, or timestamps.';

export class GeminiSttAdapter implements SttAdapter {
  constructor(private opts: GeminiOpts, private deps: SttDeps) {}

  async transcribe(input: SttInput): Promise<SttResult> {
    if (!this.opts.apiKey.trim()) throw new Error('Gemini API key not configured');
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${this.opts.model}:generateContent?key=${encodeURIComponent(this.opts.apiKey)}`;
    const body = {
      contents: [
        {
          parts: [
            { text: PROMPT },
            {
              inline_data: {
                mime_type: input.mimeType,
                data: Buffer.from(input.audio).toString('base64'),
              },
            },
          ],
        },
      ],
    };
    const res = await this.deps.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Gemini STT failed: ${res.status} ${detail}`.trim());
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    return { text: parts.map((p) => p.text ?? '').join('') };
  }
}
