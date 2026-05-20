# Vocium ROADMAP

> 桌面語音輸入工具（Windows + macOS）：三家雲端 STT（Groq / OpenAI / Gemini）+ AI 潤稿 + 繁簡轉換 + PTT/VAD，**MCP 原生對外**。打包 P1 完成（終端使用者**免裝 Node**）。簽署 / CI / Releases 與**本地推論**為後續。

## Status @ 2026-05-20 — 最終 Phase 之前剩餘工作

**Phase 2 — 整合**
- [ ] BrainMesh 註冊 Vocium sidecar 為可 spawn 的 MCP 工具，驗證 `transcribe_clip` / `inject_text`
- [ ] STT 串流／分段以降低延遲；音訊改串流傳遞（取代 base64 一次性）
- [ ] Groq 用量／費用估算顯示

**Phase 3 — 體驗強化**
- [ ] idle 滑鼠穿透（hover 區域動態切換）
- [ ] 多麥克風選擇、輸入增益
- [ ] 開機自啟
- [ ] i18n（中／英）

**Phase 4 — 發佈**
- [ ] P2：程式簽署 / Apple 公證 / Windows SmartScreen + 首次啟動 UX 文件
- [ ] P3：CI matrix 交叉建置、打 tag 自動 GitHub Release、Homebrew Cask / Scoop / winget manifest

**Phase 5 — 本地推論（最終階段）**
- [ ] 本地 STT（whisper.cpp / faster-whisper / LocalAI / Ollama；量化選型見 `docs/superpowers/COMPETITIVE-Handy.md` §4）
- [ ] 本地 LLM 潤稿（on-device，Ollama 風格）

---

## Phase 0 — 規劃（DONE, 2026-05-16）

- [x] SPEC.md / ROADMAP.md / DESIGN_MOCKUP.html
- [x] 設計定案（`docs/superpowers/specs/`）+ implementation plans（`docs/superpowers/plans/`，TDD bite-sized）

## Phase 1 — 核心 MVP（DONE, 2026-05-16/17）

### M1 專案骨架
- [x] `package.json`（TypeScript + Vitest）、`tsconfig.json`、`vitest.config.ts`、`.gitignore`、`README.md`
- [x] Tauri 2 殼啟動懸浮 ICON 視窗（頂部置中、無邊框、透明、不搶焦點）

### M2 純核心邏輯（TDD）
- [x] `core/state-machine.ts` + 測試（全狀態轉移、CANCEL、FAIL/RESET、重入忽略）
- [x] `core/config.ts` + 測試（預設/壞檔回退/合併、API 金鑰不入版控）
- [x] `core/stt/groq-stt.ts` + 測試（multipart 組裝、200 解析、4xx/網路錯誤 reject）
- [x] `core/stt/mock-stt.ts` + `stt-adapter.ts` 工廠 + 測試
- [x] `core/inject/injector.ts` 介面 + `windows.ts` + `macos.ts` + 測試（工廠選平台；非支援平台拋 NotImplemented）

### M3 Sidecar / MCP server
- [x] `sidecar/mcp-tools.ts`：8 工具（toggle/start/stop/cancel/submit_audio/transcribe_clip/inject_text/get_state）接 core
- [x] `sidecar/index.ts`：MCP server bootstrap（stdio）、state→`state_changed` notification
- [x] MCP 整合測試（in-memory client + headless 工具）

### M4 懸浮 ICON UI（webview）
- [x] DESIGN_MOCKUP 的 pill/orb/bars 與五狀態 keyframes 移植
- [x] 接收 `state_changed` → 切 `.s-*` class；點擊 ICON → MCP `toggle`；水平拖曳微調
- [x] 麥克風錄音（`getUserMedia` + `MediaRecorder`）

### M5 Tauri 殼接線
- [x] spawn Node sidecar，建立 MCP client；relay state 至 webview
- [x] 全域快捷鍵 `Ctrl+Shift+Space` 註冊/解除、佔用容錯；`Esc` 取消（webview）
- [x] Tray 選單（顯示/隱藏、開啟設定檔、結束）；tooltip 隨狀態
- [x] Windows 文字注入（PowerShell `Set-Clipboard` + `SendKeys` + 常駐 host）

### M6 驗證
- [x] `npm test` 全綠（vitest **165/165** @ 2026-05-20）
- [x] code-reviewer sub-agent 多輪審查並修正
- [x] README 使用說明、`docs/projects/vocium/SUMMARY.md`（依工作區 SOP）
- [x] App 內 API Key 欄位；無金鑰→注入引導訊息；STT 錯誤→分類簡語注入＋錯誤動畫（2026-05-17）

---

## Settings 三大功能（A / B / B2 / B3 / C — DONE）

> 三項皆做在 **Settings 視窗內**。Pipeline 順序：**STT → AI 潤稿 → 繁簡轉換 → 注入**（各步可選、可關）。皆不動狀態機 / MCP / sidecar / Injector。

### A. 中文輸出（繁／簡）— DONE 2026-05-17
- [x] Whisper 中文時繁時簡 → Settings 二段式切換 **繁體（台灣）/ 簡體**（config `zhConvert`，預設 twp）
- [x] opencc-js `cn↔twp` 雙向；`save_zh_mode` 即時生效（不重啟）

### B. 多家雲端 STT + 切換 UI — DONE 2026-05-18
> 權威設計：`docs/superpowers/specs/2026-05-18-vocium-multi-stt-ptt-vad-design.md`

- [x] `OpenAiSttAdapter`、`GeminiSttAdapter`（Groq 既有）；`createSttAdapter` 由 `resolveActive(cfg)` 單一出口
- [x] 每家獨立持久化（D1）：`openaiApiKey/openaiModel/openaiBaseUrl`、`geminiApiKey/geminiModel`；`groqApiKey` 向後相容
- [x] Settings「STT 來源」下拉（D5 方案 A）；OpenAI 多 Base URL 欄
- [x] 本地 stub（D4）：下拉可見「本地」，選取顯示「即將推出」；`sttProvider` 永不持久化為 `'local'`
- [x] 精選模型清單 + 自訂逃生口（D7）：`src/core/stt/models.ts` 單一常數來源；末項「自訂…」逃生口；**無 runtime model-list fetch**

### B2. 輸入模式 toggle / push-to-talk — DONE 2026-05-18
- [x] `inputMode:'toggle'|'ptt'`（預設 `toggle`）；Settings 二段式
- [x] Rust global-shortcut 同時處理 `Pressed`/`Released`：toggle→Pressed 觸發；ptt→Pressed 開始、Released 停止；**ICON 恆 toggle**（D2）；`save_input_mode` 即時生效

### B3. 靜音修剪 VAD — DONE 2026-05-18
- [x] `vadTrim:bool`（預設關，opt-in，D3/D6）
- [x] `@ricky0123/vad-web` NonRealTimeVAD 於 webview；`MediaRecorder` 後／`submit_audio` 前修剪；只做修剪非 endpointing；失敗 best-effort fallback；assets 於 `app-tauri/ui/vad/`（gitignored，`npm run vad:assets`）

### C. AI 潤稿 — DONE 2026-05-19
- [x] 轉錄後可選交雲端 LLM 潤飾（清理口語贅詞、補標點、語句通順，**不改原意**）再注入
- [x] Settings「AI 潤稿」分頁：開關 + 供應商（groq/openai/gemini/claude）/ 模型 / 金鑰 + 風格（輕度/完整/自訂 prompt）
- [x] Claude 用獨立金鑰；groq/openai/gemini 沿用 STT 同家金鑰（除非覆蓋）
- [x] 任何失敗 → best-effort 原文，不中斷流程；**預設關閉**
- [x] `polish_text` MCP 工具：headless，host 控制；不受桌面 polishEnabled 影響

### 韌性修正（2026-05-20）
- [x] STT 30s 逾時（`src/core/stt/with-timeout.ts`，AbortController；hang → 既有 catch → FAIL → 1.5s 自動 RESET → idle；跨平台）
- [x] orb-click 在 `transcribing` 改送 `cancel`（即時人工脫困；FSM `transcribing--CANCEL-->idle`）

---

## Phase 2 — 整合

### 已完成
- [x] **macOS 平台 parity**（2026-05-19）：`MacInjector` = `pbcopy` + `osascript` Cmd+V，base64 文字（CJK 安全），與 Windows 相同 `InjectResult` 合約；輔助使用拒絕時降級引導；`NSMicrophoneUsageDescription`（Tauri 合併）
- [x] **macOS 注入管線根因修復**（2026-05-20，commits `8eeee29` + `a541cf2`）：
  - **重複貼上**：根因為 Bun `--compile` 下 `import.meta.url` 在 bundle 內所有 module 都等於 root entry URL → `index.ts` 的 `if (isMain)` 區塊與 `main.ts` 同時各自 spawn 一個 server，兩個 server attach 同一個 `process.stdin` 上的 `data` listener → 每個 MCP call 被處理兩次。**修法**：移除 `index.ts` 的 isMain 自啟動，`main.ts` 為唯一 entry；dev 路徑改用 `dist/sidecar/main.js`；`smoke-sidecar-bin.mjs` 加 regression guard（同一 id 重複回應就 fail）
  - **Mojibake `皜祈岫` / empty paste**：根因為 macOS `pbcopy` 按 `LC_CTYPE` / `LANG` 決定 pasteboard plain-text type；Finder/launchd 啟動繼承 C/POSIX locale → pbcopy 把 UTF-8 bytes 標成 legacy type → UTF-8 paste 目標解出 Big5 → 出現 `皜祈岫`。**修法**：`spawn_sidecar` 在 macOS 加 `LANG=en_US.UTF-8 LC_CTYPE=en_US.UTF-8`
  - **失敗無感**：未授輔助使用時，剪貼簿成功但 Cmd+V 不會發生，UI 只有錯誤動畫無指引。**修法**：`MacInjector.probe()` + 新 `probe_inject` MCP tool；app.js 開機 invoke 一次，失敗就在 pill 上顯示指引 8 秒；`applyView` 在 inject-error 視窗 active 時不寫 label，避免 `state_changed` race 蓋掉訊息
- [x] **Linux 移除**（2026-05-20）：使用者裁定 Win/mac 已足；`linux.ts` 移除，`createInjector` 非 win/darwin 拋 NotImplementedError；docs 全清
- [x] 技術債清理（2026-05-18）：`derive_active(dir)→(provider,keySet)` + `mask_key(key)` Rust helper，消除三處重複，統一 `trim().is_empty()`

### 未完成
- [ ] BrainMesh 端：將 Vocium sidecar 註冊為可 spawn 的 MCP 工具，驗證 `transcribe_clip` / `inject_text`
- [ ] STT 串流／分段以降低延遲；音訊改串流傳遞（取代 base64 一次性）
- [ ] Groq 用量／費用估算顯示

---

## Phase 3 — 體驗強化

### 已完成
- [x] 自訂快捷鍵 UI（Settings 視窗 hotkey 錄製器，2026-05-17）

### 未完成
- [ ] idle 滑鼠穿透（hover 區域動態切換）
- [ ] 多麥克風選擇、輸入增益
- [ ] 開機自啟
- [ ] i18n（中／英）

---

## Phase 4 — 發佈

### 方向（已定）
受眾分解：①開發者跑 App　②串 MCP 開發者　③下載即用一般用戶。Sidecar 封裝方向＝**方案 B**（推薦）＝編單一自帶執行檔（Node SEA / `bun build --compile`）+ Tauri 原生 `externalBin`；那顆 binary 仍是同一個 MCP server，**保住 MCP 可重用紅線（受眾 2 不受影響）**。**方案 A**（退路）＝內嵌整包 Node runtime + `dist/` 打包成 Tauri resource。簽署範圍與 CI 矩陣待 P2/P3 各自 brainstorming 定案。

### 進度
- [x] **P1：獨立可運行 App** — DONE 2026-05-20。Bun 編譯 sidecar via Tauri `externalBin`，`lib.rs` std::process 解析（binary 優先 > node-dev 回退；`mcp.rs` JSON-RPC transport 零變動），macOS `.app`/`.dmg` + `.icns`，`beforeBuildCommand`（`build:sidecar-bin && vad:assets`）。**終端使用者免裝 Node**。SPEC §3.11 FR-PKG-1。
- [ ] **P2**（獨立）：程式簽署 / Apple 公證（$99/年 或 ad-hoc）/ Windows SmartScreen 處理 + 首次啟動 UX 文件。**附帶解決**：未簽署版本目前每次重 build 都會被 macOS 視為不同 App，使用者必須移除舊的「輔助使用」授權再加新版（README 權限章節有寫）；以同一 Developer ID 簽署後跨版本繼承權限即不再需要手動重設
- [ ] **P3**（獨立）：CI matrix 交叉建置（windows-latest + macos-latest）、打 tag 自動 GitHub Release、Homebrew Cask / Scoop / winget manifest

---

## Phase 5 — 本地推論（最終階段）

> 雲端的免費額度（Groq）足夠日常自用；本地推論為**長遠選項**（離線、無 API 費用、隱私）。

- [ ] **本地 STT**（whisper.cpp / faster-whisper / LocalAI / Ollama）— 仍走 sidecar `SttAdapter` 介面，新增 adapter class 即可，不動狀態機/MCP/sidecar/Injector。選型參考 `docs/superpowers/COMPETITIVE-Handy.md` §4（量化 q5、small-q5/turbo-q5）
- [ ] **本地 LLM 潤稿**（on-device，Ollama / 本地 Claude / 等）— 仍走 `polishText` 的 `polishProvider` 擴充

---

## 風險與緩解

| 風險 | 緩解 |
|------|------|
| Windows 文字注入需 native 模組 | 採 PowerShell `Set-Clipboard` + `SendKeys`，零 native build；失敗回退手動貼上 |
| always-on-top 視窗搶焦點導致無法貼回原 app | 視窗 non-activating + 注入前延遲 + clipboard 後援 |
| 全域快捷鍵被其他程式佔用 | 註冊失敗容錯 + Tray 提示，可改鍵 |
| API 金鑰外洩 | 所有 provider 金鑰僅存本機 config，`.gitignore` 排除；缺金鑰注入引導訊息（不回退 mock） |
| STT 費用 / 網路不穩 | 可一鍵切其他 provider；錯誤走 error 狀態不崩潰；STT **30s 逾時**防永久卡住 |
| sidecar 需 Node runtime | 開發期假設已裝 Node；打包版以 Bun 編譯 binary 隨附（FR-PKG-1），終端使用者免裝 Node |
| Tauri / MCP SDK API 差異 | 鎖定主版本；MCP 以 in-memory client 整合測試把關 |
| Rust toolchain 門檻 | 文件標明前置需求；BrainMesh 開發環境已具 Rust，一致 |
