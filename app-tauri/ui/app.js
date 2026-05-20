/*
 * Vocium webview controller.
 *
 * ── Chosen recording start/stop flow (why it matches the REAL sidecar) ──
 *
 * The actual implemented sidecar (src/sidecar/*) is the single source of truth.
 * It emits ONLY the `state_changed { state, prev }` notification and exposes
 * the 8 tools: toggle, start_listening, stop_listening, cancel, submit_audio,
 * transcribe_clip, inject_text, get_state. It does NOT emit
 * request_start_capture / request_stop_capture, and there is NO
 * report_audio_error tool.
 *
 * Therefore recording is WEBVIEW-DRIVEN by reacting to `state` transitions
 * (consistent with SPEC FR-MCP-3 "錄音由 webview 完成；停止後以 submit_audio
 * 把音訊交給 sidecar"):
 *
 *   - Rust relays sidecar `state_changed` -> Tauri `state` event.
 *   - On ENTERING `listening`  : getUserMedia + MediaRecorder.start()
 *                                + arm maxListenMs auto-stop timer.
 *   - On LEAVING `listening`   : MediaRecorder.stop(); onstop -> Blob ->
 *                                base64 -> invoke('submit_audio', ...).
 *     The state machine has already moved past `listening` (toggle/shortcut/
 *     Esc-cancel drove it). If it left because of `cancel` (-> idle without
 *     passing through transcribing) we DISCARD the audio and do not submit.
 *   - getUserMedia / MediaRecorder failure: log + show local visual error +
 *     invoke('audio_error') which the shell maps onto the real `cancel` tool
 *     (NO invented sidecar tool).
 *
 * maxListenMs (config, default 30000) is ENFORCED HERE per Task 8 scope —
 * deliberately deferred from the sidecar to the webview.
 */

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { getCurrentWindow } = window.__TAURI__.window;

const pill = document.getElementById('pill');
const orb = document.getElementById('orb');
const meta = document.getElementById('meta');
const labelEl = document.getElementById('label');
const btnLock = document.getElementById('btnLock');
const btnMin = document.getElementById('btnMin');
const btnClose = document.getElementById('btnClose');
const lockUse = document.getElementById('lockUse');

// state -> CSS class + single-line label text (NO subtitle anymore).
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
let maxListenTimer = null;
let currentState = 'idle';
let submitOnStop = false; // true while we WANT the next stop to submit audio
let dragLocked = false;   // when true, the #meta drag handle is disabled

function applyView(state) {
  const v = VIEW[state] || VIEW.idle;
  pill.className = 'pill ' + v.cls;
  // While an inject-error message is being displayed, keep the label pinned
  // so it isn't overwritten by the racing state_changed('error') + 1.5 s
  // RESET → state_changed('idle') sequence. The pill class still updates so
  // the colour/animation reflects current state.
  if (!injectErrorClearTimer) labelEl.textContent = v.label;
}

// Inject failure: clipboard succeeded but the paste keystroke didn't (most
// often: macOS Accessibility permission was reset after rebuilding the .app
// at a new path/signature). Holds the guidance text on the pill for ~8 s,
// suppressing applyView label writes during that window.
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

// Last-known webview-side mic state cache. Populated by probeWebviewHealthOnce
// (the same source that emits to Rust). triggerToggle's pre-flight gate reads
// THIS instead of invoking `get_health` so the FSM idle→listening transition
// pays zero IPC cost on every hotkey press. The pure-block conditions in
// derive_health (Rust) are exclusively `mic_device_count == 0` and
// `mic_perm === 'denied'` — both are owned by the webview — so the local
// gate is functionally identical to a get_health round-trip.
let lastMicDeviceCount = -1; // -1 = not yet probed; treated as "no info, do not block"
let lastMicPerm = 'unknown';

// Health: enumerate mic devices and check permission state; emit results to
// the Rust shell whenever they change. The shell merges into HealthState and
// rebuilds the tray. `permissions.query` returns a live PermissionStatus whose
// `.onchange` fires on grant/revoke; `mediaDevices.devicechange` fires on
// plug/unplug. We never poll.
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
  // Re-probe on device plug/unplug.
  try {
    navigator.mediaDevices.addEventListener('devicechange', () => { probeWebviewHealthOnce(); });
  } catch (_) { /* older WKWebView: ignore — startup probe still ran */ }
  // Re-probe on permission grant/revoke. Note: re-querying gives a fresh
  // status; we also wire .onchange on the first status object below.
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

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error || new Error('FileReader failed'));
    fr.onload = () => {
      // result = "data:audio/webm;base64,XXXX" -> strip prefix
      const s = String(fr.result);
      const comma = s.indexOf(',');
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    fr.readAsDataURL(blob);
  });
}

// ── VAD silence trimming (opt-in, design D3) ────────────────────────────────
//
// trimBlobSilence: decodes blob → 16 kHz mono Float32 → runs Silero
// NonRealTimeVAD → re-encodes kept speech frames as 16-bit mono WAV blob.
//
// CONTRACT (non-negotiable):
//   • ANY throw / rejection returns the ORIGINAL blob unchanged.
//   • Zero speech detected returns the ORIGINAL blob (never silence-only clip).
//   • This function MUST NOT block or corrupt submit_audio on failure.
//
// NOTE: @ricky0123/vad-web NonRealTimeVAD.run() already returns trimmed speech
// segments (it applies its own internal speech padding/redemption). We concatenate
// those segments directly. The pure src/core/audio/trim-silence.ts (keep speech±pad
// union) is the deterministic, unit-tested reference model for that behavior but is
// NOT imported here (webview has no bundler); the library performs the actual trim.

const VAD_BASE_PATH = './vad/';       // served from app-tauri/ui/vad/
const VAD_ORT_WASM_PATH = './vad/';   // ort-wasm-simd-threaded.wasm lives here
const VAD_FRAME_SAMPLES = 1536;       // Silero legacy model fixed frame size @16 kHz

/** Encode an array of Float32 PCM frames (each VAD_FRAME_SAMPLES long) into
 *  a 16-bit mono WAV Blob at 16 000 Hz. */
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

  // Write WAV header using offset-based DataView helpers
  let o = 0;
  const w8 = (s) => { for (let i = 0; i < s.length; i++) view.setUint8(o++, s.charCodeAt(i)); };
  const w32 = (v) => { view.setUint32(o, v, true); o += 4; };
  const w16 = (v) => { view.setUint16(o, v, true); o += 2; };

  w8('RIFF');
  w32(36 + dataSize);   // ChunkSize
  w8('WAVE');
  w8('fmt ');
  w32(16);              // Subchunk1Size (PCM)
  w16(1);               // AudioFormat (PCM = 1)
  w16(numChannels);
  w32(sampleRate);
  w32(byteRate);
  w16(blockAlign);
  w16(bitsPerSample);
  w8('data');
  w32(dataSize);

  // PCM samples: clamp Float32 [-1,1] to Int16
  for (const frame of frames) {
    for (let i = 0; i < frame.length; i++) {
      const s = Math.max(-1, Math.min(1, frame[i]));
      view.setInt16(o, s < 0 ? s * 32768 : s * 32767, true);
      o += 2;
    }
  }

  return new Blob([buf], { type: 'audio/wav' });
}

/** Main VAD trim function. Returns a WAV Blob (trimmed) or the original Blob on
 *  any error / no-speech / VAD unavailable. Never throws. */
async function trimBlobSilence(originalBlob) {
  try {
    // Step 1: ensure vad-web bundle is loaded (idempotent).
    if (typeof self.vad === 'undefined' || typeof self.vad.NonRealTimeVAD === 'undefined') {
      throw new Error('vad bundle not loaded');
    }

    // Step 2: decode blob → AudioBuffer via OfflineAudioContext.
    const arrayBuf = await originalBlob.arrayBuffer();
    // AudioContext.decodeAudioData requires AudioContext, not offline, for
    // some codecs. Use a short-lived AudioContext for decoding.
    const decodeCtx = new AudioContext();
    let sourceBuf;
    try {
      sourceBuf = await decodeCtx.decodeAudioData(arrayBuf);
    } finally {
      decodeCtx.close().catch(() => {});
    }

    // Step 3: resample to 16 kHz mono via OfflineAudioContext.
    const targetSampleRate = 16000;
    const durationSec = sourceBuf.duration;
    const targetSamples = Math.ceil(durationSec * targetSampleRate);
    const offCtx = new OfflineAudioContext(1, targetSamples, targetSampleRate);
    const srcNode = offCtx.createBufferSource();
    srcNode.buffer = sourceBuf;
    srcNode.connect(offCtx.destination);
    srcNode.start(0);
    const renderedBuf = await offCtx.startRendering();
    const pcm16k = renderedBuf.getChannelData(0); // Float32Array @16 kHz mono

    // Step 4: run NonRealTimeVAD — yields {audio, start, end} speech segments.
    const vadInstance = await self.vad.NonRealTimeVAD.new({
      baseAssetPath: VAD_BASE_PATH,
      onnxWASMBasePath: VAD_ORT_WASM_PATH,
    });

    // Track original sample count for duration-based decision below.
    const originalSamples = pcm16k.length;

    // Collect all speech segment audio chunks.
    const speechChunks = [];
    for await (const { audio } of vadInstance.run(pcm16k, targetSampleRate)) {
      speechChunks.push(audio); // each audio is a Float32Array of speech frames
    }

    if (speechChunks.length === 0) {
      // No speech detected — return original blob untouched.
      console.warn('[vocium] VAD: no speech detected, using original audio');
      return originalBlob;
    }

    // Step 5: re-encode the collected speech segments to a WAV blob.
    // NonRealTimeVAD already returns only the speech audio (trimmed);
    // we apply our own pad logic by treating each yielded chunk as a contiguous
    // kept region. Wrap each chunk as a pseudo-frame for pcmToWavBlob.
    const trimmedBlob = pcmToWavBlob(speechChunks);

    // Decide by DURATION not bytes: trimmed WAV is larger than source opus by design;
    // the win is shorter audio → faster/cheaper STT, less hallucination (design D3).
    const keptSamples = speechChunks.reduce((s, c) => s + c.length, 0);
    if (keptSamples >= originalSamples * 0.98) {
      // VAD removed <2% — essentially no silence found; trimming not worthwhile.
      return originalBlob;
    }

    return trimmedBlob;

  } catch (err) {
    console.warn('[vocium] VAD trim failed, using original audio:', err && err.message ? err.message : err);
    return originalBlob; // guaranteed fallback — never throws
  }
}

async function startRecording() {
  // Already recording? ignore (re-entry guard).
  if (recorder && recorder.state === 'recording') return;
  chunks = [];
  submitOnStop = true;
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    submitOnStop = false;
    reportAudioError(`麥克風存取失敗：${e && e.message ? e.message : e}`);
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
      // Cancelled: discard audio, do NOT call submit_audio.
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
      // D3 opt-in: trim silence if vadTrim is enabled in config.
      // Any VAD failure falls back to the original blob (trimBlobSilence never throws).
      try {
        const cfg = await invoke('get_config');
        if (cfg && cfg.vadTrim) {
          blob = await trimBlobSilence(blob);
        }
      } catch (_cfgErr) {
        // get_config or vadTrim check failed — proceed with original blob.
      }
      // Determine the effective mimeType for the (possibly WAV-converted) blob.
      const effectiveMime = blob.type || mimeType;
      const audioBase64 = await blobToBase64(blob);
      // Sidecar pipeline: submit_audio -> transcribing -> injecting -> idle.
      // Result shape: { content: [{ type: 'text', text: JSON({ text, injectError? }) }] }.
      // `injectError` is populated when pbcopy succeeded but the paste keystroke
      // failed (typically: macOS Accessibility permission reset after rebuild).
      // We surface it on the pill so the user sees the actionable guidance
      // instead of just the generic "發生問題" red flash.
      const res = await invoke('submit_audio', { audioBase64, mimeType: effectiveMime });
      let inner = null;
      try { inner = JSON.parse(res?.content?.[0]?.text ?? 'null'); } catch (_) { /* ignore */ }
      if (inner && inner.injectError) showInjectError(inner.injectError);
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
  // the sidecar to leave `listening` (-> transcribing). The resulting
  // state_changed off `listening` triggers the normal stop+submit path.
  const limit = readMaxListenMs();
  maxListenTimer = setTimeout(async () => {
    maxListenTimer = null;
    if (currentState === 'listening') {
      try { await invoke('toggle'); } catch (_) { /* shell handles */ }
    }
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

function reportAudioError(message) {
  console.error('[vocium] ' + message);
  // Local immediate visual feedback (sidecar has no audio-error tool).
  applyView('error');
  // Shell maps this onto the real `cancel` tool to reset the state machine.
  invoke('audio_error', { message }).catch(() => {});
}

let _maxListenMs = MAX_LISTEN_MS_DEFAULT;
function readMaxListenMs() {
  return Number.isFinite(_maxListenMs) && _maxListenMs > 0
    ? _maxListenMs
    : MAX_LISTEN_MS_DEFAULT;
}

// ── State event from the shell (relayed sidecar state_changed) ──────────────
listen('state', (event) => {
  const p = event.payload || {};
  const next = p.state;
  if (!next) return;
  const wasListening = currentState === 'listening';
  currentState = next;
  applyView(next);

  if (next === 'listening' && !wasListening) {
    // Entered listening -> begin capture.
    startRecording();
  } else if (wasListening && next !== 'listening') {
    // Left listening. transcribing => submit; idle (cancel) => discard.
    stopRecording(next === 'transcribing');
  }
});

// ── Click the orb -> toggle (OPTIMISTIC) ────────────────────────────────────
// The orb is a dedicated control (NOT a drag region), so clicks are delivered
// normally even though the window is non-activating (WS_EX_NOACTIVATE).
//
// We do NOT wait for the MCP round-trip to update the UI: the state/animation
// flips and capture starts/stops the instant you click; `invoke('toggle')`
// runs in the background and the sidecar's `state_changed` only *confirms*
// what we already showed (idempotent — the listener's wasListening guard and
// the recorder re-entry guards make the confirm a no-op). The shell command is
// async (off Tauri's main thread) so this never freezes regardless of latency.
// Perceived click→listening latency ≈ 0; the only real wait left is STT.
//
// Design D2 / SPEC FR-TRG-4: the floating orb click is ALWAYS toggle-style
// (click=start, click=stop). inputMode (toggle/ptt) intentionally affects ONLY
// the global hotkey, not the orb — you can't "hold" a click. Do not wire PTT here.
async function triggerToggle() {
  const from = currentState;
  if (from === 'idle') {
    // Pre-flight: gate idle→listening using the webview's own last-known mic
    // state (populated by probeWebviewHealthOnce). Zero IPC cost — the prior
    // get_health round-trip added 5–50 ms to every hotkey press for no
    // additional information (derive_health's Block conditions are exclusively
    // mic_device_count == 0 and mic_perm === 'denied', both owned here).
    if (lastMicDeviceCount === 0) {
      showInjectError('找不到麥克風 — 請連接音訊輸入裝置');
      return;
    }
    if (lastMicPerm === 'denied') {
      showInjectError('已拒絕 — 請至系統設定授予');
      return;
    }
    currentState = 'listening';
    applyView('listening');
    startRecording();
  } else if (from === 'listening') {
    currentState = 'transcribing';
    applyView('transcribing');
    stopRecording(true); // leaving listening via toggle => submit
  } else if (from === 'transcribing') {
    // Escape hatch: a hung STT request (no provider response) would otherwise
    // pin 'transcribing' forever with no recovery. Clicking the orb aborts
    // back to idle via the state machine's transcribing--CANCEL-->idle edge
    // (Rust `cancel` command -> `cancel` tool -> pipeline.cancel()). The STT
    // request timeout (core/stt/with-timeout.ts) is the automatic backstop;
    // this is the instant manual one.
    currentState = 'idle';
    applyView('idle');
    invoke('cancel').catch((err) => console.error('[vocium] cancel failed', err));
    return;
  } else {
    return; // injecting: re-entry ignored (bounded; matches state machine)
  }

  try {
    const r = await invoke('toggle');
    // Reconcile only if the sidecar's authoritative state differs from our
    // optimistic guess (e.g. it wasn't in the state we assumed).
    if (r && r.state && r.state !== currentState) reconcile(r.state, from);
  } catch (err) {
    console.error('[vocium] toggle failed', err);
    reconcile(null, from); // undo the optimistic action
  }
}

// authState != null  -> trust the sidecar and converge to it.
// authState == null   -> toggle errored; roll back the optimistic action.
function reconcile(authState, from) {
  if (authState) {
    const was = currentState;
    currentState = authState;
    applyView(authState);
    if (authState === 'listening' && was !== 'listening') startRecording();
    else if (was === 'listening' && authState !== 'listening') {
      stopRecording(authState === 'transcribing');
    }
    return;
  }
  if (from === 'idle') {
    stopRecording(false); // discard the capture we optimistically started
    currentState = 'idle';
    applyView('idle');
  } else {
    applyView('error');
    currentState = 'idle';
    setTimeout(() => { if (currentState === 'idle') applyView('idle'); }, 1500);
  }
}

orb.addEventListener('click', () => { triggerToggle(); });

// ── Esc while listening -> cancel ───────────────────────────────────────────
window.addEventListener('keydown', async (e) => {
  if (e.key === 'Escape' && currentState === 'listening') {
    try { await invoke('cancel'); } catch (err) { console.error(err); }
  }
});

// ── Window control buttons (lock / minimize / close) ────────────────────────
function applyLockVisual() {
  lockUse.setAttribute('href', dragLocked ? '#ic-lock' : '#ic-unlock');
  btnLock.classList.toggle('on', dragLocked);
  btnLock.title = dragLocked ? '點擊解除鎖定' : '鎖定水平拖曳';
}

btnLock.addEventListener('click', async () => {
  const next = !dragLocked;
  dragLocked = next;
  applyLockVisual();
  try {
    await invoke('save_drag_locked', { locked: next });
  } catch (err) {
    console.error('[vocium] save_drag_locked failed', err);
    dragLocked = !next; // revert visual on failure
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
// Dragging is confined to #meta so the #orb stays clickable. When dragLocked
// is true the handler early-returns and no drag is initiated.
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
        // outerPosition() and monitor.size are physical px; use the real
        // physical window width so centering is correct on HiDPI displays.
        const winW = (await win.outerSize()).width;
        const centerX =
          mon.position.x + Math.round((mon.size.width - winW) / 2);
        const offsetX = pos.x - centerX;
        await invoke('save_offset_x', { offsetX });
      }
    } catch (err) {
      console.error('[vocium] persist offset failed', err);
    }
  }
});

// Shell config relayed at startup; may fire before this listener attaches, so
// we also pull it via get_config on load. Only dragLocked is consumed here.
listen('config', (event) => {
  const p = event.payload || {};
  if (typeof p.dragLocked === 'boolean') {
    dragLocked = p.dragLocked;
    applyLockVisual();
  }
});

// Initialize view + sync drag-lock and current state from the shell on load.
applyView('idle');
applyLockVisual();
(async () => {
  try {
    const cfg = await invoke('get_config');
    if (cfg && typeof cfg.dragLocked === 'boolean') {
      dragLocked = cfg.dragLocked;
      applyLockVisual();
    }
  } catch (_) { /* shell may still be starting */ }
  try {
    const r = await invoke('get_state');
    if (r && r.state) {
      currentState = r.state;
      applyView(r.state);
    }
  } catch (_) { /* sidecar may still be starting */ }
  // Inject preflight: detect a stale macOS Accessibility entry up front
  // (after rebuilding the .app the system keeps an entry pointing at the
  // old, now-invalid binary — the green checkbox lies) so the user sees
  // the actionable guidance the moment Vocium launches, not after their
  // first voice attempt silently fails to paste.
  try {
    const res = await invoke('probe_inject');
    let inner = null;
    try { inner = JSON.parse(res?.content?.[0]?.text ?? 'null'); } catch (_) { /* ignore */ }
    if (inner && inner.ok === false && inner.message) showInjectError(inner.message);
  } catch (_) { /* probe is best-effort; never blocks the UI */ }
})();
