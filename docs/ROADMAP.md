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

## 下一階段 — Settings 三大功能（規劃中，2026-05-17 定）

> 三項皆**做在 Settings 視窗內**，且 ②③ 同屬「轉錄後處理鏈」。
> 既定 pipeline 順序：**STT → 繁簡轉換 → AI 潤稿 → 注入**（各步可選、可關）。
> 皆不動狀態機 / MCP / sidecar / Injector。

### A. 中文輸出（繁／簡）（Settings 內）
- [x] Whisper 中文時繁時簡 → Settings 二段式切換**繁體（台灣）/ 簡體**（config `zhConvert`，預設 twp；非開關非三選項）。 （2026-05-17 完成）
- [x] opencc-js `cn→twp`／`twp→cn` 雙向強制；config 持久化，`save_zh_mode` 即時生效（不重啟）；由儲存按鈕套用。

### B. 多家雲端 AI + 本地 AI 串接（Settings 內，STT 來源選擇）
- [ ] Settings 增「STT 來源」區：provider 選擇 + 金鑰 / baseURL / 模型 欄位。
- 雲端：Groq（現有）、OpenAI Whisper、Gemini 音訊轉錄（**Claude 無 STT API，不列**）。
- 本地：`whisper.cpp` server / `faster-whisper` / LocalAI / Ollama（多為 OpenAI 相容 HTTP，沿用注入 fetch）。
- 架構已以 `SttAdapter` 介面隔離（FR-STT-1）→ 新增 = `src/core/stt/<provider>-stt.ts` 一 class + `stt-adapter.ts` 工廠一分支 + `config.ts` 欄位（`{...DEFAULTS,...parsed}` 舊設定相容）+ Settings 一區。純行程內本地模型（直接 spawn 二進位）需注入 `spawn`，屆時工廠 `GroqDeps`→共用 `SttDeps`。

### C. AI 潤稿（Settings 內，轉錄後處理）
- [ ] 轉錄完成後，可選將文字交 LLM 潤飾（清理口語贅詞、補標點、語句通順；**不改原意**）再注入。
- Settings 增開關 + AI 供應商 / 模型 / 金鑰 + 風格（輕度修飾 / 完整潤稿 / 自訂 prompt）。
- 與 B 共用 provider 設定基礎，但**潤稿可用任何 LLM（含 Claude / OpenAI / Gemini / 本地 LLM）**——與 STT 不同（STT 無 Claude）。
- 實作為 STT pipeline 後、注入前的可選 step（與繁簡轉換、贅詞清理同屬轉錄後處理鏈）。**預設關閉**（增加延遲與成本，使用者自選）。

## Phase 2 — 跨平台與 BrainMesh 整合（後續，非本次）

### 技術債／後續清理

- [ ] 重構：`stt_provider` 推導邏輯在 `read_config` / `get_config` / `set_groq_key` 三處重複（且 `read_config` 用 `is_empty()` 而 get_config/set_groq_key 用 `trim().is_empty()`，空白金鑰行為微不一致）；抽 `derive_provider(dir)->(provider, groq_key_set)` 共用

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
| Groq 金鑰外洩 | 僅存本機 config，`.gitignore` 排除；缺金鑰注入引導訊息提示使用者設定（不回退 mock） |
| Groq 費用/網路不穩 | 可一鍵切 `mock`；錯誤走 error 狀態不崩潰 |
| sidecar 需 Node runtime | 開發期假設已裝 Node；Phase 4 以 pkg 封裝二進位 |
| Tauri/MCP SDK API 差異 | 鎖定主版本；MCP 以 in-memory client 整合測試把關 |
| Rust toolchain 門檻 | 文件標明前置需求；BrainMesh 開發環境已具 Rust，一致 |
