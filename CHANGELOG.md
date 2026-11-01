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

- **New app icon** ("Swash"): a solid black disc cut once by a hand-lettered V. One mark and
  one gesture: the V is the opening of a mouth, the disc is the "o" of Vocium (and the plainest
  speech-bubble outline), and the wedge the cut frees is the word leaving it. One ink
  (`#000000`), no gradient, outline or second shape, on a flat white tile; it replaces "V-Mic"
  (and, before that, "Cut-V Bubble", "Voice Ribbon", "AI Mic" and the equaliser V, all retired).
  The V is a single channel of constant width 28 (1.75 px at 16 px) whose arms leave the vertex
  at 26 and 34 degrees and relax to 40 and 56, so it leans 4 to 8 degrees like a hand-lettered
  V; it splits the disc (r = 104, 81 % of the tile) into a wedge and a bowl. Every convex corner
  is r = 6 and the vertex r = 7, blended with a Gaussian so the curvature never jumps; each
  contour is fitted to 12 and 14 cubic Beziers (G1, maximum deviation 0.05 units) and the mark is
  optically centred (moved by 0.09, -1.66). At 16 px the gap is 1.75 px, the black chin under
  the V 2.2 px and the wedge 7.3 px tall.
- **Tray glyph in two colours.** `tray.svg` is the same mark without the tile: the same two
  shapes scaled 0.1413 onto the 32 grid, with the V channel widened to 32 construction units
  (2.3 px at 16 px) so it still opens up when the system downscales. `npm run icons` now renders
  `tray-dark-*.png` (black, for light taskbars and the macOS template image) and
  `tray-light-*.png` (white, for dark taskbars). On Windows `build_tray` reads
  `HKCU\...\Themes\Personalize\SystemUsesLightTheme` at startup (new `Win32_System_Registry`
  feature of the `windows` crate) and embeds the matching one; elsewhere it embeds the white one.
  A taskbar theme change takes effect on the next launch. The old `tray-{16,22,32,44}.png` are no
  longer generated or used; `lib.rs` is unchanged. Rationale, construction, the two other
  finalists ("Orb Cut" and "Bubble Cut", sources included for a one-file swap), the 16 px rules,
  the explorations and why the five earlier marks were retired are in `docs/ICON_DESIGN.html`.
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
