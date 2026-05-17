const { invoke } = window.__TAURI__.core;
const { getCurrentWindow } = window.__TAURI__.window;

const comboEl = document.getElementById('combo');
const recBtn = document.getElementById('rec');
const saveBtn = document.getElementById('save');
const cancelBtn = document.getElementById('cancel');
const errEl = document.getElementById('err');

const keyInput = document.getElementById('keyInput');
const keyToggle = document.getElementById('keyToggle');
const keyClear = document.getElementById('keyClear');
const keyHint = document.getElementById('keyHint');
const keyErr = document.getElementById('keyErr');

const zhSeg = document.getElementById('zhSeg');
const zhOpts = zhSeg ? Array.from(zhSeg.querySelectorAll('.seg-opt')) : [];
let currentZh = 'twp';  // authoritative (from config)
let pendingZh = 'twp';  // selected but unsaved
function renderZh() {
  zhOpts.forEach((o) => {
    const on = o.dataset.mode === pendingZh;
    o.classList.toggle('active', on);
    o.setAttribute('aria-checked', on ? 'true' : 'false');
    o.tabIndex = on ? 0 : -1;
  });
}
function pickZh(mode) {
  pendingZh = mode === 'cn' ? 'cn' : 'twp';
  renderZh();
}
zhOpts.forEach((o) => {
  o.addEventListener('click', () => pickZh(o.dataset.mode));
  o.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); pickZh(o.dataset.mode); o.focus(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = pendingZh === 'twp' ? 'cn' : 'twp';
      pickZh(next);
      const el = zhOpts.find((x) => x.dataset.mode === next);
      if (el) el.focus();
    }
  });
});

let clearArmed = false;
const KEY_PLACEHOLDER_UNSET = '貼上 gsk_… 後按儲存';
const EYE_OPEN_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
// Special keys render as a recognizable glyph instead of text.
const WIN_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M3 5.4 10.6 4.3v7.2H3zM11.6 4.1 21 3v8.5h-9.4zM3 12.5h7.6v7.2L3 18.6zM11.6 12.5H21V21l-9.4-1.3z"/></svg>';
const CMD_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/></svg>';
const FN_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 15v-4h2M8 13h1.6M14 15v-4l2.5 4v-4" stroke-width="1.6" stroke-linecap="round"/></svg>';
const SPECIAL_KEY_SVG = {
  win: WIN_SVG, meta: WIN_SVG, super: WIN_SVG,
  cmd: CMD_SVG, command: CMD_SVG,
  fn: FN_SVG,
};
// Last config snapshot so an emptied field can restore the masked state
// without another get_config round-trip.
let lastKeySet = false;
let lastKeyMask = '';
// Two-step confirm state for the borderless "✕ 清除金鑰" action.
let clearConfirm = false;
let clearConfirmTimer = null;
function resetClearConfirm() {
  clearConfirm = false;
  if (clearConfirmTimer) { clearTimeout(clearConfirmTimer); clearConfirmTimer = null; }
  if (!keyClear.hidden) keyClear.textContent = '✕ 清除金鑰';
}

// Reflect "configured" state in the field: when a key is set we show only the
// server-built mask (first4•••last4 — the raw key never reaches the webview);
// when unset we show the paste prompt. Never overrides text the user is typing.
function applyKeyState(keySet, keyMask) {
  lastKeySet = !!keySet;
  lastKeyMask = keyMask || '';
  keyClear.hidden = !lastKeySet; // offer "清除金鑰" only when a key exists
  resetClearConfirm();
  if (keyInput.value) return; // user is typing a new value — leave it alone
  // Only the placeholder reflects state (mask when set, prompt when unset).
  // No instructional hint text — keeps the dialog clean.
  keyInput.placeholder = lastKeySet ? (lastKeyMask || '••••••••') : KEY_PLACEHOLDER_UNSET;
}

// The reveal toggle only exists for a value the user is actively typing.
// A stored key can never be revealed (the webview doesn't have it).
function updateToggleVisibility() {
  if (keyInput.value) {
    keyToggle.style.display = '';
  } else {
    keyToggle.style.display = 'none';
    keyInput.type = 'password';
    keyToggle.innerHTML = EYE_OPEN_SVG;
  }
}

// Pull authoritative state from the shell. Runs on load AND every time the
// window regains focus (tray reopen) so the masked/hotkey state is never stale.
async function refreshFromConfig() {
  try {
    const cfg = await invoke('get_config');
    if (cfg && cfg.hotkey) currentSpec = cfg.hotkey;
    applyKeyState(cfg && cfg.groqKeySet, cfg && cfg.groqKeyMask);
    currentZh = cfg && cfg.zhConvert === 'cn' ? 'cn' : 'twp';
    pendingZh = currentZh;
    renderZh();
  } catch (_) {}
  updateToggleVisibility();
  renderCombo(pendingSpec || currentSpec);
}

let currentSpec = 'Ctrl+Shift+Space'; // authoritative (from config); kept on failure
let pendingSpec = null;               // recorded but unsaved
let armed = false;
let capturedThisSession = false;      // a valid combo captured in current arm

const CODE_KEY = (code) => {
  if (code === 'Space') return 'Space';
  if (code === 'Enter') return 'Enter';
  if (code.startsWith('Key')) return code.slice(3);            // KeyA -> A
  if (code.startsWith('Digit')) return code.slice(5);          // Digit1 -> 1
  if (/^F([1-9]|1[0-2])$/.test(code)) return code;             // F1..F12
  if (code === 'ArrowUp') return 'Up';
  if (code === 'ArrowDown') return 'Down';
  if (code === 'ArrowLeft') return 'Left';
  if (code === 'ArrowRight') return 'Right';
  return null;                                                 // unsupported main key
};

function renderCombo(spec, animate) {
  comboEl.innerHTML = '';
  let n = 0; // running index across keycaps + plus separators for stagger
  spec.split('+').forEach((part, i) => {
    if (i > 0) {
      const plus = document.createElement('span');
      plus.className = animate ? 'kc-plus kc-anim' : 'kc-plus';
      if (animate) plus.style.animationDelay = (n++ * 0.05) + 's';
      plus.textContent = '+';
      comboEl.appendChild(plus);
    }
    const s = document.createElement('span');
    s.className = animate ? 'keycap kc-anim' : 'keycap';
    if (animate) s.style.animationDelay = (n++ * 0.05) + 's';
    const ic = SPECIAL_KEY_SVG[part.toLowerCase()];
    if (ic) { s.classList.add('keycap-ic'); s.title = part; s.innerHTML = ic; }
    else s.textContent = part;
    comboEl.appendChild(s);
  });
}
function showErr(msg) { errEl.textContent = msg; errEl.style.display = 'block'; }
function clearErr() { errEl.style.display = 'none'; }

function setArmed(on) {
  armed = on;
  capturedThisSession = false; // fresh session / cleanup
  recBtn.classList.toggle('armed', on);
  recBtn.textContent = on ? '● 錄製中…' : '錄製';
  // Suspend Vocium's global hotkey while recording so pressing the current
  // combo doesn't trigger it; resume when recording ends.
  invoke('set_hotkey_enabled', { enabled: !on }).catch(() => {});
}

window.addEventListener('keydown', (e) => {
  if (!armed) return;
  e.preventDefault();
  if (e.key === 'Escape') { setArmed(false); renderCombo(pendingSpec || currentSpec); return; }
  const main = CODE_KEY(e.code);
  if (!main) return; // wait for a real main key
  const mods = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.shiftKey) mods.push('Shift');
  if (e.altKey) mods.push('Alt');
  if (e.metaKey) mods.push('Win');
  if (mods.length === 0) { showErr('需含至少一個修飾鍵（Ctrl/Shift/Alt/Win）＋一個主鍵'); return; }
  clearErr();
  pendingSpec = [...mods, main].join('+');
  capturedThisSession = true;
  // Stay armed after capture so a new chord can replace it; recording
  // auto-ends on full key release (keyup below).
  renderCombo(pendingSpec, true); // staggered keycap fade-in
});

// Smart finalize: once a valid combo is captured, end recording as soon as
// the user lets go of all keys (no modifier still held) — no stuck "錄製中…".
window.addEventListener('keyup', (e) => {
  if (!armed || !capturedThisSession) return;
  // keyup flags reflect post-release state: all false ⇒ nothing held.
  if (e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
  setArmed(false);
  renderCombo(pendingSpec || currentSpec);
});

recBtn.addEventListener('click', () => { clearErr(); setArmed(true); });

saveBtn.addEventListener('click', async () => {
  // 1. Hotkey (unchanged behavior)
  const spec = pendingSpec || currentSpec;
  try {
    const r = await invoke('set_hotkey', { spec });
    if (r && r.ok) {
      currentSpec = r.hotkey;
      pendingSpec = null;
      clearErr();
      if (armed) setArmed(false); // exit recording mode on apply
    }
  } catch (reason) {
    if (reason === 'parse') showErr('組合無效：需修飾鍵＋主鍵');
    else if (reason === 'taken') showErr(`此組合已被占用，仍保留原快捷鍵 ${currentSpec}`);
    else showErr(`設定失敗：${reason}`);
    renderCombo(currentSpec);
    pendingSpec = null;
    return; // hotkey failed — don't proceed to key/close
  }

  // 2. Groq API key: send only if user typed a new value OR armed clear.
  const typed = keyInput.value.trim();
  if (typed || clearArmed) {
    try {
      const kr = await invoke('set_groq_key', { key: typed });
      if (kr && kr.ok) {
        keyErr.style.display = 'none';
        keyInput.value = '';
        clearArmed = false;
        keyHint.textContent = typed
          ? `金鑰已套用（STT：${kr.sttProvider}）`
          : '金鑰已清除';
      }
    } catch (reason) {
      keyErr.textContent = `金鑰套用失敗：${reason}（請重啟程式）`;
      keyErr.style.display = 'block';
      return; // keep window open so the error is visible
    }
  }

  // 3. zh mode: apply only if changed
  if (pendingZh !== currentZh) {
    try {
      await invoke('save_zh_mode', { mode: pendingZh });
      currentZh = pendingZh;
    } catch (reason) {
      showErr(`中文輸出套用失敗：${reason}`);
      return; // surface as error (not 提示語), keep window open
    }
  }
  // success feedback animation on the Save button (dedup: a rapid 2nd save
  // must not capture the '✓ 已套用' transient as the label to restore)
  if (saveBtn._okTimer) { clearTimeout(saveBtn._okTimer); }
  else { saveBtn._okLabel = saveBtn.textContent; } // original captured once
  saveBtn.classList.add('ok');
  saveBtn.textContent = '✓ 已套用';
  saveBtn._okTimer = setTimeout(() => {
    saveBtn.classList.remove('ok');
    saveBtn.textContent = saveBtn._okLabel;
    saveBtn._okTimer = null;
  }, 1000);

  // Per UX: do NOT close after save. Re-sync the masked field to the new key
  // (dialog stays open); the animation above provides confirmation.
  await refreshFromConfig();
});

function dismiss() {
  pendingSpec = null;
  setArmed(false);
  clearErr();
  renderCombo(currentSpec);
  keyInput.value = '';
  clearArmed = false;
  resetClearConfirm();
  keyErr.style.display = 'none';
  keyHint.textContent = '';
  pendingZh = currentZh;
  renderZh();
  getCurrentWindow().hide();
}
cancelBtn.addEventListener('click', dismiss);

refreshFromConfig(); // initial load

// In-field eye: reveals ONLY a value the user is actively typing.
// A stored key is never revealable (the webview never receives it).
keyToggle.addEventListener('click', () => {
  if (!keyInput.value) return;
  const reveal = keyInput.type === 'password';
  keyInput.type = reveal ? 'text' : 'password';
  keyToggle.innerHTML = reveal ? EYE_OFF_SVG : EYE_OPEN_SVG;
});

// Borderless red "✕ 清除金鑰" (only shown when a key is set). Two-step
// confirm: first click arms, second click within 3s actually marks for clear.
keyClear.addEventListener('click', () => {
  if (keyClear.hidden) return;
  if (!clearConfirm) {
    clearConfirm = true;
    keyClear.textContent = '✕ 再按一次確認清除';
    if (clearConfirmTimer) clearTimeout(clearConfirmTimer);
    clearConfirmTimer = setTimeout(resetClearConfirm, 3000);
    return;
  }
  resetClearConfirm();
  clearArmed = true;
  keyInput.value = '';
  keyInput.placeholder = KEY_PLACEHOLDER_UNSET;
  keyErr.style.display = 'none';
  keyHint.textContent = '已標記清除（儲存後生效）';
  updateToggleVisibility();
});

keyInput.addEventListener('input', () => {
  // Field emptied → restore masked/unset prompt; otherwise enable reveal toggle.
  if (!keyInput.value) applyKeyState(lastKeySet, lastKeyMask);
  updateToggleVisibility();
});

// On regaining focus (tray reopen / OS dismiss), clear stale ARMED + error + hint UI.
// Keep a recorded-but-unsaved pendingSpec so user can resume mid-flow after alt-tab.
getCurrentWindow().onFocusChanged(({ payload: focused }) => {
  if (!focused) return;
  if (armed) setArmed(false);
  clearErr();
  // Clear stale transient confirmations from a previous session.
  keyHint.textContent = '';
  // Re-sync hotkey + masked key state + zh mode from the shell every reopen.
  refreshFromConfig();
});
