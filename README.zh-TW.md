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

支援平台：**Windows 11** 與 **macOS**。

### 前置需求

#### 共通（Windows + macOS）

| 工具 | 用途 | 安裝方式 |
|---|---|---|
| **Node.js ≥ 20** | dev 時跑 sidecar（`npm run dev`）；內含 `npm` | ✅ 指令（見下方快速安裝）或 [nodejs.org](https://nodejs.org) 下載 |
| **Rust 工具鏈** | 建置 Tauri 殼 | ✅ 指令（見下方快速安裝） |
| **Bun** | 僅 `npm run package` 需要（建置期；`npm run dev` 不需要） | ✅ 指令（見下方快速安裝）— [文件](https://bun.sh) |

#### 🪟 僅 Windows

| 工具 | 用途 | 安裝方式 |
|---|---|---|
| **WebView2 Runtime** | Tauri 在 Windows 的 webview | **Windows 10（2020+）/ Windows 11** 已內建——通常無需處理。若缺：[Evergreen bootstrapper](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) |
| **MSVC Build Tools** | Windows 下 `cargo build` 需要 | ⚙️ **手動安裝**：安裝 **Visual Studio 2022 Build Tools** 並勾選 *「使用 C++ 的桌面開發」*工作負載——工作負載需在 Visual Studio 安裝程式 GUI 內勾選 |

#### 🍎 僅 macOS

| 工具 | 用途 | 安裝方式 |
|---|---|---|
| **Xcode Command Line Tools** | 提供 `clang`、`codesign` 等讓 `cargo build` 跑 | ✅ 半指令：`xcode-select --install`（會跳系統對話框→點**安裝**） |

### 快速安裝

複製貼上到全新 shell。已安裝的工具請略過該行。

**🪟 Windows（PowerShell）：**
```powershell
# Node.js（LTS，≥ 20）
winget install --id OpenJS.NodeJS.LTS
# Rust
winget install --id Rustlang.Rustup
# Bun —— 僅建置期需要；只跑 `npm run dev` 可跳過
powershell -c "irm bun.sh/install.ps1 | iex"
# MSVC Build Tools —— 需 GUI 勾「使用 C++ 的桌面開發」
winget install --id Microsoft.VisualStudio.2022.BuildTools
```

**🍎 macOS（Terminal）：**
```bash
# Xcode Command Line Tools（會跳系統對話框）
xcode-select --install
# Node.js（≥ 20），用 Homebrew 或 nvm 皆可
brew install node
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Bun —— 僅建置期需要；只跑 `npm run dev` 可跳過
curl -fsSL https://bun.sh/install | bash
```

> 安裝 Rust / Bun 後請開新的 shell，讓更新後的 `PATH` 生效。

### 從原始碼執行（dev）

```bash
git clone <repo-url> vocium
cd vocium
npm install
npm run dev   # 編譯 sidecar 並透過 `tauri dev` 啟動桌面程式
```

### 打包

`npm run package` 產生獨立安裝檔，終端使用者機器**免裝 Node.js**（sidecar 以編譯後 binary 隨附）。**只建主機平台**——在 Windows 跑出 Windows 安裝檔；在 macOS 跑出 macOS 安裝檔。跨平台 CI 為後續（P3）。

**共通（兩平台）：**
```bash
npm install
npm run package
```

安裝檔產生於 **`app-tauri/src-tauri/target/release/bundle/`**。

#### 🪟 Windows 打包

產出兩種安裝檔格式：

| 格式 | 路徑 | 說明 |
|---|---|---|
| `.msi` | `bundle/msi/Vocium_<ver>_x64_en-US.msi` | Windows Installer——適合群組原則／靜默安裝 |
| `.nsis` | `bundle/nsis/Vocium_<ver>_x64-setup.exe` | NSIS 安裝檔——體積小；OSS 常用 |

**首次執行（未簽署）：** Windows SmartScreen 跳「Windows 已保護你的電腦」→ 點**其他資訊** → **仍要執行**。程式簽署為後續規劃（P2）。

#### 🍎 macOS 打包

產出：

| 格式 | 路徑 | 說明 |
|---|---|---|
| `.app` | `bundle/macos/Vocium.app` | 可執行的應用程式 bundle |
| `.dmg` | `bundle/dmg/Vocium_<ver>_{x64\|aarch64}.dmg` | 給人下載的磁碟映像 |

**首次啟動（未簽署）：** Gatekeeper 擋雙擊 → **右鍵 → 打開 → 仍要打開**（一次即可）。Apple Developer ID 簽署 + 公證為後續規劃（P2）。

### 權限

Vocium 在首次執行時會需要作業系統層級的權限。內容與還原流程兩平台略有不同。

#### 🪟 Windows

| 權限 | 用途 | 怎麼給 |
|---|---|---|
| **麥克風** | 錄你的語音 | 首次錄音時 Windows 會跳出標準權限對話框——點 *允許* |

不需要貼上權限—— Vocium 用 `Set-Clipboard` + `SendKeys`，這兩者都不需提權。

#### 🍎 macOS

| 權限 | 用途 | 怎麼給 |
|---|---|---|
| **麥克風** | 錄你的語音 | 首次錄音時 macOS 會跳系統提示；授予給 App（或執行 `npm run dev` 的終端機） |
| **輔助使用** | 把貼上按鍵（Cmd+V）送到焦點 App | **系統設定 ▸ 隱私權與安全性 ▸ 輔助使用** —— 把 Vocium 加入並打勾啟用 |

未授予輔助使用時，轉錄文字仍會複製到剪貼簿，懸浮 ICON 會顯示指引文字——你可以手動 Cmd+V 貼上。

##### 重要：未簽署的版本每次重 build 都必須重新授權

在 Vocium 取得 Apple Developer ID 完成程式簽署之前（P2 路線圖），每次 `npm run package` 都會產生**新的 ad-hoc 簽章**。macOS 用 `(bundle ID, code-signing requirement)` 索引輔助使用清單，所以**每次重 build 都被當成不同 App**。系統設定裡前一筆 Vocium 雖然還顯示綠勾，但指向的是已失效的舊 binary——**那個綠勾在騙人**。

若重 build 後遇到「轉錄成功但貼上不會發生」：

1. 打開 **系統設定 ▸ 隱私權與安全性 ▸ 輔助使用**
2. **移除**舊的 Vocium 那一列（`–` 按鈕）
3. 把新的 `Vocium.app` 加回去（從 Finder 拖入或用 `+`）並打勾啟用

懸浮 ICON 在啟動時會自動跑一次權限 probe，所以若輔助使用不通，球氣會在開機後 1–2 秒內直接顯示指引文字——你不必先講一句話才發現有問題。Dev loop（`npm run dev`）從 Terminal 啟動且重用已授權的 entry，所以這條「重新授權稅」只會出現在 packaged 版。

> **狀態一覽：** Tray 選單即時顯示 麥克風裝置／麥克風權限／STT 金鑰／全域快捷鍵／（macOS）輔助使用 的狀態。失敗項以 ⚠ 標示且可點 — 直接開啟對應的系統設定頁或內部設定視窗。

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

**`polish_text`** — `{ text, style? }` → `{ text }`。用本機設定的 LLM provider 與金鑰潤飾文字。三種類別：`light`（「只補標點符號」— 補標點 + 自然分段 + 修正明顯錯字／同音字，保留 filler）、`full`（「話語潤飾」— 含 light 全部行為，另加 filler 清理 + 句子流暢化）、`custom`（自訂 prompt）。一律不改原意。Headless、由 host 控制：MCP host 決定是否呼叫，不受桌面 `polishEnabled` 開關影響。和其他工具一樣，金鑰從執行 sidecar 那台機器的本機 Vocium config 讀取，呼叫端不傳金鑰。

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

> 呼叫端需自備音訊（Vocium 不會替無頭程式開麥克風）。`inject_text` 在 **Windows 與 macOS 兩個平台都可用**；macOS 上跑 sidecar 的程式需有標準的輔助使用權限（見 **權限**章節）。


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
