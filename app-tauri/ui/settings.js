const { invoke } = window.__TAURI__.core;
const { getCurrentWindow } = window.__TAURI__.window;

const comboEl = document.getElementById('combo');
const recBtn = document.getElementById('rec');
const saveBtn = document.getElementById('save');
const cancelBtn = document.getElementById('cancel');
const closeX = document.getElementById('sClose');
const hintEl = document.getElementById('hint');
const errEl = document.getElementById('err');

const DEFAULT_HINT = '目前綁定。點「錄製快捷鍵」後按下想要的組合即可變更。';

let currentSpec = 'Ctrl+Shift+Space'; // authoritative (from config); kept on failure
let pendingSpec = null;               // recorded but unsaved
let armed = false;

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

function renderCombo(spec) {
  comboEl.innerHTML = '';
  spec.split('+').forEach((part) => {
    const s = document.createElement('span');
    s.className = 'keycap';
    s.textContent = part;
    comboEl.appendChild(s);
  });
}
function showErr(msg) { errEl.textContent = msg; errEl.style.display = 'block'; }
function clearErr() { errEl.style.display = 'none'; }

function setArmed(on) {
  armed = on;
  recBtn.classList.toggle('armed', on);
  recBtn.textContent = on ? '● 錄製中（按組合，Esc 取消）' : '重新錄製';
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
  renderCombo(pendingSpec);
  setArmed(false);
});

recBtn.addEventListener('click', () => { clearErr(); setArmed(true); });

saveBtn.addEventListener('click', async () => {
  const spec = pendingSpec || currentSpec;
  try {
    const r = await invoke('set_hotkey', { spec });
    if (r && r.ok) {
      currentSpec = r.hotkey;
      pendingSpec = null;
      clearErr();
      hintEl.textContent = '已套用，立即生效。';
      await getCurrentWindow().hide();
    }
  } catch (reason) {
    if (reason === 'parse') showErr('組合無效：需修飾鍵＋主鍵');
    else if (reason === 'taken') showErr(`此組合已被占用，仍保留原快捷鍵 ${currentSpec}`);
    else showErr(`設定失敗：${reason}`);
    renderCombo(currentSpec); // revert preview to what is actually active
    pendingSpec = null;
  }
});

function dismiss() {
  pendingSpec = null;
  setArmed(false);
  clearErr();
  hintEl.textContent = DEFAULT_HINT;
  renderCombo(currentSpec);
  getCurrentWindow().hide();
}
cancelBtn.addEventListener('click', dismiss);
closeX.addEventListener('click', dismiss);

(async () => {
  try {
    const cfg = await invoke('get_config');
    if (cfg && cfg.hotkey) currentSpec = cfg.hotkey;
  } catch (_) {}
  renderCombo(currentSpec);
})();

// On regaining focus (tray reopen / OS dismiss), clear stale ARMED + error + hint UI.
// Keep a recorded-but-unsaved pendingSpec so user can resume mid-flow after alt-tab.
getCurrentWindow().onFocusChanged(({ payload: focused }) => {
  if (!focused) return;
  if (armed) setArmed(false);
  clearErr();
  if (!pendingSpec) hintEl.textContent = DEFAULT_HINT;
  renderCombo(pendingSpec || currentSpec);
});
