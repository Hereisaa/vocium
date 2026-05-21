// src/sidecar/pipeline.ts
import type { createVoiceSession } from '../core/state-machine.js';
import type { SttAdapter } from '../core/stt/types.js';
import type { Injector, InjectResult } from '../core/inject/types.js';
import { describeSttError, GUIDANCE_MSG } from '../core/stt/describe-error.js';
import type { Lang } from '../core/stt/describe-error.js';
import { convertZh } from '../core/zh-convert.js';

type Session = ReturnType<typeof createVoiceSession>;

export interface PipelineDeps {
  session: Session;
  stt: SttAdapter;
  injector: Injector;
  /** Resolved at boot: sttProvider==='groq' but no API key. When true,
   *  submitAudio short-circuits transcription and injects the no-key guidance. */
  noKey?: boolean;
  /** User-facing UI language. Selects zh-TW (default) vs en for the STT-error
   *  categories injected on failure. */
  lang?: Lang;
  /** Localized no-key guidance text. Resolved at the call site from lang +
   *  active provider. Defaults to the zh-TW Groq GUIDANCE_MSG so callers that
   *  omit it (e.g. tests) keep the previous behavior. */
  guidance?: string;
  /** Resolved per-call from the live setting (no sidecar restart needed).
   *  'twp' → force Traditional(TW), 'cn' → force Simplified. */
  getZhMode?: () => 'twp' | 'cn';
  /** Resolved per-call (live). Returns possibly-polished text; total (any
   *  failure returns the input). styleOverride is used by the polish_text MCP
   *  tool. Default: identity (polish disabled). */
  polish?: (text: string, styleOverride?: 'light' | 'full' | 'custom') => Promise<string>;
}
export interface AudioPayload { audioBase64: string; mimeType: string; language?: string; }
export interface SubmitAudioResult { text: string; injectError?: string; }

export function createPipeline({ session, stt, injector, noKey = false, lang = 'zh-TW', guidance = GUIDANCE_MSG, getZhMode = () => 'twp', polish = async (t: string) => t }: PipelineDeps) {
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
     * Always resolves with { text, injectError? }. STT failures and the no-key
     * case become injected user-facing text (not Promise rejections); only a
     * wrong call state (idle/injecting) rejects, as that is a programmer error.
     * `injectError` is populated when the clipboard write succeeded but the
     * paste keystroke failed (typically: macOS Accessibility permission was
     * reset after a rebuild) — the webview surfaces it so the user immediately
     * sees the actionable guidance instead of a silent red flash.
     */
    async submitAudio(p: AudioPayload): Promise<SubmitAudioResult> {
      advanceFromListening();
      if (noKey) {
        // Not an error: user simply hasn't configured a key. Calm normal flow.
        session.send('TRANSCRIBED'); // -> injecting
        const r = await injector.inject(guidance);
        if (!r.ok) { fail(); return { text: guidance, ...(r.message ? { injectError: r.message } : {}) }; }
        session.send('INJECTED');    // -> idle
        return { text: guidance };
      }
      try {
        const raw = await stt.transcribe({
          audio: Buffer.from(p.audioBase64, 'base64'), mimeType: p.mimeType, language: p.language,
        });
        let polished = raw.text;
        try { polished = await polish(raw.text); } catch { /* polish best-effort (design E6): fall back to raw */ }
        const text = convertZh(polished, getZhMode()); // zh conversion is the FINAL transform (deterministic; normalizes whatever script polish produced)
        session.send('TRANSCRIBED'); // -> injecting
        const r = await injector.inject(text);
        if (!r.ok) { fail(); return { text, ...(r.message ? { injectError: r.message } : {}) }; }
        session.send('INJECTED');    // -> idle
        return { text };
      } catch (e) {
        // STT failed: inject a short categorized message into the focused field,
        // then play the error animation. Do NOT rethrow — handled by injection.
        const msg = describeSttError(e, lang);
        try { await injector.inject(msg); } catch { /* injection best-effort */ }
        fail();
        return { text: msg };
      }
    },
    async transcribeClip(p: AudioPayload): Promise<{ text: string; durationMs?: number }> {
      // Consistent with submitAudio: no key -> guidance text, never a raw
      // 'Groq API key not configured' throw leaking to MCP consumers.
      if (noKey) return { text: guidance };
      const raw = await stt.transcribe({
        audio: Buffer.from(p.audioBase64, 'base64'), mimeType: p.mimeType, language: p.language,
      });
      return { ...raw, text: convertZh(raw.text, getZhMode()) };
    },
    async injectText(text: string) { return injector.inject(text); },
    async probeInject(): Promise<InjectResult> {
      // probe is optional: platforms without permission gating (Windows) may
      // omit it; that case maps to ok:true so the webview never sees a false
      // warning on those platforms.
      if (typeof injector.probe === 'function') return injector.probe();
      return { ok: true };
    },
    async polishOnly(text: string, style?: 'light' | 'full' | 'custom') {
      return polish(text, style);
    },
  };
}
