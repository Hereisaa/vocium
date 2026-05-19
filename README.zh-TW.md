<p align="center">
  <img src="app-tauri/src-tauri/icons/128x128.png" width="96" height="96" alt="Vocium" />
</p>

<h1 align="center">Vocium</h1>

<p align="center">
  <b>桌面 AI 智慧語音輸入。</b>
</p>

<p align="center">
  <a href="README.md">English</a> · <b>繁體中文</b>
</p>

<p align="center">
  <img src="docs/assets/showcase.gif" width="940" alt="Vocium — AI 語音輸入示範（快捷鍵 → 說話 → 文字落入輸入框）" />
</p>

---

按下快捷鍵，開口說話，AI 即時將語音轉為文字並自動貼入目前焦點的輸入框——不搶焦點，無伺服器，不內建任何憑證。它同時是 **MCP 原生**：任何 AI 助手或腳本都能把它的語音轉文字與文字注入當成工具直接呼叫。

## 功能

- **懸浮 ICON** — 鎖定/解除拖曳 · 縮小到系統匣 · 不搶焦點
- **五種狀態** — 待命 · 聆聽 · 轉錄 · 完成 · 錯誤
- **輸入模式、可自訂快捷鍵** — 切換模式（預設）或 按鍵發話
- **靜音修剪 VAD** — 自動剪剪輯無聲片段
- **中文繁／簡輸出切換** — 中文可強制設置 繁體／簡體
- **多家雲端 STT** — **Groq**、**OpenAI Whisper**、**Gemini**，自備金鑰（BYOK）僅存本機
- **本機 STT** — Coming Soon
- **MCP 原生** — 內建獨立 MCP server：任何 MCP host（Claude Desktop、Cursor、agent、腳本）都能呼叫它的語音轉文字與文字注入工具

---

## 安裝與使用

### 前置需求

- **Windows 11** 或 **macOS**（以 `npm run dev` 執行）。
- **Node.js ≥ 20** · **Rust 工具鏈** · **WebView2** runtime（Windows）· **MSVC build tools**（Windows）

**macOS（以 `npm run dev` 執行）：** 首次啟動請授予 Vocium 兩項權限：
- **麥克風** — 首次錄音時 macOS 會要求授權；授予給執行 `npm run dev` 的 App 或終端機。
- **輔助使用** — 系統設定 ▸ 隱私權與安全性 ▸ 輔助使用。全域快捷鍵與「把轉錄文字貼進焦點 App」皆需要。未授予時文字仍會複製到剪貼簿，App 會提示你手動貼上。

`node` 須在 `PATH`（由終端機啟動的 `npm run dev` 會繼承）。

### 步驟

```bash
git clone <repo-url> vocium
cd vocium
npm install
npm run build          # 編譯 TypeScript sidecar
npm run dev            # 編譯並啟動桌面程式（tauri dev）
```

### 打包

`npm run package` 產生獨立安裝檔 — Windows `.msi`/`.nsis` 或 macOS `.app`/`.dmg` — 終端使用者機器**免裝 Node.js**（sidecar 以編譯後 binary 隨附）。需先安裝 [Bun](https://bun.sh)（僅建置期需要）：

```bash
npm install
npm run package
```

安裝檔產生於 `app-tauri/src-tauri/target/release/bundle/`。未簽署（macOS 首次啟動右鍵 → 打開）；程式簽署為後續規劃。

### 設定

設定檔：`%APPDATA%\vocium\vocium-config.json`（首次執行自動建立）。
可從 **系統列 → 設定…** 即時修改——三分頁：一般 / 語音轉文字 / AI 潤稿。

```jsonc
{
  "hotkey": "Ctrl+Shift+Space",
  "sttProvider": "groq",               // "groq" | "openai" | "gemini" | "mock"
  "groqApiKey": "<你的 Groq 金鑰>",     // 你的 Groq 金鑰
  "groqModel": "whisper-large-v3-turbo",
  "openaiApiKey": "<your-openai-key>", // 選用；OpenAI provider 使用
  "openaiModel": "whisper-1",
  "openaiBaseUrl": "",                 // 選用；留空使用官方端點
  "geminiApiKey": "<your-gemini-key>", // 選用；Gemini provider 使用
  "geminiModel": "gemini-1.5-flash",
  "inputMode": "toggle",               // "toggle" | "ptt"（按住說話）
  "vadTrim": false,                    // 靜音修剪（選用）
  "maxListenMs": 30000,
  "dragLocked": false
}
```

### 設定 STT API Key（BYOK）

- 無 Vocium 伺服器，不內建金鑰 —— 各家來源各有獨立欄位，本機存檔
- 系統列 → Vocium → 右鍵 → 設定... → 語音轉文字

#### Groq — 推薦

**https://console.groq.com** 建立金鑰，貼入 Groq API Key。


#### OpenAI

**https://platform.openai.com/api-keys** 建立金鑰，貼入 OpenAI API Key。
可設自訂 **Base URL** 使用相容第三方端點。

#### Gemini

**https://aistudio.google.com/apikey** 建立金鑰，貼入 貼入 Gemini API Key。

> **隱私** — `雲端 provider（Groq、OpenAI、Gemini）`會將語音音訊離開本機送往服務轉錄。要完全離線，請使用 `本地 STT`。


### 日常使用

1. 把焦點放在任一輸入框（編輯器、瀏覽器、聊天室 …）
2. 按快捷鍵或點擊懸浮 ICON → **聆聽**
3. **說話**
4. 再按一次 → 轉錄並自動貼入焦點輸入框 (當下無焦點則複製於剪貼簿中)

**切換模式** — 按一次開始，再按一次停止並轉錄
**按鍵發話** — 按住錄音，鬆手即轉錄

---

## 設計圖

視覺規格為可直接用瀏覽器開的單一 HTML：

- `docs/DESIGN_MOCKUP.html` — 懸浮 ICON、五狀態、懸浮控制鈕、設定視窗。
- `docs/ICON_DESIGN.html` — App 圖示方案與定案。


## 架構

輕薄的 Tauri 2（Rust）殼驅動一個 Node sidecar，以單一 MCP 協定對外暴露核心邏輯。
細節見 [`docs/SPEC.md`](docs/SPEC.md)、[`docs/ROADMAP.md`](docs/ROADMAP.md)。

## 作為 MCP 工具使用

Node sidecar 本身是一個**獨立 MCP server**——任何 MCP host（Claude Desktop、Cursor、Agent SDK、腳本…）都能直接重用 Vocium，不必自己重造語音轉文字或系統文字注入。對外提供三個 headless 工具：

**`transcribe_clip`** — `{ audioBase64, mimeType, language? }` → `{ text }`。用你本機設定的來源轉錄音訊，並套用你的繁／簡偏好。唯讀、無副作用：呼叫端拿到文字後自行決定怎麼處理。

**`inject_text`** — `{ text }` → `{ ok }`。把文字打進作業系統目前焦點的視窗（剪貼簿＋模擬貼上）。與 STT 無關，可注入任意字串。會落在「呼叫當下焦點所在」的視窗，焦點由呼叫端負責。

**`polish_text`** — `{ text, style? }` → `{ text }`。用本機設定的 LLM provider 與金鑰潤飾文字（清贅詞、補標點、通順，不改原意）。Headless、由 host 控制：MCP host 決定是否呼叫，不受桌面 `polishEnabled` 開關影響。和其他工具一樣，金鑰從執行 sidecar 那台機器的本機 Vocium config 讀取，呼叫端不傳金鑰。

在 MCP host 設定中註冊（先 `npm run build`）：

```json
{
  "mcpServers": {
    "vocium": { "command": "node", "args": ["<path>/vocium/dist/sidecar/index.js"] }
  }
}
```

Host 會在需要時以 stdio spawn sidecar——你不必保持任何東西在跑，桌面 app 也不需開著。

範例 — *「用 vocium 把 `./會議.m4a` 轉成逐字稿，再用繁體中文摘要。」* 助手會呼叫 `transcribe_clip`，再從回傳文字接續處理。

### API 金鑰從哪來

MCP 呼叫端不會傳入也看不到金鑰。Vocium 從「執行 sidecar 那台機器」的本機設定讀取——`%APPDATA%\vocium\vocium-config.json`（用 **系統匣 → 設定… → 語音轉文字** 設定一次，或直接編輯該檔）。所以那台機器必須已在 Vocium 設好來源金鑰；呼叫端全程不碰金鑰。

> 呼叫端需自備音訊（Vocium 不會替無頭程式開麥克風）；`inject_text` 目前僅支援 Windows。


## Roadmap

後處理 pipeline：**STT → AI 潤稿 → 繁簡轉換 → 注入**（各步可選）。

- **中文輸出（繁／簡）** ✅
- **多家雲端 STT** — Groq／OpenAI／Gemini，BYOK、PTT、VAD ✅
- **AI 潤稿** — 可選 LLM 潤飾（清贅詞、補標點、通順）再注入；預設關閉。✅
- **本地 STT** — whisper.cpp／faster-whisper／LocalAI／Ollama。裝置端轉錄；下一個規劃項目。
- **本地 LLM 潤稿** — 裝置端潤稿。延後。

詳見 [`docs/ROADMAP.md`](docs/ROADMAP.md)。

## 授權

MIT
