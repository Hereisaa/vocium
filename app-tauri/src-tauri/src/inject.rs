//! Native text injection: clipboard write → synthesized paste keystroke →
//! clipboard restore. Replaces the former Node sidecar injectors
//! (PowerShell `SendKeys` on Windows, `pbcopy` + `osascript` on macOS).
//!
//! Contract (mirrors voice-core's `Injector`): never panics; returns
//! `InjectResult { ok, message }`. On failure the text is still on the
//! clipboard where that step succeeded, and `message` tells the user to paste
//! manually.
//!
//! Windows uses Win32 directly (no PowerShell cold start, no execution-policy
//! surprises). macOS keeps the proven `pbcopy` + System Events path because it
//! is the one gated by the Accessibility permission the tray health panel
//! reports on. Linux is best-effort via `wl-copy`/`xclip` + `wtype`/`xdotool`.

use serde::Serialize;
use std::thread;
use std::time::Duration;

#[derive(Debug, Clone, Serialize)]
pub struct InjectResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl InjectResult {
    fn ok() -> Self {
        Self { ok: true, message: None }
    }
    fn fail(msg: String) -> Self {
        Self { ok: false, message: Some(msg) }
    }
}

/// Delay between clipboard write and the paste keystroke so the previously
/// focused app settles (same 120 ms the sidecar used).
const FOCUS_DELAY: Duration = Duration::from_millis(120);
/// Delay after the paste keystroke before restoring the user's clipboard, so
/// the target app has consumed our text first.
const RESTORE_DELAY: Duration = Duration::from_millis(250);

fn copied_manual(lang: &str, reason: &str) -> String {
    if lang == "en" {
        format!("Copied — paste manually ({reason})")
    } else {
        format!("已複製，請手動貼上（{reason}）")
    }
}

/// Inject `text` into the focused window. Blocking: call from a blocking
/// task, never from Tauri's event loop thread.
pub fn inject(text: &str, lang: &str) -> InjectResult {
    #[cfg(windows)]
    {
        win::inject(text, lang)
    }
    #[cfg(target_os = "macos")]
    {
        mac::inject(text, lang)
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        linux::inject(text, lang)
    }
}

/// Permission probe without touching the clipboard. Only macOS has a gate
/// (Accessibility); other platforms always report ok.
pub fn probe(lang: &str) -> InjectResult {
    #[cfg(target_os = "macos")]
    {
        mac::probe(lang)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = lang;
        InjectResult::ok()
    }
}

// ───────────────────────────── Windows ──────────────────────────────────────

#[cfg(windows)]
mod win {
    use super::*;
    use windows::Win32::Foundation::{GlobalFree, HANDLE, HGLOBAL, HWND};
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, GetClipboardData, IsClipboardFormatAvailable,
        OpenClipboard, SetClipboardData,
    };
    use windows::Win32::System::Memory::{
        GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE,
    };
    use windows::Win32::System::Ole::CF_UNICODETEXT;
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VK_CONTROL, VK_V,
    };

    /// RAII guard around OpenClipboard/CloseClipboard with a short retry loop
    /// (another app may hold the clipboard for a few ms).
    struct Clipboard;
    impl Clipboard {
        fn open() -> Option<Self> {
            for _ in 0..10 {
                if unsafe { OpenClipboard(HWND::default()) }.is_ok() {
                    return Some(Clipboard);
                }
                thread::sleep(Duration::from_millis(10));
            }
            None
        }
    }
    impl Drop for Clipboard {
        fn drop(&mut self) {
            unsafe { let _ = CloseClipboard(); }
        }
    }

    fn read_text(_cb: &Clipboard) -> Option<String> {
        unsafe {
            if !IsClipboardFormatAvailable(CF_UNICODETEXT.0 as u32).is_ok() {
                return None;
            }
            let h: HANDLE = GetClipboardData(CF_UNICODETEXT.0 as u32).ok()?;
            if h.is_invalid() {
                return None;
            }
            let hg = HGLOBAL(h.0);
            let p = GlobalLock(hg) as *const u16;
            if p.is_null() {
                return None;
            }
            // Bound the terminator scan by the block size: a producer that
            // forgot the trailing NUL must not walk us off the allocation.
            let max = GlobalSize(hg) / 2;
            let mut len = 0usize;
            while len < max && *p.add(len) != 0 {
                len += 1;
            }
            let s = String::from_utf16_lossy(std::slice::from_raw_parts(p, len));
            let _ = GlobalUnlock(hg);
            Some(s)
        }
    }

    fn write_text(_cb: &Clipboard, text: &str) -> Result<(), String> {
        let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
        unsafe {
            EmptyClipboard().map_err(|e| format!("EmptyClipboard: {e}"))?;
            let hg = GlobalAlloc(GMEM_MOVEABLE, wide.len() * 2)
                .map_err(|e| format!("GlobalAlloc: {e}"))?;
            let p = GlobalLock(hg) as *mut u16;
            if p.is_null() {
                let _ = GlobalFree(hg);
                return Err("GlobalLock returned null".into());
            }
            std::ptr::copy_nonoverlapping(wide.as_ptr(), p, wide.len());
            let _ = GlobalUnlock(hg);
            // The system takes ownership of the HGLOBAL only when
            // SetClipboardData succeeds; on failure it is still ours to free.
            if let Err(e) = SetClipboardData(CF_UNICODETEXT.0 as u32, HANDLE(hg.0)) {
                let _ = GlobalFree(hg);
                return Err(format!("SetClipboardData: {e}"));
            }
        }
        Ok(())
    }

    fn send_ctrl_v() -> Result<(), String> {
        fn key(vk: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY, up: bool) -> INPUT {
            INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: vk,
                        wScan: 0,
                        dwFlags: if up { KEYEVENTF_KEYUP } else { Default::default() },
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            }
        }
        let seq = [
            key(VK_CONTROL, false),
            key(VK_V, false),
            key(VK_V, true),
            key(VK_CONTROL, true),
        ];
        let sent = unsafe { SendInput(&seq, std::mem::size_of::<INPUT>() as i32) };
        if sent as usize == seq.len() {
            Ok(())
        } else {
            Err(format!("SendInput sent {sent}/{} events", seq.len()))
        }
    }

    pub fn inject(text: &str, lang: &str) -> InjectResult {
        // 1. Save the user's clipboard text (if any) and put ours in place.
        let previous = {
            let Some(cb) = Clipboard::open() else {
                return InjectResult::fail(copied_manual(lang, "clipboard busy"));
            };
            let prev = read_text(&cb);
            if let Err(e) = write_text(&cb, text) {
                return InjectResult::fail(copied_manual(lang, &e));
            }
            prev
        };
        // 2. Let the target app settle, then paste.
        thread::sleep(FOCUS_DELAY);
        if let Err(e) = send_ctrl_v() {
            return InjectResult::fail(copied_manual(lang, &e));
        }
        // 3. Restore the user's clipboard (text only; non-text content is not
        //    preserved). Best-effort: a failure here is not an inject failure.
        if let Some(prev) = previous {
            thread::sleep(RESTORE_DELAY);
            if let Some(cb) = Clipboard::open() {
                let _ = write_text(&cb, &prev);
            }
        }
        InjectResult::ok()
    }
}

// ───────────────────────────── macOS ────────────────────────────────────────

#[cfg(target_os = "macos")]
mod mac {
    use super::*;
    use std::io::Write;
    use std::process::{Command, Stdio};

    /// osascript / Apple-events "not trusted for Accessibility" signatures.
    fn access_denied(msg: &str) -> bool {
        msg.contains("-1719")
            || msg.to_ascii_lowercase().contains("not allowed assistive access")
            || msg.to_ascii_lowercase().contains("not authorized to send apple events")
    }

    fn a11y_guidance(lang: &str, tail: &str) -> String {
        if lang == "en" {
            format!("Open System Settings ▸ Privacy & Security ▸ Accessibility, enable Vocium, then retry ({tail})")
        } else {
            format!("請到 系統設定 ▸ 隱私權與安全性 ▸ 輔助使用 開啟 Vocium 後再試（{tail}）")
        }
    }

    fn run(program: &str, args: &[&str], stdin: Option<&[u8]>) -> Result<String, String> {
        let mut cmd = Command::new(program);
        cmd.args(args)
            // pbcopy tags stdin bytes by LC_CTYPE; a Finder-launched .app has
            // the C locale, which mis-tags UTF-8 as legacy Mac text ("皜祈岫").
            .env("LANG", "en_US.UTF-8")
            .env("LC_CTYPE", "en_US.UTF-8")
            .stdin(if stdin.is_some() { Stdio::piped() } else { Stdio::null() })
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = cmd.spawn().map_err(|e| format!("{program}: {e}"))?;
        if let (Some(bytes), Some(mut si)) = (stdin, child.stdin.take()) {
            si.write_all(bytes).map_err(|e| format!("{program} stdin: {e}"))?;
        }
        let out = child.wait_with_output().map_err(|e| format!("{program}: {e}"))?;
        if out.status.success() {
            Ok(String::from_utf8_lossy(&out.stdout).into_owned())
        } else {
            Err(format!(
                "{program} exit {}: {}",
                out.status.code().unwrap_or(-1),
                String::from_utf8_lossy(&out.stderr).trim()
            ))
        }
    }

    pub fn inject(text: &str, lang: &str) -> InjectResult {
        let previous = run("pbpaste", &[], None).ok();
        if let Err(e) = run("pbcopy", &[], Some(text.as_bytes())) {
            return InjectResult::fail(copied_manual(lang, &e));
        }
        thread::sleep(FOCUS_DELAY);
        // `key code 9` = physical V key (layout independent).
        let paste = "tell application \"System Events\" to key code 9 using {command down}";
        if let Err(e) = run("osascript", &["-e", paste], None) {
            if access_denied(&e) {
                let tail = if lang == "en" {
                    "text is copied — you can paste manually"
                } else {
                    "文字已複製，可手動貼上"
                };
                return InjectResult::fail(a11y_guidance(lang, tail));
            }
            return InjectResult::fail(copied_manual(lang, &e));
        }
        if let Some(prev) = previous {
            thread::sleep(RESTORE_DELAY);
            let _ = run("pbcopy", &[], Some(prev.as_bytes()));
        }
        InjectResult::ok()
    }

    pub fn probe(lang: &str) -> InjectResult {
        match run("osascript", &["-e", "tell application \"System Events\" to return"], None) {
            Ok(_) => InjectResult::ok(),
            Err(e) if access_denied(&e) => {
                let tail = if lang == "en" {
                    "if an old Vocium is already listed, remove it first and add the new one"
                } else {
                    "若清單已有舊版 Vocium，請先移除再加入新版"
                };
                InjectResult::fail(a11y_guidance(lang, tail))
            }
            Err(e) => InjectResult::fail(e),
        }
    }
}

// ───────────────────────────── Linux ────────────────────────────────────────

#[cfg(not(any(windows, target_os = "macos")))]
mod linux {
    use super::*;
    use std::io::Write;
    use std::process::{Command, Stdio};

    fn try_run(program: &str, args: &[&str], stdin: Option<&[u8]>) -> Result<(), String> {
        let mut cmd = Command::new(program);
        cmd.args(args)
            .stdin(if stdin.is_some() { Stdio::piped() } else { Stdio::null() })
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        let mut child = cmd.spawn().map_err(|e| format!("{program}: {e}"))?;
        if let (Some(bytes), Some(mut si)) = (stdin, child.stdin.take()) {
            si.write_all(bytes).map_err(|e| format!("{program} stdin: {e}"))?;
        }
        let st = child.wait().map_err(|e| format!("{program}: {e}"))?;
        if st.success() { Ok(()) } else { Err(format!("{program} exit {}", st.code().unwrap_or(-1))) }
    }

    pub fn inject(text: &str, lang: &str) -> InjectResult {
        let wayland = std::env::var_os("WAYLAND_DISPLAY").is_some();
        let copy = if wayland {
            try_run("wl-copy", &[], Some(text.as_bytes()))
        } else {
            try_run("xclip", &["-selection", "clipboard"], Some(text.as_bytes()))
        };
        if let Err(e) = copy {
            return InjectResult::fail(copied_manual(lang, &e));
        }
        thread::sleep(FOCUS_DELAY);
        let paste = if wayland {
            try_run("wtype", &["-M", "ctrl", "v", "-m", "ctrl"], None)
                .or_else(|_| try_run("ydotool", &["key", "29:1", "47:1", "47:0", "29:0"], None))
        } else {
            try_run("xdotool", &["key", "--clearmodifiers", "ctrl+v"], None)
        };
        match paste {
            Ok(()) => InjectResult::ok(),
            Err(e) => InjectResult::fail(copied_manual(lang, &e)),
        }
    }
}
