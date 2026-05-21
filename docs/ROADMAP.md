# Vocium Roadmap

**Desktop voice typing for Windows and macOS — MCP-native.**

---

## Status

Vocium is fully functional on Windows 11 and macOS. It supports three cloud STT providers (Groq, OpenAI, Gemini), optional AI polish, Traditional/Simplified Chinese conversion, Toggle and Push-to-Talk (PTT) modes, VAD silence trimming, a tray health panel, and a standalone MCP server. Packaged builds require no Node.js on the end user's machine.

---

## Shipped

- **Floating icon** — always-on-top overlay; lock/unlock drag, minimize to system tray, never steals focus
- **Toggle and Push-to-Talk (PTT)** — configurable global hotkey with immediate effect; hotkey recorder in Settings
- **Multi-provider STT** — Groq, OpenAI Whisper, Gemini; bring-your-own-key, stored only on your device; curated model list with a custom escape hatch
- **AI polish** — optional LLM post-processing before injection (add punctuation, remove filler words, improve fluency); providers: Groq, OpenAI, Gemini, Claude; three styles: punctuation-only, full polish, custom prompt; any failure falls back to the raw transcript
- **Chinese output** — force Traditional (Taiwan) or Simplified; conversion runs after AI polish to preserve intent
- **VAD silence trimming** — opt-in; strips leading/trailing silence before sending to STT
- **Tray health panel** — five probes (microphone device, microphone permission, macOS Accessibility, STT API key, global hotkey); failures link directly to OS settings; pre-flight check before recording starts
- **STT timeout + cancel** — 30-second hard timeout; clicking the icon during transcription cancels immediately
- **MCP-native** — standalone MCP server (`transcribe_clip`, `inject_text`, `polish_text`); any MCP host (Claude Desktop, Cursor, scripts) can call STT and text injection headlessly
- **Packaged builds** — `npm run package` produces a self-contained installer (Windows: `.msi`/`.nsis`; macOS: `.app`/`.dmg`); sidecar compiled to a single binary, no Node.js required for end users
- **macOS parity** — Accessibility-based injection (`pbcopy` + `osascript Cmd+V`), in-app guidance when permission is missing, graceful degradation

---

## Planned / Deferred

- **Local STT** *(planned)* — on-device transcription via whisper.cpp, faster-whisper, or Ollama-compatible backends; no API key or internet required; Local option is already visible in the STT provider selector (currently shows "coming soon")
- **Local LLM polish** *(planned)* — on-device AI polish via Ollama or similar; same pipeline, new provider option
- **Streaming transcription** *(planned)* — stream audio to reduce latency instead of a single-shot upload
- **Usage / cost estimate** *(planned)* — display approximate API usage in the tray
- **Multi-microphone selection + input gain** *(planned)*
- **Launch at login** *(planned)*
- **UI language (i18n)** *(planned)* — Chinese / English interface toggle
- **Code signing** *(deferred)* — Windows SmartScreen + macOS Developer ID / notarization; currently unsigned builds require a manual Gatekeeper workaround on macOS after each new build
- **Cross-platform CI + public Releases** *(deferred)* — automated builds for both platforms on push/tag, Homebrew Cask / Scoop / winget manifests
- **BrainMesh integration** *(deferred)* — register the Vocium sidecar as a callable MCP tool inside BrainMesh
