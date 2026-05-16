# Vocium — 桌面語音輸入工具 SPEC

> 版本：v0.1 (MVP)　日期：2026-05-16　狀態：規劃定案

## 1. 產品概述

Vocium 是一款桌面語音輸入工具。使用者透過**快捷鍵**或**點擊桌面頂部的懸浮 ICON** 啟動錄音，語音經語音轉文字（Speech-to-Text, STT）後，自動將文字輸入到當前焦點的應用程式（任何文字輸入框）。

懸浮 ICON 常駐於桌面頂部置中，以**視覺狀態與動畫**讓使用者隨時掌握目前是否正在聆聽。

核心邏輯（狀態機 / STT / 注入）執行於一個獨立的 **Node sidecar daemon**，對外只暴露**單一 MCP 協定**。Tauri 殼本身是這個 MCP server 的一個 client；未來 BrainMesh 是另一個 client——**同一核心、同一協定、多個消費者**，因此 Vocium 天生即可作為 BrainMesh 插件被 spawn 使用。

v1 STT **預設使用 Groq**（`whisper-large-v3-turbo`，REST），講話即時轉成真實文字；架構上以 Adapter 介面隔離，`MockSttAdapter` 降為測試與離線 fallback。

### 1.1 目標（In Scope, MVP）

- 桌面頂部置中、永遠最上層（always-on-top）、無邊框、半透明、不搶焦點的懸浮 ICON 視窗。
- 懸浮 ICON 依語音工作階段狀態變化外觀，**聆聽時有語音動畫**。
- 兩種觸發方式：**點擊懸浮 ICON** 與**全域快捷鍵**（預設 `Ctrl+Shift+Space`）。
- 一個明確的語音工作階段狀態機（idle → listening → transcribing → injecting → idle）。
- 麥克風錄音（Tauri webview，`getUserMedia` + `MediaRecorder`）。
- STT Adapter 介面，內建 **GroqSttAdapter（v1 預設，真實轉錄）** 與 **MockSttAdapter（測試/離線 fallback）**。
- 轉錄結果**自動注入**目前焦點視窗（剪貼簿 + 模擬貼上），並同時保留在剪貼簿供手動貼上。
- Node sidecar 對外為**單一 MCP server**；Tauri 殼以 MCP client 身分驅動。
- MCP 工具表可被任意 MCP client（含未來 BrainMesh）呼叫，達成 headless 重用。
- 系統匣（Tray）選單：顯示/隱藏 ICON、變更快捷鍵說明、結束程式。
- 設定持久化（快捷鍵、STT provider 選擇、Groq 金鑰、ICON 位置微調）。
- 純邏輯模組（狀態機、STT adapter、config、injector 介面）具單元測試。
- 跨平台 `Injector` 抽象層**就位**：`WindowsInjector` v1 實作完成；`MacInjector` / `LinuxInjector` 為介面就位 stub。

### 1.2 不在範圍（Out of Scope, MVP）

- macOS / Linux **實際可跑**（介面與 stub 就位，但 v1 僅驗證 Windows 11；mac/Linux 注入為 Phase 2）。
- STT 串流/分段、多語言後處理、標點與口語贅詞清理、語音指令。
- BrainMesh 端的整合（v1 只負責讓 Vocium 成為合規 MCP server；BrainMesh 連接屬其專案範疇）。
- 帳號系統、雲端同步、使用統計上報。
- 安裝程式打包與簽章、sidecar 二進位封裝（ROADMAP 後期）。

## 2. 使用者情境

| # | 情境 | 流程 |
|---|------|------|
| U1 | 快捷鍵觸發 | 使用者在任意輸入框 → 按 `Ctrl+Shift+Space` → ICON 進入 listening 並顯示動畫 → 說話 → 再按一次快捷鍵（或靜音逾時）停止 → Groq 轉錄 → 文字注入輸入框 |
| U2 | 點擊 ICON 觸發 | 使用者點擊桌面頂部懸浮 ICON → 同 U1 的聆聽/停止切換 |
| U3 | 取消 | 聆聽中按 `Esc` 或再次觸發 → 丟棄本次錄音，回到 idle，不注入任何文字 |
| U4 | 失敗回復 | STT 失敗、無音訊或金鑰未設 → ICON 顯示 error 動畫 1.5s → 自動回 idle |
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

### 3.4 錄音（FR-AUD）

- FR-AUD-1：Tauri webview 以 `navigator.mediaDevices.getUserMedia({audio:true})` 取串流，`MediaRecorder` 錄為 `audio/webm;codecs=opus` Blob。
- FR-AUD-2：Tauri 設定允許 webview media 權限（`webview` capability + 平台麥克風權限）。
- FR-AUD-3：靜音/逾時保護：listening 超過 `maxListenMs`（預設 30s，config 可調）自動觸發停止。
- FR-AUD-4：無可用麥克風或權限被拒 → 前端送 MCP `report_audio_error` → 狀態機 `FAIL`。

### 3.5 STT Adapter（FR-STT）

- FR-STT-1：介面 `SttAdapter.transcribe(input: { audio: Buffer; mimeType: string; language?: string }): Promise<{ text: string; durationMs?: number }>`。
- FR-STT-2：**`GroqSttAdapter`（v1 預設）**：建構式接受 `{ apiKey, model='whisper-large-v3-turbo' }`。`transcribe()` 以 `multipart/form-data` POST 至 `https://api.groq.com/openai/v1/audio/transcriptions`，欄位 `file`（audio blob）、`model`、`response_format=json`、選填 `language`；回應 `{ text }`。逾時、4xx/5xx、網路錯誤皆 reject 明確 Error。`apiKey` 缺失時 reject `Error('Groq API key not configured')`。
- FR-STT-3：`MockSttAdapter`：回傳預設句子（可由 config `mockText` 自訂），模擬 600–1200ms 延遲；用於測試與離線 fallback；`failMode` 參數可觸發 reject 以測失敗路徑。
- FR-STT-4：Adapter 由 `createSttAdapter(config)` 工廠依 `config.sttProvider`（`'groq' | 'mock'`，**預設 `'groq'`**）建立；`'groq'` 但金鑰缺失時，工廠記錄警告並回退 `MockSttAdapter`，狀態於 Tray 提示「未設定 Groq 金鑰，目前為模擬模式」。

### 3.6 文字注入（FR-INJ）

- FR-INJ-1：將轉錄文字寫入系統剪貼簿（Windows：PowerShell `Set-Clipboard`，零 native 相依）。
- FR-INJ-2：模擬 `Ctrl+V` 貼上至目前焦點視窗。Windows 以 `child_process` 呼叫 PowerShell `SendKeys`（`^v`）。
- FR-INJ-3：注入前延遲 ~120ms 確保焦點仍在使用者原應用程式（Vocium 視窗為 non-activating）。
- FR-INJ-4：注入失敗（PowerShell 不可用）→ 仍保留剪貼簿內容並提示「已複製，請手動貼上」。
- FR-INJ-5：`Injector` 為介面：`WindowsInjector` v1 完整實作；`MacInjector` / `LinuxInjector` 建構可成功但 `inject()` `throw new NotImplementedError(platform)`，由狀態機轉 error 並於 Tray 明確顯示，不靜默失敗。

### 3.7 設定（FR-CFG）

- FR-CFG-1：config JSON 存於 OS app-data 目錄（Windows：`%APPDATA%/vocium/vocium-config.json`）。
- FR-CFG-2：欄位：`hotkey`、`cancelKey`、`sttProvider`（預設 `'groq'`）、`groqApiKey`、`groqModel`（預設 `whisper-large-v3-turbo`）、`mockText`、`maxListenMs`、`iconOffsetX`。
- FR-CFG-3：缺檔/壞檔時回退預設值並重寫，不崩潰。
- FR-CFG-4：config 載入/合併/儲存為純模組，可單測（注入 fs/path）。
- FR-CFG-5：`groqApiKey` **僅存本機 config，絕不寫入版本控制**（`.gitignore` 排除 config 檔）。

### 3.8 系統匣（FR-TRY）

- FR-TRY-1：Tray 圖示 + tooltip 顯示目前狀態與 STT 模式（groq / mock）。
- FR-TRY-2：選單：`顯示/隱藏 ICON`、`目前快捷鍵：<hotkey>`（唯讀）、`STT：<provider>`（唯讀）、`開啟設定檔位置`、`結束`。

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
  | `get_state` | — | `{ state }` | 查詢目前狀態 |

- FR-MCP-2：notification `state_changed`，payload `{ state, prev, sttProvider }`，每次狀態機變更時推播給所有連線 client（驅動 ICON 動畫）。
- FR-MCP-3：Tauri 殼錄音由 webview 完成；停止後以 `submit_audio` 把音訊交給 sidecar，pipeline（轉錄→注入）在 sidecar 內完成。
- FR-MCP-4：sidecar 不依賴 Tauri 即可獨立啟動並服務任一 MCP client（headless）；`transcribe_clip` / `inject_text` 不需先 `start_listening`。

## 4. 非功能需求

- NFR-1（效能）：idle 時 CPU ≈ 0%；ICON 動畫使用 CSS（GPU 合成），不使用 JS 計時重繪。Tauri 殼採系統 webview，常駐記憶體遠低於 Electron。
- NFR-2（穩定）：任一例外不得使 sidecar 或殼崩潰；STT/注入錯誤皆走 error 狀態並推播。
- NFR-3（隱私）：v1 預設 Groq，音訊會離開本機送 Groq——README 與首次啟動須明確告知。`groqApiKey` 僅存本機、不入版控。離線/不願上傳者可設 `sttProvider:'mock'`。
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
| STT | Groq Whisper REST（v1 預設） | `whisper-large-v3-turbo`，multipart |

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
│   │   │   ├── stt-adapter.ts   # createSttAdapter(config) 工廠
│   │   │   ├── groq-stt.ts      # GroqSttAdapter（v1 預設，真實 multipart）
│   │   │   └── mock-stt.ts      # MockSttAdapter（測試/離線 fallback）
│   │   └── inject/
│   │       ├── injector.ts      # Injector 介面 + createInjector(platform)
│   │       ├── windows.ts       # WindowsInjector（PowerShell，v1）
│   │       ├── macos.ts         # MacInjector（stub，Phase 2）
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

- Client→Server：`tools/call`（`toggle` / `start_listening` / `stop_listening` / `cancel` / `submit_audio` / `transcribe_clip` / `inject_text` / `get_state`）。
- Server→Client：notification `state_changed { state, prev, sttProvider }`；server→client 請求 `request_start_capture` / `request_stop_capture`（指示 Tauri webview 起停錄音）。
- 音訊以 base64 於 `submit_audio` / `transcribe_clip` 傳遞（v1 簡化；大音訊串流化列 Phase 2）。

## 6. 驗收標準（MVP Done Definition）

1. `npm install && npm test` 全綠（狀態機 / config / STT adapter（含 Groq 以注入 fetch 測）/ Injector 介面 / MCP 整合）。
2. sidecar 可獨立啟動為 MCP server，`get_state` 回 `idle`。
3. Tauri 啟動後桌面頂部置中出現懸浮 ICON。
4. 點擊 ICON 或按 `Ctrl+Shift+Space`：ICON 進入 listening 動畫。
5. 再次觸發：ICON 轉 transcribing → injecting；**設定 Groq 金鑰時，所說內容真實轉錄並貼入焦點輸入框**（如記事本）。
6. 未設金鑰時自動回退 mock，Tray 明示模擬模式，pipeline 仍走通。
7. `Esc` 於聆聽中取消，不注入；失敗路徑顯示 error 動畫並回 idle。
8. Tray 選單可隱藏/顯示 ICON 並結束程式。
9. 任一 MCP client 呼叫 `transcribe_clip` 可不經 GUI 取得文字；`inject_text` 可注入任意文字。
10. `groqApiKey` 不在版本控制中；非 Windows 平台 `inject()` 明確報 NotImplemented。
11. `docs/` 內含 SPEC.md、ROADMAP.md、DESIGN_MOCKUP.html、設計定案與實作計畫。

> v1 平台範疇：**Windows 11 實際可跑**；macOS / Linux 之 Injector 介面就位但為 stub（Phase 2 補）。需 GUI 互動者（錄音、PowerShell 貼上、ICON、Tray、多螢幕）標註「待實機驗證」。
