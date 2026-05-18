# Vocium ROADMAP

> 路線圖。MVP 聚焦「Windows 可用的本機語音輸入殼層 + Groq 真實 STT + 單一 MCP 協定」。跨平台注入、BrainMesh 整合、打包延後。

## Phase 0 — 規劃（DONE, 2026-05-16）

- [x] SPEC.md 定案
- [x] ROADMAP.md
- [x] DESIGN_MOCKUP.html（懸浮 ICON 各狀態視覺）
- [x] 設計定案（`docs/superpowers/specs/`）
- [x] implementation plan（`docs/superpowers/plans/`，TDD bite-sized）

## Phase 1 — 核心 MVP（Terminal Claude Code 開發目標）

### M1 專案骨架
- [ ] `package.json`（TypeScript + Vitest）、`tsconfig.json`、`vitest.config.ts`、`.gitignore`、`README.md`
- [ ] Tauri 2 殼可啟動空懸浮視窗（頂部置中、無邊框、透明、不搶焦點）

### M2 純核心邏輯（TDD）
- [ ] `core/state-machine.ts` + 測試（全狀態轉移、CANCEL、FAIL/RESET、重入忽略）
- [ ] `core/config.ts` + 測試（預設/壞檔回退/合併、groqApiKey 不入版控）
- [ ] `core/stt/groq-stt.ts` + 測試（注入 fetch：multipart 組裝、200 解析、金鑰缺失/4xx/網路錯誤 reject）
- [ ] `core/stt/mock-stt.ts` + `stt-adapter.ts` 工廠 + 測試（預設 groq、金鑰缺不回退 mock（sidecar 層處理 noKey）、failMode）
- [ ] `core/inject/injector.ts` 介面 + `windows.ts` + `macos.ts`/`linux.ts` stub + 測試（工廠選平台、stub 拋 NotImplemented）

### M3 Sidecar / MCP server
- [ ] `sidecar/mcp-tools.ts`：工具表（toggle/start/stop/cancel/submit_audio/transcribe_clip/inject_text/get_state）接 core
- [ ] `sidecar/index.ts`：MCP server bootstrap（stdio）、state→`state_changed` notification
- [ ] MCP 整合測試（in-memory client：呼叫 8 工具 + 驗 notification + headless transcribe/inject）

### M4 懸浮 ICON UI（webview）
- [ ] 移植 DESIGN_MOCKUP 的 pill/orb/bars 與五狀態 keyframes
- [ ] 接收 `state_changed` → 切 `.s-*` class；點擊 ICON → MCP `toggle`；可水平拖曳微調
- [ ] 麥克風錄音（getUserMedia + MediaRecorder）；收 server `request_start/stop_capture` 起停

### M5 Tauri 殼接線
- [ ] spawn Node sidecar，建立 MCP client；relay state 至 webview
- [ ] 全域快捷鍵 `Ctrl+Shift+Space` 註冊/解除、佔用容錯；`Esc` 取消
- [ ] Tray 選單（顯示/隱藏、STT 模式、開啟設定檔、結束）；tooltip 隨狀態
- [ ] Windows 文字注入（PowerShell Set-Clipboard + SendKeys），延遲與失敗回退

### M6 驗證
- [ ] `npm test` 全綠
- [ ] code-reviewer sub-agent 審查並修正
- [ ] 手動驗收清單（SPEC §6）逐項核對；GUI 互動項標「待實機」
- [ ] README 使用說明、`docs/projects/vocium/SUMMARY.md`（依工作區 SOP）
- [x] App 內 API Key 欄位；無金鑰→注入引導訊息（取代 Mock 假文字）；STT 錯誤→分類簡語注入＋錯誤動畫；Mock 降為僅測試用；`set_groq_key` 重啟生效（2026-05-17）

## 下一階段 — Settings 三大功能（A/B/B2/B3 已完成；C 為下一步）

> 三項皆**做在 Settings 視窗內**，且 ②③ 同屬「轉錄後處理鏈」。
> 既定 pipeline 順序：**STT → 繁簡轉換 → AI 潤稿 → 注入**（各步可選、可關）。
> 皆不動狀態機 / MCP / sidecar / Injector。
>
> **A 已完成（2026-05-17）；B/B2/B3 已完成（2026-05-18，vitest 106/106，tsc clean，cargo 0/0）；C 為下一實作階段。**

### A. 中文輸出（繁／簡）（Settings 內）
- [x] Whisper 中文時繁時簡 → Settings 二段式切換**繁體（台灣）/ 簡體**（config `zhConvert`，預設 twp；非開關非三選項）。 （2026-05-17 完成）
- [x] opencc-js `cn→twp`／`twp→cn` 雙向強制；config 持久化，`save_zh_mode` 即時生效（不重啟）；由儲存按鈕套用。

### B. 多家雲端 AI + 本地 AI 串接（Settings 內，STT 來源選擇）✅（雲端部分已完成 2026-05-18）

> 權威設計：`docs/superpowers/specs/2026-05-18-vocium-multi-stt-ptt-vad-design.md`。
> 完成範圍：雲端 Groq/OpenAI/Gemini + 切換 UI（下拉，方案 A）+ 本地 stub。
> 延後：本地 STT 實際實作（whisper.cpp 等）。

- [x] **雲端多家**：新增 `OpenAiSttAdapter`、`GeminiSttAdapter`（Groq 既有）；
      `createSttAdapter` 工廠改由 `resolveActive(cfg)` 單一出口決定活躍 provider；
      錯誤沿用 `describeSttError`（泛化）、空金鑰沿用 noKey 路徑。
- [x] **每家獨立持久化**（決策 D1）：扁平具名欄位
      `openaiApiKey/openaiModel/openaiBaseUrl`、`geminiApiKey/geminiModel`；
      保留既有 `groqApiKey` 向後相容；切換只改 active。
- [x] **Settings「STT 來源」下拉**（決策 D5 方案 A）：切下拉＝切換 active 並
      載入該家已存設定；OpenAI 多 Base URL 欄。
- [x] **本地 stub**（決策 D4）：下拉可見可選「本地」，但選取不改 active、
      Settings 內顯示「本地 STT 即將推出，請先用雲端」；`sttProvider`
      永不持久化為 `'local'`（零 pipeline 風險）。
- [x] **精選模型清單 + 自訂逃生口**（決策 D7）：`src/core/stt/models.ts` 為單一常數來源；
      webview `app-tauri/ui/settings.js` 的 `STT_MODELS` 為刻意鏡像副本（兩處同步維護，
      詳見 CONTRIBUTING.md「Adding / updating an STT model」）；Settings 末項「自訂…」
      為清單落後時的逃生口；**無 runtime model-list fetch**。
- [ ] 本地 STT（whisper.cpp/faster-whisper/LocalAI/Ollama）實作**延後**；
      選型參考見 `docs/superpowers/COMPETITIVE-Handy.md` §4（量化 q5、small-q5/turbo-q5）。

### B2. 輸入模式 toggle / push-to-talk（Settings 內，借鑑 Handy）✅（已完成 2026-05-18）
- [x] `inputMode:'toggle'|'ptt'`（預設 `toggle`，保留現行）；Settings 二段式切換。
- [x] Rust global-shortcut 同時處理 `Pressed`/`Released`：toggle→Pressed 觸發；
      ptt→Pressed 開始、Released 停止。**ICON 恆 toggle**（決策 D2）；
      狀態機/MCP/sidecar 不動，不需重啟 sidecar。`save_input_mode` 即時持久化。

### B3. 靜音修剪 VAD（Settings 內，借鑑 Handy）✅（已完成 2026-05-18）
- [x] `vadTrim:bool`（預設 **關**，opt-in，決策 D3/D6）；Settings 開關。
- [x] `@ricky0123/vad-web` NonRealTimeVAD 於 **webview**，`MediaRecorder` 後、`submit_audio` 前
      修剪靜音段；**只做修剪非 endpointing**，不動狀態機時序/MCP/sidecar。
      任何 VAD 失敗 → best-effort fallback，原始 blob 繼續送出。
      VAD assets vendored 至 `app-tauri/ui/vad/`（gitignored，`npm run vad:assets`）。
      `save_vad_trim` 即時持久化。

### C. AI 潤稿（Settings 內，轉錄後處理）
- [ ] 轉錄完成後，可選將文字交 LLM 潤飾（清理口語贅詞、補標點、語句通順；**不改原意**）再注入。
- Settings 增開關 + AI 供應商 / 模型 / 金鑰 + 風格（輕度修飾 / 完整潤稿 / 自訂 prompt）。
- 與 B 共用 provider 設定基礎，但**潤稿可用任何 LLM（含 Claude / OpenAI / Gemini / 本地 LLM）**——與 STT 不同（STT 無 Claude）。
- 實作為 STT pipeline 後、注入前的可選 step（與繁簡轉換、贅詞清理同屬轉錄後處理鏈）。**預設關閉**（增加延遲與成本，使用者自選）。

## Phase 2 — 跨平台與 BrainMesh 整合（後續，非本次）

### 技術債／後續清理

- [x] ~~重構：`stt_provider` 推導邏輯在 `read_config` / `get_config` / `set_groq_key` 三處重複（且 `read_config` 用 `is_empty()` 而 get_config/set_groq_key 用 `trim().is_empty()`，空白金鑰行為微不一致）~~
  **RESOLVED（2026-05-18，§B 多家雲端實作時一併還債）**：抽 `derive_active(dir)->(provider,keySet)` + `mask_key(key)` Rust helper，消除三處重複，統一 `trim().is_empty()` 一致性；`is_empty()` 舊寫法已全數修正。

### 跨平台與整合

- [ ] `MacInjector` 實作（CGEvent / AppleScript keystroke + 輔助使用權限引導）
- [ ] `LinuxInjector` 實作（X11 xdotool；Wayland 標已知限制）
- [ ] BrainMesh 端：將 Vocium sidecar 註冊為可 spawn 的 MCP 工具，驗證 `transcribe_clip` / `inject_text`
- [ ] STT 串流/分段以降低延遲；音訊改串流傳遞（取代 base64 一次性）
- [ ] Groq 用量/費用估算顯示
- [ ] **多 STT provider（含本地）** → 見上方「下一階段 — Settings 三大功能 §B」（細節集中於該處，避免重複）

## Phase 3 — 體驗強化

- [ ] idle 滑鼠穿透（hover 區域動態切換）
- [ ] 多麥克風選擇、輸入增益
- [ ] 轉錄後處理：標點、口語贅詞清理（可選）→ 併入「下一階段 §C AI 潤稿」範疇（AI 化）
- [ ] **繁簡轉換** → 見上方「下一階段 — Settings 三大功能 §A」（細節集中於該處）
- [ ] 自訂快捷鍵 UI、開機自啟、i18n（中／英）

## Phase 4 — 發佈

- [ ] Node sidecar 二進位封裝（`pkg`/`nexe`），免使用者裝 Node
- [ ] Tauri 打包（Windows MSI/NSIS；mac/Linux 待 Phase 2 注入完成）
- [ ] 自動更新（可選）、簽章與 SmartScreen 處理
- [ ] 個人自用優先，公開發佈為最後階段

## 風險與緩解

| 風險 | 緩解 |
|------|------|
| Windows 文字注入需 native 模組 | 採 PowerShell Set-Clipboard + SendKeys，零 native build；失敗回退手動貼上 |
| always-on-top 視窗搶焦點導致無法貼回原 app | 視窗 non-activating + 注入前延遲 + clipboard 後援 |
| 全域快捷鍵被其他程式佔用 | 註冊失敗容錯 + Tray 提示，可改鍵 |
| API 金鑰外洩 | 所有 provider 金鑰僅存本機 config，`.gitignore` 排除；缺金鑰注入引導訊息提示使用者設定（不回退 mock） |
| STT 費用/網路不穩 | 可一鍵切 `mock`；可切換至其他 provider；錯誤走 error 狀態不崩潰 |
| sidecar 需 Node runtime | 開發期假設已裝 Node；Phase 4 以 pkg 封裝二進位 |
| Tauri/MCP SDK API 差異 | 鎖定主版本；MCP 以 in-memory client 整合測試把關 |
| Rust toolchain 門檻 | 文件標明前置需求；BrainMesh 開發環境已具 Rust，一致 |
