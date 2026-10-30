# Vocium Roadmap

**Desktop voice typing for Windows and macOS.**

---

## Status

Vocium is fully functional on Windows 11 and macOS. It supports three cloud STT providers (Groq, OpenAI, Gemini), optional AI polish, Traditional/Simplified Chinese conversion, Toggle and Push-to-Talk (PTT) modes, VAD silence trimming, and a tray health panel. Single process: the Rust shell owns the OS layer and the voice core (`@vocium/voice-core`) runs inside the webview, reusable in other projects.

---

## Shipped

- **Floating icon** — always-on-top overlay; lock/unlock drag, minimize to system tray, never steals focus
- **Toggle and Push-to-Talk (PTT)** — configurable global hotkey with immediate effect; hotkey recorder in Settings
- **Multi-provider STT** — Groq, OpenAI Whisper, Gemini; bring-your-own-key, stored only on your device; curated model list with a custom escape hatch
- **AI polish** — optional LLM post-processing before injection (add punctuation, remove filler words, improve fluency); providers: Groq, OpenAI, Gemini, Claude; three styles: basic correction, full polish, custom prompt; any failure falls back to the raw transcript
- **Chinese output** — force Traditional (Taiwan) or Simplified; conversion runs after AI polish to preserve intent
- **VAD silence trimming** — opt-in; strips leading/trailing silence before sending to STT
- **Tray health panel** — five probes (microphone device, microphone permission, macOS Accessibility, STT API key, global hotkey); failures link directly to OS settings; pre-flight check before recording starts
- **STT timeout + cancel** — 30-second hard timeout; clicking the icon during transcription cancels immediately
- **Packaged builds** — `npm run package` produces a self-contained installer (Windows: `.msi`/`.nsis`; macOS: `.app`/`.dmg`)
- **macOS parity** — Accessibility-based injection (`pbcopy` + `osascript Cmd+V`), in-app guidance when permission is missing, graceful degradation
- **Single-process architecture** (2026-10) — Node sidecar and MCP removed; core extracted to `packages/voice-core` (pure TS, fetch-only); Windows injection is now native Win32; clipboard restored after injection

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
