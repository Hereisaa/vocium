# Contributing to Vocium

Thank you for contributing to Vocium! This document describes the main development workflow and key guidelines.

## Prerequisites

- **Node.js ≥ 20**
- **Rust toolchain** + Tauri 2 prerequisites
- **Windows** or **macOS** (both platforms support text injection: Windows = PowerShell `Set-Clipboard`+`SendKeys`, macOS = `pbcopy`+`osascript` Cmd+V)

## Build & Test Gates

Before every commit, ensure all of the following pass (no PR should turn any gate red):

```bash
# 1. TypeScript type-check + sidecar compile
npm run build

# 2. Unit tests + MCP integration tests
npx vitest run

# 3. Rust shell tests
cargo test --manifest-path app-tauri/src-tauri/Cargo.toml

# 4. webview JS syntax check (app-tauri/ui/*.js are plain JS, outside tsconfig scope)
node --check app-tauri/ui/app.js
node --check app-tauri/ui/settings.js

# 5. Before pushing: confirm the diff contains no real API keys
git diff origin/main..HEAD -U0 | grep -nE "gsk_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{30,}" || echo "no secrets"
```

Baseline: **tsc clean, vitest all green, cargo 0 errors / 0 warnings, node --check no output, no secrets**.

> **Gate 3 note**: `cargo test` first runs the tauri-build `externalBin` pre-check, which requires `app-tauri/src-tauri/binaries/vocium-sidecar-<target-triple>` to exist. Running `npm run dev` or `npm run build:sidecar-bin` (requires Bun) once beforehand is sufficient. If you only want to run tests without installing Bun, you can temporarily place a 1-byte stub file with the expected name so the pre-check passes — remove it after testing and do not commit it.

## Adding / Updating an STT Model

The STT model list must be kept in sync in **two places**:

### 1. `src/core/stt/models.ts` (single source of truth)

This is the **single source of truth** used by the Node sidecar and the TypeScript core. Each provider maps to an array of `{ id, label }` options; `DEFAULT_MODEL` is a **separate top-level constant** (not nested inside the list).

```typescript
export const STT_MODELS: Record<CloudProvider, ModelOption[]> = {
  groq: [
    { id: 'whisper-large-v3-turbo', label: 'whisper-large-v3-turbo（預設）' },
    { id: 'whisper-large-v3', label: 'whisper-large-v3' },
  ],
  openai: [{ id: 'whisper-1', label: 'whisper-1（預設）' }],
  gemini: [{ id: 'gemini-1.5-flash', label: 'gemini-1.5-flash（預設）' }],
};

export const DEFAULT_MODEL: Record<CloudProvider, string> = {
  groq: 'whisper-large-v3-turbo', openai: 'whisper-1', gemini: 'gemini-1.5-flash',
};
```

### 2. `app-tauri/ui/settings.js` (intentional mirror copy for the webview)

The webview has no bundler and **cannot** `import` Node modules, so `STT_MODELS` is **manually duplicated** in `settings.js` with the same structure. This is an intentional design trade-off, not an oversight.

> **When updating the model list, both locations must be updated together — no exceptions.**
> If they diverge, the webview Settings dropdown and the model actually used by the sidecar may disagree.

### Why no runtime model-list fetch?

- The `/models` endpoints provided by each vendor have no reliable STT flag to filter on.
- An API key is required, which adds an additional failure surface.
- It increases latency and network dependency on first open of Settings.

See design decision D7 (`docs/superpowers/specs/2026-05-18-vocium-multi-stt-ptt-vad-design.md`, gitignored internal document).

### The "Custom…" escape hatch

The last item in the Settings dropdown is "Custom…", which lets users type any arbitrary model string — useful for the latest models not yet in the curated list. This is intentional design so that a stale list never blocks the user.

### AI Polish models (POLISH_MODELS)

`POLISH_MODELS` / `DEFAULT_POLISH_MODEL` follow the **identical rules** as `STT_MODELS` above — same two-location sync (`src/core/stt/models.ts` + the `app-tauri/ui/settings.js` mirror), same "Custom…" escape hatch, same no-runtime-fetch policy. Only differences: the constants are `POLISH_MODELS` / `DEFAULT_POLISH_MODEL`, and they cover **four** providers (groq / openai / gemini / claude).
※ claude has no STT but is usable for polish

## Adding a New STT Provider

1. Add `<provider>-stt.ts` under `src/core/stt/` implementing the `SttAdapter` interface
   (refer to `groq-stt.ts` / `openai-stt.ts` / `gemini-stt.ts` as examples).
2. Add the provider's model list and `DEFAULT_MODEL` to `src/core/stt/models.ts`.
3. Sync the new provider into `STT_MODELS` in `app-tauri/ui/settings.js` (see section above).
4. Add a branch for the new provider in the `createSttAdapter` factory in `src/core/stt/stt-adapter.ts`;
   also verify that the normalization logic in `resolveActive(cfg)` (`src/core/stt/resolve-active.ts`) covers the new provider.
5. Add config fields in `src/core/config.ts` (`<provider>ApiKey`, `<provider>Model`, optional `baseUrl`).
6. On the Rust side in `app-tauri/src-tauri/src/lib.rs`, add provider branches to
   `set_provider_key` / `clear_provider_key` and update the `providers` struct in `get_config`.
7. Add Settings UI in `app-tauri/ui/settings.js` (follow the existing Groq/OpenAI/Gemini structure).
8. Add corresponding tests (`tests/<provider>-stt.test.ts`) covering: 200 response parsing, missing-key `noKey` case, and error classification.

## Config File Safety

- **Never commit real API keys to version control.** `vocium-config.json` is excluded via `.gitignore`.
- All key fields (`groqApiKey`, `openaiApiKey`, `geminiApiKey`) are stored locally only.
- The `get_config` Rust command returns `keySet:bool` + `mask:string` and **never** returns the raw key to the frontend.

## Code Style

- TypeScript: follow the existing `tsconfig.json` strict mode; pure modules (DI, no global state).
- Rust: keep `cargo clippy` clean (no project-specific config — standard lints); model new helpers on the style of `derive_active` / `mask_key`.

## Commit Message

Short imperative (English); one sentence describing the main change. Examples:

```
add GeminiSttAdapter with gemini-1.5-flash default
fix: sync STT_MODELS in settings.js after adding gemini-2.0
```
