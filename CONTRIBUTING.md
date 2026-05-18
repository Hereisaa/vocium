# Contributing to Vocium

感謝你對 Vocium 的貢獻！本文件說明主要開發流程與注意事項。

## 環境前置需求

- **Node.js ≥ 20**
- **Rust toolchain** + Tauri 2 prerequisites（Edge WebView2 Runtime、MSVC build tools）
- **Windows 11**（v1 範疇；文字注入為 PowerShell，零 native build）

## Build & Test Gates

每次提交前請確保以下三項全綠：

```bash
# 1. TypeScript 型別檢查 + sidecar 編譯
npm run build

# 2. 單元測試 + MCP 整合測試
npx vitest run

# 3. Rust 殼型別檢查（在 app-tauri/src-tauri 目錄下執行）
cargo check --manifest-path app-tauri/src-tauri/Cargo.toml
```

目前基準：**vitest 106/106 passed、tsc clean、cargo 0 errors / 0 warnings**。PR 不應使任何一項變紅。

## Adding / Updating an STT Model

STT 模型清單有**兩個地方**必須同步維護：

### 1. `src/core/stt/models.ts`（唯一常數來源）

這是 Node sidecar 與 TypeScript 核心使用的 **single source of truth**。每個 provider 的精選模型陣列與 `DEFAULT_MODEL` 皆定義於此。

```typescript
// 新增 / 更新範例
export const STT_MODELS = {
  groq: { models: ['whisper-large-v3-turbo', 'whisper-large-v3', ...], default: 'whisper-large-v3-turbo' },
  openai: { models: ['whisper-1', ...], default: 'whisper-1' },
  gemini: { models: ['gemini-1.5-flash', 'gemini-1.5-pro', ...], default: 'gemini-1.5-flash' },
};
```

### 2. `app-tauri/ui/settings.js`（webview 的刻意鏡像副本）

webview 沒有 bundler，**無法** `import` Node 模組，因此 `STT_MODELS` 在 `settings.js` 中以相同結構**手動複製**一份。這是設計決策 D7 的刻意取捨，非疏忽。

> **更新模型清單時，兩處必須同步修改，缺一不可。**
> 若兩者不一致，webview Settings 下拉清單與 sidecar 實際使用的模型可能不符。

### 為何不做 runtime model-list fetch？

- 各家 `/models` 端點無可靠的 STT 旗標可過濾
- 需要 API 金鑰，增加失敗面
- 增加首次開啟 Settings 的延遲與網路依賴

見設計決策 D7（`docs/superpowers/specs/2026-05-18-vocium-multi-stt-ptt-vad-design.md`，gitignored 內部文件）。

### 「自訂…」逃生口

Settings 下拉末項為「自訂…」，允許使用者輸入任意 model string，適用於精選清單尚未列入的最新模型。這是刻意的設計，讓清單落後不會卡住使用者。

---

## Adding a New STT Provider

1. 在 `src/core/stt/` 新增 `<provider>-stt.ts`，實作 `SttAdapter` 介面
   （參考 `groq-stt.ts` / `openai-stt.ts` / `gemini-stt.ts`）。
2. 在 `src/core/stt/models.ts` 增加該 provider 的模型清單與 `DEFAULT_MODEL`。
3. 在 `app-tauri/ui/settings.js` 的 `STT_MODELS` 同步新增（見上節）。
4. 在 `src/core/stt/stt-adapter.ts` 的 `createSttAdapter` 工廠新增分支；
   同時確認 `resolveActive(cfg)` 的正規化邏輯涵蓋新 provider。
5. 在 `src/core/config.ts` 新增 config 欄位（`<provider>ApiKey`、`<provider>Model`，選填 `baseUrl`）。
6. 在 Rust 側 `app-tauri/src-tauri/src/main.rs`（或對應模組）新增
   `set_provider_key` / `clear_provider_key` 的 provider 分支，更新 `get_config` 的
   `providers` 結構。
7. 在 `app-tauri/ui/settings.js` 加入 Settings UI（參考 Groq/OpenAI/Gemini 現有結構）。
8. 新增對應測試（`src/core/stt/<provider>-stt.test.ts`），涵蓋 200 解析、金鑰缺失 noKey、錯誤分類。

---

## Config File Safety

- **切勿將真實 API 金鑰提交進版控**。`vocium-config.json` 已在 `.gitignore` 中排除。
- 所有金鑰欄位（`groqApiKey`、`openaiApiKey`、`geminiApiKey`）僅存本機。
- `get_config` Rust 命令回傳 `keySet:bool` + `mask:string`，**永不**回傳原始金鑰給前端。

## Code Style

- TypeScript：遵循現有 `tsconfig.json` 嚴格模式；pure modules（DI，無 global state）。
- Rust：遵循現有 `clippy` 設定；新 helper 請仿照 `derive_active` / `mask_key` 風格。
- 測試：Vitest in-process；不啟動 Tauri、不需網路（inject fetch mock）。

## Commit Message

簡短 imperative（英文）；主要變更一句話說明。範例：

```
add GeminiSttAdapter with gemini-1.5-flash default
fix: sync STT_MODELS in settings.js after adding gemini-2.0
```
