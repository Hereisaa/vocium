// src/pipeline.ts
import type { createVoiceSession } from './state-machine.js';
import type { SttAdapter } from './stt/types.js';
import type { Injector, InjectResult } from './inject/types.js';
import { describeSttError, GUIDANCE_MSG } from './stt/describe-error.js';
import type { Lang } from './stt/describe-error.js';
import { convertZh } from './zh-convert.js';

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
  /** Resolved per-call from the live setting.
   *  'twp' → force Traditional(TW), 'cn' → force Simplified. */
  getZhMode?: () => 'twp' | 'cn';
  /** Resolved per-call (live). Returns possibly-polished text; total (any
   *  failure returns the input). styleOverride lets a caller force a style
   *  regardless of the user's toggle. Default: identity (polish disabled). */
  polish?: (text: string, styleOverride?: 'light' | 'full' | 'custom') => Promise<string>;
}
/** Raw audio bytes + container MIME type. Bytes (not base64) so the webview
 *  can hand a recorded Blob straight through without a re-encode. */
export interface AudioPayload { audio: Uint8Array; mimeType: string; language?: string; }
export interface SubmitAudioResult {
  /** Text that was injected ('' when nothing was). */
  text: string;
  /** Clipboard write succeeded but the paste keystroke failed; shown by the UI. */
  injectError?: string;
  /** Something to tell the user that must NOT be pasted into their document
   *  (no API key, STT failure). The UI shows it on the pill instead. */
  notice?: string;
  /** True when the session was cancelled while STT/polish was in flight; the
   *  text was NOT injected. */
  cancelled?: boolean;
}

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
     * Always resolves with { text, injectError?, notice?, cancelled? }. Only
     * real transcript text is ever injected: an empty transcript (silence)
     * quietly returns to idle, and the no-key / STT-failure cases come back as
     * `notice` for the UI to display — nothing is pasted into the user's
     * document. Only a wrong call state (idle/injecting) rejects, as that is a
     * programmer error. `injectError` is populated when the clipboard write
     * succeeded but the paste keystroke failed (typically: macOS
     * Accessibility permission was reset after a rebuild).
     */
    async submitAudio(p: AudioPayload): Promise<SubmitAudioResult> {
      advanceFromListening();
      // Identity of THIS transcribing visit. If the user cancels and starts a
      // new round while our request is in flight, the session may be back in
      // 'transcribing' for the newer round — same state, different epoch —
      // and our late result must still be dropped.
      const epoch = session.getEpoch();
      const stillOurs = () => session.getState() === 'transcribing' && session.getEpoch() === epoch;
      if (noKey) {
        // Not an error: user simply hasn't configured a key. Calmly back to
        // idle; the UI shows the guidance.
        session.send('CANCEL');      // transcribing -> idle
        return { text: '', notice: guidance };
      }
      try {
        const raw = await stt.transcribe({
          audio: p.audio, mimeType: p.mimeType, language: p.language,
        });
        // The user may have cancelled (orb click / Esc) while the request was
        // in flight: the machine is already back in idle, so drop the result
        // instead of pasting stale text into whatever is focused now.
        if (!stillOurs()) return { text: raw.text, cancelled: true };
        let polished = raw.text;
        try { polished = await polish(raw.text); } catch { /* polish is best-effort: fall back to raw */ }
        if (!stillOurs()) return { text: polished, cancelled: true };
        const text = convertZh(polished, getZhMode()); // zh conversion is the FINAL transform (deterministic; normalizes whatever script polish produced)
        if (!text.trim()) {
          // Silence / nothing recognisable: inject nothing, no error state.
          session.send('CANCEL');    // transcribing -> idle
          return { text: '' };
        }
        session.send('TRANSCRIBED'); // -> injecting
        const r = await injector.inject(text);
        if (!r.ok) { fail(); return { text, ...(r.message ? { injectError: r.message } : {}) }; }
        session.send('INJECTED');    // -> idle
        return { text };
      } catch (e) {
        // A failure that belongs to a cancelled/superseded round must not
        // flash the error state over whatever the user is doing now.
        if (!stillOurs()) return { text: '', cancelled: true };
        // STT failed: play the error animation and hand the categorized
        // message to the UI. Never paste it into the user's document.
        fail();
        return { text: '', notice: describeSttError(e, lang) };
      }
    },
    async transcribeClip(p: AudioPayload): Promise<{ text: string; durationMs?: number }> {
      // Consistent with submitAudio: no key -> guidance text, never a raw
      // 'API key not configured' throw leaking to callers.
      if (noKey) return { text: guidance };
      const raw = await stt.transcribe({
        audio: p.audio, mimeType: p.mimeType, language: p.language,
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
