const { invoke } = window.__TAURI__.core;
const { getCurrentWindow } = window.__TAURI__.window;

// ── DOM refs ────────────────────────────────────────────────────────────────
const comboEl    = document.getElementById('combo');
const recBtn     = document.getElementById('rec');
const saveBtn    = document.getElementById('save');
const cancelBtn  = document.getElementById('cancel');
const errEl      = document.getElementById('err');
const micSel     = document.getElementById('micSel');

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

const polishProvSel     = document.getElementById('polishProvSel');
const polishCloudFields = document.getElementById('polishCloudFields');
const polishLocalStub   = document.getElementById('polishLocalStub');
const polishKeyLabel    = document.getElementById('polishKeyLabel');
const polishKeyInput    = document.getElementById('polishKeyInput');
const polishKeyToggle   = document.getElementById('polishKeyToggle');
const polishKeyClear    = document.getElementById('polishKeyClear');
const polishModelSel    = document.getElementById('polishModelSel');
const polishModelCustom = document.getElementById('polishModelCustom');
const polishModelDelete = document.getElementById('polishModelDelete');
const polishCustomPrompt = document.getElementById('polishCustomPrompt');

// ── Model lists (mirrors core/stt/models.ts — duplication is intentional) ──
const STT_MODELS = {
  groq: [
    { id: 'whisper-large-v3-turbo', label: 'whisper-large-v3-turbo（預設・快）', labelEn: 'whisper-large-v3-turbo (default · fast)' },
    { id: 'whisper-large-v3', label: 'whisper-large-v3（較慢・較準）', labelEn: 'whisper-large-v3 (slower · more accurate)' },
  ],
  openai: [
    { id: 'whisper-1', label: 'whisper-1（預設・便宜）', labelEn: 'whisper-1 (default · cheap)' },
    { id: 'gpt-4o-transcribe', label: 'gpt-4o-transcribe（最準・較貴）', labelEn: 'gpt-4o-transcribe (most accurate · pricier)' },
    { id: 'gpt-4o-mini-transcribe', label: 'gpt-4o-mini-transcribe（快・平價）', labelEn: 'gpt-4o-mini-transcribe (fast · value)' },
  ],
  gemini: [
    { id: 'gemini-3.5-flash', label: 'gemini-3.5-flash（預設・快）', labelEn: 'gemini-3.5-flash (default · fast)' },
    { id: 'gemini-3.1-flash-lite', label: 'gemini-3.1-flash-lite（最快・最便宜）', labelEn: 'gemini-3.1-flash-lite (fastest · cheapest)' },
    { id: 'gemini-3.1-pro-preview', label: 'gemini-3.1-pro-preview（最準・較貴）', labelEn: 'gemini-3.1-pro-preview (most accurate · pricier)' },
  ],
};
const CUSTOM = '__custom__';

// ── Polish model lists (mirrors core/stt/models.ts POLISH_MODELS — duplication is intentional) ──
const POLISH_MODELS = {
  groq: [
    { id: 'llama-3.3-70b-versatile', label: 'llama-3.3-70b-versatile（預設・品質佳）', labelEn: 'llama-3.3-70b-versatile (default · good quality)' },
    { id: 'llama-3.1-8b-instant', label: 'llama-3.1-8b-instant（最快・最便宜）', labelEn: 'llama-3.1-8b-instant (fastest · cheapest)' },
    { id: 'openai/gpt-oss-120b', label: 'openai/gpt-oss-120b（高品質・較慢）', labelEn: 'openai/gpt-oss-120b (high quality · slower)' },
    { id: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'meta-llama/llama-4-scout-17b-16e-instruct（新・快）', labelEn: 'meta-llama/llama-4-scout-17b-16e-instruct (new · fast)' },
  ],
  openai: [
    { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini（預設・快・平價）', labelEn: 'gpt-5.4-mini (default · fast · value)' },
    { id: 'gpt-5.5', label: 'gpt-5.5（最佳・較貴）', labelEn: 'gpt-5.5 (best · pricier)' },
    { id: 'gpt-5.4-nano', label: 'gpt-5.4-nano（最快・最便宜）', labelEn: 'gpt-5.4-nano (fastest · cheapest)' },
  ],
  gemini: [
    { id: 'gemini-3.5-flash', label: 'gemini-3.5-flash（預設・快）', labelEn: 'gemini-3.5-flash (default · fast)' },
    { id: 'gemini-3.1-pro-preview', label: 'gemini-3.1-pro-preview（最準・較貴）', labelEn: 'gemini-3.1-pro-preview (most accurate · pricier)' },
    { id: 'gemini-3.1-flash-lite', label: 'gemini-3.1-flash-lite（最快・最便宜）', labelEn: 'gemini-3.1-flash-lite (fastest · cheapest)' },
  ],
  claude: [
    { id: 'claude-haiku-4-5', label: 'claude-haiku-4-5（預設・快・便宜）', labelEn: 'claude-haiku-4-5 (default · fast · cheap)' },
    { id: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6（平衡）', labelEn: 'claude-sonnet-4-6 (balanced)' },
    { id: 'claude-opus-4-7', label: 'claude-opus-4-7（最佳・最貴）', labelEn: 'claude-opus-4-7 (best · priciest)' },
  ],
};

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
  const ids = list.map((m) => m.id);
  modelSel.innerHTML = '';
  list.forEach(({ id, label, labelEn }) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = window.I18N.getLang() === 'en' ? (labelEn || id) : (label || id);
    modelSel.appendChild(opt);
  });
  // Add custom option
  const customOpt = document.createElement('option');
  customOpt.value = CUSTOM;
  customOpt.textContent = window.I18N.t('opt.modelCustom');
  modelSel.appendChild(customOpt);

  const inList = current && ids.includes(current);
  if (current && !inList) {
    // Custom value not in preset list
    modelSel.value = CUSTOM;
    modelCustom.value = current;
    modelCustom.style.display = '';
  } else {
    modelSel.value = current || ids[0] || '';
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

// ── Polish provider / model wiring ───────────────────────────────────────────
const POLISH_PROVIDER_LABELS = {
  groq:   'Groq API Key',
  openai: 'OpenAI API Key',
  gemini: 'Gemini API Key',
  claude: 'Claude API Key',
};

// ── Remembered (user-entered) polish custom models, per provider ──────────────
// Persisted in webview localStorage only (single-machine; never written to the
// Rust config / never pushed). A non-preset model the user saved becomes a
// reusable dropdown option with a ✕ delete affordance.
const rememberedKey = (provider) => `vocium.polishModels.${provider}`;
function getRememberedModels(provider) {
  try {
    const arr = JSON.parse(localStorage.getItem(rememberedKey(provider)) || '[]');
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string' && x.trim()) : [];
  } catch { return []; }
}
function addRememberedModel(provider, model) {
  const m = (model || '').trim();
  if (!m || (POLISH_MODELS[provider] || []).some((x) => x.id === m)) return; // skip empty / preset
  const list = getRememberedModels(provider);
  if (list.includes(m)) return;
  list.push(m);
  try { localStorage.setItem(rememberedKey(provider), JSON.stringify(list)); } catch { /* quota/private mode */ }
}
function removeRememberedModel(provider, model) {
  try {
    localStorage.setItem(rememberedKey(provider),
      JSON.stringify(getRememberedModels(provider).filter((x) => x !== model)));
  } catch { /* best-effort */ }
}

/** Show the ✕ delete affordance only when the selected option is a remembered
 *  (user-entered, non-preset) model. */
function updatePolishModelDeleteBtn() {
  if (!polishModelDelete) return;
  const provider = polishProvSel.value;
  const val = polishModelSel.value;
  const isRemembered = !!val && val !== CUSTOM
    && !(POLISH_MODELS[provider] || []).some((x) => x.id === val)
    && getRememberedModels(provider).includes(val);
  polishModelDelete.hidden = !isRemembered;
}

/** Populate #polishModelSel: presets → remembered customs → 自訂…. A non-preset
 *  `current` (a custom the user set before) is remembered and shown as a real
 *  selectable option rather than re-typed. Defaults to the first preset. */
function fillPolishModels(provider, current) {
  const presets = POLISH_MODELS[provider] || [];
  const presetIds = presets.map((m) => m.id);
  if (current && !presetIds.includes(current)) addRememberedModel(provider, current);
  const remembered = getRememberedModels(provider).filter((m) => !presetIds.includes(m));

  polishModelSel.innerHTML = '';
  presets.forEach(({ id, label, labelEn }) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = window.I18N.getLang() === 'en' ? (labelEn || id) : (label || id);
    polishModelSel.appendChild(opt);
  });
  remembered.forEach((id) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = id; // user-entered custom: no preset tag
    polishModelSel.appendChild(opt);
  });
  const customOpt = document.createElement('option');
  customOpt.value = CUSTOM;
  customOpt.textContent = window.I18N.t('opt.modelCustom');
  polishModelSel.appendChild(customOpt);

  const known = [...presetIds, ...remembered];
  polishModelSel.value = (current && known.includes(current)) ? current : (presetIds[0] || '');
  polishModelCustom.value = '';
  polishModelCustom.style.display = 'none';
  updatePolishModelDeleteBtn();
}

polishModelSel.addEventListener('change', () => {
  if (polishModelSel.value === CUSTOM) {
    polishModelCustom.style.display = '';
    polishModelCustom.focus();
  } else {
    polishModelCustom.style.display = 'none';
  }
  updatePolishModelDeleteBtn();
});

if (polishModelDelete) {
  polishModelDelete.addEventListener('click', () => {
    const provider = polishProvSel.value;
    const val = polishModelSel.value;
    if (!val || val === CUSTOM) return;
    removeRememberedModel(provider, val);
    fillPolishModels(provider, ''); // re-render → default to first preset
  });
}

// Single source of truth for the "no key set" placeholder text (shared by STT
// and polish key fields). A function (not a const) so it follows live language
// switches.
function keyPhUnset() { return window.I18N.t('ph.key'); }

// Last polish key snapshot for placeholder restore without round-trip.
let lastPolishKeySet  = false;
let lastPolishKeyMask = '';
// Desired empty-state placeholder for the current polish provider (Fix 1).
let polishSharedPlaceholder = keyPhUnset();

function applyPolishKeyState(keySet, keyMask) {
  lastPolishKeySet  = !!keySet;
  lastPolishKeyMask = keyMask || '';
  polishKeyClear.hidden = !lastPolishKeySet;
  resetPolishClearConfirm();
  if (polishKeyInput.value) return; // user is typing — leave it alone
  polishKeyInput.placeholder = lastPolishKeySet
    ? (lastPolishKeyMask || '••••••••')
    : polishSharedPlaceholder;
}

function updatePolishToggleVisibility() {
  if (polishKeyInput.value) {
    polishKeyToggle.style.display = '';
  } else {
    polishKeyToggle.style.display = 'none';
    polishKeyInput.type = 'password';
    polishKeyToggle.innerHTML = EYE_OPEN_SVG;
  }
}

/**
 * Render the per-provider fields for the polish tab from the cached config snapshot.
 * If provider === 'local', hide polishCloudFields and show stub.
 */
function renderPolishProvider(provider) {
  if (provider === 'local') {
    polishCloudFields.style.display = 'none';
    polishLocalStub.style.display = '';
    return;
  }
  polishCloudFields.style.display = '';
  polishLocalStub.style.display = 'none';

  // Key label
  polishKeyLabel.textContent = POLISH_PROVIDER_LABELS[provider] || `${provider} API Key`;

  // Apply key state + fill models from cached config
  if (cachedCfg && cachedCfg.polish) {
    const p = cachedCfg.polish;
    if (provider === 'claude') {
      // claude always has its own key slot — use normal unset placeholder
      polishSharedPlaceholder = keyPhUnset();
      applyPolishKeyState(p.hasClaudeKey, p.claudeKeyMask);
    } else {
      // groq / openai / gemini — show override key state; if no override but STT key
      // for same provider is available, surface a "will reuse" placeholder.
      if (p.hasPolishOverride) {
        // has a dedicated polish key — use normal unset placeholder for empty-state restores
        polishSharedPlaceholder = keyPhUnset();
        applyPolishKeyState(true, p.polishKeyMask);
      } else {
        const sharedAvail = p.sharedKeyAvailable && p.sharedKeyAvailable[provider];
        // Fix 4: sharedLabel only needed when sharedAvail
        polishSharedPlaceholder = sharedAvail
          ? window.I18N.t('ph.polishShared').replace('{p}', POLISH_PROVIDER_LABELS[provider].replace(' API Key', ''))
          : keyPhUnset();
        applyPolishKeyState(false, '');
      }
    }
    // Only honor the saved model for the provider it was actually saved under.
    // polish.model is a single value (not per-provider), so switching the
    // dropdown to a different provider must default to that provider's first
    // preset — otherwise e.g. a saved Groq model leaks into OpenAI's custom box.
    const savedModel = (p.provider && provider === p.provider) ? (p.model || '') : '';
    fillPolishModels(provider, savedModel);
  } else {
    polishSharedPlaceholder = keyPhUnset();
    applyPolishKeyState(false, '');
    fillPolishModels(provider, '');
  }
}

polishProvSel.addEventListener('change', () => renderPolishProvider(polishProvSel.value));

// ── Polish style seg custom prompt visibility ────────────────────────────────
// (wired after polishStyleSeg is created, below in seg section)

// ── Polish key helpers ────────────────────────────────────────────────────────
// Two-step confirm state for polish "✕ 清除金鑰" action.
let polishClearConfirm = false;
let polishClearConfirmTimer = null;

function resetPolishClearConfirm() {
  polishClearConfirm = false;
  if (polishClearConfirmTimer) { clearTimeout(polishClearConfirmTimer); polishClearConfirmTimer = null; }
  if (!polishKeyClear.hidden) polishKeyClear.textContent = window.I18N.t('btn.clearKey');
}

polishKeyClear.addEventListener('click', () => {
  if (polishKeyClear.hidden) return;
  if (polishProvSel.value === 'local') return;
  if (!polishClearConfirm) {
    polishClearConfirm = true;
    polishKeyClear.textContent = window.I18N.t('btn.clearKeyConfirm');
    if (polishClearConfirmTimer) clearTimeout(polishClearConfirmTimer);
    polishClearConfirmTimer = setTimeout(resetPolishClearConfirm, 3000);
    return;
  }
  // Second click — actually clear
  resetPolishClearConfirm();
  const which = polishProvSel.value === 'claude' ? 'claude' : 'polish';
  invoke('clear_polish_key', { which })
    .then(() => {
      polishKeyInput.value = '';
      updatePolishToggleVisibility();
      return refreshFromConfig();
    })
    .catch((reason) => {
      console.error('[settings] clear_polish_key failed:', reason);
    });
});

polishKeyToggle.addEventListener('click', () => {
  if (!polishKeyInput.value) return;
  const reveal = polishKeyInput.type === 'password';
  polishKeyInput.type = reveal ? 'text' : 'password';
  polishKeyToggle.innerHTML = reveal ? EYE_OFF_SVG : EYE_OPEN_SVG;
});

polishKeyInput.addEventListener('input', () => {
  if (!polishKeyInput.value) applyPolishKeyState(lastPolishKeySet, lastPolishKeyMask);
  updatePolishToggleVisibility();
});

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

/**
 * Sliding on/off switch. Same { get(), set(v) } contract as makeSeg so the
 * load/save code stays unchanged: get() returns 'on'|'off', set('on'|'off').
 */
function makeSwitch(el, onChange) {
  let on = false;
  function render() {
    if (!el) return;
    el.classList.toggle('on', on);
    el.setAttribute('aria-checked', on ? 'true' : 'false');
  }
  function toggle() { on = !on; render(); if (onChange) onChange(); }
  if (el) {
    el.addEventListener('click', toggle);
    el.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
    });
  }
  return {
    get: () => (on ? 'on' : 'off'),
    set: (v) => { on = v === 'on'; render(); },
  };
}

// inputMode seg (#imSeg, data-im)
const imSeg  = makeSeg(document.getElementById('imSeg'),  'im');
// UI language seg (#langSeg, data-lang) — switches the whole UI live.
const langSeg = makeSeg(document.getElementById('langSeg'), 'lang');
function applyLangLive(lang) {
  window.I18N.setLang(lang === 'en' ? 'en' : 'zh-TW');
  window.I18N.applyI18n(document);
  // Re-render JS-built dynamic strings (model/mic dropdowns + placeholders).
  if (cachedCfg) {
    renderProvider(provSel.value);
    renderPolishProvider(polishProvSel.value);
    fillMicDevices(micSel.value);
  }
}
document.getElementById('langSeg').querySelectorAll('.seg-opt').forEach((o) => {
  const onPick = () => {
    const lang = o.dataset.lang === 'en' ? 'en' : 'zh-TW';
    applyLangLive(lang);
    invoke('save_lang', { lang }).catch((reason) => console.error('[settings] save_lang failed:', reason));
  };
  o.addEventListener('click', onPick);
  o.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onPick(); } });
});
// VAD switch (#vadSeg) — on/off
const vadSeg = makeSwitch(document.getElementById('vadSeg'));
// Polish enabled switch (#polishEnabledSeg) — on/off. Toggling it shows/hides
// the whole polish config block below (#polishFields).
const polishFields = document.getElementById('polishFields');
function syncPolishFields() {
  if (polishFields) polishFields.style.display = polishEnabledSeg.get() === 'on' ? '' : 'none';
}
const polishEnabledSeg = makeSwitch(document.getElementById('polishEnabledSeg'), syncPolishFields);
syncPolishFields(); // initial state: off → hidden
// Polish style seg (#polishStyleSeg, data-pstyle)
const polishStyleSeg   = makeSeg(document.getElementById('polishStyleSeg'),   'pstyle');

// Wire polishStyleSeg change: show/hide the custom-prompt textarea. When the
// user picks 自訂 Prompt, reveal the textarea, scroll it into view, and (on a
// mouse pick) focus it so they can type immediately. makeSeg exposes no
// onChange hook, so per-opt listeners are the established idiom here.
function applyPolishStyle(pstyle, focusInput) {
  const isCustom = pstyle === 'custom';
  polishCustomPrompt.style.display = isCustom ? '' : 'none';
  if (isCustom) {
    polishCustomPrompt.scrollIntoView({ behavior: 'smooth', block: 'end' });
    if (focusInput) polishCustomPrompt.focus({ preventScroll: true });
  }
}
document.getElementById('polishStyleSeg').querySelectorAll('.seg-opt').forEach((o) => {
  o.addEventListener('click', () => applyPolishStyle(o.dataset.pstyle, true));
  o.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      applyPolishStyle(o.dataset.pstyle, false); // makeSeg keeps focus on the option
    }
  });
});

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
  if (!keyClear.hidden) keyClear.textContent = window.I18N.t('btn.clearKey');
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
  keyInput.placeholder = lastKeySet ? (lastKeyMask || '••••••••') : keyPhUnset();
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
  recBtn.textContent = on ? window.I18N.t('btn.recording') : window.I18N.t('btn.record');
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
  if (mods.length === 0) { showErr(window.I18N.t('err.hotkeyNeedMod')); return; }
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

// ── Microphone selection ──────────────────────────────────────────────────────
// Populate #micSel from the OS audio-input devices. Labels require mic
// permission; if unavailable we still list devices by index. Always offer a
// "system default" option whose value is '' (empty = let the OS choose).
async function fillMicDevices(current) {
  if (!micSel) return;
  let devices = [];
  try { devices = await navigator.mediaDevices.enumerateDevices(); } catch { /* ignore */ }
  const mics = devices.filter((d) => d.kind === 'audioinput');
  micSel.innerHTML = '';
  const def = document.createElement('option');
  def.value = '';
  def.textContent = window.I18N.t('mic.default');
  micSel.appendChild(def);
  mics.forEach((d, i) => {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.textContent = d.label || `${window.I18N.t('lbl.mic')} ${i + 1}`;
    micSel.appendChild(opt);
  });
  // Select current if still present; else fall back to system default ('').
  const ids = Array.from(micSel.options).map((o) => o.value);
  micSel.value = (current && ids.includes(current)) ? current : '';
}

// ── Config refresh ────────────────────────────────────────────────────────────
/**
 * Pull authoritative state from the shell. Runs on load AND every time the
 * window regains focus (tray reopen) so state is never stale.
 */
async function refreshFromConfig() {
  try {
    const cfg = await invoke('get_config');
    cachedCfg = cfg;

    // i18n: apply saved UI language first so static markup + the dynamic
    // strings built below all render in the right language.
    window.I18N.setLang((cfg && cfg.lang) || 'zh-TW');
    window.I18N.applyI18n(document);
    langSeg.set((cfg && cfg.lang) === 'en' ? 'en' : 'zh-TW');

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

    // Microphone
    fillMicDevices((cfg && cfg.micDeviceId) || '');

    // zh mode
    currentZh = (cfg && cfg.zhConvert === 'cn') ? 'cn' : 'twp';
    pendingZh  = currentZh;
    renderZh();

    // polish
    if (cfg && cfg.polish) {
      const p = cfg.polish;
      polishEnabledSeg.set(p.enabled ? 'on' : 'off');
      // provider: never set to 'local' (local is never persisted)
      const prov = (p.provider && p.provider !== 'local') ? p.provider : 'groq';
      polishProvSel.value = prov;
      renderPolishProvider(prov);
      polishStyleSeg.set(p.style || 'light');
      polishCustomPrompt.value = p.customPrompt || '';
      polishCustomPrompt.style.display = (p.style === 'custom') ? '' : 'none';
    }
  } catch (e) { console.error('[settings] get_config failed:', e); }
  updateToggleVisibility();
  updatePolishToggleVisibility();
  syncPolishFields();
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
    if (reason === 'parse')  showErr(window.I18N.t('err.hotkeyParse'));
    else if (reason === 'taken') showErr(window.I18N.t('err.hotkeyTaken') + currentSpec);
    else showErr(window.I18N.t('err.hotkeySet') + reason);
    renderCombo(currentSpec);
    pendingSpec = null;
    return; // hotkey failed — don't proceed
  }

  // 2. Provider key / model / baseUrl
  const sel = provSel.value;
  if (sel === 'local') {
    // D4: never persist local; surface info via keyErr transiently
    keyErr.textContent = window.I18N.t('err.localStt');
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
        keyErr.textContent = window.I18N.t('err.key') + reason + window.I18N.t('err.keyRestart');
        keyErr.style.display = 'block';
        return; // keep window open so the error is visible
      }
    }
    // Switch active STT provider if changed
    if (providerSwitching) {
      try {
        await invoke('set_stt_provider', { provider: sel });
      } catch (reason) {
        keyErr.textContent = window.I18N.t('err.sttSwitch') + reason;
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
      showErr(window.I18N.t('err.inputMode') + reason);
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
      showErr(window.I18N.t('err.vad') + reason);
      return;
    }
  }

  // 4b. Microphone: persist the chosen input device (empty = system default).
  try { await invoke('save_mic_device', { deviceId: micSel.value }); }
  catch (reason) { showErr(window.I18N.t('err.mic') + reason); return; }

  // 5. zh mode: apply only if changed
  if (pendingZh !== currentZh) {
    try {
      await invoke('save_zh_mode', { mode: pendingZh });
      currentZh = pendingZh;
    } catch (reason) {
      showErr(window.I18N.t('err.zh') + reason);
      return;
    }
  }

  // 6. polish: skip entirely if provider is 'local' (never persist local)
  if (polishProvSel.value !== 'local') {
    const pStyle = polishStyleSeg.get();
    const pModel = polishModelSel.value === CUSTOM
      ? polishModelCustom.value.trim()
      : polishModelSel.value;
    const pSel = polishProvSel.value;
    // Remember a freshly-typed custom model so it becomes a reusable option next time.
    if (polishModelSel.value === CUSTOM && pModel) addRememberedModel(pSel, pModel);
    try {
      await invoke('save_polish', {
        enabled: polishEnabledSeg.get() === 'on',
        provider: pSel,
        model: pModel,
        style: pStyle,
        customPrompt: polishCustomPrompt.value,
        key: pSel === 'claude' ? '' : polishKeyInput.value,
        claudeKey: pSel === 'claude' ? polishKeyInput.value : '',
      });
      polishKeyInput.value = '';
    } catch (reason) {
      showErr(window.I18N.t('err.polish') + reason);
      return;
    }
  }

  // Per UX: do NOT close after save. Re-sync masked fields to new state.
  await refreshFromConfig();

  // Success feedback on the Save button. MUST run AFTER refreshFromConfig:
  // that call's applyI18n pass rewrites #save's text (data-i18n="btn.save"),
  // which would otherwise instantly clobber the transient "✓ Applied" label
  // and leave only the colour change.
  // (dedup: a rapid 2nd save must not capture the transient as the label)
  if (saveBtn._okTimer) { clearTimeout(saveBtn._okTimer); }
  else { saveBtn._okLabel = saveBtn.textContent; } // original captured once
  saveBtn.classList.add('ok');
  saveBtn.textContent = window.I18N.t('btn.saveOk');
  saveBtn._okTimer = setTimeout(() => {
    saveBtn.classList.remove('ok');
    saveBtn.textContent = saveBtn._okLabel;
    saveBtn._okTimer = null;
  }, 1000);
});

// ── Cancel / dismiss ─────────────────────────────────────────────────────────
function dismiss() {
  pendingSpec = null;
  setArmed(false);
  clearErr();
  renderCombo(currentSpec);
  keyInput.value = '';
  resetClearConfirm();
  polishKeyInput.value = '';
  resetPolishClearConfirm();
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
    keyClear.textContent = window.I18N.t('btn.clearKeyConfirm');
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
      keyErr.textContent = window.I18N.t('err.clearKey') + reason;
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

// ── Microphone hot-plug ───────────────────────────────────────────────────────
// Re-populate the dropdown when devices are added/removed, preserving the
// current selection if it survives.
navigator.mediaDevices.addEventListener('devicechange', () => fillMicDevices(micSel.value));

// ── Initial load ──────────────────────────────────────────────────────────────
refreshFromConfig();
