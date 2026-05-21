# Contributing to Vocium

感謝你對 Vocium 的貢獻！本文件說明主要開發流程與注意事項。

## 環境前置需求

- **Node.js ≥ 20**
- **Rust toolchain** + Tauri 2 prerequisites
- **Windows** 或 **macOS**（兩平台皆支援文字注入：Windows = PowerShell `Set-Clipboard`+`SendKeys`，macOS = `pbcopy`+`osascript` Cmd+V）

## Build & Test Gates

每次提交前請確保以下全綠（PR 不應使任何一項變紅）：

```bash
# 1. TypeScript 型別檢查 + sidecar 編譯
npm run build

# 2. 單元測試 + MCP 整合測試
npx vitest run

# 3. Rust 殼測試
cargo test --manifest-path app-tauri/src-tauri/Cargo.toml

# 4. webview JS 語法檢查（app-tauri/ui/*.js 為純 JS，不在 tsconfig 範圍）
node --check app-tauri/ui/app.js
node --check app-tauri/ui/settings.js

# 5. 推遠端前：確認 diff 未混入真實金鑰
git diff origin/main..HEAD -U0 | grep -nE "gsk_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{30,}" || echo "no secrets"
```

基準：**tsc clean、vitest 全綠、cargo 0 errors / 0 warnings、node --check 無輸出、no secrets**。

> **Gate 3 注意**：`cargo test` 會先跑 tauri-build 的 `externalBin` 預檢，要求 `app-tauri/src-tauri/binaries/vocium-sidecar-<target-triple>` 存在。先跑過 `npm run dev` 或 `npm run build:sidecar-bin`（需 Bun）即可；若僅要測試而不想裝 Bun，可暫放一個 1-byte 同名 stub 檔讓預檢通過（測完移除，勿提交）。

## Adding / Updating an STT Model

STT 模型清單有**兩個地方**必須同步維護：

### 1. `src/core/stt/models.ts`（唯一常數來源）

這是 Node sidecar 與 TypeScript 核心使用的 **single source of truth**。每個 provider 對應一個 `{ id, label }` 物件陣列；`DEFAULT_MODEL` 為**獨立的頂層常數**（非巢狀在清單內）。

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

### 2. `app-tauri/ui/settings.js`（webview 的刻意鏡像副本）

webview 沒有 bundler，**無法** `import` Node 模組，因此 `STT_MODELS` 在 `settings.js` 中以相同結構**手動複製**一份。這是設計決策取捨，非疏忽。

> **更新模型清單時，兩處必須同步修改，缺一不可。**
> 若兩者不一致，webview Settings 下拉清單與 sidecar 實際使用的模型可能不符。

### 為何不做 runtime model-list fetch？

- 各家 `/models` 端點無可靠的 STT 旗標可過濾
- 需要 API 金鑰，增加失敗面
- 增加首次開啟 Settings 的延遲與網路依賴

見設計決策 D7（`docs/superpowers/specs/2026-05-18-vocium-multi-stt-ptt-vad-design.md`，gitignored 內部文件）。

### 模型「自訂…」逃生口

模型選單下拉末項為「自訂…」，允許使用者輸入任意且正確的模型名稱，適用於精選清單尚未列入的最新模型。這是刻意的設計，讓清單落後不會卡住使用者。

### AI 潤稿模型（POLISH_MODELS）

`POLISH_MODELS` / `DEFAULT_POLISH_MODEL` 的維護規則與上面的 `STT_MODELS` **完全相同**——同樣兩處同步（`src/core/stt/models.ts` + `app-tauri/ui/settings.js` 鏡像）、同樣「自訂…」逃生口、同樣無 runtime fetch。差異只有：常數名為 `POLISH_MODELS` / `DEFAULT_POLISH_MODEL`，且涵蓋**四家** provider（groq / openai / gemini / claude）。
※ claude 無 STT 但可用於潤稿

## 新增 STT Provider

1. 在 `src/core/stt/` 新增 `<provider>-stt.ts`，實作 `SttAdapter` 介面
   （參考 `groq-stt.ts` / `openai-stt.ts` / `gemini-stt.ts`）。
2. 在 `src/core/stt/models.ts` 增加該 provider 的模型清單與 `DEFAULT_MODEL`。
3. 在 `app-tauri/ui/settings.js` 的 `STT_MODELS` 同步新增（見上節）。
4. 在 `src/core/stt/stt-adapter.ts` 的 `createSttAdapter` 工廠新增分支；
   同時確認 `resolveActive(cfg)`（`src/core/stt/resolve-active.ts`）的正規化邏輯涵蓋新 provider。
5. 在 `src/core/config.ts` 新增 config 欄位（`<provider>ApiKey`、`<provider>Model`，選填 `baseUrl`）。
6. 在 Rust 側 `app-tauri/src-tauri/src/lib.rs` 新增
   `set_provider_key` / `clear_provider_key` 的 provider 分支，更新 `get_config` 的
   `providers` 結構。
7. 在 `app-tauri/ui/settings.js` 加入 Settings UI（參考 Groq/OpenAI/Gemini 現有結構）。
8. 新增對應測試（`tests/<provider>-stt.test.ts`），涵蓋 200 解析、金鑰缺失 noKey、錯誤分類。

## 設定檔安全

- **切勿將真實 API 金鑰提交進版控**。`vocium-config.json` 已在 `.gitignore` 中排除。
- 所有金鑰欄位（`groqApiKey`、`openaiApiKey`、`geminiApiKey`）僅存本機。
- `get_config` Rust 命令回傳 `keySet:bool` + `mask:string`，**永不**回傳原始金鑰給前端。

## 程式碼風格

- TypeScript：遵循現有 `tsconfig.json` 嚴格模式；pure modules（DI，無 global state）。
- Rust：保持 `cargo clippy` 乾淨（無專案專屬設定，採標準 lint）；新 helper 請仿照 `derive_active` / `mask_key` 風格。

## 提交訊息 (Commit Message)

簡短 imperative（英文）；主要變更一句話說明。範例：

```
add GeminiSttAdapter with gemini-1.5-flash default
fix: sync STT_MODELS in settings.js after adding gemini-2.0
```
