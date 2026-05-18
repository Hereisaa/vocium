// src/core/audio/trim-silence.ts
// Pure frame-selection logic for the opt-in VAD silence trim (design D3/§8).
// The real Silero speech decision runs in the webview and is injected here as
// `isSpeech(frameIndex)`, so this stays deterministic and unit-testable.
export interface TrimOpts { padFrames: number; }

export function trimSilence<T>(
  frames: readonly T[],
  isSpeech: (frameIndex: number) => boolean,
  opts: TrimOpts,
): T[] {
  const pad = Math.max(0, opts.padFrames | 0);
  const keep = new Array(frames.length).fill(false);
  for (let i = 0; i < frames.length; i++) {
    if (isSpeech(i)) {
      for (let j = Math.max(0, i - pad); j <= Math.min(frames.length - 1, i + pad); j++) {
        keep[j] = true;
      }
    }
  }
  const out: T[] = [];
  for (let i = 0; i < frames.length; i++) if (keep[i]) out.push(frames[i]);
  return out;
}
