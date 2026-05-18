// tests/trim-silence.test.ts
import { describe, it, expect } from 'vitest';
import { trimSilence } from '../src/core/audio/trim-silence.js';

describe('trimSilence', () => {
  const frames = [0, 1, 2, 3, 4, 5, 6, 7];
  const speechOf = (set: Set<number>) => (i: number) => set.has(i);

  it('keeps only speech frames + padding', () => {
    const out = trimSilence(frames, speechOf(new Set([3, 4])), { padFrames: 1 });
    expect(out).toEqual([2, 3, 4, 5]);
  });
  it('all silence -> empty', () => {
    expect(trimSilence(frames, () => false, { padFrames: 0 })).toEqual([]);
  });
  it('all speech -> unchanged', () => {
    expect(trimSilence(frames, () => true, { padFrames: 0 })).toEqual(frames);
  });
  it('padding clamps at array bounds and drops genuine mid-silence', () => {
    // speech at edges 0 and 7, pad 2: keeps {0,1,2} ∪ {5,6,7}; frames 3,4 are
    // > pad from any speech → dropped (pure union, no gap-bridging per D3).
    expect(trimSilence(frames, speechOf(new Set([0, 7])), { padFrames: 2 }))
      .toEqual([0, 1, 2, 5, 6, 7]);
  });
  it('overlapping speech pads cover the whole range', () => {
    // speech 1 keeps [0..3], speech 5 keeps [3..7] — pads overlap at 3 → full.
    const out = trimSilence(frames, speechOf(new Set([1, 5])), { padFrames: 2 });
    expect(out).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});
