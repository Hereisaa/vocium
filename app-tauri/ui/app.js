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
  labelEl.textContent = v.label;
}

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
      const blob = new Blob(chunks, { type: mimeType });
      chunks = [];
      const audioBase64 = await blobToBase64(blob);
      // Sidecar pipeline: submit_audio -> transcribing -> injecting -> idle.
      await invoke('submit_audio', { audioBase64, mimeType });
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
async function triggerToggle() {
  const from = currentState;
  if (from === 'idle') {
    currentState = 'listening';
    applyView('listening');
    startRecording();
  } else if (from === 'listening') {
    currentState = 'transcribing';
    applyView('transcribing');
    stopRecording(true); // leaving listening via toggle => submit
  } else {
    return; // transcribing/injecting: re-entry ignored (matches state machine)
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
})();
