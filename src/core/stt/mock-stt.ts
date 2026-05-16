// src/core/stt/mock-stt.ts
import type { SttAdapter, SttInput, SttResult } from './types.js';

export interface MockOpts { text: string; delayMs?: number; failMode?: boolean; }

export class MockSttAdapter implements SttAdapter {
  constructor(private opts: MockOpts) {}
  async transcribe(_input: SttInput): Promise<SttResult> {
    const delay = this.opts.delayMs ?? 800;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    if (this.opts.failMode) throw new Error('mock: forced failure');
    return { text: this.opts.text };
  }
}
