# Contributing to Vocium

Thank you for contributing to Vocium! This document describes the main development workflow and key guidelines.

## Project layout

```
packages/voice-core/   pure-TypeScript core (STT adapters, polish, zh conversion, state machine, pipeline) + tests
app-tauri/ui/src/      webview sources (app.js floating icon, settings.js, i18n.js)
app-tauri/ui/build/    esbuild output (gitignored)
app-tauri/src-tauri/   Rust shell (window, tray, hotkey, config file, native injection in inject.rs)
scripts/               build helpers (build-ui.mjs, copy-vad-assets.mjs, icon generation, check-models.mjs)
```

Single process: voice-core runs inside the floating icon's webview, talks to Rust via Tauri `invoke`/events, and makes network requests through `@tauri-apps/plugin-http`'s `fetch`.

## Prerequisites

- **Node.js ≥ 20**
- **Rust toolchain** + Tauri 2 prerequisites
- **Windows** or **macOS** (text injection: Windows = Win32 clipboard + `SendInput` Ctrl+V, macOS = `pbcopy` + `osascript` Cmd+V; Linux is best-effort via `wl-copy`/`xclip` + `wtype`/`xdotool`)

## Build & Test Gates

Before every commit, ensure all of the following pass (no PR should turn any gate red):

```bash
# 1. voice-core type-check + webview bundles
npm run build

# 2. voice-core unit tests
npm test

# 3. Rust shell tests
cargo test --manifest-path app-tauri/src-tauri/Cargo.toml

# 4. Before pushing: confirm the diff contains no real API keys
git diff origin/main..HEAD -U0 | grep -nE "gsk_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{30,}" || echo "no secrets"
```

Baseline: **tsc clean, vitest all green, cargo 0 errors / 0 warnings, no secrets**.

## Adding / Updating an STT Model

There is exactly **one** model list: `packages/voice-core/src/stt/models.ts`. `settings.js` imports `STT_MODELS` / `POLISH_MODELS` from it — there is no mirrored copy any more.

```typescript
export const STT_MODELS: Record<CloudProvider, ModelOption[]> = {
  groq: [
    { id: 'whisper-large-v3-turbo', label: 'whisper-large-v3-turbo（預設・快）', labelEn: '…' },
  ],
  // …
};
export const DEFAULT_MODEL: Record<CloudProvider, string> = { /* … */ };
```

- No runtime model-list fetch: provider `/models` endpoints have no reliable STT flag, need a key, and add first-open latency.
- The dropdown's last entry "Custom…" accepts any model id, so a stale list never blocks anyone.
- `POLISH_MODELS` / `DEFAULT_POLISH_MODEL` follow the same rules across four providers (groq / openai / gemini / claude; claude has no STT but can polish).

## Keeping the model list current

Three layers share the job, and none of them needs an API key:

1. **Script — `npm run check:models`** (`scripts/check-models.mjs`). Fetches each provider's *public* models and
   deprecations pages (Groq, OpenAI, Gemini, Claude), flattens them to text and checks every id in `STT_MODELS`,
   `POLISH_MODELS`, `DEFAULT_*` and the replacement ids in `RETIRED_MODEL_REPLACEMENTS`. An id missing from the
   models page is **severe** (exit 1) unless the deprecations page still gives a future shutdown date; an id listed as
   deprecated is a **warning**; a page that cannot be fetched (403, timeout, JS shell) is **unverifiable** rather than a
   false alarm. Pass `--out report.md` to also write the Markdown report. If `GROQ_API_KEY` / `OPENAI_API_KEY` /
   `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` happen to be set in your shell, the script additionally compares against the
   live `/models` endpoint through voice-core's `listModels()`; keys are never printed. Requires `npm run build:core` first.
2. **Project skill — `.claude/skills/update-models/SKILL.md`.** The step-by-step playbook for Claude Code (or a human):
   run the script, confirm replacements and price positioning on the official docs, edit `models.ts` (labels, `DEFAULT_*`,
   `MODEL_LIST_VERIFIED_AT`, `RETIRED_MODEL_REPLACEMENTS`), update `docs/CONFIGURATION*.md` and `CHANGELOG.md`, run
   `npm test`, open a PR. It spells out that keys are never printed or committed.
3. **Scheduled CI — `.github/workflows/check-models.yml`.** Runs the script on the 1st of every month (and on
   `workflow_dispatch`) with **no repository secrets** — only the default `GITHUB_TOKEN`, scoped to
   `issues: write, contents: read`. On severe drift it opens or updates a single issue titled **Model list drift**
   (label `model-drift`) containing the report; when a later run is clean it comments on and closes that issue. Because
   it has no keys it can only verify public documentation, which is intentional: the owner does not want provider
   credentials in GitHub.

Typical loop: CI opens the issue → run the `update-models` skill locally → PR → merge → next monthly run closes the issue.

## Adding an STT Provider

1. Add `<provider>-stt.ts` under `packages/voice-core/src/stt/` implementing `SttAdapter` (see the existing three). Use only `deps.fetch` — no Node APIs.
2. Add the provider's model list and `DEFAULT_MODEL` entry in `models.ts`.
3. Add a branch in `createSttAdapter` (`stt-adapter.ts`); make sure `resolve-active.ts` covers the new provider.
4. Add config fields in `config.ts` (`<provider>ApiKey`, `<provider>Model`, optional `baseUrl`).
5. Add branches in Rust `lib.rs`: `set_provider_key` / `clear_provider_key` / `derive_active` / `get_config`.
6. Add the Settings UI in `app-tauri/ui/src/settings.js`.
7. Add tests (`packages/voice-core/tests/<provider>-stt.test.ts`): 200 parsing, missing key, error classification.

## Config security

- **Never commit real API keys.** `vocium-config.json` is gitignored.
- Keys stay on the local machine. `get_config` returns `keySet` + `mask` for the Settings window; `read_config_raw` returns the full config (keys included) to voice-core inside the same process — it never leaves the machine.

## Code style

- TypeScript: follow `packages/voice-core/tsconfig.json` strict mode; pure modules (DI, no global state).
- Rust: keep `cargo clippy` clean; model new helpers on `derive_active` / `mask_key`.

## Commit messages

Short imperative (English); one line for the main change. Examples:

```
add GeminiSttAdapter with gemini-1.5-flash default
fix(settings): default polish model when switching provider
```
