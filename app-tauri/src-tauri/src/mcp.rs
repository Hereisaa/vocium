//! Lightweight JSON-RPC-over-stdio MCP client for the Vocium Node sidecar.
//!
//! The full @modelcontextprotocol Rust SDK is intentionally NOT used — the
//! sidecar only needs: an `initialize` handshake, `tools/call` requests, and
//! receipt of the `state_changed` notification. This keeps the Rust shell thin
//! and matches SPEC §5.2 message shapes while using the *real* tool names the
//! sidecar implements (toggle, start_listening, stop_listening, cancel,
//! submit_audio, transcribe_clip, inject_text, get_state).
//!
//! Transport: child process stdin/stdout, newline-delimited JSON-RPC 2.0
//! (the MCP stdio transport framing — one JSON message per line).

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin};
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Instant;

use serde_json::{json, Value};

/// Callback invoked when the sidecar pushes a `state_changed` notification.
pub type StateListener = Arc<dyn Fn(String, String) + Send + Sync>;

/// Diagnostic sink. lib.rs wires this to %APPDATA%/vocium/logs/shell.log so the
/// MCP round-trip is observable even though the GUI process has no console
/// (CREATE_NO_WINDOW). Used to pin down why responses are (or aren't) arriving.
pub type LogFn = Arc<dyn Fn(&str) + Send + Sync>;

/// Extract a JSON-RPC id as i64 whether the peer encodes it as a number or a
/// numeric string. The MCP SDK echoes the id we sent (integer), but be robust:
/// a string id silently fell through the old `as_i64()` check, dropped the
/// response, and made every call hang the full timeout.
fn id_as_i64(v: &Value) -> Option<i64> {
    v.as_i64()
        .or_else(|| v.as_str().and_then(|s| s.parse::<i64>().ok()))
}

pub struct McpClient {
    stdin: Mutex<ChildStdin>,
    next_id: AtomicI64,
    /// id -> oneshot sender for the matching JSON-RPC response
    pending: Arc<Mutex<HashMap<i64, Sender<Result<Value, String>>>>>,
    log: LogFn,
    _child: Mutex<Child>,
}

impl McpClient {
    /// Spawn the sidecar process and start the stdout reader thread.
    /// `on_state(state, prev)` fires for every `state_changed` notification.
    pub fn spawn(
        mut child: Child,
        on_state: StateListener,
        log: LogFn,
    ) -> Result<Arc<McpClient>, String> {
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "sidecar stdin unavailable".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "sidecar stdout unavailable".to_string())?;

        let pending: Arc<Mutex<HashMap<i64, Sender<Result<Value, String>>>>> =
            Arc::new(Mutex::new(HashMap::new()));

        let client = Arc::new(McpClient {
            stdin: Mutex::new(stdin),
            next_id: AtomicI64::new(1),
            pending: pending.clone(),
            log: log.clone(),
            _child: Mutex::new(child),
        });

        // Reader thread: demux responses vs. notifications.
        let rlog = log.clone();
        thread::Builder::new()
            .name("vocium-sidecar-reader".into())
            .spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    let line = match line {
                        Ok(l) => l,
                        Err(e) => {
                            rlog(&format!("[reader] stdout read error: {e} — reader exiting"));
                            break;
                        }
                    };
                    let line = line.trim();
                    if line.is_empty() {
                        continue;
                    }
                    // Truncated raw dump: THE key evidence for whether responses
                    // arrive at all and how their id is encoded.
                    let preview: String = line.chars().take(240).collect();
                    rlog(&format!("[reader] <- {preview}"));
                    let msg = match serde_json::from_str::<Value>(line) {
                        Ok(m) => m,
                        Err(e) => {
                            rlog(&format!("[reader] non-JSON line (skipped): {e}"));
                            continue;
                        }
                    };

                    // Response (has an id and result/error)
                    if let Some(idv) = msg.get("id") {
                        if let Some(id) = id_as_i64(idv) {
                            if let Some(tx) = pending.lock().unwrap().remove(&id) {
                                if let Some(err) = msg.get("error") {
                                    rlog(&format!("[reader] matched id={id} -> error"));
                                    let _ = tx.send(Err(err.to_string()));
                                } else {
                                    rlog(&format!("[reader] matched id={id} -> result"));
                                    let _ = tx.send(Ok(msg
                                        .get("result")
                                        .cloned()
                                        .unwrap_or(Value::Null)));
                                }
                            } else {
                                rlog(&format!(
                                    "[reader] UNMATCHED response id={id} (no pending waiter — late/duplicate?)"
                                ));
                            }
                            continue;
                        }
                        rlog(&format!(
                            "[reader] response with NON-NUMERIC id {idv} — DROPPED (demux miss)"
                        ));
                        continue;
                    }

                    // Notification: method without id
                    if let Some(method) = msg.get("method").and_then(|v| v.as_str()) {
                        if method == "state_changed" || method == "notifications/state_changed" {
                            let params = msg.get("params").cloned().unwrap_or(Value::Null);
                            let state = params
                                .get("state")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            let prev = params
                                .get("prev")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            if !state.is_empty() {
                                rlog(&format!(
                                    "[reader] notification state_changed {prev} -> {state}"
                                ));
                                on_state(state, prev);
                            }
                        } else {
                            rlog(&format!("[reader] notification '{method}' (ignored)"));
                        }
                    }
                }
            })
            .map_err(|e| format!("failed to spawn reader thread: {e}"))?;

        // MCP handshake — MUST be synchronous. The @modelcontextprotocol/sdk
        // server will not service tools/call until initialization completes, so
        // we send `initialize` as a TRACKED request and BLOCK for its response
        // before sending `notifications/initialized` and returning a ready
        // client. (Previously this was fire-and-forget: the first real
        // tools/call raced the server's init and was dropped, making every
        // trigger hang the full 30s tool timeout and then error.)
        //
        // If the sidecar never answers (node missing / crashed on boot), this
        // fails fast with a clear error instead of every later click hanging.
        log("[handshake] sending initialize (protocolVersion 2024-11-05)…");
        let init = client
            .request(
                "initialize",
                json!({
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": { "name": "vocium-tauri-shell", "version": "0.1.0" }
                }),
                std::time::Duration::from_secs(15),
            )
            .map_err(|e| {
                log(&format!("[handshake] initialize FAILED: {e}"));
                format!("sidecar MCP initialize failed: {e}")
            })?;
        // Log the server's negotiated protocol version: if the SDK negotiated a
        // version other than what we asked, that is a prime suspect for it
        // refusing to service later tools/call.
        let negotiated = init
            .get("protocolVersion")
            .and_then(|v| v.as_str())
            .unwrap_or("<none>");
        log(&format!(
            "[handshake] initialize OK, server protocolVersion={negotiated}"
        ));

        // Only now is the server ready for requests.
        client.notify_raw(json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        }))?;
        log("[handshake] sent notifications/initialized — client ready");

        Ok(client)
    }

    fn write_line(&self, value: &Value) -> Result<(), String> {
        let mut s = serde_json::to_string(value).map_err(|e| e.to_string())?;
        s.push('\n');
        let mut stdin = self.stdin.lock().unwrap();
        stdin
            .write_all(s.as_bytes())
            .map_err(|e| format!("sidecar write failed: {e}"))?;
        stdin.flush().map_err(|e| e.to_string())
    }

    fn notify_raw(&self, value: Value) -> Result<(), String> {
        self.write_line(&value)
    }

    /// Send a tracked JSON-RPC request and block until its matching response
    /// (or `timeout`). Used by both the initialize handshake and `call_tool`.
    fn request(
        &self,
        method: &str,
        params: Value,
        timeout: std::time::Duration,
    ) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx): (Sender<Result<Value, String>>, Receiver<Result<Value, String>>) =
            channel();
        self.pending.lock().unwrap().insert(id, tx);

        let req = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params
        });
        let started = Instant::now();
        (self.log)(&format!("[req] id={id} method={method} sent"));
        if let Err(e) = self.write_line(&req) {
            self.pending.lock().unwrap().remove(&id);
            (self.log)(&format!("[req] id={id} method={method} write failed: {e}"));
            return Err(e);
        }

        // Blocks the calling thread until the matching response arrives or
        // `timeout` elapses. Callers MUST keep this off Tauri's main thread
        // (lib.rs runs every command via async_runtime::spawn_blocking) — a
        // synchronous Tauri command here would freeze the whole webview.
        // On timeout, drop the pending entry so a late response is ignored
        // rather than delivered to a stale receiver.
        match rx.recv_timeout(timeout) {
            Ok(r) => {
                let ms = started.elapsed().as_millis();
                match &r {
                    Ok(_) => (self.log)(&format!(
                        "[req] id={id} method={method} OK in {ms}ms"
                    )),
                    Err(e) => (self.log)(&format!(
                        "[req] id={id} method={method} ERR in {ms}ms: {e}"
                    )),
                }
                r
            }
            Err(_) => {
                self.pending.lock().unwrap().remove(&id);
                let ms = started.elapsed().as_millis();
                (self.log)(&format!(
                    "[req] id={id} method={method} TIMEOUT after {ms}ms (no response demuxed)"
                ));
                Err(format!("sidecar timed out on '{method}'"))
            }
        }
    }

    /// Kill the sidecar child so `quit_app` leaves no orphan node process.
    pub fn shutdown(&self) {
        if let Ok(mut c) = self._child.lock() {
            let _ = c.kill();
        }
    }

    /// Call an MCP tool by its real sidecar name and return the parsed JSON
    /// payload the sidecar wrapped in `content[0].text`.
    pub fn call_tool(&self, name: &str, args: Value) -> Result<Value, String> {
        let result = self.request(
            "tools/call",
            json!({ "name": name, "arguments": args }),
            std::time::Duration::from_secs(30),
        )?;

        // tools/call result -> { content: [ { type:"text", text:"<json>" } ] }
        if let Some(text) = result
            .get("content")
            .and_then(|c| c.as_array())
            .and_then(|a| a.first())
            .and_then(|x| x.get("text"))
            .and_then(|t| t.as_str())
        {
            return serde_json::from_str::<Value>(text)
                .map_err(|e| format!("bad tool payload: {e}"));
        }
        Ok(result)
    }
}
