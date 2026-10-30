# Changelog

All notable changes to Vocium are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Single-process architecture.** The Node sidecar (Bun-compiled binary) and the MCP
  server/client layer are gone. The voice core now runs inside the floating icon's
  webview; the Rust shell only does OS work (window, tray, hotkey, config file,
  native text injection). Smaller installers, no sidecar restarts on settings change.
- **`@vocium/voice-core` package** (`packages/voice-core/`): the former `src/core`
  as a pure-TypeScript, fetch-only library reusable outside Vocium. Model lists are
  imported by the Settings UI instead of being mirrored by hand.
- **Windows injection is native** (Win32 clipboard + `SendInput` Ctrl+V) — no
  PowerShell cold start. All platforms restore the user's previous clipboard text
  after pasting.
- Network requests go through `@tauri-apps/plugin-http` (issued by Rust).
- Cancelling while a transcription is in flight now drops the late result instead
  of pasting it.

### Added

- `docs/ARCHITECTURE.md` — the architecture single source of truth (process
  boundaries, source map, state machine, IPC contract, decision log).
- `docs/archify/` — Archify architecture + voice-input workflow diagrams with
  source citations, rendered from the JSON candidates next to them.

### Changed (icon + README)

- **New app icon** ("V-Mic"): the letter V whose right arm ends in an upright microphone
  capsule. One solid black silhouette: a plain round-capped stroke for the left arm, and a
  right arm that swells into a stadium-shaped capsule (64 x 100, 1.6x the 40-unit stroke)
  like the head of a studio microphone. One ink (`#000000`), no gradient, outline or second
  shape, on a flat white tile; it replaces "Cut-V Bubble" (and, before that, the rejected
  "Voice Ribbon"). Drawn as one closed path of 8 arcs and 7 lines from four integer
  construction points, with every convex end at r >= 20 and every concave corner at r = 16.
  The capsule's flanks sit on x = 144 and 208, so at 16 px it is a crisp 4 px wide pill and
  the V's notch stays at least 2 px wide; the mark fills 65.6 % of the tile.
- **Tray glyph in two colours.** `tray.svg` is the same mark without the tile (scaled 10/64,
  capsule edges on even units so it is a whole-pixel pill at 16 and 32 px);
  `npm run icons` now renders `tray-dark-*.png` (black, for light taskbars and the
  macOS template image) and `tray-light-*.png` (white, for dark taskbars). On Windows
  `build_tray` reads `HKCU\...\Themes\Personalize\SystemUsesLightTheme` at startup
  (new `Win32_System_Registry` feature of the `windows` crate) and embeds the matching
  one; elsewhere it embeds the white one. A taskbar theme change takes effect on the
  next launch. The old `tray-{16,22,32,44}.png` are no longer generated or used.
  Construction, the comparison with the earlier marks and the explorations (the capsule
  variants and the iteration rounds) are in `docs/ICON_DESIGN.html`.
- **README rewritten** (zh-TW + en): short sections, feature table, three-step
  setup, permissions table. The hero is now an animated SVG
  (`docs/assets/showcase.svg`); `npm run showcase` renders the GIF fallback.
- Removed the old `showcase.html` + `gen-banner.mjs` banner pipeline.

### Fixed (review follow-ups)

- A late STT result (or failure) from a cancelled round is dropped even when a
  newer round is already transcribing (session epoch check), instead of being
  pasted or flashing an error over the new round.
- Cancelling during the config-read / VAD-trim gap before submit now discards
  the audio quietly instead of showing a bogus "send failed" error.
- Overlapping `startRecording` calls (slow mic prompt + rapid toggling) no
  longer leak a live recorder/stream; each capture has a generation number.
- Windows injection: the clipboard `HGLOBAL` is freed when `GlobalLock` or
  `SetClipboardData` fails; the previous-text scan is bounded by `GlobalSize`.
- A `plugin-http` "Request canceled" rejection is classified as a timeout.

### Removed

- MCP tools (`transcribe_clip`, `inject_text`, `polish_text`, state-machine tools),
  `dist/sidecar/main.js` entry point, Bun build requirement.
- Dead config field `cancelKey`, unused i18n key `lbl.apiKey`, the one-off
  `scripts/gen-sample-audio.ps1`, `@types/node`, and leftover sidecar/MCP/spec
  references in comments.

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
