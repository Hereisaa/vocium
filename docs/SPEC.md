# Vocium — 桌面語音輸入工具 SPEC

> 版本：v0.3　日期：2026-05-19　狀態：§A 繁簡轉換 + §B 多雲端 STT + PTT + VAD + §C AI 潤稿 已實作

## 1. 產品概述

Vocium 是一款桌面語音輸入工具。使用者透過**快捷鍵**或**點擊桌面頂部的懸浮 ICON** 啟動錄音，語音經語音轉文字（Speech-to-Text, STT）後，自動將文字輸入到當前焦點的應用程式（任何文字輸入框）。

懸浮 ICON 常駐於桌面頂部置中，以**視覺狀態與動畫**讓使用者隨時掌握目前是否正在聆聽。

核心邏輯（狀態機 / STT / 注入）執行於一個獨立的 **Node sidecar daemon**，對外只暴露**單一 MCP 協定**。Tauri 殼本身是這個 MCP server 的一個 client；未來 BrainMesh 是另一個 client——**同一核心、同一協定、多個消費者**，因此 Vocium 天生即可作為 BrainMesh 插件被 spawn 使用。

v1 STT **預設使用 Groq**（`whisper-large-v3-turbo`，REST），講話即時轉成真實文字；架構上以 Adapter 介面隔離，`MockSttAdapter` 降為測試用途及使用者主動選擇的離線模式（sttProvider:'mock'）。

### 1.1 目標（In Scope, MVP）

- 桌面頂部置中、永遠最上層（always-on-top）、無邊框、半透明、不搶焦點的懸浮 ICON 視窗。
- 懸浮 ICON 依語音工作階段狀態變化外觀，**聆聽時有語音動畫**。
- 兩種觸發方式：**點擊懸浮 ICON** 與**全域快捷鍵**（預設 `Ctrl+Shift+Space`）。
- 一個明確的語音工作階段狀態機（idle → listening → transcribing → injecting → idle）。
- 麥克風錄音（Tauri webview，`getUserMedia` + `MediaRecorder`）。
- STT Adapter 介面，內建 **GroqSttAdapter（預設）**、**OpenAiSttAdapter**、**GeminiSttAdapter**（雲端三家）與 **MockSttAdapter（測試／使用者主動離線）**；`createSttAdapter` 工廠依 `resolveActive(cfg)` 單一出口決定。
- 轉錄結果**自動注入**目前焦點視窗（剪貼簿 + 模擬貼上），並同時保留在剪貼簿供手動貼上。
- Node sidecar 對外為**單一 MCP server**；Tauri 殼以 MCP client 身分驅動。
- MCP 工具表可被任意 MCP client（含未來 BrainMesh）呼叫，達成 headless 重用。
- 系統匣（Tray）選單：顯示/隱藏 ICON、變更快捷鍵說明、結束程式。
- 設定持久化（快捷鍵、STT provider 選擇、Groq 金鑰、ICON 位置微調）。
- 純邏輯模組（狀態機、STT adapter、config、injector 介面）具單元測試。
- 跨平台 `Injector` 抽象層**就位**：`WindowsInjector` v1 實作完成；`MacInjector` v2 已實作（2026-05-19）；`LinuxInjector` 為介面就位 stub。

### 1.2 不在範圍（Out of Scope, v1+v2）

- macOS `npm run dev` 注入 v2 已實作（2026-05-19）；`LinuxInjector` 注入仍為 Phase 2 stub。
- STT 串流/分段、多語言後處理、標點與口語贅詞清理、語音指令。
- BrainMesh 端的整合（v1 只負責讓 Vocium 成為合規 MCP server；BrainMesh 連接屬其專案範疇）。
- 帳號系統、雲端同步、使用統計上報。
- 安裝程式打包與簽章、sidecar 二進位封裝（ROADMAP 後期）。
- **本地 STT 實際實作**（whisper.cpp / faster-whisper / LocalAI / Ollama — stub 及下拉選項已就位，但實際推論延後；見 §1.3）。
- **AI 潤稿 §C**：已實作（2026-05-19），見 §1.3；本地 LLM 潤稿延後。

### 1.3 已完成與後續規劃

詳見 `docs/ROADMAP.md`「下一階段 — Settings 三大功能」。三項皆於 Settings 視窗內設定，且 B/C 同屬轉錄後處理鏈，既定 pipeline 順序：**STT → AI 潤稿 → 繁簡轉換 → 注入**（各步可選、可關），皆不動狀態機 / MCP / sidecar / Injector。A/B/B2/B3/C 皆已實作；本地 LLM 潤稿（on-device）延後。

> FR 級權威設計（D1–D8）見
> `docs/superpowers/specs/2026-05-18-vocium-multi-stt-ptt-vad-design.md`（gitignored，內部文件）。

- **A. 中文輸出（繁／簡）** ✅（已實作，2026-05-17）：Whisper 中文時繁時簡；Settings 二段式「中文輸出（中文字繁／簡）」＝**繁體（台灣）/ 簡體**（config `zhConvert`，預設 `twp`），opencc-js `cn→twp`／`twp→cn` 雙向強制（已是目標字體則 passthrough）；每次轉錄即時讀設定不重啟；由「儲存並套用」按鈕套用；套用 submitAudio+transcribeClip，不轉引導/錯誤訊息。
- **B. 多家雲端 STT + 切換 UI + 本地 stub** ✅（已實作，2026-05-18）：Settings「STT 來源」**下拉**（方案 A）。Groq（預設）/OpenAI/Gemini 三家雲端（Claude 無 STT，不列）+ **本地 stub**（下拉可見，不可套用，顯示「即將推出」，`sttProvider` 不持久化 `'local'`）；**每家金鑰/模型獨立持久化**（扁平具名欄位，保留 `groqApiKey` 向後相容）。詳見 FR-STT-6/FR-STT-7/FR-CFG-7。**本地 STT 實際實作延後**。
- **B2. 輸入模式 toggle / push-to-talk** ✅（已實作，2026-05-18）：`inputMode:'toggle'|'ptt'`（預設 toggle）；Settings 二段式。Rust global-shortcut 處理 Pressed/Released；**只影響快捷鍵，ICON 恆 toggle**（決策 D2）。詳見 FR-TRG-4。
- **B3. 靜音修剪 VAD** ✅（已實作，2026-05-18）：`vadTrim`（預設關，opt-in，決策 D3/D6）；`@ricky0123/vad-web` NonRealTimeVAD 於 webview，`submit_audio` 前修剪靜音段；**只修剪非 endpointing**，不動狀態機時序；任何 VAD 失敗 → 原始 blob 繼續。詳見 FR-AUD-5。
- **C. AI 潤稿** ✅（已實作，2026-05-19）：轉錄後可選交雲端 LLM 潤飾（清贅詞/補標點/通順，不改原意）再注入。Settings「AI 潤稿」分頁：開關 + 供應商（groq/openai/gemini/claude）/ 模型 / 金鑰 + 風格（輕度 / 完整 / 自訂 prompt）。預設關閉；任何失敗（無金鑰/逾時/例外）→ 直接使用原始文字，不擋住輸入流程。Claude 使用獨立金鑰；groq/openai/gemini 可沿用 STT 同家金鑰，除非明確設定潤稿覆蓋金鑰。config 即時讀取，不重啟 sidecar（與 `save_vad_trim`/`save_zh_mode` 同機制）。**本地 LLM 潤稿延後**（不在本版範圍）。詳見 FR-POL-1–5。

## 2. 使用者情境

| # | 情境 | 流程 |
|---|------|------|
| U1 | 快捷鍵觸發 | 使用者在任意輸入框 → 按 `Ctrl+Shift+Space` → ICON 進入 listening 並顯示動畫 → 說話 → 再按一次快捷鍵（或靜音逾時）停止 → Groq 轉錄 → 文字注入輸入框 |
| U2 | 點擊 ICON 觸發 | 使用者點擊桌面頂部懸浮 ICON → 同 U1 的聆聽/停止切換 |
| U3 | 取消 | 聆聽中按 `Esc` 或再次觸發 → 丟棄本次錄音，回到 idle，不注入任何文字 |
| U4 | 失敗回復 | STT 失敗或無音訊 → ICON 顯示 error 動畫 1.5s → 自動回 idle；金鑰未設 → pipeline 走正常流注入引導訊息（無錯誤動畫） |
| U5 | 隱藏 ICON | 由 Tray 選單切換 ICON 顯示/隱藏；隱藏時快捷鍵仍可用 |
| U6 | Headless 重用 | 任一 MCP client（含未來 BrainMesh）連 sidecar → 呼叫 `transcribe_clip` 取得純文字、或 `inject_text` 注入任意文字，**不經 GUI** |

## 3. 功能需求

### 3.1 懸浮 ICON 視窗（FR-WIN）

- FR-WIN-1：無邊框、透明背景、永遠最上層的 Tauri 視窗（`decorations:false`、`transparent:true`、`alwaysOnTop:true`）。
- FR-WIN-2：不出現在工作列（`skipTaskbar:true`），不可調整大小（`resizable:false`）。
- FR-WIN-3：尺寸約 `220×64` px，啟動時定位於主螢幕**工作區頂部置中**（以 `tauri::Monitor` 工作區計算 `x = (work.width - winWidth)/2`，`y = work.y + 8`）。
- FR-WIN-4：視窗**不搶焦點**：Windows 採 no-activate 行為（`WS_EX_NOACTIVATE` 等價設定），確保貼上落回使用者原應用程式。MVP 不啟用 idle 滑鼠穿透（列為 ROADMAP）。
- FR-WIN-5：使用者可拖曳 ICON 微調水平位置（Tauri `startDragging` 於 ICON 容器），位置寫入 config。

### 3.2 狀態機（FR-SM）

狀態：`idle | listening | transcribing | injecting | error`

| 事件 | 來源狀態 | 目標狀態 | 動作 |
|------|----------|----------|------|
| `TOGGLE` | idle | listening | 開始錄音 |
| `TOGGLE` | listening | transcribing | 停止錄音、送 STT |
| `CANCEL` | listening | idle | 丟棄錄音 |
| `TRANSCRIBED` | transcribing | injecting | 取得文字、執行注入 |
| `INJECTED` | injecting | idle | 完成 |
| `FAIL` | listening/transcribing/injecting | error | 記錄錯誤 |
| `RESET` | error | idle | 1.5s 後自動 |
| `TOGGLE` | transcribing/injecting | （忽略） | 防止重入 |

- FR-SM-1：狀態機為**純函式模組**（`src/core/state-machine.ts`），不依賴 Tauri / sidecar 傳輸層，可單測。
- FR-SM-2：每次狀態變更發出事件，sidecar 據此向所有 MCP client 推播 `state_changed` notification。

### 3.3 觸發（FR-TRG）

- FR-TRG-1：全域快捷鍵預設 `Ctrl+Shift+Space`，可由 config 變更；註冊失敗（被佔用）時 Tray 顯示警告且不崩潰。Tauri `globalShortcut` 為 toggle 觸發。
- FR-TRG-2：點擊 ICON → 前端呼叫 MCP `toggle`。
- FR-TRG-3：`Esc` 於 listening 時送 `CANCEL`（聆聽中由前端註冊鍵盤事件 / 全域快捷鍵）。
- FR-TRG-4：**輸入模式 toggle / push-to-talk**（2026-05-18 實作）：`inputMode:'toggle'|'ptt'`（config，預設 `'toggle'`）。Rust global-shortcut 同時處理 `Pressed` 與 `Released`：`toggle` 模式 → `Pressed` 觸發 `toggle`（等同現行行為）；`ptt` 模式 → `Pressed` 呼叫 `start_listening`，`Released` 呼叫 `stop_listening`。**ICON 點擊恆為 toggle，不受 inputMode 影響**（決策 D2）；狀態機 / MCP / sidecar 不動。`save_input_mode` Tauri 命令持久化並立即更新 Rust shortcut 邏輯（不重啟 sidecar）。

### 3.4 錄音（FR-AUD）

- FR-AUD-1：Tauri webview 以 `navigator.mediaDevices.getUserMedia({audio:true})` 取串流，`MediaRecorder` 錄為 `audio/webm;codecs=opus` Blob。
- FR-AUD-2：Tauri 設定允許 webview media 權限（`webview` capability + 平台麥克風權限）。
- FR-AUD-3：靜音/逾時保護：listening 超過 `maxListenMs`（預設 30s，config 可調）自動觸發停止。
- FR-AUD-4：無可用麥克風或權限被拒 → 前端送 MCP `report_audio_error` → 狀態機 `FAIL`。
- FR-AUD-5：**opt-in 靜音修剪 VAD**（2026-05-18 實作）：`vadTrim:bool`（config，預設 `false`，opt-in；決策 D3/D6）。啟用時，webview 於 `MediaRecorder` 停止後、`submit_audio` 呼叫前，以 `@ricky0123/vad-web` NonRealTimeVAD 離線修剪靜音段（保留語音±padding union）；VAD assets vendored 至 `app-tauri/ui/vad/`（gitignored，`npm run vad:assets` 複製）。**只做修剪，不做 endpointing**，不動狀態機時序；任何 VAD 失敗（例外、空結果）→ best-effort fallback，原始 blob 繼續送出，不進 error 狀態。`save_vad_trim` Tauri 命令持久化（不重啟 sidecar）。

### 3.5 STT Adapter（FR-STT）

- FR-STT-1：介面 `SttAdapter.transcribe(input: { audio: Buffer; mimeType: string; language?: string }): Promise<{ text: string; durationMs?: number }>`。
- FR-STT-2：**`GroqSttAdapter`（v1 預設）**：建構式接受 `{ apiKey, model='whisper-large-v3-turbo' }`。`transcribe()` 以 `multipart/form-data` POST 至 `https://api.groq.com/openai/v1/audio/transcriptions`，欄位 `file`（audio blob）、`model`、`response_format=json`、選填 `language`；回應 `{ text }`。逾時、4xx/5xx、網路錯誤皆 reject 明確 Error。`apiKey` 缺失時 reject `Error('Groq API key not configured')`。
- FR-STT-3：`MockSttAdapter`：回傳預設句子（可由 config `mockText` 自訂），模擬 600–1200ms 延遲；用於測試與使用者主動選擇離線（sttProvider:'mock'）；`failMode` 參數可觸發 reject 以測失敗路徑。
- FR-STT-4：Adapter 由 `createSttAdapter(config)` 工廠建立：`sttProvider==='mock'` → `MockSttAdapter`（僅測試／sidecar `opts.sttText` 注入）；否則 `GroqSttAdapter`（**注意：此為原始 v1 行為；多 provider 泛化已由 FR-STT-6 `resolveActive` 取代——非 mock 時依 `sttProvider` 選 Groq/OpenAI/Gemini**）。`sttProvider==='groq'` 但金鑰為空時**不回退 Mock**：sidecar 計算 `noKey`，pipeline 走正常流程注入引導訊息 `（尚未設定 API Key，請開啟 Vocium 設定填入 Groq API Key）`（listening→transcribing→injected，無錯誤動畫），Tray「STT」標籤顯示 `mock`。
- FR-STT-5：`describeSttError(e)` 為 total 純函式，將 STT 例外分類為簡語，由 pipeline 注入後播錯誤動畫且不 rethrow：API Key 無效（401／invalid key）、請求過於頻繁（429／rate limit）、網路異常（fetch failed／ENOTFOUND／ECONNREFUSED／EAI_AGAIN）、請求逾時（timeout／AbortError／ETIMEDOUT）、其他服務錯誤（其餘，含 5xx）。`transcribeClip` 在 `noKey` 時亦回傳引導訊息（不 raw throw 給 MCP 消費者）。此錯誤處理路徑已泛化，適用所有 provider。
- FR-CFG-6：Settings 視窗提供遮罩 Groq API Key 欄位（顯示／隱藏切換、清除金鑰、輸入留空＝不變更）。`get_config` 回傳 `groqKeySet:bool`（**不回傳原始金鑰**）。`set_groq_key` 命令 `patch_config` 後重啟 sidecar 使新金鑰生效並更新 Tray「STT」標籤；重啟失敗回 Err（Settings 顯示錯誤、清空 client 避免 30s 卡住）。（與 FR-CFG-7 並行；`set_groq_key` 保留作向後相容。）
- FR-STT-6：**多雲端 STT adapter + 泛化工廠**（2026-05-18 實作）：新增 `OpenAiSttAdapter`（`https://api.openai.com/v1/audio/transcriptions`，可自訂 `openaiBaseUrl` 相容第三方端點）與 `GeminiSttAdapter`（`generativelanguage.googleapis.com` Gemini 1.5 系列）。`createSttAdapter(config)` 工廠改由 `resolveActive(cfg)` 單一出口決定活躍 provider（`sttProvider` 欄位；`'local'` / 未知值防禦正規化為 `'groq'`，不持久化）。`describeSttError` / noKey 路徑泛化，所有 provider 共用。
- FR-STT-7：**精選模型清單 + 自訂逃生口**（2026-05-18 實作）：`src/core/stt/models.ts` 為單一常數來源，按 provider 列出精選 STT 模型（Groq whisper 系列、OpenAI whisper 系列、Gemini 1.5/2.0 系列）及各家 `DEFAULT_MODEL`；webview `app-tauri/ui/settings.js` 中 `STT_MODELS` 為**刻意的鏡像副本**（webview 無 bundler，故設計上複製一份，兩處需同步維護）。Settings 下拉顯示精選清單，末項「自訂…」可輸入任意 model string，作為清單落後時的逃生口（決策 D7）。**無 runtime model-list fetch**（各家 /models 端點無可靠 STT 旗標，且需金鑰）。

### 3.6 文字注入（FR-INJ）

- FR-INJ-1：將轉錄文字寫入系統剪貼簿（Windows：PowerShell `Set-Clipboard`，零 native 相依）。
- FR-INJ-2：模擬 `Ctrl+V` 貼上至目前焦點視窗。Windows 以 `child_process` 呼叫 PowerShell `SendKeys`（`^v`）。
- FR-INJ-3：注入前延遲 ~120ms 確保焦點仍在使用者原應用程式（Vocium 視窗為 non-activating）。
- FR-INJ-4：注入失敗（PowerShell 不可用）→ 仍保留剪貼簿內容並提示「已複製，請手動貼上」。
- FR-INJ-5：`Injector` 為介面：`WindowsInjector` v1 完整實作；`MacInjector`（v2 已實作，見 FR-INJ-6）；`LinuxInjector` 建構可成功但 `inject()` `throw new NotImplementedError(platform)`，由狀態機轉 error 並於 Tray 明確顯示，不靜默失敗。
- FR-INJ-6：On macOS，`MacInjector` 將（繁簡轉換、AI 潤稿後的）文字以 `pbcopy` 寫入剪貼簿，再透過 `osascript` 合成 `Cmd+V` 貼入焦點 App。文字先 base64 編碼後嵌入單一 `/bin/sh -c` 呼叫（CJK 安全，不走 argv）。`InjectResult` 合約與 Windows 相同：成功時 `{ok:true}`；失敗時剪貼簿已設好、回傳 `{ok:false, message}`——通常為 `已複製，請手動貼上（…）`，若 osascript 未取得輔助使用授權（`-1719` / `not allowed assistive access`）則回傳含**輔助使用**引導的提示訊息。
- FR-PERM-1：`src-tauri/Info.plist` 含 `NSMicrophoneUsageDescription`，供 **打包建置（`tauri build`，現行範疇外）** 時由 Tauri v2 合併進 `.app` bundle，滿足 WKWebView 麥克風存取；`npm run dev` 下無嵌入 plist，麥克風授權由 macOS TCC 對開發用二進位檔／啟動終端機授予。合成按鍵注入與全域快捷鍵皆需在「系統設定 ▸ 隱私權與安全性 ▸ 輔助使用」授予 App 授權；一次授予即涵蓋兩者。拒絕輔助使用時可降級：文字仍留在剪貼簿，App 顯示提示訊息請使用者手動貼上。

### 3.7 設定（FR-CFG）

- FR-CFG-1：config JSON 存於 OS app-data 目錄（Windows：`%APPDATA%/vocium/vocium-config.json`）。
- FR-CFG-2：欄位：`hotkey`、`cancelKey`、`sttProvider`（預設 `'groq'`；`'groq'|'openai'|'gemini'|'mock'`）、`groqApiKey`、`groqModel`（預設 `whisper-large-v3-turbo`）、`openaiApiKey`、`openaiModel`、`openaiBaseUrl`（可選，自訂端點）、`geminiApiKey`、`geminiModel`（預設 `gemini-1.5-flash`）、`inputMode`（`'toggle'|'ptt'`，預設 `'toggle'`）、`vadTrim`（`bool`，預設 `false`）、`mockText`、`maxListenMs`、`iconOffsetX`、`dragLocked`（預設 false）。`sttProvider:'local'` 及未知值防禦正規化為 `'groq'`，不持久化（決策 D4）。
- FR-CFG-3：缺檔/壞檔時回退預設值並重寫，不崩潰。
- FR-CFG-4：config 載入/合併/儲存為純模組，可單測（注入 fs/path）。
- FR-CFG-5：所有 provider API key（`groqApiKey`、`openaiApiKey`、`geminiApiKey`）**僅存本機 config，絕不寫入版本控制**（`.gitignore` 排除 config 檔）。
- FR-CFG-7：**多 provider 設定持久化 + 遮罩回傳**（2026-05-18 實作）：各 provider 金鑰/模型欄位獨立持久化（扁平具名欄位，`groqApiKey` 保留向後相容）。`get_config` 回傳 `providers:{groq,openai,gemini:{keySet:bool,mask:string,model,baseUrl?}}` 結構以及頂層 `activeProvider`、`inputMode`、`vadTrim`、`sttProvider`；同時保留頂層 `groqKeySet`/`groqKeyMask` 供向後相容。新增 Tauri 命令：`set_provider_key(provider,key)`、`set_stt_provider(provider)`、`clear_provider_key(provider)`、`save_input_mode(mode)`、`save_vad_trim(val)`。Rust 內部抽 `derive_active(dir)→(provider,keySet)` + `mask_key(key)` helper，消除三處重複，統一 `trim().is_empty()` 一致性。Tray「STT」標籤顯示真實 active provider（`effectiveProvider`）。

### 3.8 系統匣（FR-TRY）

- FR-TRY-1：Tray 圖示 + tooltip 顯示目前狀態與 STT 模式（groq / mock）（顯示 effective provider：`groq` 僅在 sttProvider=='groq' 且金鑰非空時，否則 `mock`）。
- FR-TRY-2：選單：`顯示/隱藏 ICON`、`目前快捷鍵：<hotkey>`（唯讀）、`STT：<provider>`（唯讀）、`設定…（開啟 Settings 視窗）`、`開啟設定檔位置`、`結束`。

### 3.9 MCP 介面（FR-MCP）

Node sidecar 啟動即為一個 **MCP server（stdio transport，JSON-RPC + notifications）**。Tauri 殼 spawn sidecar 後以 MCP client 連接；未來任一 MCP client（含 BrainMesh）連接皆得相同能力。

- FR-MCP-1：工具表

  | tool | 參數 | 回傳 | 說明 |
  |------|------|------|------|
  | `toggle` | — | `{ state }` | 等同快捷鍵：依當前狀態 listening⇄停止 |
  | `start_listening` | — | `{ state }` | idle→listening；通知 client 開始錄音 |
  | `stop_listening` | — | `{ state }` | listening→transcribing |
  | `cancel` | — | `{ state }` | listening→idle，丟棄音訊 |
  | `submit_audio` | `{ audioBase64, mimeType }` | `{ text }` | GUI 路徑：送錄音 → 轉錄 → 注入焦點視窗 |
  | `transcribe_clip` | `{ audioBase64, mimeType, language? }` | `{ text }` | **headless**：只轉錄回文字，不注入（BrainMesh 重用） |
  | `inject_text` | `{ text }` | `{ ok }` | **headless**：把任意文字注入焦點視窗 |
  | `polish_text` | `{ text, style? }` | `{ text }` | **headless**：用本機設定的 LLM provider / 金鑰潤飾文字（清贅詞、補標點、通順，不改原意）。不受桌面 `polishEnabled` 開關影響，由 MCP host 決定是否呼叫；best-effort / total（任何失敗回傳原始文字，不 throw）。金鑰讀自本機 config（呼叫端不傳金鑰）。 |
  | `get_state` | — | `{ state }` | 查詢目前狀態 |

- FR-MCP-2：notification `state_changed`，payload `{ state, prev, sttProvider }`，每次狀態機變更時推播給所有連線 client（驅動 ICON 動畫）。
- FR-MCP-3：Tauri 殼錄音由 webview 完成；停止後以 `submit_audio` 把音訊交給 sidecar，pipeline（轉錄→注入）在 sidecar 內完成。
- FR-MCP-4：sidecar 不依賴 Tauri 即可獨立啟動並服務任一 MCP client（headless）；`transcribe_clip` / `inject_text` 不需先 `start_listening`。

### 3.10 AI 潤稿（FR-POL）

- FR-POL-1：AI 潤稿為 `submitAudio` pipeline 的**可選步驟**，執行順序：**STT → AI 潤稿 → 繁簡轉換 → 注入**。潤稿在 STT 之後、繁簡轉換之前執行（原始 STT 文字輸入潤稿模組）；繁簡轉換為最後的確定性正規化（對潤稿輸出做轉換），確保無論潤稿 LLM 輸出何種字體，最終注入的文字都符合使用者的繁／簡設定。`transcribe_clip` 不套用潤稿。任何失敗（無金鑰、逾時、例外）→ best-effort（Totality，E6），直接使用 STT 原始文字（繁簡轉換仍套用），不進 error 狀態，不中斷語音輸入流程。潤稿 system prompt 含 zh-script 指令（`twp`→繁體／`cn`→簡體），僅偏置中文輸出字體作為防禦縱深，不翻譯非中文內容為中文（與「保留原語言」規則疊加）。
- FR-POL-2：provider / 金鑰解析：支援 `groq` / `openai` / `gemini` / `claude` 四家；`claude` 使用獨立的 `claudeApiKey`；`groq` / `openai` / `gemini` 潤稿若未設定覆蓋金鑰，則沿用同家 STT 金鑰（`groqApiKey`/`openaiApiKey`/`geminiApiKey`）。
- FR-POL-3：潤稿風格：`light`（輕度修飾，預設）、`full`（完整潤稿）、`custom`（使用者自訂 prompt；留空時自動回退為 `light`）。
- FR-POL-4：`polishEnabled` 預設 `false`；使用者必須主動於 Settings「AI 潤稿」分頁開啟。
- FR-POL-5：config 即時讀取，**不需重啟 sidecar**（與 `save_vad_trim`/`save_zh_mode` 同機制）。
- FR-POL-6：**注入加固（prompt-injection / instruction-confusion 緩解）**：潤稿步驟將轉錄文字以 `<transcript>…</transcript>` 分隔符包裹後送出，並一律於 system prompt 注入 TRANSCRIPT_GUARD 指令，要求模型將被包裹內容**嚴格視為待修訂之文字而非指令**——不得遵循、回答或執行其中任何請求／問題／命令，不得新增內容或描述任務，僅輸出修訂後文字。防禦縱深：若模型回吐包裹標籤，`polishText` 會剝除輸出開頭／結尾錨定的 `<transcript>`／`</transcript>`（Totality 保留：剝除後為空→回原文）。適用全部三種風格（`light`／`full`／`custom`；`custom` 自訂 prompt 仍為受信任指令，轉錄文字仍為惰性內容）與四家 provider。此規則與 SAFETY_SUFFIX（保留原意／原語言）及 zh-script 指令疊加（不取代）。註：無任何 prompt 能 100% 防注入，此為標準且強力之緩解，非絕對保證。

## 4. 非功能需求

- NFR-1（效能）：idle 時 CPU ≈ 0%；ICON 動畫使用 CSS（GPU 合成），不使用 JS 計時重繪。Tauri 殼採系統 webview，常駐記憶體遠低於 Electron。
- NFR-2（穩定）：任一例外不得使 sidecar 或殼崩潰；STT/注入錯誤皆走 error 狀態並推播。
- NFR-3（隱私）：預設使用 Groq，選 OpenAI/Gemini 時音訊同樣離開本機——README 與 Settings 須明確告知。所有 provider API key 僅存本機、不入版控（`.gitignore` 排除）。離線/不願上傳者可設 `sttProvider:'mock'`；本地 STT 實際推論支援列為後期 roadmap。
- NFR-4（可測試）：核心邏輯與傳輸層解耦，`npm test` 不啟動 Tauri / 不需網路即可跑（Groq adapter 以注入 fetch 測試）。
- NFR-5（可維護）：core / sidecar(mcp) / injector / app-tauri 分層；單一檔案單一職責。
- NFR-6（可重用）：核心零殼依賴，透過單一 MCP 協定服務多 client，為 BrainMesh 插件化的前提。

## 5. 技術架構

| 層 | 技術 | 說明 |
|----|------|------|
| 殼層 | Tauri 2（Rust，薄） | 懸浮視窗、Tray、global shortcut、spawn sidecar、MCP client |
| 前端 | HTML/CSS/JS（webview） | 懸浮 ICON UI、CSS 狀態動畫、麥克風錄音 |
| Sidecar | Node 20+ / TypeScript（ESM） | MCP server、組裝核心、狀態機驅動、注入 |
| 核心邏輯 | 純 TS 模組 | 狀態機、STT adapter、config、Injector 介面（無殼/傳輸依賴） |
| MCP | `@modelcontextprotocol/sdk` | stdio MCP server + notifications |
| 測試 | Vitest | 核心邏輯 + MCP 整合（in-memory client） |
| STT | Groq Whisper REST（預設）/ OpenAI Whisper / Gemini 1.5 | 三家雲端 BYOK；`resolveActive` 決定活躍 provider |

### 5.1 模組與檔案職責（規劃，實作時得微調）

```
projects/vocium/
├── package.json                 # sidecar/core 依賴與 scripts（build/test）
├── tsconfig.json
├── vitest.config.ts
├── .gitignore                   # node_modules, dist, vocium-config.json
├── src/
│   ├── core/
│   │   ├── state-machine.ts     # createVoiceSession({onState}) 純狀態機
│   │   ├── config.ts            # loadConfig/saveConfig/DEFAULTS（注入 fs/path）
│   │   ├── stt/
│   │   │   ├── stt-adapter.ts   # createSttAdapter(config) 工廠；resolveActive(cfg) 單一出口
│   │   │   ├── models.ts        # 精選模型清單 + DEFAULT_MODEL（單一常數來源，D7）
│   │   │   ├── groq-stt.ts      # GroqSttAdapter（預設，真實 multipart）
│   │   │   ├── openai-stt.ts    # OpenAiSttAdapter（含自訂 baseUrl）
│   │   │   ├── gemini-stt.ts    # GeminiSttAdapter（generativelanguage REST）
│   │   │   └── mock-stt.ts      # MockSttAdapter（測試/離線）
│   │   └── inject/
│   │       ├── injector.ts      # Injector 介面 + createInjector(platform)
│   │       ├── windows.ts       # WindowsInjector（PowerShell，v1）
│   │       ├── macos.ts         # MacInjector（v2 已實作，2026-05-19）
│   │       └── linux.ts         # LinuxInjector（stub，Phase 2）
│   └── sidecar/
│       ├── index.ts             # MCP server bootstrap、組裝 core
│       └── mcp-tools.ts         # 工具表 → core 操作；state→notification
├── app-tauri/
│   ├── src-tauri/               # Rust 殼（視窗/Tray/shortcut/spawn sidecar/MCP client）
│   └── ui/                      # index.html / styles.css / app.js（ICON + 錄音）
└── docs/
    ├── SPEC.md  ROADMAP.md  DESIGN_MOCKUP.html
    └── superpowers/{specs,plans}/
```

### 5.2 MCP 訊息（對應 §3.9）

- Client→Server：`tools/call`（`toggle` / `start_listening` / `stop_listening` / `cancel` / `submit_audio` / `transcribe_clip` / `inject_text` / `polish_text` / `get_state`）。
- Server→Client：notification `state_changed { state, prev, sttProvider }`；server→client 請求 `request_start_capture` / `request_stop_capture`（指示 Tauri webview 起停錄音）。
- 音訊以 base64 於 `submit_audio` / `transcribe_clip` 傳遞（v1 簡化；大音訊串流化列 Phase 2）。

## 6. 驗收標準（MVP Done Definition）

1. `npm install && npm test` 全綠（狀態機 / config / STT adapter（Groq + OpenAI + Gemini + Mock，注入 fetch）/ Injector 介面 / MCP 整合 / zh-convert / VAD trim / describe-error / AI polish）。目前：**vitest 146/146**、tsc clean、cargo 0/0。
2. sidecar 可獨立啟動為 MCP server，`get_state` 回 `idle`。
3. Tauri 啟動後桌面頂部置中出現懸浮 ICON。
4. 點擊 ICON 或按 `Ctrl+Shift+Space`：ICON 進入 listening 動畫。
5. 再次觸發：ICON 轉 transcribing → injecting；**設定任一雲端 provider 金鑰（Groq/OpenAI/Gemini）時，所說內容真實轉錄並貼入焦點輸入框**（如記事本）。
6. 未設活躍 provider 金鑰時 pipeline 走正常流（listening→transcribing→injected，無錯誤動畫），注入 noKey 引導訊息；Tray「STT」標籤顯示 mock。
7. `Esc` 於聆聽中取消，不注入；失敗路徑顯示 error 動畫並回 idle。
8. Tray 選單可隱藏/顯示 ICON 並結束程式。
9. 任一 MCP client 呼叫 `transcribe_clip` 可不經 GUI 取得文字；`inject_text` 可注入任意文字。
10. `groqApiKey` 不在版本控制中；`LinuxInjector` `inject()` 明確報 NotImplemented；`MacInjector` v2 已實作（`npm run dev` 可跑，見 FR-INJ-6 / FR-PERM-1）。
11. `docs/` 內含 SPEC.md、ROADMAP.md、DESIGN_MOCKUP.html、設計定案與實作計畫。

> 平台範疇：**Windows 11 實際可跑（v1）**；**macOS `npm run dev` 可跑（v2，2026-05-19）**，注入需輔助使用授權；Linux Injector 為 stub（Phase 2 補）。需 GUI 互動者（錄音、注入、ICON、Tray、多螢幕）標註「待實機驗證」。
