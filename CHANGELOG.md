# Changelog

All notable changes to Vocium are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet._

## [0.1.0] - 2026-05-22

First public release. A desktop AI voice-input tool whose core is exposed over a single MCP protocol.

### Added

- **Floating pill** — lockable/draggable overlay, minimize to tray, never steals focus; five visual states (idle / listening / transcribing / injecting / error).
- **Two capture modes** — toggle and push-to-talk, with a customizable global hotkey.
- **Multi-provider cloud STT** — Groq, OpenAI Whisper, and Gemini. Bring-your-own-key (BYOK); keys are stored locally only.
- **AI polish** — optional LLM cleanup before injection, in three styles: basic correction, conversational polish, and custom prompt. Transcript is prompt-injection guarded.
- **Chinese output** — force Traditional or Simplified (offline conversion via OpenCC); applied after polish.
- **Voice activity detection (VAD)** — optional silence trimming.
- **MCP-native** — bundled standalone MCP server. Three headless tools for external hosts (`transcribe_clip`, `inject_text`, `polish_text`) plus state-machine tools (`toggle`, `start_listening`, `stop_listening`, `cancel`, `get_state`, `submit_audio`) and `probe_inject` for the desktop shell. Keys are read from the host machine's config — never passed by or visible to the caller.
- **Tray health panel** — live status for microphone device, microphone permission, STT key, global hotkey, and (macOS) Accessibility; failed checks are clickable and open the relevant OS or in-app settings.
- **Bilingual UI** — Traditional Chinese / English, switchable live across the pill, settings, tray, and health panel.
- **Multi-microphone selection** in settings.
- **Cross-platform** — Windows and macOS, from source (`npm run dev`) or packaged installers (`.msi` / `.nsis` / `.app` / `.dmg` via a Bun-compiled sidecar binary).

[Unreleased]: https://github.com/Hereisaa/vocium/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Hereisaa/vocium/releases/tag/v0.1.0
