//! Vocium Tauri 2 shell — thin MCP client over the Node sidecar.
//!
//! Responsibilities (FR-WIN / FR-TRG / FR-TRY):
//!  - Spawn `node dist/sidecar/index.js` and speak MCP over its stdio (see mcp.rs).
//!  - Position the frameless, transparent, always-on-top icon window at the
//!    top-center of the primary monitor work area + iconOffsetX, then show it.
//!  - Windows: apply WS_EX_NOACTIVATE so clicking/pasting never steals focus
//!    from the user's app (paste lands where the user is typing).
//!  - Global shortcut Ctrl+Shift+Space -> MCP `toggle`; registration failure ->
//!    tray warning, never panic.
//!  - System tray menu + state-following tooltip.
//!  - Relay sidecar `state_changed` notification -> `state` event to webview.
//!
//! Recording is webview-driven (the real sidecar emits NO request_*_capture):
//! the webview reacts to `state` transitions itself (see app.js).

mod mcp;

use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, PhysicalPosition, Wry,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use mcp::{LogFn, McpClient};

/// Shared app state: the MCP client handle once the sidecar is up.
struct ShellState {
    client: Mutex<Option<Arc<McpClient>>>,
    hotkey_ok: Mutex<bool>,
    /// The currently-registered global toggle shortcut (for runtime re-binding).
    shortcut: Mutex<Option<Shortcut>>,
    /// The tray "快捷鍵：…" menu item so set_hotkey can refresh its label live.
    hk_item: Mutex<Option<MenuItem<Wry>>>,
    /// The tray "STT：…" menu item so set_groq_key can refresh its label live.
    stt_item: Mutex<Option<MenuItem<Wry>>>,
    /// True while the global toggle hotkey is temporarily unregistered
    /// (the user is recording a new combo in Settings).
    hotkey_suspended: Mutex<bool>,
    config: VociumConfig,
    /// Diagnostic sink (-> %APPDATA%/vocium/logs/shell.log). The GUI process
    /// has no console (CREATE_NO_WINDOW) so eprintln! is invisible; everything
    /// worth seeing goes here.
    log: LogFn,
}

/// Append-only logger to `<config_dir>/logs/shell.log` with epoch-ms prefixes
/// so timestamps across the shell and the MCP reader thread are comparable.
fn make_logger(config_dir: &std::path::Path) -> LogFn {
    let dir = config_dir.join("logs");
    let _ = std::fs::create_dir_all(&dir);
    let file = Mutex::new(
        std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(dir.join("shell.log"))
            .ok(),
    );
    Arc::new(move |msg: &str| {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        if let Ok(mut g) = file.lock() {
            if let Some(f) = g.as_mut() {
                use std::io::Write;
                let _ = writeln!(f, "{ts} {msg}");
                let _ = f.flush();
            }
        }
    })
}

#[derive(Clone)]
struct VociumConfig {
    hotkey: String,
    stt_provider: String, // resolved label: "groq" | "mock"
    icon_offset_x: i32,
    drag_locked: bool,
    config_dir: PathBuf,
}

fn config_dir() -> PathBuf {
    // Mirrors src/sidecar/index.ts configDir(): %APPDATA%/vocium on Windows.
    if let Ok(appdata) = std::env::var("APPDATA") {
        PathBuf::from(appdata).join("vocium")
    } else if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home).join(".config").join("vocium")
    } else {
        PathBuf::from(".").join("vocium")
    }
}

/// Read the SAME config file the sidecar uses. Best-effort: never panics; if the
/// file is missing/broken we fall back to defaults (sidecar will create it).
fn read_config() -> VociumConfig {
    let dir = config_dir();
    let file = dir.join("vocium-config.json");
    let mut hotkey = "Ctrl+Shift+Space".to_string();
    let mut provider_cfg = "groq".to_string();
    let mut groq_key = String::new();
    let mut icon_offset_x = 0i32;
    let mut drag_locked = false;

    if let Ok(raw) = std::fs::read_to_string(&file) {
        if let Ok(v) = serde_json::from_str::<Value>(&raw) {
            if let Some(h) = v.get("hotkey").and_then(|x| x.as_str()) {
                hotkey = h.to_string();
            }
            if let Some(p) = v.get("sttProvider").and_then(|x| x.as_str()) {
                provider_cfg = p.to_string();
            }
            if let Some(k) = v.get("groqApiKey").and_then(|x| x.as_str()) {
                groq_key = k.to_string();
            }
            if let Some(o) = v.get("iconOffsetX").and_then(|x| x.as_i64()) {
                icon_offset_x = o as i32;
            }
            if let Some(d) = v.get("dragLocked").and_then(|x| x.as_bool()) {
                drag_locked = d;
            }
        }
    }

    // Effective STT mode mirrors createSttAdapter(): groq only if key present.
    let stt_provider = if provider_cfg == "groq" && !groq_key.trim().is_empty() {
        "groq".to_string()
    } else {
        "mock".to_string()
    };

    VociumConfig {
        hotkey,
        stt_provider,
        icon_offset_x,
        drag_locked,
        config_dir: dir,
    }
}

/// Parse a config hotkey like "Ctrl+Shift+Space" into a Tauri Shortcut.
fn parse_shortcut(spec: &str) -> Option<Shortcut> {
    let mut mods = Modifiers::empty();
    let mut code: Option<Code> = None;
    for part in spec.split('+') {
        match part.trim().to_ascii_lowercase().as_str() {
            "ctrl" | "control" => mods |= Modifiers::CONTROL,
            "shift" => mods |= Modifiers::SHIFT,
            "alt" => mods |= Modifiers::ALT,
            "super" | "cmd" | "win" | "meta" => mods |= Modifiers::SUPER,
            "space" => code = Some(Code::Space),
            "enter" => code = Some(Code::Enter),
            "up" | "arrowup" => code = Some(Code::ArrowUp),
            "down" | "arrowdown" => code = Some(Code::ArrowDown),
            "left" | "arrowleft" => code = Some(Code::ArrowLeft),
            "right" | "arrowright" => code = Some(Code::ArrowRight),
            "f1" => code = Some(Code::F1), "f2" => code = Some(Code::F2),
            "f3" => code = Some(Code::F3), "f4" => code = Some(Code::F4),
            "f5" => code = Some(Code::F5), "f6" => code = Some(Code::F6),
            "f7" => code = Some(Code::F7), "f8" => code = Some(Code::F8),
            "f9" => code = Some(Code::F9), "f10" => code = Some(Code::F10),
            "f11" => code = Some(Code::F11), "f12" => code = Some(Code::F12),
            "0" => code = Some(Code::Digit0), "1" => code = Some(Code::Digit1),
            "2" => code = Some(Code::Digit2), "3" => code = Some(Code::Digit3),
            "4" => code = Some(Code::Digit4), "5" => code = Some(Code::Digit5),
            "6" => code = Some(Code::Digit6), "7" => code = Some(Code::Digit7),
            "8" => code = Some(Code::Digit8), "9" => code = Some(Code::Digit9),
            other if other.len() == 1 && other.chars().next().unwrap().is_ascii_alphabetic() => {
                code = match other {
                    "a" => Some(Code::KeyA), "b" => Some(Code::KeyB), "c" => Some(Code::KeyC),
                    "d" => Some(Code::KeyD), "e" => Some(Code::KeyE), "f" => Some(Code::KeyF),
                    "g" => Some(Code::KeyG), "h" => Some(Code::KeyH), "i" => Some(Code::KeyI),
                    "j" => Some(Code::KeyJ), "k" => Some(Code::KeyK), "l" => Some(Code::KeyL),
                    "m" => Some(Code::KeyM), "n" => Some(Code::KeyN), "o" => Some(Code::KeyO),
                    "p" => Some(Code::KeyP), "q" => Some(Code::KeyQ), "r" => Some(Code::KeyR),
                    "s" => Some(Code::KeyS), "t" => Some(Code::KeyT), "u" => Some(Code::KeyU),
                    "v" => Some(Code::KeyV), "w" => Some(Code::KeyW), "x" => Some(Code::KeyX),
                    "y" => Some(Code::KeyY), "z" => Some(Code::KeyZ),
                    _ => None,
                };
            }
            _ => {}
        }
    }
    code.map(|c| Shortcut::new(Some(mods), c))
}

/// (Re)register the global toggle hotkey at runtime. Unregisters the previously
/// stored shortcut first. Err("parse") if spec invalid; Err("taken") if the OS
/// refuses (already in use). On success the new Shortcut is stored in state.
/// Register the OS-level toggle shortcut with its Pressed handler. Shared by
/// apply_hotkey (new binding) and resume_hotkey (re-arm after recording).
fn register_toggle_shortcut(app: &AppHandle, sc: Shortcut) -> Result<(), String> {
    let h = app.clone();
    app.global_shortcut()
        .on_shortcut(sc, move |_a, _s, ev| {
            if ev.state == ShortcutState::Pressed {
                let hh = h.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = invoke_tool(hh, "toggle", json!({})).await;
                });
            }
        })
        .map_err(|_| "taken".to_string())
}

fn apply_hotkey(app: &AppHandle, spec: &str) -> Result<(), String> {
    let sc = parse_shortcut(spec).ok_or_else(|| "parse".to_string())?;
    // No-op if unchanged (avoids the same-key re-register edge).
    if app.state::<ShellState>().shortcut.lock().unwrap().as_ref() == Some(&sc) {
        return Ok(());
    }
    register_toggle_shortcut(app, sc)?;
    // New binding is live — now safe to drop the previous one.
    if let Some(old) = app.state::<ShellState>().shortcut.lock().unwrap().take() {
        let _ = app.global_shortcut().unregister(old);
    }
    *app.state::<ShellState>().shortcut.lock().unwrap() = Some(sc);
    // A concrete hotkey is now active again.
    *app.state::<ShellState>().hotkey_suspended.lock().unwrap() = false;
    Ok(())
}

/// Unregister the global toggle hotkey without forgetting it (idempotent).
/// Used while the user records a new combo so pressing the current hotkey
/// doesn't trigger Vocium.
fn suspend_hotkey(app: &AppHandle) {
    let st = app.state::<ShellState>();
    let mut suspended = st.hotkey_suspended.lock().unwrap();
    if *suspended {
        return;
    }
    if let Some(sc) = *st.shortcut.lock().unwrap() {
        let _ = app.global_shortcut().unregister(sc);
    }
    *suspended = true;
}

/// Re-register the stored toggle hotkey if it was suspended (idempotent).
fn resume_hotkey(app: &AppHandle) {
    let st = app.state::<ShellState>();
    let mut suspended = st.hotkey_suspended.lock().unwrap();
    if !*suspended {
        return;
    }
    let sc = *st.shortcut.lock().unwrap();
    if let Some(sc) = sc {
        let _ = register_toggle_shortcut(app, sc);
    }
    *suspended = false;
}

/// Settings recorder calls this: enabled=false while recording (suspend),
/// enabled=true when recording ends (resume).
#[tauri::command]
fn set_hotkey_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    if enabled {
        resume_hotkey(&app);
    } else {
        suspend_hotkey(&app);
    }
    Ok(())
}

/// Locate the built sidecar entry: app-tauri/src-tauri/../../dist/sidecar/index.js
fn sidecar_entry() -> PathBuf {
    // CARGO_MANIFEST_DIR = .../app-tauri/src-tauri at build; at runtime resolve
    // relative to the current exe's project root, with a dev fallback.
    if let Ok(manifest) = std::env::var("CARGO_MANIFEST_DIR") {
        let p = PathBuf::from(&manifest)
            .join("..")
            .join("..")
            .join("dist")
            .join("sidecar")
            .join("index.js");
        if p.exists() {
            return p;
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        // Walk up looking for dist/sidecar/index.js (handles bundled layouts).
        let mut cur = exe.parent().map(|p| p.to_path_buf());
        while let Some(dir) = cur {
            let cand = dir.join("dist").join("sidecar").join("index.js");
            if cand.exists() {
                return cand;
            }
            cur = dir.parent().map(|p| p.to_path_buf());
        }
    }
    PathBuf::from("dist/sidecar/index.js")
}

fn spawn_sidecar(
    app: &AppHandle,
    log: LogFn,
    logs_dir: &std::path::Path,
) -> Result<Arc<McpClient>, String> {
    let entry = sidecar_entry();
    log(&format!("[spawn] node entry = {}", entry.display()));
    if !entry.exists() {
        log("[spawn] WARNING: sidecar entry does not exist — run `npm run build`");
    }

    // Route sidecar stderr to a file. Previously Stdio::inherit() into a
    // CREATE_NO_WINDOW GUI process silently discarded every sidecar crash/log,
    // which is why a dead/erroring sidecar looked like an unexplained 30s hang.
    let _ = std::fs::create_dir_all(logs_dir);
    let stderr = match std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(logs_dir.join("sidecar.log"))
    {
        Ok(f) => Stdio::from(f),
        Err(e) => {
            log(&format!("[spawn] could not open sidecar.log ({e}); stderr -> null"));
            Stdio::null()
        }
    };

    let mut cmd = Command::new("node");
    cmd.arg(&entry)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(stderr);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW so the spawned node has no console flash.
        cmd.creation_flags(0x0800_0000);
    }
    let child = cmd.spawn().map_err(|e| {
        log(&format!("[spawn] failed to spawn node: {e}"));
        format!("failed to spawn sidecar `node {}`: {e}", entry.display())
    })?;
    log(&format!("[spawn] node started (pid={})", child.id()));

    let app_handle = app.clone();
    let listener = Arc::new(move |state: String, prev: String| {
        // Relay to webview as the `state` event (app.js drives recording from this).
        let _ = app_handle.emit("state", json!({ "state": state, "prev": prev }));
        update_tray_tooltip(&app_handle, &state);
    });

    McpClient::spawn(child, listener, log)
}

fn update_tray_tooltip(app: &AppHandle, state: &str) {
    let label = match state {
        "idle" => "Vocium — 待命",
        "listening" => "Vocium — 聆聽中…",
        "transcribing" => "Vocium — 轉錄中…",
        "injecting" => "Vocium — 輸入完成",
        "error" => "Vocium — 發生問題",
        _ => "Vocium",
    };
    if let Some(tray) = app.tray_by_id("vocium-tray") {
        let _ = tray.set_tooltip(Some(label));
    }
}

// ---- Window placement -------------------------------------------------------

fn position_icon_window(app: &AppHandle, offset_x: i32) {
    let Some(win) = app.get_webview_window("icon") else {
        return;
    };
    // Primary monitor work area (excludes taskbar where the platform reports it).
    let monitor = win
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| win.current_monitor().ok().flatten());

    if let Some(m) = monitor {
        let size = m.size();
        let pos = m.position();
        let win_w = win.outer_size().map(|s| s.width as i32).unwrap_or(220);
        let x = pos.x + ((size.width as i32 - win_w) / 2) + offset_x;
        // 待實機驗證: uses monitor top; true Windows work area (SPI_GETWORKAREA) deferred — see ROADMAP
        let y = pos.y + 8; // work.y + 8 per FR-WIN-3
        let _ = win.set_position(PhysicalPosition::new(x, y));
    }
    let _ = win.set_always_on_top(true);

    #[cfg(windows)]
    apply_no_activate(&win);

    let _ = win.show();
}

/// Windows: add WS_EX_NOACTIVATE so the icon window never takes focus, ensuring
/// pasted text lands in whatever app the user was typing in (FR-WIN-4).
#[cfg(windows)]
fn apply_no_activate(win: &tauri::WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    };
    if let Ok(handle) = win.hwnd() {
        let hwnd = HWND(handle.0 as *mut _);
        unsafe {
            let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            let new_ex =
                ex | (WS_EX_NOACTIVATE.0 as isize) | (WS_EX_TOOLWINDOW.0 as isize);
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_ex);
        }
    }
}

// ---- Tauri commands (webview -> shell -> sidecar) ---------------------------

/// Run an MCP tool call OFF Tauri's main thread.
///
/// The blocking stdio round-trip (`McpClient::call_tool` -> `rx.recv_timeout`)
/// MUST NOT run on a synchronous `#[tauri::command] fn` — Tauri executes those
/// on the windowing/event-loop thread, so any latency (or a 30s timeout from a
/// dropped response) froze the whole webview and Windows ghosted the window.
/// Every command is now `async` and the blocking call is moved onto the
/// blocking pool via `spawn_blocking`, keeping the UI thread free to animate.
async fn invoke_tool(
    app: AppHandle,
    name: &'static str,
    args: Value,
) -> Result<Value, String> {
    // Clone the Arc out under the lock, then DROP the std MutexGuard before any
    // await (a guard is not Send across await points).
    let (client, log) = {
        let state = app.state::<ShellState>();
        let client = state.client.lock().unwrap().as_ref().cloned();
        (client, state.log.clone())
    };
    let Some(client) = client else {
        log(&format!("[cmd] {name} rejected: sidecar not connected"));
        return Err("sidecar not connected".into());
    };
    log(&format!("[cmd] {name} dispatched -> spawn_blocking"));
    tauri::async_runtime::spawn_blocking(move || client.call_tool(name, args))
        .await
        .map_err(|e| format!("sidecar task join error: {e}"))?
}

#[tauri::command]
async fn toggle(app: AppHandle) -> Result<Value, String> {
    invoke_tool(app, "toggle", json!({})).await
}

#[tauri::command]
async fn cancel(app: AppHandle) -> Result<Value, String> {
    invoke_tool(app, "cancel", json!({})).await
}

#[tauri::command]
async fn get_state(app: AppHandle) -> Result<Value, String> {
    invoke_tool(app, "get_state", json!({})).await
}

#[tauri::command]
async fn submit_audio(
    app: AppHandle,
    audio_base64: String,
    mime_type: String,
) -> Result<Value, String> {
    invoke_tool(
        app,
        "submit_audio",
        json!({ "audioBase64": audio_base64, "mimeType": mime_type }),
    )
    .await
}

/// Audio failure path. The real sidecar exposes NO `report_audio_error` tool,
/// so we drive the machine back via the real `cancel` tool and let app.js show
/// the visual error. We do NOT invent a new sidecar tool (per Task 8 scope).
#[tauri::command]
async fn audio_error(app: AppHandle, message: String) -> Result<Value, String> {
    {
        let state = app.state::<ShellState>();
        (state.log)(&format!("[cmd] webview audio error: {message}"));
    }
    invoke_tool(app, "cancel", json!({})).await
}

/// Read-modify-write a single key into vocium-config.json. Never destroys a
/// corrupt/missing file's recoverable content (falls back to a fresh object).
fn patch_config(dir: &std::path::Path, key: &str, val: Value) -> Result<(), String> {
    let file = dir.join("vocium-config.json");
    let mut obj: Value = std::fs::read_to_string(&file)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| json!({}));
    if !obj.is_object() {
        obj = json!({});
    }
    obj[key] = val;
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    std::fs::write(
        &file,
        serde_json::to_string_pretty(&obj).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

/// Expose shell-config-derived values (effective STT provider, hotkey, drag
/// lock state) to the webview. Shell-config-derived only — NOT a sidecar tool.
#[tauri::command]
fn get_config(app: AppHandle) -> Result<Value, String> {
    let s = app.state::<ShellState>();
    // hotkey/dragLocked/groqApiKey can change at runtime via the settings
    // commands, so read them live from the file the commands write.
    let file = s.config.config_dir.join("vocium-config.json");
    let (mut hotkey, mut drag_locked) = (s.config.hotkey.clone(), s.config.drag_locked);
    let (mut provider_cfg, mut groq_key) = ("groq".to_string(), String::new());
    let mut zh_convert = "twp".to_string();
    if let Ok(raw) = std::fs::read_to_string(&file) {
        if let Ok(v) = serde_json::from_str::<Value>(&raw) {
            if let Some(h) = v.get("hotkey").and_then(|x| x.as_str()) {
                hotkey = h.to_string();
            }
            if let Some(d) = v.get("dragLocked").and_then(|x| x.as_bool()) {
                drag_locked = d;
            }
            if let Some(p) = v.get("sttProvider").and_then(|x| x.as_str()) {
                provider_cfg = p.to_string();
            }
            if let Some(k) = v.get("groqApiKey").and_then(|x| x.as_str()) {
                groq_key = k.to_string();
            }
            if let Some(z) = v.get("zhConvert").and_then(|x| x.as_str()) {
                if z == "twp" || z == "cn" { zh_convert = z.to_string(); }
            }
        }
    }
    let groq_key_trimmed = groq_key.trim();
    let groq_key_set = !groq_key_trimmed.is_empty();
    // Industry-standard preview: first 4 + ••• + last 4. NEVER the full key.
    // (Groq keys are ~56 chars; first 4 is the constant `gsk_` prefix, last 4
    // is the only mild exposure — standard dashboard practice.)
    let groq_key_mask = if groq_key_set {
        let chars: Vec<char> = groq_key_trimmed.chars().collect();
        if chars.len() > 8 {
            let first: String = chars[..4].iter().collect();
            let last: String = chars[chars.len() - 4..].iter().collect();
            format!("{first}•••{last}")
        } else {
            "•".repeat(8) // too short to safely reveal edges
        }
    } else {
        String::new()
    };
    let stt_provider = if provider_cfg == "groq" && groq_key_set { "groq" } else { "mock" };
    Ok(json!({
        "sttProvider": stt_provider,
        "hotkey": hotkey,
        "dragLocked": drag_locked,
        "groqKeySet": groq_key_set,
        "groqKeyMask": groq_key_mask,
        "zhConvert": zh_convert
    }))
}

/// Persist the drag-lock toggle into the shared config file.
#[tauri::command]
fn save_drag_locked(app: AppHandle, locked: bool) -> Result<(), String> {
    let dir = app.state::<ShellState>().config.config_dir.clone();
    patch_config(&dir, "dragLocked", json!(locked))
}

/// Persist the zh-convert mode ('twp'|'cn'). No sidecar restart — the sidecar
/// re-reads it per transcription (read-only readZhMode). Invalid input is
/// rejected so the config never holds a bad value.
#[tauri::command]
fn save_zh_mode(app: AppHandle, mode: String) -> Result<(), String> {
    if mode != "twp" && mode != "cn" {
        return Err(format!("invalid zh mode: {mode}"));
    }
    let dir = app.state::<ShellState>().config.config_dir.clone();
    patch_config(&dir, "zhConvert", json!(mode))
}

/// Kill the sidecar child so no orphan node process remains after exit.
fn shutdown_sidecar(app: &AppHandle) {
    if let Some(c) = app.state::<ShellState>().client.lock().unwrap().as_ref() {
        c.shutdown();
    }
}

/// Quit the whole app: kill the sidecar child first so no orphan node remains.
#[tauri::command]
fn quit_app(app: AppHandle) {
    shutdown_sidecar(&app);
    app.exit(0);
}

/// Re-bind the global hotkey at runtime, persist it, and refresh the tray label.
#[tauri::command]
fn set_hotkey(app: AppHandle, spec: String) -> Result<Value, String> {
    apply_hotkey(&app, &spec)?;
    let dir = app.state::<ShellState>().config.config_dir.clone();
    patch_config(&dir, "hotkey", json!(spec))?;
    if let Some(item) = app.state::<ShellState>().hk_item.lock().unwrap().as_ref() {
        let _ = item.set_text(format!("快捷鍵：{spec}"));
    }
    Ok(json!({ "ok": true, "hotkey": spec }))
}

/// Persist the Groq API key, restart the sidecar so it rebuilds its STT
/// adapter with the new key, and refresh the tray "STT：…" label.
#[tauri::command]
async fn set_groq_key(app: AppHandle, key: String) -> Result<Value, String> {
    let (dir, log) = {
        let s = app.state::<ShellState>();
        (s.config.config_dir.clone(), s.log.clone())
    };
    patch_config(&dir, "groqApiKey", json!(key))?;

    // Restart sidecar via the same spawn/connect path used at boot so the
    // adapter is rebuilt from the new key. Old child is killed first.
    shutdown_sidecar(&app);
    let logs_dir = dir.join("logs");
    let new_client = match spawn_sidecar(&app, log.clone(), &logs_dir) {
        Ok(c) => c,
        Err(e) => {
            log(&format!("[set_groq_key] sidecar restart failed: {e}"));
            // Old child was killed; clear the client so invoke_tool fast-fails
            // ("sidecar not connected") instead of 30s-hanging on a dead Arc.
            *app.state::<ShellState>().client.lock().unwrap() = None;
            return Err(e);
        }
    };
    *app.state::<ShellState>().client.lock().unwrap() = Some(new_client);

    // Re-derive effective provider from the file we just wrote.
    let file = dir.join("vocium-config.json");
    let mut provider_cfg = "groq".to_string();
    let mut groq_key = String::new();
    if let Ok(raw) = std::fs::read_to_string(&file) {
        if let Ok(v) = serde_json::from_str::<Value>(&raw) {
            if let Some(p) = v.get("sttProvider").and_then(|x| x.as_str()) {
                provider_cfg = p.to_string();
            }
            if let Some(k) = v.get("groqApiKey").and_then(|x| x.as_str()) {
                groq_key = k.to_string();
            }
        }
    }
    let stt_provider = if provider_cfg == "groq" && !groq_key.trim().is_empty() {
        "groq"
    } else {
        "mock"
    };
    if let Some(item) = app.state::<ShellState>().stt_item.lock().unwrap().as_ref() {
        let _ = item.set_text(format!("STT：{stt_provider}"));
    }
    log(&format!("[set_groq_key] applied; provider now {stt_provider}"));
    Ok(json!({ "ok": true, "sttProvider": stt_provider }))
}

/// Persist iconOffsetX into the shared config file (drag-to-reposition).
#[tauri::command]
fn save_offset_x(app: AppHandle, offset_x: i32) -> Result<(), String> {
    patch_config(
        &app.state::<ShellState>().config.config_dir.clone(),
        "iconOffsetX",
        json!(offset_x),
    )
}

// ---- App bootstrap ----------------------------------------------------------

pub fn run() {
    let cfg = read_config();
    let cfg_for_state = cfg.clone();
    let logs_dir = cfg.config_dir.join("logs");
    let log = make_logger(&cfg.config_dir);
    log("[boot] vocium shell starting");
    let log_setup = log.clone();
    let log_state = log.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(ShellState {
            client: Mutex::new(None),
            hotkey_ok: Mutex::new(false),
            shortcut: Mutex::new(None),
            hk_item: Mutex::new(None),
            stt_item: Mutex::new(None),
            hotkey_suspended: Mutex::new(false),
            config: cfg_for_state,
            log: log_state,
        })
        // The settings window is created once and reused via show()/hide().
        // The native title-bar close (decorations:true) would DESTROY it,
        // making tray "設定…" (get_webview_window) return None forever. Hide
        // instead so it stays reopenable.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "settings" {
                    api.prevent_close();
                    let _ = window.hide();
                    // Safety net: closing mid-recording must never leave the
                    // global hotkey suspended (would soft-lock it).
                    resume_hotkey(window.app_handle());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            toggle,
            cancel,
            get_state,
            submit_audio,
            audio_error,
            get_config,
            save_offset_x,
            save_drag_locked,
            save_zh_mode,
            quit_app,
            set_hotkey,
            set_hotkey_enabled,
            set_groq_key
        ])
        .setup(move |app| {
            let handle = app.handle().clone();

            // 1. Spawn sidecar + MCP client.
            match spawn_sidecar(&handle, log_setup.clone(), &logs_dir) {
                Ok(client) => {
                    log_setup("[boot] sidecar connected");
                    *handle.state::<ShellState>().client.lock().unwrap() = Some(client);
                }
                Err(e) => {
                    log_setup(&format!("[boot] sidecar NOT connected: {e}"));
                }
            }

            // 2. Surface the effective STT provider to the webview so it can
            //    show a correct transcribing subtitle (shell-config-derived).
            let _ = handle.emit(
                "config",
                json!({ "sttProvider": cfg.stt_provider }),
            );

            // 3. Position + show the floating icon window.
            position_icon_window(&handle, cfg.icon_offset_x);

            // 4. Global shortcut -> toggle, via the runtime-swappable path.
            let hotkey_ok = match apply_hotkey(&handle, &cfg.hotkey) {
                Ok(_) => {
                    log_setup(&format!(
                        "[boot] global shortcut '{}' registered",
                        cfg.hotkey
                    ));
                    true
                }
                Err(e) => {
                    log_setup(&format!(
                        "[boot] global shortcut '{}' failed: {e}",
                        cfg.hotkey
                    ));
                    false
                }
            };
            *handle.state::<ShellState>().hotkey_ok.lock().unwrap() = hotkey_ok;

            // 5. System tray.
            build_tray(&handle, &cfg, hotkey_ok)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Vocium shell");
}

fn build_tray(
    app: &AppHandle,
    cfg: &VociumConfig,
    hotkey_ok: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let hotkey_label = if hotkey_ok {
        format!("快捷鍵：{}", cfg.hotkey)
    } else {
        format!("快捷鍵：{}（註冊失敗）", cfg.hotkey)
    };

    let show = MenuItem::with_id(app, "show", "顯示 ICON", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "隱藏 ICON", true, None::<&str>)?;
    // Read-only informational items (enabled=false).
    let hk = MenuItem::with_id(app, "hk", &hotkey_label, false, None::<&str>)?;
    *app.state::<ShellState>().hk_item.lock().unwrap() = Some(hk.clone());
    let settings_item =
        MenuItem::with_id(app, "settings", "設定…", true, None::<&str>)?;
    let stt = MenuItem::with_id(
        app,
        "stt",
        &format!("STT：{}", cfg.stt_provider),
        false,
        None::<&str>,
    )?;
    *app.state::<ShellState>().stt_item.lock().unwrap() = Some(stt.clone());
    let open_cfg =
        MenuItem::with_id(app, "open_cfg", "開啟設定檔位置", true, None::<&str>)?;
    // Distinct separator instances: muda OS menu-item ID reuse is undefined on
    // Windows, so each separator slot needs its own instance.
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "結束", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[&show, &hide, &sep1, &hk, &stt, &sep2, &settings_item, &open_cfg, &sep3, &quit],
    )?;

    let cfg_dir = cfg.config_dir.clone();
    let _tray = TrayIconBuilder::with_id("vocium-tray")
        .tooltip("Vocium — 待命")
        // Embed the generated B+ icon at COMPILE TIME so the tray is always the
        // current art, independent of bundle-icon embedding/dev caching (the
        // old default_window_icon() path showed a stale icon under tauri dev).
        .icon(
            tauri::image::Image::from_bytes(include_bytes!("../icons/128x128.png"))
                .unwrap_or_else(|_| app.default_window_icon().cloned().unwrap()),
        )
        .menu(&menu)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "show" => {
                if let Some(w) = app.get_webview_window("icon") {
                    let _ = w.show();
                }
            }
            "hide" => {
                if let Some(w) = app.get_webview_window("icon") {
                    let _ = w.hide();
                }
            }
            "settings" => {
                if let Some(w) = app.get_webview_window("settings") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "open_cfg" => {
                use tauri_plugin_opener::OpenerExt;
                let _ = app
                    .opener()
                    .open_path(cfg_dir.to_string_lossy().to_string(), None::<&str>);
            }
            "quit" => {
                shutdown_sidecar(app);
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}
