/*
 * Vocium webview i18n. Plain script (no modules) — loaded by BOTH windows via
 * <script src="i18n.js"></script> BEFORE their respective controllers.
 *
 * Exposes window.I18N = { t, setLang, getLang, applyI18n }.
 *
 *   • setLang(l)        — 'en' or 'zh-TW' (anything else → 'zh-TW').
 *   • getLang()         — current language code.
 *   • t(key)           — localized string; falls back to zh-TW, then the raw key.
 *   • applyI18n(root)  — translate static markup under `root` (default document):
 *       [data-i18n]       → textContent
 *       [data-i18n-ph]    → placeholder attribute
 *       [data-i18n-title] → title attribute
 *       [data-i18n-aria]  → aria-label attribute
 *
 * Brand names (Vocium, Groq, OpenAI, Gemini, Claude) and model ids are NOT
 * translated and intentionally absent from STRINGS where they appear verbatim.
 */
(function () {
  const STRINGS = {
    'zh-TW': {
      // Pill states (app.js VIEW). state.idle is the brand name (same both langs).
      'state.idle': 'Vocium',
      'state.listening': '聆聽中…',
      'state.transcribing': '轉錄中…',
      'state.injecting': '輸入完成',
      'state.error': '發生問題',

      // Pill control titles (index.html)
      'ctl.lock': '鎖定/解除水平拖曳',
      'ctl.min': '縮小到系統匣',
      'ctl.close': '結束 Vocium',
      'orb.title': '點此或按快捷鍵開始／停止',
      'meta.title': '拖曳此處可水平移動',
      // Lock button dynamic titles (app.js applyLockVisual)
      'ctl.lockOn': '點擊解除鎖定',
      'ctl.lockOff': '鎖定水平拖曳',

      // Pre-flight messages (app.js)
      'preflight.noMic': '找不到麥克風 — 請連接音訊輸入裝置',
      'preflight.permDenied': '已拒絕 — 請至系統設定授予',

      // Settings tabs
      'tab.general': '一般',
      'tab.stt': '語音轉文字',
      'tab.polish': 'AI 潤稿',

      // Settings general
      'lbl.lang': '介面語言',
      'lbl.hotkey': '全域快捷鍵',
      'btn.record': '錄製',
      'btn.recording': '● 錄製中…',
      'lbl.mic': '麥克風',
      'mic.default': '系統預設',
      'lbl.inputMode': '輸入模式',
      'seg.toggle': '切換',
      'seg.ptt': '按住說',
      'lbl.vad': '靜音修剪（VAD）',
      'lbl.zh': '中文輸出（中文字繁／簡）',
      'seg.twp': '繁體（台灣）',
      'seg.cn': '簡體',

      // Settings STT
      'lbl.sttProvider': 'STT 來源',
      'opt.local': '本地',
      'lbl.apiKey': 'API Key',
      'ph.key': '貼上金鑰後按儲存',
      'aria.keyToggle': '顯示或隱藏金鑰',
      'title.keyToggle': '顯示/隱藏',
      'btn.clearKey': '✕ 清除金鑰',
      'btn.clearKeyConfirm': '✕ 再按一次確認清除',
      'lbl.model': '模型',
      'opt.modelCustom': '自訂…',
      'ph.modelId': '輸入 model id',
      'lbl.baseUrl': 'Base URL（選填）',
      'lbl.localStt': '本地語音轉文字',
      'stub.localStt': '本地 STT 即將推出，請先選擇雲端來源（Groq / OpenAI / Gemini）。',
      'stub.localSttKeep': '目前啟用來源不變。',

      // Settings polish
      'lbl.polishEnable': '啟用 AI 潤稿',
      'lbl.polishProvider': '來源',
      'lbl.polishStyle': '風格',
      'seg.styleLight': '基礎校正',
      'seg.styleFull': '話語潤飾',
      'seg.styleCustom': '自訂 Prompt',
      'ph.customPrompt': '自訂潤稿指令（保留原意與原語言）',
      'btn.deleteModel': '✕ 刪除此自訂模型',
      'lbl.localPolish': '本地 AI 潤稿',
      'stub.localPolish': '本地 AI 潤稿即將推出，請先選擇雲端來源（Groq / OpenAI / Gemini / Claude）。',

      // Settings footer
      'btn.cancel': '取消',
      'btn.save': '儲存並套用',
      'btn.saveOk': '✓ 已套用',

      // Dynamic error / notice strings (settings.js)
      'err.hotkeyParse': '組合無效：需修飾鍵＋主鍵',
      'err.hotkeyTaken': '此組合已被占用，仍保留原快捷鍵 ',
      'err.hotkeySet': '設定失敗：',
      'err.hotkeyNeedMod': '需含至少一個修飾鍵（Ctrl/Shift/Alt/Win）＋一個主鍵',
      'err.localStt': '本地 STT 尚未推出，啟用來源未變更',
      'err.key': '金鑰套用失敗：',
      'err.keyRestart': '（請重啟程式）',
      'err.sttSwitch': '切換 STT 來源失敗：',
      'err.inputMode': '輸入模式套用失敗：',
      'err.vad': 'VAD 設定套用失敗：',
      'err.mic': '麥克風設定套用失敗：',
      'err.zh': '中文輸出套用失敗：',
      'err.polish': 'AI 潤稿設定套用失敗：',
      'err.clearKey': '清除金鑰失敗：',
      // sharedKey "will reuse" placeholder (settings.js renderPolishProvider).
      // {p} is the provider display name (Groq/OpenAI/Gemini).
      'ph.polishShared': '沿用語音轉文字的 {p} 金鑰（留空＝沿用）',
    },
    'en': {
      // Pill states
      'state.idle': 'Vocium',
      'state.listening': 'Listening…',
      'state.transcribing': 'Transcribing…',
      'state.injecting': 'Inserted',
      'state.error': 'Something went wrong',

      // Pill control titles
      'ctl.lock': 'Lock/unlock horizontal drag',
      'ctl.min': 'Minimize to tray',
      'ctl.close': 'Quit Vocium',
      'orb.title': 'Click or press the hotkey to start/stop',
      'meta.title': 'Drag here to move horizontally',
      'ctl.lockOn': 'Click to unlock',
      'ctl.lockOff': 'Lock horizontal drag',

      // Pre-flight messages
      'preflight.noMic': 'No microphone found — connect an audio input device',
      'preflight.permDenied': 'Denied — grant access in System Settings',

      // Settings tabs
      'tab.general': 'General',
      'tab.stt': 'Speech-to-Text',
      'tab.polish': 'AI Polish',

      // Settings general
      'lbl.lang': 'Language',
      'lbl.hotkey': 'Global hotkey',
      'btn.record': 'Record',
      'btn.recording': '● Recording…',
      'lbl.mic': 'Microphone',
      'mic.default': 'System default',
      'lbl.inputMode': 'Input mode',
      'seg.toggle': 'Toggle',
      'seg.ptt': 'Push-to-talk',
      'lbl.vad': 'Silence trimming (VAD)',
      'lbl.zh': 'Chinese output (Traditional/Simplified)',
      'seg.twp': 'Traditional',
      'seg.cn': 'Simplified',

      // Settings STT
      'lbl.sttProvider': 'STT provider',
      'opt.local': 'Local',
      'lbl.apiKey': 'API Key',
      'ph.key': 'Paste your key, then Save',
      'aria.keyToggle': 'Show or hide key',
      'title.keyToggle': 'Show/hide',
      'btn.clearKey': '✕ Clear key',
      'btn.clearKeyConfirm': '✕ Click again to confirm',
      'lbl.model': 'Model',
      'opt.modelCustom': 'Custom…',
      'ph.modelId': 'Enter model id',
      'lbl.baseUrl': 'Base URL (optional)',
      'lbl.localStt': 'Local Speech-to-Text',
      'stub.localStt': 'Local STT is coming soon — pick a cloud provider (Groq / OpenAI / Gemini) for now.',
      'stub.localSttKeep': 'Your active provider is unchanged.',

      // Settings polish
      'lbl.polishEnable': 'Enable AI polish',
      'lbl.polishProvider': 'Provider',
      'lbl.polishStyle': 'Style',
      'seg.styleLight': 'Basic correction',
      'seg.styleFull': 'Speech polishing',
      'seg.styleCustom': 'Custom prompt',
      'ph.customPrompt': 'Custom polish instruction (preserve meaning & language)',
      'btn.deleteModel': '✕ Delete this custom model',
      'lbl.localPolish': 'Local AI polish',
      'stub.localPolish': 'Local AI polish is coming soon — pick a cloud provider (Groq / OpenAI / Gemini / Claude) for now.',

      // Settings footer
      'btn.cancel': 'Cancel',
      'btn.save': 'Save & apply',
      'btn.saveOk': '✓ Applied',

      // Dynamic error / notice strings
      'err.hotkeyParse': 'Invalid combo: a modifier + main key is required',
      'err.hotkeyTaken': 'That combo is already in use; keeping the current hotkey ',
      'err.hotkeySet': 'Failed to set: ',
      'err.hotkeyNeedMod': 'Needs at least one modifier (Ctrl/Shift/Alt/Win) + one main key',
      'err.localStt': 'Local STT is not available yet; the active provider is unchanged',
      'err.key': 'Failed to apply key: ',
      'err.keyRestart': ' (please restart the app)',
      'err.sttSwitch': 'Failed to switch STT provider: ',
      'err.inputMode': 'Failed to apply input mode: ',
      'err.vad': 'Failed to apply VAD setting: ',
      'err.mic': 'Failed to apply microphone setting: ',
      'err.zh': 'Failed to apply Chinese output: ',
      'err.polish': 'Failed to apply AI polish setting: ',
      'err.clearKey': 'Failed to clear key: ',
      'ph.polishShared': 'Reuse the Speech-to-Text {p} key (leave blank = reuse)',
    },
  };

  let LANG = 'zh-TW';

  function setLang(l) { LANG = l === 'en' ? 'en' : 'zh-TW'; }
  function getLang() { return LANG; }

  function t(key) {
    const s = STRINGS[LANG] || STRINGS['zh-TW'];
    return (s && s[key] != null)
      ? s[key]
      : (STRINGS['zh-TW'][key] != null ? STRINGS['zh-TW'][key] : key);
  }

  // Translate static markup. data-i18n=textContent, data-i18n-ph=placeholder,
  // data-i18n-title=title, data-i18n-aria=aria-label.
  function applyI18n(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    root.querySelectorAll('[data-i18n-ph]').forEach((el) => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
    root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
  }

  window.I18N = { t, setLang, getLang, applyI18n };
})();
