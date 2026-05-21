<p align="center">
  <img src="app-tauri/src-tauri/icons/128x128.png" width="96" height="96" alt="Vocium" />
</p>

<h1 align="center">Vocium</h1>

<p align="center">
  <b>AI‑powered voice typing for the desktop.</b>
</p>

<p align="center">
  <b>English</b> · <a href="README.zh-TW.md">繁體中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License: MIT" />
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-555" alt="Platform: Windows and macOS" />
  <img src="https://img.shields.io/badge/MCP-native-8A2BE2" alt="MCP-native" />
</p>

<p align="center">
  <img src="docs/assets/showcase.gif" width="940" alt="Vocium — AI voice input demo (hotkey → speak → text inserted)" />
</p>

---

Press a hotkey, speak, and AI transcribes your voice and pastes it straight into the focused field — no focus stolen, no server, no bundled credentials. Supports Windows and macOS.

It's also **MCP‑native**: any AI assistant or script can reuse its speech‑to‑text and text‑injection as tools.

## Architecture

A thin Tauri 2 (Rust) shell drives a Node sidecar that exposes the core logic over a single MCP protocol — the shell is just one client of that server. The sidecar daemon owns the state machine, STT, AI polish, and text injection; the shell handles only the window, tray, global shortcut, and microphone capture.

## Features

- **Floating icon** — lock/unlock drag, minimize to tray, never steals focus
- **Toggle or push‑to‑talk** — with a custom global hotkey
- **Multi‑provider STT** — Groq, OpenAI Whisper, Gemini; bring‑your‑own‑key, stored only on your device
- **AI polish** — optional LLM cleanup pass before injection (punctuation, fillers, fluency)
- **Chinese output** — force Traditional or Simplified; opt‑in VAD silence trimming
- **MCP‑native** — a standalone MCP server any MCP host can call

---

### Prerequisites

| Tool | Why | Notes |
|---|---|---|
| **Node.js ≥ 20** | runs the sidecar in dev | includes `npm` |
| **Rust toolchain** | builds the Tauri shell | — |
| **Bun** | only for `npm run package` | build‑time; not needed for `npm run dev` |

Platform extras:
**Windows** — WebView2 Runtime (pre‑installed on Win 10 2020+/11) + MSVC Build Tools (*"Desktop development with C++"* workload).
**macOS** — Xcode Command Line Tools (`xcode-select --install`).

---

## Setup

No published binaries yet — build from source.

### Install the toolchain

**🪟 Windows (PowerShell):**
```powershell
winget install --id OpenJS.NodeJS.LTS          # Node.js (LTS, ≥ 20)
winget install --id Rustlang.Rustup            # Rust
powershell -c "irm bun.sh/install.ps1 | iex"   # Bun — build-time only
winget install --id Microsoft.VisualStudio.2022.BuildTools  # select "Desktop development with C++"
```

**🍎 macOS (Terminal):**
```bash
xcode-select --install                                          # Xcode CLT (system dialog)
brew install node                                               # Node.js (≥ 20), or use nvm
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh  # Rust
curl -fsSL https://bun.sh/install | bash                        # Bun — build-time only
```

After installing Rust / Bun, open a new shell so the updated `PATH` is picked up.

### Run from source

```bash
git clone <repo-url> vocium
cd vocium
npm install
npm run dev   # builds the sidecar + launches the app via `tauri dev`
```

In dev the sidecar runs via Node — Bun is not required.

### Package the app

```bash
npm run package # builds a standalone installer
# output in `app-tauri/src-tauri/target/release/bundle/`
```

**🪟 Windows**

| Format | Path | Notes |
|---|---|---|
| `.msi` | `bundle/msi/Vocium_<ver>_x64_en-US.msi` | Group‑Policy / silent‑install |
| `.nsis` | `bundle/nsis/Vocium_<ver>_x64-setup.exe` | smaller; common for OSS |

First launch (unsigned): SmartScreen → **More info → Run anyway**.

**🍎 macOS**

| Format | Path | Notes |
|---|---|---|
| `.app` | `bundle/macos/Vocium.app` | runnable application bundle |
| `.dmg` | `bundle/dmg/Vocium_<ver>_{x64\|aarch64}.dmg` | disk image for distribution |

First launch (unsigned): Gatekeeper → **right‑click → Open → Open anyway** (once).
> Unsigned builds require re‑granting Accessibility on every rebuild — see [Permissions](#permissions).

---

## Permissions

Vocium needs OS‑level permissions on first run. The list and recovery flow differ by platform.

**🪟 Windows**

| Permission | Why | How |
|---|---|---|
| **Microphone** | Recording your voice | A standard Windows prompt appears the first time Vocium records — click *Allow* |

No paste permission is required — Vocium uses `Set-Clipboard` + `SendKeys`, neither of which needs elevated rights.

**🍎 macOS**

| Permission | Why | How |
|---|---|---|
| **Microphone** | Recording your voice | A standard macOS prompt appears the first time Vocium records; grant it to the app (or to the terminal running `npm run dev`) |
| **Accessibility** | Sending the paste keystroke (Cmd+V) into the focused app | **System Settings ▸ Privacy & Security ▸ Accessibility** — add Vocium and enable the toggle |

If Accessibility is not granted, the transcribed text is still copied to the clipboard and the floating icon shows guidance text — you can paste manually with Cmd+V.

> **If auto-paste stops working after `npm run package` — how to fix it:**
> Every `npm run package` produces a new ad-hoc signature, and macOS treats each rebuild as a different app — the old Accessibility checkbox still shows green but points at a stale binary. If transcription works but paste doesn't fire after a rebuild:
> **System Settings ▸ Privacy & Security ▸ Accessibility → remove the old Vocium row → add the new `Vocium.app` and enable it**.
> The dev loop (`npm run dev`) reuses the granted entry, so this only affects packaged builds.

---

## Tray health panel

The tray menu shows live status for microphone device, microphone permission, STT key, global shortcut, and (on macOS) Accessibility. Failing items are marked ⚠ and clickable — they jump straight to the relevant OS settings page or the in‑app Settings window. If a blocking check fails (no microphone, or permission denied), pressing the hotkey won't enter listening; the UI surfaces the reason instead.

---

## Usage

1. Focus any text field. (If nothing is focused, the result is copied to the clipboard.)
2. Press the hotkey or click Vocium → Vocium shows **listening**.
3. **Speak.**
4. Press again → transcribed and inserted.

**Toggle** — press to start, press again to stop and transcribe.
**Push‑to‑talk** — hold to record, release to transcribe.

First run needs an STT API key — see [CONFIGURATION.md](docs/CONFIGURATION.md).

---

## Use as an MCP tool

The Node sidecar is a **standalone MCP server** — any MCP host (Claude Desktop, Cursor, an Agent SDK, scripts) can reuse Vocium's speech‑to‑text and text injection without the desktop app.

Three headless tools:

| Tool | Input → Output | Does |
|---|---|---|
| `transcribe_clip` | `{ audioBase64, mimeType, language? }` → `{ text }` | Transcribe audio with your configured provider; applies your Traditional/Simplified preference. Read‑only. |
| `inject_text` | `{ text }` → `{ ok }` | Type text into the OS‑focused window (clipboard + paste). The caller owns focus. |
| `polish_text` | `{ text, style? }` → `{ text }` | LLM cleanup. `style`: `light` (punctuation + obvious fixes, fillers kept), `full` (also removes fillers, smooths flow), `custom` (your prompt). |

- API keys are read from the local Vocium config on the machine running the sidecar — **callers never pass or see a key**.
- The caller supplies the audio (Vocium does not open the microphone headlessly).
- On macOS, `inject_text` needs the standard Accessibility permission (see [Permissions](#permissions)).
- Register in an MCP host (after `npm run build`). The entry point is **`dist/sidecar/main.js`**:

```json
{
  "mcpServers": {
    "vocium": { "command": "node", "args": ["<path>/vocium/dist/sidecar/main.js"] }
  }
}
```

> The MCP server also exposes six **state‑machine tools** (`toggle`, `start_listening`, `stop_listening`, `cancel`, `get_state`, `submit_audio`) that drive the desktop shell's live recording flow, plus `probe_inject` for diagnostics.
>
> **External integrations normally need only the three headless tools above.**

**Embedding in your own host?**
Import the factory instead of spawning a process: `import { buildServer } from '<path>/vocium/dist/sidecar/index.js'`, then `buildServer().connect(yourTransport)`.
(`index.js` only exports the factory; running it directly starts nothing — `main.js` is the stdio entry point.)
The sidecar and the Tauri shell build independently — the shell is just one MCP client of this same server.

---

## Documentation

| Doc | What |
|---|---|
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | `vocium-config.json`, BYOK key setup, AI polish |
| [docs/ROADMAP.md](docs/ROADMAP.md) | What's shipped, planned, and deferred |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | Dev workflow, build gates, adding providers |
| [docs/DESIGN_MOCKUP.html](docs/DESIGN_MOCKUP.html), [docs/ICON_DESIGN.html](docs/ICON_DESIGN.html) | Design mockups (open in a browser) |

---

## License

MIT
