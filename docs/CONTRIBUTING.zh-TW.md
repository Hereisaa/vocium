# Contributing to Vocium

感謝你對 Vocium 的貢獻！本文件說明主要開發流程與注意事項。

## 專案結構

```
packages/voice-core/   純 TypeScript 核心（STT adapters、潤稿、繁簡、狀態機、pipeline）+ 測試
app-tauri/ui/src/      webview 原始碼（app.js 懸浮 ICON、settings.js 設定、i18n.js）
app-tauri/ui/build/    esbuild 產物（gitignored）
app-tauri/src-tauri/   Rust 殼層（視窗、Tray、快捷鍵、設定檔、原生注入 inject.rs）
scripts/               建置輔助（build-ui.mjs、copy-vad-assets.mjs、圖示產生）
```

單一行程：voice-core 在懸浮 ICON 的 webview 內執行，透過 Tauri 的 `invoke`／event 與 Rust 溝通，網路請求走 `@tauri-apps/plugin-http` 的 `fetch`。

## 環境前置需求

- **Node.js ≥ 20**
- **Rust toolchain** + Tauri 2 prerequisites
- **Windows** 或 **macOS**（文字注入：Windows = Win32 剪貼簿 + `SendInput` Ctrl+V，macOS = `pbcopy` + `osascript` Cmd+V；Linux 為 best-effort，需 `wl-copy`/`xclip` 與 `wtype`/`xdotool`）

## Build & Test Gates

每次提交前請確保以下全綠（PR 不應使任何一項變紅）：

```bash
# 1. voice-core 型別檢查 + webview 打包
npm run build

# 2. voice-core 單元測試
npm test

# 3. Rust 殼測試
cargo test --manifest-path app-tauri/src-tauri/Cargo.toml

# 4. 推遠端前：確認 diff 未混入真實金鑰
git diff origin/main..HEAD -U0 | grep -nE "gsk_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{30,}" || echo "no secrets"
```

基準：**tsc clean、vitest 全綠、cargo 0 errors / 0 warnings、no secrets**。

## 新增／更新 STT 模型

模型清單只有**一個**來源：`packages/voice-core/src/stt/models.ts`。`settings.js` 直接 `import { STT_MODELS, POLISH_MODELS }`，不再有鏡像副本。

```typescript
export const STT_MODELS: Record<CloudProvider, ModelOption[]> = {
  groq: [
    { id: 'whisper-large-v3-turbo', label: 'whisper-large-v3-turbo（預設・快）', labelEn: '…' },
  ],
  // …
};
export const DEFAULT_MODEL: Record<CloudProvider, string> = { /* … */ };
```

- 不做 runtime model-list fetch：各家 `/models` 端點無可靠的 STT 旗標可過濾、需要金鑰、增加首次開啟延遲。
- 模型選單末項「自訂…」允許輸入任意模型 id，清單落後不會卡住使用者。
- `POLISH_MODELS` / `DEFAULT_POLISH_MODEL` 規則相同，涵蓋四家 provider（groq / openai / gemini / claude；claude 無 STT 但可潤稿）。

## 新增 STT Provider

1. 在 `packages/voice-core/src/stt/` 新增 `<provider>-stt.ts`，實作 `SttAdapter`（參考既有三家）。只能用 `deps.fetch`，不可用 Node API。
2. 在 `models.ts` 增加該 provider 的模型清單與 `DEFAULT_MODEL`。
3. 在 `stt-adapter.ts` 的 `createSttAdapter` 工廠新增分支；確認 `resolve-active.ts` 涵蓋新 provider。
4. 在 `config.ts` 新增 config 欄位（`<provider>ApiKey`、`<provider>Model`，選填 `baseUrl`）。
5. 在 Rust `lib.rs` 的 `set_provider_key` / `clear_provider_key` / `derive_active` / `get_config` 新增分支。
6. 在 `app-tauri/ui/src/settings.js` 加入 Settings UI（參考既有結構）。
7. 新增對應測試（`packages/voice-core/tests/<provider>-stt.test.ts`），涵蓋 200 解析、金鑰缺失、錯誤分類。

## 設定檔安全

- **切勿將真實 API 金鑰提交進版控**。`vocium-config.json` 已在 `.gitignore` 中排除。
- 金鑰僅存本機。`get_config` 回傳 `keySet` + `mask` 給設定視窗；`read_config_raw` 回傳完整設定（含金鑰）給同一行程內的 voice-core 使用，不會離開本機。

## 程式碼風格

- TypeScript：遵循 `packages/voice-core/tsconfig.json` 嚴格模式；pure modules（DI，無 global state）。
- Rust：保持 `cargo clippy` 乾淨；新 helper 請仿照 `derive_active` / `mask_key` 風格。

## 提交訊息 (Commit Message)

簡短 imperative（英文）；主要變更一句話說明。範例：

```
add GeminiSttAdapter with gemini-1.5-flash default
fix(settings): default polish model when switching provider
```
