# Vocium 架構（SSOT）

> 本文件是 Vocium 架構與行為契約的**唯一事實來源**（Single Source of Truth）。
> README、ROADMAP、CONTRIBUTING 只能摘要或連結這裡，不得與本文件矛盾；
> 改動架構、IPC 介面、設定欄位或管線行為時，先改本文件，再改程式碼與其他文件。
> 自動產生的互動式架構圖見 [archify/](archify/)（由 `docs/archify/*.json` 渲染）。

最後對齊版本：`0.2.0`（單行程重構，2026-10-30）。

---

## 1. 一句話

按快捷鍵說話，Vocium 把語音送到你自備金鑰的雲端 STT，必要時用 LLM 潤稿、轉成指定中文字體，再貼進目前焦點的輸入框。

## 2. 行程與邊界

Vocium 是**單一行程**的 Tauri 2 桌面程式。沒有 sidecar、沒有本機伺服器、沒有 MCP。

```
Vocium.exe
├── Rust 殼層（app-tauri/src-tauri/）
│     視窗 · Tray · 全域快捷鍵 · 設定檔讀寫 · 原生文字注入 · 健康面板
└── WebView（app-tauri/ui/）
      ├── icon 視窗（index.html → build/app.js）
      │     懸浮 ICON UI · 麥克風錄音 · VAD · voice-core 狀態機與管線
      └── settings 視窗（settings.html → build/settings.js）
            設定表單（只透過 Rust 指令讀寫設定檔）
```

| 關注點 | 擁有者 | 理由 |
|---|---|---|
| 狀態機、STT、潤稿、繁簡轉換 | webview 內的 `@vocium/voice-core` | 純 TypeScript，可在 Goji 等其他專案重用 |
| 麥克風錄音、VAD | icon webview（`MediaRecorder`、Silero） | 現階段最省力；規劃搬進 Rust `cpal`（見 ROADMAP） |
| 網路請求 | Rust（`tauri-plugin-http`） | webview 只拿到一個 `fetch` 介面；無 CORS 問題 |
| 設定檔與金鑰 | Rust | 唯一會碰磁碟的一方；webview 以指令讀寫 |
| 文字注入 | Rust `inject.rs` | 需要 OS API；三平台各一實作 |
| 快捷鍵 | Rust → `hotkey` 事件 | OS 層註冊；按鍵語意由 webview 決定 |

**信任邊界**：金鑰只存在本機設定檔與 App 行程記憶體；`read_config_raw` 會把完整設定（含金鑰）交給同行程的 webview，這是刻意的，因為 voice-core 需要金鑰呼叫供應商。沒有任何對外 IPC 介面。

## 3. 原始碼地圖

```
packages/voice-core/            @vocium/voice-core（npm workspace）
  src/index.ts                  公開匯出面
  src/state-machine.ts          idle/listening/transcribing/injecting/error 五態
  src/pipeline.ts               submitAudio：STT → polish → zh → inject
  src/config.ts                 VociumConfig、DEFAULTS、normalizeConfig
  src/stt/                      adapters（groq / openai 相容 / gemini / mock）、models.ts 模型清單
  src/polish/                   LLM 潤稿 prompt 與四家 adapter
  src/zh-convert.ts             OpenCC 繁簡轉換（離線）
  src/health.ts                 健康面板的純函式
  src/audio/trim-silence.ts     VAD 裁剪的參考模型（測試用；實際裁剪由 vad-web 執行）
  src/inject/types.ts           Injector 介面（由宿主實作）
  tests/                        vitest 單元測試
app-tauri/
  ui/index.html, settings.html  兩個視窗的靜態頁
  ui/src/app.js                 icon 視窗控制器（錄音、VAD、狀態機、管線）
  ui/src/settings.js            設定視窗控制器
  ui/src/i18n.js                zh-TW / en 字串表（window.I18N）
  ui/build/                     esbuild 產物（gitignored）
  ui/vad/                       vad-web 與 onnxruntime 資產（gitignored，npm run vad:assets）
  src-tauri/src/lib.rs          殼層：視窗、Tray、快捷鍵、設定指令、健康面板
  src-tauri/src/inject.rs       原生注入（Windows / macOS / Linux）
  src-tauri/capabilities/       webview 權限（含 http 允許 https://**）
scripts/build-ui.mjs            esbuild 打包
scripts/copy-vad-assets.mjs     複製 VAD 資產
```

## 4. 執行期流程

### 4.1 狀態機（voice-core/state-machine.ts）

| 狀態 | TOGGLE | CANCEL | TRANSCRIBED | INJECTED | FAIL | RESET |
|---|---|---|---|---|---|---|
| idle | listening | — | — | — | — | — |
| listening | transcribing | idle | — | — | error | — |
| transcribing | — | idle | injecting | — | error | — |
| injecting | — | — | — | idle | error | — |
| error | — | — | — | — | — | idle |

`error` 由 pipeline 在 1.5 秒後自動 `RESET`。狀態機只活在 icon webview，Rust 透過 `report_state` 得知狀態以更新 Tray 提示。

### 4.2 一次語音輸入

1. 使用者按快捷鍵或點 ICON。Rust 發 `hotkey` 事件（`toggle` / `start_listening` / `stop_listening`，依 `inputMode`）；webview 做 pre-flight（無麥克風或權限被拒則顯示提示並停止），然後 `session.send('TOGGLE')`。
2. 進入 `listening`：`getUserMedia` → `MediaRecorder` 開始錄音；`maxListenMs` 到期自動 TOGGLE。
   - **競態防護**：每次 `startRecording` 有自己的世代號，任何 `await` 之後發現已被更新的一輪取代就釋放串流退出；`getUserMedia` 回來時若狀態已不是 `listening`（例如首次權限對話框期間使用者已放開按鍵），不啟動錄音器，若卡在 `transcribing` 則 CANCEL 回 idle。每次開始錄音前一律丟棄殘留的舊錄音器。
3. 離開 `listening`：`transcribing` 代表要送出；`idle` 代表取消、音訊丟棄。
4. 送出：讀取最新設定 → 可選 VAD 裁剪（失敗即用原音訊）→ 若這段期間使用者已取消（狀態不再是 `transcribing`）就靜靜丟棄 → 以 `Uint8Array` 建立**本次專用的 pipeline**（設定變更免重啟）→ `submitAudio`。
5. pipeline：
   - 未設金鑰：CANCEL → idle，回傳 `notice`（UI 顯示在 ICON 上，**不貼上**）。
   - STT 失敗：FAIL → error，回傳 `notice`（同上）。
   - 轉錄中被取消：丟棄晚到的結果，回傳 `cancelled: true`。判斷依據是「狀態仍為 transcribing **且** session epoch 未變」，所以即使使用者取消後立刻開始新一輪，上一輪的晚到結果（含失敗）也不會貼上或閃錯誤。
   - 結果為空白：CANCEL → idle，什麼都不貼。
   - 正常：polish（任何失敗退回原文）→ `convertZh` → TRANSCRIBED → `inject_text` → INJECTED → idle。注入失敗回傳 `injectError`（文字已在剪貼簿）。

**不變量**：只有真正的轉錄文字會被貼上；任何錯誤或提示只出現在懸浮 ICON。

### 4.3 文字注入（inject.rs）

| 平台 | 方法 | 權限 | 剪貼簿還原 |
|---|---|---|---|
| Windows | Win32 `OpenClipboard` + `SetClipboardData(CF_UNICODETEXT)` → 120 ms → `SendInput` Ctrl+V | 無需 | 文字型內容會在 250 ms 後還原 |
| macOS | `pbcopy` → 120 ms → `osascript` System Events `key code 9` + command | 輔助使用 | 以 `pbpaste` 備份後還原 |
| Linux | `wl-copy`/`xclip` → `wtype`/`ydotool`/`xdotool` | 視桌面環境 | 尚未還原（best-effort） |

`probe_inject` 在 macOS 跑一個無副作用的 System Events 指令以偵測輔助使用權限；Windows/Linux 永遠回 ok。注入結果會回饋到健康面板的 `mac_a11y`。

## 5. IPC 契約（webview ↔ Rust）

### 5.1 Rust → webview 事件

| 事件 | payload | 用途 |
|---|---|---|
| `hotkey` | `{ action: 'toggle' \| 'start_listening' \| 'stop_listening' }` | 全域快捷鍵（PTT 模式送 start/stop，切換模式送 toggle） |
| `config` | `{ dragLocked?: boolean, lang?: 'zh-TW' \| 'en', sttProvider?: string }` | 執行期設定變更（語言切換、拖曳鎖定） |

### 5.2 webview → Rust 指令

| 指令 | 參數 → 回傳 | 說明 |
|---|---|---|
| `read_config_raw` | → 設定檔原始 JSON | 含金鑰；webview 以 `normalizeConfig` 正規化 |
| `get_config` | → 遮罩後的設定快照 | 給設定視窗；金鑰只回 `keySet` + `mask` |
| `inject_text` | `{ text }` → `{ ok, message? }` | 原生注入（blocking pool） |
| `probe_inject` | → `{ ok, message? }` | 權限探測 |
| `report_state` | `{ state }` | 更新 Tray 提示 |
| `log_line` | `{ line }` | 寫進 `logs/shell.log` |
| `get_health` / `emit_health_webview` | 健康面板讀寫 | webview 回報麥克風裝置數與權限 |
| `set_hotkey` / `set_hotkey_enabled` | 快捷鍵綁定與錄製期間暫停 | |
| `set_stt_provider` / `set_provider_key` / `clear_provider_key` | STT 供應商與金鑰 | 寫檔後刷新 Tray 的 STT 列 |
| `save_polish` / `clear_polish_key` | 潤稿設定 | |
| `save_input_mode` / `save_vad_trim` / `save_lang` / `save_mic_device` / `save_zh_mode` / `save_drag_locked` / `save_offset_x` | 單欄位寫入 | |
| `quit_app` | | |

規則：webview 從不直接碰磁碟；每個寫入指令只改自己負責的欄位（`patch_config` 讀-改-寫）。

## 6. 設定檔

位置：`%APPDATA%\vocium\vocium-config.json`（Windows）、`~/.config/vocium/vocium-config.json`（macOS/Linux）。型別定義與預設值在 `packages/voice-core/src/config.ts`，`normalizeConfig` 負責把任何輸入收斂成合法值。欄位說明見 [CONFIGURATION.zh-TW.md](CONFIGURATION.zh-TW.md)。

Rust 端只解析自己需要的欄位（`hotkey`、`iconOffsetX`、`dragLocked`、`lang`、`inputMode`、各金鑰是否存在），**不**重複定義整份 schema。

## 7. 建置與打包

```
npm run build      = build:core（tsc → packages/voice-core/dist）+ build:ui（esbuild → app-tauri/ui/build）
npm run dev        = build + vad:assets + tauri dev
npm run package    = tauri build（beforeBuildCommand 會先跑 build + vad:assets）
npm test           = voice-core vitest
cargo test         = 殼層單元測試（健康面板推導）
```

Tauri 的 `frontendDist` 是 `app-tauri/ui`，所以 `build/` 與 `vad/` 必須在打包前存在。npm 的 `@tauri-apps/api` 與 `@tauri-apps/plugin-http` 固定在與 Rust crate 相同的 minor 版本，否則 `tauri dev` 會警告版本不一致。

## 8. 決策紀錄

| 編號 | 決策 | 理由 | 日期 |
|---|---|---|---|
| D1 | 單一行程，移除 Node sidecar 與 MCP | 兩個行程帶來 Bun binary、重啟、三處重複設定；MCP 對外場景評估後用不到 | 2026-10-30 |
| D2 | 核心留在 TypeScript，抽成 `@vocium/voice-core` | 作者的其他專案（Goji）是網頁技術，要共用辨識邏輯；180 個既有測試得以保留 | 2026-10-30 |
| D3 | voice-core 跑在 webview，網路走 `tauri-plugin-http` | 單行程下讓 TS 核心存活的唯一位置；plugin-http 讓 adapter 不用改 | 2026-10-30 |
| D4 | Windows 注入改 Win32 原生，注入後還原剪貼簿 | 去掉 PowerShell 冷啟動與執行政策風險；剪貼簿被覆蓋是最常見抱怨 | 2026-10-30 |
| D5 | 錯誤與提示只顯示在 ICON，不貼進文件 | 貼錯誤訊息到使用者文件很突兀 | 2026-10-30 |
| D6 | 模型清單不做 runtime fetch，提供「自訂…」逃生口 | 各家 `/models` 無可靠 STT 旗標；清單落後不卡人 | 2026-05 |
| D7 | 金鑰暫存明文設定檔 | 待改用 OS 鑰匙圈（ROADMAP） | — |

## 9. 已知限制與下一步

- 錄音仍在 webview：串流 STT 與即時 VAD 需要先把錄音搬進 Rust。
- 金鑰明文；Linux 注入未經實機驗證；沒有 CI 與 Releases；沒有自動更新與簽章。
- 完整優先序見 [ROADMAP.zh-TW.md](ROADMAP.zh-TW.md)。
