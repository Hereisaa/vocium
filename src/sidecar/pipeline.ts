// src/sidecar/pipeline.ts
import type { createVoiceSession } from '../core/state-machine.js';
import type { SttAdapter } from '../core/stt/types.js';
import type { Injector } from '../core/inject/types.js';

type Session = ReturnType<typeof createVoiceSession>;

export interface PipelineDeps {
  session: Session;
  stt: SttAdapter;
  injector: Injector;
}
export interface AudioPayload { audioBase64: string; mimeType: string; language?: string; }

export function createPipeline({ session, stt, injector }: PipelineDeps) {
  let resetTimer: ReturnType<typeof setTimeout> | null = null;
  function fail() {
    session.send('FAIL');
    if (resetTimer !== null) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      resetTimer = null;
      session.send('RESET');
    }, 1500);
  }
  return {
    getState: () => session.getState(),
    toggle() { session.send('TOGGLE'); return session.getState(); },
    cancel() { session.send('CANCEL'); return session.getState(); },
    async submitAudio(p: AudioPayload): Promise<{ text: string }> {
      const s = session.getState();
      if (s === 'listening') {
        session.send('TOGGLE'); // self-advance: listening -> transcribing
      } else if (s !== 'transcribing') {
        throw new Error(`submitAudio called in unexpected state: ${s}`);
      }
      // if already 'transcribing', an external toggle already advanced state — proceed
      try {
        const { text } = await stt.transcribe({
          audio: Buffer.from(p.audioBase64, 'base64'), mimeType: p.mimeType, language: p.language,
        });
        session.send('TRANSCRIBED'); // -> injecting
        const r = await injector.inject(text);
        if (!r.ok) { fail(); return { text }; }
        session.send('INJECTED');    // -> idle
        return { text };
      } catch (e) { fail(); throw e; }
    },
    async transcribeClip(p: AudioPayload): Promise<{ text: string }> {
      return stt.transcribe({
        audio: Buffer.from(p.audioBase64, 'base64'), mimeType: p.mimeType, language: p.language,
      });
    },
    async injectText(text: string) { return injector.inject(text); },
  };
}
