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
  <img src="docs/assets/showcase.gif" width="940" alt="Vocium — AI voice input demo (hotkey → speak → text inserted)" />
</p>

---

Press a hotkey, speak, and AI transcribes your voice and pastes it straight into the focused input field — no focus stolen, no server, no bundled credentials. It is also **MCP‑native**: any AI assistant or script can reuse its speech‑to‑text and text‑injection as tools.

## Features

- **Floating icon** — lock/unlock drag · minimize to tray · never steals focus.
- **Five states** — idle · listening · transcribing · injected · error.
- **Input mode & custom hotkey** — toggle (default) or push‑to‑talk.
- **VAD silence trimming** — automatically trims silent segments.
- **Chinese output switch** — force Traditional or Simplified.
- **Multi‑provider STT** — **Groq**, **OpenAI Whisper**, **Gemini**; bring‑your‑own‑key, stored only on your device.
- **Local STT** — coming soon.
- **MCP‑native** — a standalone MCP server: any MCP host (Claude Desktop, Cursor, agents, scripts) can call its speech‑to‑text and text‑injection tools.

---

## Install & Use

Supported platforms: **Windows 11** and **macOS**.

### Prerequisites

#### Common (Windows + macOS)

| Tool | Why | How |
|---|---|---|
| **Node.js ≥ 20** | runs the sidecar in dev (`npm run dev`); includes `npm` | ✅ command (see Quick install) or download from [nodejs.org](https://nodejs.org) |
| **Rust toolchain** | builds the Tauri shell | ✅ command (see Quick install) |
| **Bun** | only for `npm run package` (build-time; not needed for `npm run dev`) | ✅ command (see Quick install) — [docs](https://bun.sh) |

#### 🪟 Windows only

| Tool | Why | How |
|---|---|---|
| **WebView2 Runtime** | Tauri webview on Windows | Pre-installed on **Windows 10 (2020+)** and **Windows 11** — usually nothing to do. If missing: [Evergreen bootstrapper](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) |
| **MSVC Build Tools** | `cargo build` on Windows | ⚙️ **Manual**: install **Visual Studio 2022 Build Tools** with the *"Desktop development with C++"* workload — the workload selection is done in the Visual Studio Installer GUI |

#### 🍎 macOS only

| Tool | Why | How |
|---|---|---|
| **Xcode Command Line Tools** | provides `clang`, `codesign`, etc. for `cargo build` | ✅ semi-command: `xcode-select --install` (triggers a system dialog → click **Install**) |

### Quick install

Copy-paste these into a fresh shell. Skip any line whose tool you already have.

**🪟 Windows (PowerShell):**
```powershell
# Node.js (LTS, ≥ 20)
winget install --id OpenJS.NodeJS.LTS
# Rust
winget install --id Rustlang.Rustup
# Bun — build-time only; skip if you only run `npm run dev`
powershell -c "irm bun.sh/install.ps1 | iex"
# MSVC Build Tools — installer GUI required (select "Desktop development with C++")
winget install --id Microsoft.VisualStudio.2022.BuildTools
```

**🍎 macOS (Terminal):**
```bash
# Xcode Command Line Tools (triggers a system dialog)
xcode-select --install
# Node.js (≥ 20) via Homebrew (or use nvm)
brew install node
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Bun — build-time only; skip if you only run `npm run dev`
curl -fsSL https://bun.sh/install | bash
```

> After installing Rust / Bun, open a new shell so the updated `PATH` is picked up.

### Run from source (dev)

```bash
git clone <repo-url> vocium
cd vocium
npm install
npm run dev   # builds the sidecar + launches the desktop app via `tauri dev`
```

### Packaging

`npm run package` builds a standalone installer that runs with **no Node.js on the end user's machine** (the sidecar is bundled as a compiled binary). It builds for the **host OS only** — run on Windows to produce Windows installers; run on macOS to produce macOS installers. Cross-platform CI is future (P3).

**Common (both platforms):**
```bash
npm install
npm run package
```

Installers are written to **`app-tauri/src-tauri/target/release/bundle/`**.

#### 🪟 Windows packaging

Produces two installer formats:

| Format | Path | Notes |
|---|---|---|
| `.msi` | `bundle/msi/Vocium_<ver>_x64_en-US.msi` | Windows Installer — Group-Policy / silent-install friendly |
| `.nsis` | `bundle/nsis/Vocium_<ver>_x64-setup.exe` | NSIS installer — smaller; common for OSS |

**First launch (unsigned):** Windows SmartScreen shows *"Windows protected your PC"* → click **More info** → **Run anyway**. Code signing is planned (P2).

#### 🍎 macOS packaging

Produces:

| Format | Path | Notes |
|---|---|---|
| `.app` | `bundle/macos/Vocium.app` | The runnable application bundle |
| `.dmg` | `bundle/dmg/Vocium_<ver>_{x64\|aarch64}.dmg` | Disk image for distribution |

**First launch (unsigned):** Gatekeeper blocks double-click → **right-click → Open → Open anyway** (once). Apple Developer ID signing + notarization is planned (P2).

### Permissions

Vocium needs OS-level permissions on first run. The exact list and the recovery flow differ between platforms.

#### 🪟 Windows

| Permission | Why | How |
|---|---|---|
| **Microphone** | Recording your voice | A standard Windows permission prompt appears the first time Vocium records — click *Allow* |

No paste permission is required — Vocium uses `Set-Clipboard` + `SendKeys`, neither of which needs elevated rights.

#### 🍎 macOS

| Permission | Why | How |
|---|---|---|
| **Microphone** | Recording your voice | A standard macOS prompt appears the first time Vocium records; grant it to the app (or to the terminal running `npm run dev`) |
| **Accessibility** | Sending the paste keystroke (Cmd+V) into the focused app | **System Settings ▸ Privacy & Security ▸ Accessibility** — add Vocium and enable the toggle |

If Accessibility is not granted, the transcribed text is still copied to the clipboard and the floating icon displays the guidance text — you can paste manually with Cmd+V.

##### Important: unsigned builds force a re-grant per rebuild

Until Vocium is code-signed with an Apple Developer ID (P2 roadmap), every `npm run package` produces a **new ad-hoc signature**. macOS keys Accessibility entries by `(bundle ID, code-signing requirement)`, so it treats each rebuild as a different application. The previous Vocium row in System Settings still shows a green checkbox but points at the now-stale binary — **the checkbox lies**.

If voice transcription succeeds but paste does not fire after a rebuild:

1. Open **System Settings ▸ Privacy & Security ▸ Accessibility**
2. **Remove** the existing Vocium row (`–` button)
3. Add the new `Vocium.app` back (drag from Finder or use `+`) and enable the toggle

The floating icon runs a permission probe at startup, so if Accessibility is missing it surfaces the guidance text on the pill within a couple of seconds — you do not need to make a first voice attempt to discover this. The dev loop (`npm run dev`) launches from Terminal and reuses the granted entry across runs, so this re-grant tax only hits packaged builds.

> **At-a-glance health:** Tray menu shows live status for microphone device, microphone permission, STT key, global shortcut, and (on macOS) Accessibility. Failing items are marked ⚠ and clickable — they jump straight to the relevant OS settings page or the in-app Settings window.

### Configure

Config file: `%APPDATA%\vocium\vocium-config.json` (created on first run).
Edit it live via **Tray → Settings…** — three tabs: General / Speech-to-Text / AI Polish.

```jsonc
{
  "hotkey": "Ctrl+Shift+Space",
  "sttProvider": "groq",               // "groq" | "openai" | "gemini" | "mock"
  "groqApiKey": "<your-groq-key>",     // your Groq key
  "groqModel": "whisper-large-v3-turbo",
  "openaiApiKey": "<your-openai-key>", // optional; for OpenAI provider
  "openaiModel": "whisper-1",
  "openaiBaseUrl": "",                 // optional; leave empty for api.openai.com
  "geminiApiKey": "<your-gemini-key>", // optional; for Gemini provider
  "geminiModel": "gemini-1.5-flash",
  "inputMode": "toggle",               // "toggle" | "ptt" (push-to-talk)
  "vadTrim": false,                    // opt-in silence trimming
  "maxListenMs": 30000,
  "dragLocked": false
}
```

### Set up an STT API key (BYOK)

- No Vocium server, no bundled key — each provider has its own field, stored only on your device.
- Tray → Vocium → right‑click → Settings… → Speech-to-Text.

#### Groq — recommended

Create a key at **https://console.groq.com** and paste it into the Groq API Key field.

#### OpenAI

Create a key at **https://platform.openai.com/api-keys** and paste it into the OpenAI API Key field.
You can set a custom **Base URL** for a compatible third‑party endpoint.

#### Gemini

Create a key at **https://aistudio.google.com/apikey** and paste it into the Gemini API Key field.

> **Privacy** — cloud providers (Groq, OpenAI, Gemini) send your audio off‑device for transcription. For fully offline use, use **Local STT**.

### Daily use

1. Focus any text field (editor, browser, chat…).
2. Press the hotkey or click the floating icon → **listening**.
3. **Speak.**
4. Press again → it transcribes and pastes into the focused field (copied to the clipboard if nothing is focused).

**Toggle** — press once to start, press again to stop and transcribe.
**Push‑to‑talk** — hold to record, release to transcribe.

---

## Design

Visual specs are self‑contained HTML files — open locally in a browser:

- `docs/DESIGN_MOCKUP.html` — floating icon, all five states, hover controls, Settings window.
- `docs/ICON_DESIGN.html` — app‑icon concepts and the chosen mark.

## Architecture

A thin Tauri 2 (Rust) shell drives a Node sidecar that exposes the core logic over a single MCP protocol. Details in [`docs/SPEC.md`](docs/SPEC.md) and [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Use as an MCP tool

The Node sidecar is a **standalone MCP server** — any MCP host (Claude Desktop, Cursor, an Agent SDK, scripts…) can reuse Vocium without rebuilding speech‑to‑text or OS text injection. It exposes three headless tools:

**`transcribe_clip`** — `{ audioBase64, mimeType, language? }` → `{ text }`. Transcribes the supplied audio with your configured provider and applies your Traditional/Simplified preference. Read‑only and side‑effect‑free: the caller receives the text and decides what to do with it.

**`inject_text`** — `{ text }` → `{ ok }`. Types the given text into the OS‑focused window (clipboard + simulated paste). Independent of STT — inject any string. It lands in whichever window has focus at call time, so the caller is responsible for focus.

**`polish_text`** — `{ text, style? }` → `{ text }`. Cleans up text with your locally‑configured LLM provider and key. Three styles: `light` ("Punctuation only" — restores punctuation, breaks into paragraphs, fixes obvious mis‑recognitions; filler words preserved), `full` ("Speech polishing" — also removes filler words and smooths sentence flow), `custom` (your own prompt). Meaning is always preserved. Headless and host‑controlled: the MCP host decides when to call it; it works regardless of the desktop app's polish toggle. Like the other tools, the API key is read from the local Vocium config on the machine running the sidecar — the caller never passes a key.

Register it in an MCP host (after `npm run build`):

```json
{
  "mcpServers": {
    "vocium": { "command": "node", "args": ["<path>/vocium/dist/sidecar/index.js"] }
  }
}
```

The host spawns the sidecar over stdio on demand — nothing to keep running, and the desktop app does not need to be open.

Example — *"Use vocium to transcribe `./meeting.m4a`, then summarize it in Traditional Chinese."* The assistant calls `transcribe_clip`, then works from the returned text.

### Where the API key comes from

MCP callers never pass or see an API key. Vocium reads it from the local config on the machine running the sidecar — `%APPDATA%\vocium\vocium-config.json` (set it once via **Tray → Settings… → Speech-to-Text**, or edit the file). That machine must have Vocium configured with a provider key; the calling agent stays key‑free.

> The caller supplies the audio (Vocium does not open the microphone headlessly). `inject_text` works on **both Windows and macOS**; on macOS the host running the sidecar needs the standard Accessibility permission (see the **Permissions** section).

## Roadmap

Post‑processing pipeline: **STT → AI polish → Traditional/Simplified → inject** (each step optional).

- **Chinese output (Traditional/Simplified)** ✅
- **Multi‑provider STT** — Groq / OpenAI / Gemini, BYOK, PTT, VAD ✅
- **AI polishing** — optional LLM pass (clean fillers, punctuation, fluency) before injection; off by default. ✅
- **Local STT** — whisper.cpp / faster‑whisper / LocalAI / Ollama. On‑device transcription; next planned item.
- **Local LLM polish** — on‑device polish pass. Deferred.

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for details.

## License

MIT
