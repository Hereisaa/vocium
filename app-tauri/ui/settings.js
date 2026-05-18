const { invoke } = window.__TAURI__.core;
const { getCurrentWindow } = window.__TAURI__.window;

// ── DOM refs ────────────────────────────────────────────────────────────────
const comboEl    = document.getElementById('combo');
const recBtn     = document.getElementById('rec');
const saveBtn    = document.getElementById('save');
const cancelBtn  = document.getElementById('cancel');
const errEl      = document.getElementById('err');

const keyInput   = document.getElementById('keyInput');
const keyToggle  = document.getElementById('keyToggle');
const keyClear   = document.getElementById('keyClear');
const keyErr     = document.getElementById('keyErr');
const keyLabel   = document.getElementById('keyLabel');

const provSel    = document.getElementById('provSel');
const provFields = document.getElementById('provFields');
const localStub  = document.getElementById('localStub');
const modelSel   = document.getElementById('modelSel');
const modelCustom = document.getElementById('modelCustom');
const baseUrlField = document.getElementById('baseUrlField');
const baseUrlInput = document.getElementById('baseUrlInput');

// ── Model lists (mirrors core/stt/models.ts — duplication is intentional) ──
const STT_MODELS = {
  groq:   ['whisper-large-v3-turbo', 'whisper-large-v3', 'distil-whisper-large-v3-en'],
  openai: ['whisper-1', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe'],
  gemini: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash'],
};
const CUSTOM = '__custom__';

// ── Cached config (populated by refreshFromConfig) ──────────────────────────
let cachedCfg = null;       // full get_config snapshot
let activeProvider = 'groq'; // currently active (never 'local')

// ── Tab switching ────────────────────────────────────────────────────────────
const tabEls  = Array.from(document.querySelectorAll('#tabs .s-tab'));
const paneEls = Array.from(document.querySelectorAll('.s-pane'));

function showTab(name) {
  tabEls.forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle('active', on);
    t.tabIndex = on ? 0 : -1;
    t.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  paneEls.forEach((p) => {
    p.classList.toggle('active', p.id === `pane-${name}`);
  });
}

tabEls.forEach((t) => {
  t.addEventListener('click', () => showTab(t.dataset.tab));
  t.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); showTab(t.dataset.tab); t.focus(); }
  });
});

// ── Provider / model wiring ──────────────────────────────────────────────────
/** Populate #modelSel options for a given provider. */
function fillModels(provider, current) {
  const list = STT_MODELS[provider] || [];
  modelSel.innerHTML = '';
  list.forEach((id) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = id;
    modelSel.appendChild(opt);
  });
  // Add custom option
  const customOpt = document.createElement('option');
  customOpt.value = CUSTOM;
  customOpt.textContent = '自訂…';
  modelSel.appendChild(customOpt);

  const inList = current && list.includes(current);
  if (current && !inList) {
    // Custom value not in preset list
    modelSel.value = CUSTOM;
    modelCustom.value = current;
    modelCustom.style.display = '';
  } else {
    modelSel.value = current || list[0] || '';
    modelCustom.value = '';
    modelCustom.style.display = 'none';
  }
}

modelSel.addEventListener('change', () => {
  if (modelSel.value === CUSTOM) {
    modelCustom.style.display = '';
    modelCustom.focus();
  } else {
    modelCustom.style.display = 'none';
  }
});

const PROVIDER_LABELS = {
  groq:   'Groq API Key',
  openai: 'OpenAI API Key',
  gemini: 'Gemini API Key',
};

/**
 * Render the per-provider fields from the cached config snapshot.
 * If provider === 'local', hide provFields and show stub.
 */
function renderProvider(provider) {
  if (provider === 'local') {
    provFields.style.display = 'none';
    localStub.style.display = '';
    return;
  }
  provFields.style.display = '';
  localStub.style.display = 'none';

  // Key label
  keyLabel.textContent = PROVIDER_LABELS[provider] || `${provider} API Key`;

  // Base URL row: only for openai
  baseUrlField.style.display = provider === 'openai' ? '' : 'none';

  // Apply key state from cached config
  if (cachedCfg && cachedCfg.providers && cachedCfg.providers[provider]) {
    const p = cachedCfg.providers[provider];
    applyKeyState(p.keySet, p.mask);
    fillModels(provider, p.model || '');
    if (provider === 'openai') {
      baseUrlInput.value = p.baseUrl || '';
    }
  } else {
    applyKeyState(false, '');
    fillModels(provider, '');
    if (provider === 'openai') baseUrlInput.value = '';
  }
}

provSel.addEventListener('change', () => renderProvider(provSel.value));

// ── Segmented controls ────────────────────────────────────────────────────────
/**
 * Generic seg-control wirer. Returns { get(), set(v) }.
 * attrKey: the data-* attribute on each .seg-opt (e.g. 'im', 'vad').
 */
function makeSeg(containerEl, attrKey) {
  const opts = containerEl ? Array.from(containerEl.querySelectorAll('.seg-opt')) : [];
  let pending = null; // set by set()

  function render() {
    opts.forEach((o) => {
      const on = o.dataset[attrKey] === pending;
      o.classList.toggle('active', on);
      o.setAttribute('aria-checked', on ? 'true' : 'false');
      o.tabIndex = on ? 0 : -1;
    });
  }

  function pick(val) {
    pending = val;
    render();
  }

  opts.forEach((o) => {
    o.addEventListener('click', () => pick(o.dataset[attrKey]));
    o.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        pick(o.dataset[attrKey]);
        o.focus();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const idx = opts.findIndex((x) => x.dataset[attrKey] === pending);
        const next = opts[(idx + (e.key === 'ArrowRight' ? 1 : -1) + opts.length) % opts.length];
        if (next) { pick(next.dataset[attrKey]); next.focus(); }
      }
    });
  });

  return {
    get: () => pending,
    set: (v) => { pending = v; render(); },
  };
}

// inputMode seg (#imSeg, data-im)
const imSeg  = makeSeg(document.getElementById('imSeg'),  'im');
// VAD seg (#vadSeg, data-vad)
const vadSeg = makeSeg(document.getElementById('vadSeg'), 'vad');

// ── zh seg (preserve existing behavior, refactored minimally to align style) ─
const zhSeg  = document.getElementById('zhSeg');
const zhOpts = zhSeg ? Array.from(zhSeg.querySelectorAll('.seg-opt')) : [];
let currentZh = 'twp';   // authoritative (from config)
let pendingZh = 'twp';   // selected but unsaved

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

// ── Key field helpers ─────────────────────────────────────────────────────────
const KEY_PLACEHOLDER_UNSET = '貼上金鑰後按儲存';
const EYE_OPEN_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

// Last key snapshot so an emptied field can restore masked state without a round-trip.
let lastKeySet  = false;
let lastKeyMask = '';

// Two-step confirm state for the "✕ 清除金鑰" action.
let clearConfirm = false;
let clearConfirmTimer = null;

function resetClearConfirm() {
  clearConfirm = false;
  if (clearConfirmTimer) { clearTimeout(clearConfirmTimer); clearConfirmTimer = null; }
  if (!keyClear.hidden) keyClear.textContent = '✕ 清除金鑰';
}

/**
 * Reflect "configured" state in the key field.
 * NOTE: #keyHint was removed in Task 12 HTML. Feedback is via the Save button
 * success-pulse animation (minimal-surface approach chosen in Task 13).
 */
function applyKeyState(keySet, keyMask) {
  lastKeySet  = !!keySet;
  lastKeyMask = keyMask || '';
  keyClear.hidden = !lastKeySet;
  resetClearConfirm();
  if (keyInput.value) return; // user is typing — leave it alone
  keyInput.placeholder = lastKeySet ? (lastKeyMask || '••••••••') : KEY_PLACEHOLDER_UNSET;
}

function updateToggleVisibility() {
  if (keyInput.value) {
    keyToggle.style.display = '';
  } else {
    keyToggle.style.display = 'none';
    keyInput.type = 'password';
    keyToggle.innerHTML = EYE_OPEN_SVG;
  }
}

// ── Hotkey recorder helpers ───────────────────────────────────────────────────
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
  fn:  FN_SVG,
};

let currentSpec = 'Ctrl+Shift+Space'; // authoritative (from config); kept on failure
let pendingSpec  = null;               // recorded but unsaved
let armed        = false;
let capturedThisSession = false;       // a valid combo captured in current arm

const CODE_KEY = (code) => {
  if (code === 'Space') return 'Space';
  if (code === 'Enter') return 'Enter';
  if (code.startsWith('Key'))   return code.slice(3);            // KeyA -> A
  if (code.startsWith('Digit')) return code.slice(5);            // Digit1 -> 1
  if (/^F([1-9]|1[0-2])$/.test(code)) return code;              // F1..F12
  if (code === 'ArrowUp')    return 'Up';
  if (code === 'ArrowDown')  return 'Down';
  if (code === 'ArrowLeft')  return 'Left';
  if (code === 'ArrowRight') return 'Right';
  return null; // unsupported main key
};

function renderCombo(spec, animate) {
  comboEl.innerHTML = '';
  let n = 0;
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
function clearErr()   { errEl.style.display = 'none'; }

function setArmed(on) {
  armed = on;
  capturedThisSession = false;
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
  if (!main) return;
  const mods = [];
  if (e.ctrlKey)  mods.push('Ctrl');
  if (e.shiftKey) mods.push('Shift');
  if (e.altKey)   mods.push('Alt');
  if (e.metaKey)  mods.push('Win');
  if (mods.length === 0) { showErr('需含至少一個修飾鍵（Ctrl/Shift/Alt/Win）＋一個主鍵'); return; }
  clearErr();
  pendingSpec = [...mods, main].join('+');
  capturedThisSession = true;
  renderCombo(pendingSpec, true);
});

// Smart finalize: once a valid combo is captured, end recording as soon as
// the user lets go of all keys (no modifier still held).
window.addEventListener('keyup', (e) => {
  if (!armed || !capturedThisSession) return;
  if (e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
  setArmed(false);
  renderCombo(pendingSpec || currentSpec);
});

recBtn.addEventListener('click', () => { clearErr(); setArmed(true); });

// ── Config refresh ────────────────────────────────────────────────────────────
/**
 * Pull authoritative state from the shell. Runs on load AND every time the
 * window regains focus (tray reopen) so state is never stale.
 */
async function refreshFromConfig() {
  try {
    const cfg = await invoke('get_config');
    cachedCfg = cfg;

    // Hotkey
    if (cfg && cfg.hotkey) currentSpec = cfg.hotkey;

    // Active provider (never 'local' as active — fallback to 'groq')
    activeProvider = (cfg && cfg.activeProvider && cfg.activeProvider !== 'local')
      ? cfg.activeProvider
      : 'groq';
    provSel.value = activeProvider;
    renderProvider(activeProvider);

    // inputMode
    imSeg.set(cfg && cfg.inputMode === 'ptt' ? 'ptt' : 'toggle');

    // VAD
    vadSeg.set(cfg && cfg.vadTrim ? 'on' : 'off');

    // zh mode
    currentZh = (cfg && cfg.zhConvert === 'cn') ? 'cn' : 'twp';
    pendingZh  = currentZh;
    renderZh();
  } catch (e) { console.error('[settings] get_config failed:', e); }
  updateToggleVisibility();
  renderCombo(pendingSpec || currentSpec);
}

// ── Save ──────────────────────────────────────────────────────────────────────
saveBtn.addEventListener('click', async () => {
  // 1. Hotkey (unchanged behavior)
  const spec = pendingSpec || currentSpec;
  try {
    const r = await invoke('set_hotkey', { spec });
    if (r && r.ok) {
      currentSpec = r.hotkey;
      pendingSpec  = null;
      clearErr();
      if (armed) setArmed(false);
    }
  } catch (reason) {
    if (reason === 'parse')  showErr('組合無效：需修飾鍵＋主鍵');
    else if (reason === 'taken') showErr(`此組合已被占用，仍保留原快捷鍵 ${currentSpec}`);
    else showErr(`設定失敗：${reason}`);
    renderCombo(currentSpec);
    pendingSpec = null;
    return; // hotkey failed — don't proceed
  }

  // 2. Provider key / model / baseUrl
  const sel = provSel.value;
  if (sel === 'local') {
    // D4: never persist local; surface info via keyErr transiently
    keyErr.textContent = '本地 STT 尚未推出，啟用來源未變更';
    keyErr.style.display = 'block';
    setTimeout(() => { keyErr.style.display = 'none'; }, 3000);
    // Fall through — still save inputMode / vad / zh / hotkey
  } else {
    const model = modelSel.value === CUSTOM
      ? modelCustom.value.trim()
      : modelSel.value;
    const typed   = keyInput.value.trim(); // blank ⇒ unchanged
    const baseUrl = sel === 'openai' ? baseUrlInput.value.trim() : undefined;
    // blank key = Rust no-op (verified: set_provider_key skips patch when key.trim() empty).
    const prov = cachedCfg && cachedCfg.providers ? cachedCfg.providers[sel] : null;
    const loadedModel   = prov ? (prov.model   || '') : '';
    const loadedBaseUrl = prov ? (prov.baseUrl  || '') : '';
    const keyChanged      = typed !== '';
    const modelChanged    = model !== loadedModel;
    const baseUrlChanged  = sel === 'openai' && (baseUrl || '') !== loadedBaseUrl;
    const providerSwitching = sel !== activeProvider;
    if (keyChanged || modelChanged || baseUrlChanged || providerSwitching) {
      try {
        const r = await invoke('set_provider_key', { provider: sel, key: typed, model, baseUrl });
        keyErr.style.display = 'none';
        keyInput.value = '';
        if (r && r.sttProvider) { /* success path — provider name available via r.sttProvider */ }
      } catch (reason) {
        keyErr.textContent = `金鑰套用失敗：${reason}（請重啟程式）`;
        keyErr.style.display = 'block';
        return; // keep window open so the error is visible
      }
    }
    // Switch active STT provider if changed
    if (providerSwitching) {
      try {
        await invoke('set_stt_provider', { provider: sel });
      } catch (reason) {
        keyErr.textContent = `切換 STT 來源失敗：${reason}`;
        keyErr.style.display = 'block';
        return;
      }
    }
  }

  // 3. inputMode: apply only if changed vs loaded value
  const pendingIm = imSeg.get();
  const loadedIm  = (cachedCfg && cachedCfg.inputMode === 'ptt') ? 'ptt' : 'toggle';
  if (pendingIm && pendingIm !== loadedIm) {
    try {
      await invoke('save_input_mode', { mode: pendingIm });
    } catch (reason) {
      showErr(`輸入模式套用失敗：${reason}`);
      return;
    }
  }

  // 4. VAD: apply only if changed vs loaded value
  const pendingVad = vadSeg.get();
  const loadedVad  = (cachedCfg && cachedCfg.vadTrim) ? 'on' : 'off';
  if (pendingVad && pendingVad !== loadedVad) {
    try {
      await invoke('save_vad_trim', { enabled: pendingVad === 'on' });
    } catch (reason) {
      showErr(`VAD 設定套用失敗：${reason}`);
      return;
    }
  }

  // 5. zh mode: apply only if changed
  if (pendingZh !== currentZh) {
    try {
      await invoke('save_zh_mode', { mode: pendingZh });
      currentZh = pendingZh;
    } catch (reason) {
      showErr(`中文輸出套用失敗：${reason}`);
      return;
    }
  }

  // Success feedback animation on Save button
  // (dedup: a rapid 2nd save must not capture the '✓ 已套用' transient as label)
  if (saveBtn._okTimer) { clearTimeout(saveBtn._okTimer); }
  else { saveBtn._okLabel = saveBtn.textContent; } // original captured once
  saveBtn.classList.add('ok');
  saveBtn.textContent = '✓ 已套用';
  saveBtn._okTimer = setTimeout(() => {
    saveBtn.classList.remove('ok');
    saveBtn.textContent = saveBtn._okLabel;
    saveBtn._okTimer = null;
  }, 1000);

  // Per UX: do NOT close after save. Re-sync masked fields to new state.
  await refreshFromConfig();
});

// ── Cancel / dismiss ─────────────────────────────────────────────────────────
function dismiss() {
  pendingSpec = null;
  setArmed(false);
  clearErr();
  renderCombo(currentSpec);
  keyInput.value = '';
  resetClearConfirm();
  keyErr.style.display = 'none';
  pendingZh = currentZh;
  renderZh();
  getCurrentWindow().hide();
}
cancelBtn.addEventListener('click', dismiss);

// ── Key field interactions ────────────────────────────────────────────────────
keyToggle.addEventListener('click', () => {
  if (!keyInput.value) return;
  const reveal = keyInput.type === 'password';
  keyInput.type = reveal ? 'text' : 'password';
  keyToggle.innerHTML = reveal ? EYE_OFF_SVG : EYE_OPEN_SVG;
});

// Borderless "✕ 清除金鑰" (only shown when a key is set). Two-step confirm.
keyClear.addEventListener('click', () => {
  if (keyClear.hidden) return;
  if (provSel.value === 'local') return; // should not appear for local, guard anyway
  if (!clearConfirm) {
    clearConfirm = true;
    keyClear.textContent = '✕ 再按一次確認清除';
    if (clearConfirmTimer) clearTimeout(clearConfirmTimer);
    clearConfirmTimer = setTimeout(resetClearConfirm, 3000);
    return;
  }
  // Second click — actually clear
  resetClearConfirm();
  invoke('clear_provider_key', { provider: provSel.value })
    .then(() => {
      keyInput.value = '';
      updateToggleVisibility();
      return refreshFromConfig();
    })
    .catch((reason) => {
      keyErr.textContent = `清除金鑰失敗：${reason}`;
      keyErr.style.display = 'block';
    });
});

keyInput.addEventListener('input', () => {
  if (!keyInput.value) applyKeyState(lastKeySet, lastKeyMask);
  updateToggleVisibility();
});

// ── Focus handler ─────────────────────────────────────────────────────────────
// On regaining focus (tray reopen / OS dismiss), clear stale armed + error UI.
// Keep a recorded-but-unsaved pendingSpec so user can resume mid-flow.
getCurrentWindow().onFocusChanged(({ payload: focused }) => {
  if (!focused) return;
  if (armed) setArmed(false);
  clearErr();
  keyErr.style.display = 'none';
  // Re-sync hotkey + masked key state + all settings from the shell every reopen.
  refreshFromConfig();
});

// ── Initial load ──────────────────────────────────────────────────────────────
refreshFromConfig();
