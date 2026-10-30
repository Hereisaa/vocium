<p align="center">
  <img src="app-tauri/src-tauri/icons/128x128.png" width="96" height="96" alt="Vocium" />
</p>

<h1 align="center">Vocium</h1>

<p align="center">
  <b>AI‑powered voice typing for the desktop.</b>
</p>

<p align="center">
  <a href="README.md">繁體中文</a> · <b>English</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License: MIT" />
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-555" alt="Platform: Windows and macOS" />
</p>

<p align="center">
  <img src="docs/assets/showcase.gif" width="940" alt="Vocium — AI voice input demo (hotkey → speak → text inserted)" />
</p>

---

Press a hotkey, speak, and AI transcribes your voice and pastes it straight into the focused field — no focus stolen, no server, no bundled credentials. Supports Windows and macOS.

## Architecture

One process. The Tauri 2 (Rust) shell does only OS work: window, tray, global shortcut, config file, native text injection. All voice logic — state machine, recording, STT, AI polish, Chinese script conversion — is **`@vocium/voice-core`**, a pure‑TypeScript package that runs inside the floating icon's webview. Network requests go out through Tauri's http plugin (issued by Rust).

```
Vocium.exe (the only process)
  ├ Rust shell    window · tray · hotkey · config · clipboard + paste keystroke
  └ webview       UI + voice-core (state machine · STT · polish · zh conversion)
```

`packages/voice-core/` has no platform dependency (it only needs a `fetch`), so it can be reused in a browser, Node or Bun.

## Features

- **Floating icon** — lock/unlock drag, minimize to tray, never steals focus
- **Toggle or push‑to‑talk** — with a custom global hotkey
- **Multi‑provider STT** — Groq, OpenAI Whisper, Gemini; bring‑your‑own‑key, stored only on your device
- **AI polish** — optional LLM cleanup pass before injection (punctuation, fillers, fluency)
- **Chinese output** — force Traditional or Simplified; opt‑in VAD silence trimming
- **Clipboard restore** — your previous clipboard text is put back after injection

---

### Prerequisites

| Tool | Why | Notes |
|---|---|---|
| **Node.js ≥ 20** | builds voice-core + the webview bundles | includes `npm` |
| **Rust toolchain** | builds the Tauri shell | — |

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
winget install --id Microsoft.VisualStudio.2022.BuildTools  # select "Desktop development with C++"
```

**🍎 macOS (Terminal):**
```bash
xcode-select --install                                          # Xcode CLT (system dialog)
brew install node                                               # Node.js (≥ 20), or use nvm
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh  # Rust
```

After installing Rust, open a new shell so the updated `PATH` is picked up.

### Verify your toolchain

```bash
node -v   # ≥ 20 (LTS recommended)
npm -v    # should print cleanly — no version-compatibility error
cargo -V
```

### Run from source

```bash
git clone https://github.com/Hereisaa/vocium.git
cd vocium
npm install
npm run dev   # builds voice-core + the webview bundles, then launches via `tauri dev`
```

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

No paste permission is required — Vocium uses the Win32 clipboard API and `SendInput` for Ctrl+V, neither of which needs elevated rights.

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

## Reusing voice-core in your own project

```ts
import { createSttAdapter, normalizeConfig, polishText } from '@vocium/voice-core';

const cfg = normalizeConfig({ sttProvider: 'groq', groqApiKey: process.env.GROQ_KEY });
const stt = createSttAdapter(cfg, { fetch });
const { text } = await stt.transcribe({ audio: bytes, mimeType: 'audio/webm' });
```

The package depends only on `fetch` — no Node or DOM APIs. It currently lives as an npm workspace in `packages/voice-core/`.

---

## Documentation

| Doc | What |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | **Architecture SSOT** (zh-TW): process boundaries, source map, state machine, IPC contract, decision log |
| [docs/archify/vocium-architecture.html](docs/archify/vocium-architecture.html), [voice-input-workflow.html](docs/archify/voice-input-workflow.html) | Interactive architecture + workflow diagrams (Archify, rendered from the JSON next to them, with source citations) |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | `vocium-config.json`, BYOK key setup, AI polish |
| [docs/ROADMAP.md](docs/ROADMAP.md) | What's shipped, planned, and deferred |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | Dev workflow, build gates, adding providers |
| [DESIGN_MOCKUP](https://hereisaa.github.io/vocium/DESIGN_MOCKUP.html), [ICON_DESIGN](https://hereisaa.github.io/vocium/ICON_DESIGN.html) | Design mockups (live preview) |

---

## License

MIT
