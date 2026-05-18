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

按下快捷鍵，開口說話，AI 即時將語音轉為文字並自動貼入目前焦點的輸入框——不搶焦點，無伺服器，不內建任何憑證。

## 功能

- **懸浮 ICON** — 鎖定/解除拖曳 · 縮小到系統匣 · 不搶焦點。
- **五種狀態** — 待命 · 聆聽 · 轉錄 · 完成 · 錯誤
- **輸入模式、可自訂快捷鍵** — 切換模式（預設）或 按鍵發話
- **靜音修剪 VAD** — 自動剪剪輯無聲片段
- **中文繁／簡輸出切換** — 中文可強制設置 繁體／簡體
- **多家雲端 STT** — **Groq**、**OpenAI Whisper**、**Gemini**，自備金鑰（BYOK）僅存本機。
- **本機 STT** — Coming Soon

---

## 安裝與使用

### 前置需求

- **Windows 11**（※ macOS／Linux : Coming Soon）。
- **Node.js ≥ 20** · **Rust 工具鏈** · **WebView2** runtime · **MSVC build tools**

### 步驟

```bash
git clone <repo-url> vocium
cd vocium
npm install
npm run build          # 編譯 TypeScript sidecar
npm run dev            # 編譯並啟動桌面程式（tauri dev）
```

本機打包：

```bash
npx tauri build --config app-tauri/src-tauri/tauri.conf.json
```

> 產物未簽章；安裝程式打包／簽章列為後期項目。

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

輕薄的 Tauri 2（Rust）殼驅動一個 Node sidecar，以單一 MCP 協定對外暴露核心邏輯。細節見 [`docs/SPEC.md`](docs/SPEC.md)、[`docs/ROADMAP.md`](docs/ROADMAP.md)。


## Roadmap

後處理 pipeline：**STT → 繁簡轉換 → AI 潤稿 → 注入**（各步可選）。

- **中文輸出（繁／簡）** ✅
- **多家雲端 STT** — Groq／OpenAI／Gemini，BYOK、PTT、VAD ✅
- **AI 潤稿** — 可選 LLM 潤飾（清贅詞、補標點、通順）再注入；預設關閉。
- **本地 STT** — whisper.cpp／faster-whisper／LocalAI／Ollama。裝置端轉錄；下一個規劃項目。

詳見 [`docs/ROADMAP.md`](docs/ROADMAP.md)。

## 授權

MIT
