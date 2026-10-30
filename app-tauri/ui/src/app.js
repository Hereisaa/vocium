/*
 * Vocium icon-window controller.
 *
 * Single-process architecture: this webview hosts voice-core (state machine,
 * STT, polish, zh conversion) and drives the microphone. The Rust shell only
 * does OS work — window, tray, global hotkey, config file, native text
 * injection — and talks to us through Tauri commands and events:
 *
 *   Rust -> webview   `hotkey` event { action: 'toggle' | 'start_listening' | 'stop_listening' }
 *                     `config` event { dragLocked?, lang? }
 *   webview -> Rust   invoke('inject_text' | 'probe_inject' | 'report_state' |
 *                            'read_config_raw' | 'get_config' | 'save_*' | …)
 *
 * Recording flow:
 *   - session enters `listening`  : getUserMedia + MediaRecorder.start()
 *                                   + arm maxListenMs auto-stop timer.
 *   - session leaves `listening`  : MediaRecorder.stop(); onstop -> Blob ->
 *                                   bytes -> pipeline.submitAudio().
 *     If it left because of `cancel` (-> idle, never `transcribing`) the audio
 *     is discarded.
 *   - Network requests go through tauri-plugin-http's fetch (issued by Rust),
 *     so no CORS surprises and no browser-side key exposure beyond this
 *     process.
 */

import './i18n.js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import {
  createVoiceSession,
  createPipeline,
  createSttAdapter,
  normalizeConfig,
  resolveActive,
  guidanceMsg,
  polishText,
  resolvePolishKey,
} from '@vocium/voice-core';

const pill = document.getElementById('pill');
const orb = document.getElementById('orb');
const meta = document.getElementById('meta');
const labelEl = document.getElementById('label');
const btnLock = document.getElementById('btnLock');
const btnMin = document.getElementById('btnMin');
const btnClose = document.getElementById('btnClose');
const lockUse = document.getElementById('lockUse');

// state -> CSS class + single-line label text.
const VIEW = {
  idle:         { cls: 's-idle',   label: 'Vocium' },
  listening:    { cls: 's-listen', label: '聆聽中…' },
  transcribing: { cls: 's-trans',  label: '轉錄中…' },
  injecting:    { cls: 's-inject', label: '輸入完成' },
  error:        { cls: 's-error',  label: '發生問題' },
};

const MAX_LISTEN_MS_DEFAULT = 30000;

let recorder = null;
let mediaStream = null;
let chunks = [];
// Bumped on every startRecording. A call that resumes from an await and finds
// a newer generation must throw its stream away instead of installing a
// second recorder (the globals belong to the newest capture only).
let captureGen = 0;
let maxListenTimer = null;
let currentState = 'idle';
let submitOnStop = false; // true while we WANT the next stop to submit audio
let dragLocked = false;   // when true, the #meta drag handle is disabled

// ── Diagnostics ─────────────────────────────────────────────────────────────
// The icon webview has no visible console, so anything worth seeing is also
// appended to %APPDATA%/vocium/logs/shell.log via the shell.
function log(msg) {
  console.log('[vocium] ' + msg);
  invoke('log_line', { line: `[webview] ${msg}` }).catch(() => {});
}
window.addEventListener('error', (e) => log(`uncaught: ${e.message} @${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  log(`unhandled rejection: ${r && r.message ? r.message : JSON.stringify(r)}`);
});

// ── Config access ───────────────────────────────────────────────────────────
// The Rust shell owns the file; we read it fresh whenever a decision depends
// on it (every recording / transcription) so Settings changes apply live.
async function loadConfig() {
  try {
    return normalizeConfig(await invoke('read_config_raw'));
  } catch (err) {
    console.error('[vocium] read_config_raw failed', err);
    return normalizeConfig({});
  }
}

// ── Injector: native, in the Rust shell ─────────────────────────────────────
const injector = {
  inject: (text) => invoke('inject_text', { text }),
  probe: () => invoke('probe_inject'),
};

// ── Voice session (voice-core state machine) ────────────────────────────────
const session = createVoiceSession({
  onState(next, prev) {
    currentState = next;
    applyView(next);
    invoke('report_state', { state: next }).catch(() => {});
    if (next === 'listening' && prev !== 'listening') {
      startRecording();
    } else if (prev === 'listening' && next !== 'listening') {
      // transcribing => submit; idle (cancel) => discard.
      stopRecording(next === 'transcribing');
    }
  },
});

/** Build a pipeline bound to the live config. Pipelines are cheap and
 *  stateless apart from the shared session, so one per submission keeps
 *  provider / key / polish / zh settings current without any restart. */
function buildPipeline(cfg) {
  const active = resolveActive(cfg);
  const deps = { fetch: tauriFetch };
  return createPipeline({
    session,
    stt: createSttAdapter(cfg, deps),
    injector,
    noKey: active.noKey,
    lang: cfg.lang,
    guidance: guidanceMsg(cfg.lang, active.provider),
    getZhMode: () => cfg.zhConvert,
    polish: async (text, styleOverride) => {
      if (styleOverride === undefined && !cfg.polishEnabled) return text;
      return polishText(text, {
        provider: cfg.polishProvider,
        model: cfg.polishModel,
        style: styleOverride ?? cfg.polishStyle,
        customPrompt: cfg.polishCustomPrompt,
        apiKey: resolvePolishKey(cfg),
        zhScript: cfg.zhConvert,
      }, deps);
    },
  });
}

function applyView(state) {
  const v = VIEW[state] || VIEW.idle;
  pill.className = 'pill ' + v.cls;
  // While an inject-error message is being displayed, keep the label pinned
  // so it isn't overwritten by the error -> 1.5 s RESET -> idle sequence.
  if (!injectErrorClearTimer) {
    labelEl.textContent = (window.I18N && window.I18N.t('state.' + state)) || v.label;
  }
}

// Inject failure: clipboard succeeded but the paste keystroke didn't (most
// often: macOS Accessibility permission was reset after rebuilding the .app).
// Holds the guidance text on the pill for ~8 s.
let injectErrorClearTimer = null;
function showInjectError(message) {
  if (!message) return;
  labelEl.textContent = message;
  pill.className = 'pill s-error';
  if (injectErrorClearTimer) clearTimeout(injectErrorClearTimer);
  injectErrorClearTimer = setTimeout(() => {
    injectErrorClearTimer = null;
    applyView(currentState);
  }, 8000);
}

// ── Health: mic device + permission probes (emitted to the tray) ────────────
let lastMicDeviceCount = -1; // -1 = not yet probed; treated as "no info, do not block"
let lastMicPerm = 'unknown';

async function probeWebviewHealthOnce() {
  let mic_device_count = 0;
  let mic_perm = 'unknown';
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    mic_device_count = devices.filter((d) => d.kind === 'audioinput').length;
  } catch (_) { /* leave 0 — surfaces as block in derive_health */ }
  try {
    const status = await navigator.permissions.query({ name: 'microphone' });
    mic_perm = status.state; // 'granted' | 'prompt' | 'denied'
  } catch (_) { /* leave 'unknown' — derive_health treats as warn */ }
  lastMicDeviceCount = mic_device_count;
  lastMicPerm = mic_perm;
  try {
    await invoke('emit_health_webview', { micDeviceCount: mic_device_count, micPerm: mic_perm });
  } catch (err) { console.error('[vocium] emit_health_webview failed', err); }
}

(async function initHealthProbe() {
  await probeWebviewHealthOnce();
  try {
    navigator.mediaDevices.addEventListener('devicechange', () => { probeWebviewHealthOnce(); });
  } catch (_) { /* older WKWebView: ignore — startup probe still ran */ }
  try {
    const status = await navigator.permissions.query({ name: 'microphone' });
    status.onchange = () => { probeWebviewHealthOnce(); };
  } catch (_) { /* not supported: ignore — devicechange is the main trigger */ }
})();

function clearMaxListenTimer() {
  if (maxListenTimer !== null) {
    clearTimeout(maxListenTimer);
    maxListenTimer = null;
  }
}

function stopTracks() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
}

// ── VAD silence trimming (opt-in) ───────────────────────────────────────────
//
// trimBlobSilence: decodes blob → 16 kHz mono Float32 → runs Silero
// NonRealTimeVAD → re-encodes kept speech frames as 16-bit mono WAV blob.
//
// CONTRACT: any throw returns the ORIGINAL blob; zero speech returns the
// ORIGINAL blob; never blocks or corrupts submission on failure.
//
// The library (vendored to ui/vad/ via `npm run vad:assets`) performs the
// actual trim; voice-core's audio/trim-silence.ts is the unit-tested
// reference model of the keep-speech±pad behaviour.

const VAD_BASE_PATH = './vad/';
const VAD_ORT_WASM_PATH = './vad/';

/** Encode Float32 PCM frames into a 16-bit mono WAV Blob at 16 000 Hz. */
function pcmToWavBlob(frames) {
  const totalSamples = frames.reduce((s, f) => s + f.length, 0);
  const sampleRate = 16000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = totalSamples * blockAlign;
  const headerSize = 44;
  const buf = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buf);

  let o = 0;
  const w8 = (s) => { for (let i = 0; i < s.length; i++) view.setUint8(o++, s.charCodeAt(i)); };
  const w32 = (v) => { view.setUint32(o, v, true); o += 4; };
  const w16 = (v) => { view.setUint16(o, v, true); o += 2; };

  w8('RIFF');
  w32(36 + dataSize);
  w8('WAVE');
  w8('fmt ');
  w32(16);
  w16(1);
  w16(numChannels);
  w32(sampleRate);
  w32(byteRate);
  w16(blockAlign);
  w16(bitsPerSample);
  w8('data');
  w32(dataSize);

  for (const frame of frames) {
    for (let i = 0; i < frame.length; i++) {
      const s = Math.max(-1, Math.min(1, frame[i]));
      view.setInt16(o, s < 0 ? s * 32768 : s * 32767, true);
      o += 2;
    }
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/** Returns a trimmed WAV Blob, or the original Blob on any error / no speech
 *  / VAD unavailable. Never throws. */
async function trimBlobSilence(originalBlob) {
  try {
    if (typeof self.vad === 'undefined' || typeof self.vad.NonRealTimeVAD === 'undefined') {
      throw new Error('vad bundle not loaded');
    }
    const arrayBuf = await originalBlob.arrayBuffer();
    const decodeCtx = new AudioContext();
    let sourceBuf;
    try {
      sourceBuf = await decodeCtx.decodeAudioData(arrayBuf);
    } finally {
      decodeCtx.close().catch(() => {});
    }
    const targetSampleRate = 16000;
    const targetSamples = Math.ceil(sourceBuf.duration * targetSampleRate);
    const offCtx = new OfflineAudioContext(1, targetSamples, targetSampleRate);
    const srcNode = offCtx.createBufferSource();
    srcNode.buffer = sourceBuf;
    srcNode.connect(offCtx.destination);
    srcNode.start(0);
    const renderedBuf = await offCtx.startRendering();
    const pcm16k = renderedBuf.getChannelData(0);

    const vadInstance = await self.vad.NonRealTimeVAD.new({
      baseAssetPath: VAD_BASE_PATH,
      onnxWASMBasePath: VAD_ORT_WASM_PATH,
    });
    const originalSamples = pcm16k.length;
    const speechChunks = [];
    for await (const { audio } of vadInstance.run(pcm16k, targetSampleRate)) {
      speechChunks.push(audio);
    }
    if (speechChunks.length === 0) {
      console.warn('[vocium] VAD: no speech detected, using original audio');
      return originalBlob;
    }
    const trimmedBlob = pcmToWavBlob(speechChunks);
    const keptSamples = speechChunks.reduce((s, c) => s + c.length, 0);
    if (keptSamples >= originalSamples * 0.98) return originalBlob; // <2% removed: not worth it
    return trimmedBlob;
  } catch (err) {
    console.warn('[vocium] VAD trim failed, using original audio:', err && err.message ? err.message : err);
    return originalBlob;
  }
}

// ── Recording ───────────────────────────────────────────────────────────────
async function startRecording() {
  // Every capture is a fresh start: a recorder left over from an earlier
  // attempt (e.g. one that outlived its session) is discarded, never reused —
  // otherwise its buffered audio would ride along with this one.
  if (recorder) {
    log('discarding stale recorder (state=' + recorder.state + ')');
    submitOnStop = false;
    try { recorder.ondataavailable = null; recorder.onstop = null; recorder.stop(); } catch (_) { /* ignore */ }
    recorder = null;
    stopTracks();
  }
  chunks = [];
  submitOnStop = true;
  const myGen = ++captureGen;
  const cfg = await loadConfig();
  if (myGen !== captureGen) return; // superseded while reading config
  const micId = cfg.micDeviceId || '';
  const audioConstraint = micId ? { deviceId: { exact: micId } } : true;
  let stream;
  try {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint });
    } catch (e) {
      // Chosen device unplugged / OverconstrainedError → retry with system default.
      if (micId) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } else { throw e; }
    }
  } catch (e) {
    if (myGen !== captureGen) return; // a newer capture owns the UI now
    submitOnStop = false;
    reportAudioError(`麥克風存取失敗：${e && e.message ? e.message : e}`);
    return;
  }
  if (myGen !== captureGen) {
    // A newer startRecording already owns `recorder`/`mediaStream`; release
    // the stream we just obtained and leave the newer capture alone.
    log('discarding superseded mic stream (gen ' + myGen + ')');
    stream.getTracks().forEach((t) => t.stop());
    return;
  }
  mediaStream = stream;

  // The OS permission prompt (first run) can hold getUserMedia open for
  // seconds. If the user already released PTT / toggled again meanwhile, the
  // session has moved on and nobody would ever stop this recorder — so don't
  // start it. A session stuck in `transcribing` with no audio is reset.
  if (session.getState() !== 'listening') {
    stopTracks();
    submitOnStop = false;
    if (session.getState() === 'transcribing') {
      log('mic became available after listening ended; resetting');
      session.send('CANCEL');
    }
    return;
  }

  let mime = 'audio/webm;codecs=opus';
  if (window.MediaRecorder && !MediaRecorder.isTypeSupported(mime)) {
    mime = 'audio/webm';
  }
  try {
    recorder = new MediaRecorder(mediaStream, { mimeType: mime });
  } catch (e) {
    stopTracks();
    submitOnStop = false;
    reportAudioError(`MediaRecorder 初始化失敗：${e && e.message ? e.message : e}`);
    return;
  }

  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };

  recorder.onstop = async () => {
    clearMaxListenTimer();
    const willSubmit = submitOnStop;
    submitOnStop = false;
    const mimeType = recorder ? recorder.mimeType : 'audio/webm';
    stopTracks();
    recorder = null;
    if (!willSubmit) {
      chunks = [];
      return;
    }
    if (chunks.length === 0) {
      reportAudioError('未取得任何音訊');
      return;
    }
    try {
      let blob = new Blob(chunks, { type: mimeType });
      chunks = [];
      const liveCfg = await loadConfig();
      if (liveCfg.vadTrim) blob = await trimBlobSilence(blob);
      const effectiveMime = blob.type || mimeType;
      const audio = new Uint8Array(await blob.arrayBuffer());
      // The user may have cancelled during the config read / VAD trim above
      // (the pill still said 轉錄中). Nothing failed — just drop the audio
      // quietly instead of letting submitAudio reject on the wrong state.
      if (session.getState() !== 'transcribing') {
        log('cancelled before submit; audio discarded');
        return;
      }
      // submitAudio always resolves ({ text, injectError?, cancelled? }); STT
      // failures become injected user-facing text inside voice-core.
      log(`submit ${audio.length} bytes ${effectiveMime} via ${liveCfg.sttProvider}`);
      const res = await buildPipeline(liveCfg).submitAudio({ audio, mimeType: effectiveMime });
      log(`result: ${JSON.stringify(res).slice(0, 200)}`);
      // notice = no key / STT failure (shown here, never pasted);
      // injectError = pasted-to-clipboard-but-keystroke-failed guidance.
      if (res && res.notice) showInjectError(res.notice);
      else if (res && res.injectError) showInjectError(res.injectError);
    } catch (e) {
      reportAudioError(`送出音訊失敗：${e && e.message ? e.message : e}`);
    }
  };

  try {
    recorder.start();
  } catch (e) {
    stopTracks();
    recorder = null;
    submitOnStop = false;
    reportAudioError(`錄音啟動失敗：${e && e.message ? e.message : e}`);
    return;
  }

  // maxListenMs enforcement (config-driven; default 30s). On timeout we toggle
  // out of `listening` (-> transcribing), which triggers the normal submit path.
  const limit = Number.isFinite(cfg.maxListenMs) && cfg.maxListenMs > 0
    ? cfg.maxListenMs : MAX_LISTEN_MS_DEFAULT;
  maxListenTimer = setTimeout(() => {
    maxListenTimer = null;
    if (session.getState() === 'listening') session.send('TOGGLE');
  }, limit);
}

function stopRecording(shouldSubmit) {
  clearMaxListenTimer();
  if (!recorder) {
    stopTracks();
    return;
  }
  submitOnStop = shouldSubmit;
  if (recorder.state !== 'inactive') {
    try { recorder.stop(); } catch (_) { stopTracks(); recorder = null; }
  } else {
    stopTracks();
    recorder = null;
  }
}

/** Audio-capture failure: reset the machine and flash the error state. */
function reportAudioError(message) {
  log('audio error: ' + message);
  session.send('CANCEL'); // listening/transcribing -> idle (no-op elsewhere)
  applyView('error');
  setTimeout(() => { if (session.getState() === 'idle') applyView('idle'); }, 1500);
}

// ── Triggers: orb click / global hotkey ─────────────────────────────────────
// The floating orb is ALWAYS toggle-style (click=start, click=stop). inputMode
// (toggle/ptt) affects ONLY the global hotkey — you can't "hold" a click.
function triggerToggle() {
  const from = session.getState();
  if (from === 'idle') {
    // Pre-flight gate using the webview's own last-known mic state (the only
    // two blocking conditions in derive_health are owned here).
    if (lastMicDeviceCount === 0) {
      showInjectError(window.I18N ? window.I18N.t('preflight.noMic') : '找不到麥克風 — 請連接音訊輸入裝置');
      return;
    }
    if (lastMicPerm === 'denied') {
      showInjectError(window.I18N ? window.I18N.t('preflight.permDenied') : '已拒絕 — 請至系統設定授予');
      return;
    }
    session.send('TOGGLE');            // -> listening (starts recording)
  } else if (from === 'listening') {
    session.send('TOGGLE');            // -> transcribing (stops + submits)
  } else if (from === 'transcribing') {
    // Escape hatch for a hung STT request: back to idle; the in-flight
    // result is dropped by the pipeline's cancellation guard.
    session.send('CANCEL');
  }
  // injecting / error: re-entry ignored (bounded; matches state machine)
}

orb.addEventListener('click', () => { triggerToggle(); });

listen('hotkey', (event) => {
  const action = event.payload && event.payload.action;
  const s = session.getState();
  if (action === 'toggle') triggerToggle();
  else if (action === 'start_listening' && s === 'idle') triggerToggle();
  else if (action === 'stop_listening' && s === 'listening') triggerToggle();
});

// Esc while listening -> cancel (discard audio).
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && session.getState() === 'listening') session.send('CANCEL');
});

// ── Window control buttons (lock / minimize / close) ────────────────────────
function applyLockVisual() {
  lockUse.setAttribute('href', dragLocked ? '#ic-lock' : '#ic-unlock');
  btnLock.classList.toggle('on', dragLocked);
  btnLock.title = window.I18N
    ? window.I18N.t(dragLocked ? 'ctl.lockOn' : 'ctl.lockOff')
    : (dragLocked ? '點擊解除鎖定' : '鎖定水平拖曳');
}

btnLock.addEventListener('click', async () => {
  const next = !dragLocked;
  dragLocked = next;
  applyLockVisual();
  try {
    await invoke('save_drag_locked', { locked: next });
  } catch (err) {
    console.error('[vocium] save_drag_locked failed', err);
    dragLocked = !next;
    applyLockVisual();
  }
});

btnMin.addEventListener('click', async () => {
  try { await getCurrentWindow().hide(); } catch (err) { console.error(err); }
});

btnClose.addEventListener('click', async () => {
  try { await invoke('quit_app'); } catch (err) { console.error(err); }
});

// ── Drag the meta area to reposition; persist iconOffsetX ───────────────────
let dragStartX = 0;
let dragging = false;
meta.addEventListener('mousedown', async (e) => {
  if (dragLocked) return;
  if (e.button !== 0) return;
  dragStartX = e.screenX;
  dragging = true;
  try {
    await getCurrentWindow().startDragging();
  } catch (_) { /* startDragging may reject if no active drag */ }
});
window.addEventListener('mouseup', async (e) => {
  if (!dragging) return;
  dragging = false;
  const moved = Math.abs(e.screenX - dragStartX);
  if (moved > 4) {
    try {
      const win = getCurrentWindow();
      const pos = await win.outerPosition();
      const mon = await win.currentMonitor();
      if (mon) {
        const winW = (await win.outerSize()).width;
        const centerX = mon.position.x + Math.round((mon.size.width - winW) / 2);
        await invoke('save_offset_x', { offsetX: pos.x - centerX });
      }
    } catch (err) {
      console.error('[vocium] persist offset failed', err);
    }
  }
});

// Shell config relayed at runtime (drag lock, live language switch).
listen('config', (event) => {
  const p = event.payload || {};
  if (typeof p.dragLocked === 'boolean') {
    dragLocked = p.dragLocked;
    applyLockVisual();
  }
  if (p.lang && window.I18N) {
    window.I18N.setLang(p.lang);
    window.I18N.applyI18n();
    applyView(currentState);
    applyLockVisual();
  }
});

// ── Boot ────────────────────────────────────────────────────────────────────
applyView('idle');
applyLockVisual();
(async () => {
  const cfg = await loadConfig();
  if (window.I18N) {
    window.I18N.setLang(cfg.lang);
    window.I18N.applyI18n();
    applyView(currentState);
    applyLockVisual();
  }
  dragLocked = cfg.dragLocked === true;
  applyLockVisual();
  // Inject preflight: surface a stale macOS Accessibility entry up front.
  try {
    const r = await injector.probe();
    if (r && r.ok === false && r.message) showInjectError(r.message);
  } catch (_) { /* probe is best-effort; never blocks the UI */ }
})();
