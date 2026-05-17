// src/sidecar/pipeline.ts
import type { createVoiceSession } from '../core/state-machine.js';
import type { SttAdapter } from '../core/stt/types.js';
import type { Injector } from '../core/inject/types.js';
import { describeSttError, GUIDANCE_MSG } from '../core/stt/describe-error.js';

type Session = ReturnType<typeof createVoiceSession>;

export interface PipelineDeps {
  session: Session;
  stt: SttAdapter;
  injector: Injector;
  /** Resolved at boot: sttProvider==='groq' but no API key. When true,
   *  submitAudio short-circuits transcription and injects GUIDANCE_MSG. */
  noKey?: boolean;
}
export interface AudioPayload { audioBase64: string; mimeType: string; language?: string; }

export function createPipeline({ session, stt, injector, noKey = false }: PipelineDeps) {
  let resetTimer: ReturnType<typeof setTimeout> | null = null;
  function fail() {
    session.send('FAIL');
    if (resetTimer !== null) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      resetTimer = null;
      session.send('RESET');
    }, 1500);
  }
  function advanceFromListening() {
    const s = session.getState();
    if (s === 'listening') {
      session.send('TOGGLE'); // self-advance: listening -> transcribing
    } else if (s !== 'transcribing') {
      throw new Error(`submitAudio called in unexpected state: ${s}`);
    }
    // if already 'transcribing', an external toggle already advanced — proceed
  }
  return {
    getState: () => session.getState(),
    toggle() { session.send('TOGGLE'); return session.getState(); },
    cancel() { session.send('CANCEL'); return session.getState(); },
    /**
     * Always resolves with { text }. STT failures and the no-key case become
     * injected user-facing text (not Promise rejections); only a wrong call
     * state (idle/injecting) rejects, as that is a programmer error.
     */
    async submitAudio(p: AudioPayload): Promise<{ text: string }> {
      advanceFromListening();
      if (noKey) {
        // Not an error: user simply hasn't configured a key. Calm normal flow.
        session.send('TRANSCRIBED'); // -> injecting
        const r = await injector.inject(GUIDANCE_MSG);
        if (!r.ok) { fail(); return { text: GUIDANCE_MSG }; }
        session.send('INJECTED');    // -> idle
        return { text: GUIDANCE_MSG };
      }
      try {
        const { text } = await stt.transcribe({
          audio: Buffer.from(p.audioBase64, 'base64'), mimeType: p.mimeType, language: p.language,
        });
        session.send('TRANSCRIBED'); // -> injecting
        const r = await injector.inject(text);
        if (!r.ok) { fail(); return { text }; }
        session.send('INJECTED');    // -> idle
        return { text };
      } catch (e) {
        // STT failed: inject a short categorized message into the focused field,
        // then play the error animation. Do NOT rethrow — handled by injection.
        const msg = describeSttError(e);
        try { await injector.inject(msg); } catch { /* injection best-effort */ }
        fail();
        return { text: msg };
      }
    },
    async transcribeClip(p: AudioPayload): Promise<{ text: string }> {
      // Consistent with submitAudio: no key -> guidance text, never a raw
      // 'Groq API key not configured' throw leaking to MCP consumers.
      if (noKey) return { text: GUIDANCE_MSG };
      return stt.transcribe({
        audio: Buffer.from(p.audioBase64, 'base64'), mimeType: p.mimeType, language: p.language,
      });
    },
    async injectText(text: string) { return injector.inject(text); },
  };
}
