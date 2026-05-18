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

### Prerequisites

- **Windows 11** (macOS / Linux: coming soon).
- **Node.js ≥ 20** · **Rust toolchain** · **WebView2** runtime · **MSVC build tools**

### Steps

```bash
git clone <repo-url> vocium
cd vocium
npm install
npm run build          # compile the TypeScript sidecar
npm run dev            # build + launch the desktop app (tauri dev)
```

For a local installable build:

```bash
npx tauri build --config app-tauri/src-tauri/tauri.conf.json
```

> The produced binary is unsigned; installer packaging/signing is a later‑phase item.

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

The Node sidecar is a **standalone MCP server** — any MCP host (Claude Desktop, Cursor, an Agent SDK, scripts…) can reuse Vocium without rebuilding speech‑to‑text or OS text injection. It exposes two headless tools:

**`transcribe_clip`** — `{ audioBase64, mimeType, language? }` → `{ text }`. Transcribes the supplied audio with your configured provider and applies your Traditional/Simplified preference. Read‑only and side‑effect‑free: the caller receives the text and decides what to do with it.

**`inject_text`** — `{ text }` → `{ ok }`. Types the given text into the OS‑focused window (clipboard + simulated paste). Independent of STT — inject any string. It lands in whichever window has focus at call time, so the caller is responsible for focus.

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

> The caller supplies the audio (Vocium does not open the microphone headlessly); `inject_text` is Windows‑only for now.

## Roadmap

Post‑processing pipeline: **STT → Traditional/Simplified → AI polish → inject** (each step optional).

- **Chinese output (Traditional/Simplified)** ✅
- **Multi‑provider STT** — Groq / OpenAI / Gemini, BYOK, PTT, VAD ✅
- **AI polishing** — optional LLM pass (clean fillers, punctuation, fluency) before injection; off by default.
- **Local STT** — whisper.cpp / faster‑whisper / LocalAI / Ollama. On‑device transcription; next planned item.

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for details.

## License

MIT
