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
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License: MIT" />
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-555" alt="Platform: Windows and macOS" />
  <img src="https://img.shields.io/badge/MCP-native-8A2BE2" alt="MCP-native" />
</p>

<p align="center">
  <img src="docs/assets/showcase.gif" width="940" alt="Vocium — AI 語音輸入示範（快捷鍵 → 說話 → 文字落入輸入框）" />
</p>

---

按下快捷鍵、開口說話，AI 即時將語音轉為文字並自動貼入目前焦點的輸入框——不搶焦點、無伺服器、不內建任何憑證。支援 Windows 與 macOS。

它同時是 **MCP 原生**：任何 AI 助手或腳本都能把它的語音轉文字與文字注入當成工具呼叫。

## 架構

輕薄的 Tauri 2（Rust）殼驅動一個 Node sidecar，以單一 MCP 協定對外暴露核心邏輯——殼層只是該 server 的其中一個 client。sidecar daemon 掌管狀態機、STT、AI 潤稿與文字注入；殼層只負責視窗、系統列、全域快捷鍵與麥克風錄音。

## 功能

- **懸浮 ICON** — 鎖定／解除拖曳、縮小到系統匣、不搶焦點
- **切換模式或按鍵發話** — 可自訂全域快捷鍵
- **多家雲端 STT** — Groq、OpenAI Whisper、Gemini；自備金鑰（BYOK），僅存本機
- **AI 潤稿** — 注入前可選的 LLM 潤飾（標點、贅詞、通順）
- **中文輸出** — 強制繁體或簡體；可選 VAD 靜音修剪
- **MCP 原生** — 內建獨立 MCP server，任何 MCP host 都能呼叫

---

### 前置需求

| 工具 | 用途 | 備註 |
|---|---|---|
| **Node.js ≥ 20** | dev 時跑 sidecar | 內含 `npm` |
| **Rust 工具鏈** | 建置 Tauri 殼 | — |
| **Bun** | 僅 `npm run package` 需要 | 建置期；`npm run dev` 不需要 |

平台額外需求：
**Windows** — WebView2 Runtime（Win 10 2020+/11 已內建）+ MSVC Build Tools（勾選 *「使用 C++ 的桌面開發」* 工作負載）。
**macOS** — Xcode Command Line Tools（`xcode-select --install`）。

---

## 快速安裝指令 

無發佈的安裝檔 —— 從原始碼建置

### 前置環境

**🪟 Windows（PowerShell）：**
```powershell
winget install --id OpenJS.NodeJS.LTS          # Node.js（LTS, ≥ 20）
winget install --id Rustlang.Rustup            # Rust
powershell -c "irm bun.sh/install.ps1 | iex"   # Bun — 僅建置期
winget install --id Microsoft.VisualStudio.2022.BuildTools  # 勾「使用 C++ 的桌面開發」
```

**🍎 macOS（Terminal）：**
```bash
xcode-select --install                                          # Xcode CLT（系統對話框）
brew install node                                               # Node.js（≥ 20），或用 nvm
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh  # Rust
curl -fsSL https://bun.sh/install | bash                        # Bun — 僅建置期
```

安裝 Rust / Bun 後請開新 shell，讓更新後的 `PATH` 生效。

### 從原始碼執行

```bash
git clone https://github.com/Hereisaa/vocium.git vocium
cd vocium
npm install
npm run dev   # 編譯 sidecar 並透過 `tauri dev` 啟動桌面程式
```

dev 模式 sidecar 以 Node 執行，不需要 Bun。

### 打包成應用程式

```bash
npm run package # 產生獨立安裝檔
# 產物在 `app-tauri/src-tauri/target/release/bundle/`
```

**🪟 Windows**

| 格式 | 路徑 | 說明 |
|---|---|---|
| `.msi` | `bundle/msi/Vocium_<ver>_x64_en-US.msi` | 群組原則／靜默安裝 |
| `.nsis` | `bundle/nsis/Vocium_<ver>_x64-setup.exe` | 體積小，OSS 常用 |

首次啟動（未簽署）：SmartScreen →**其他資訊 → 仍要執行**。

**🍎 macOS**

| 格式 | 路徑 | 說明 |
|---|---|---|
| `.app` | `bundle/macos/Vocium.app` | 可執行的應用程式 bundle |
| `.dmg` | `bundle/dmg/Vocium_<ver>_{x64\|aarch64}.dmg` | 散佈用磁碟映像 |

首次啟動（未簽署）：Gatekeeper →**右鍵 → 打開 → 仍要打開**（一次）。
※ 未簽署版每次 rebuild 需重新授權輔助使用——見 [權限](#權限)。

---

## 權限

Vocium 首次執行需要作業系統層級權限，內容與還原流程兩平台略有不同。

**🪟 Windows**

| 權限 | 用途 | 怎麼給 |
|---|---|---|
| **麥克風** | 錄你的語音 | 首次錄音時 Windows 跳標準權限對話框——點*允許* |

不需要貼上權限——Vocium 用 `Set-Clipboard` + `SendKeys`，兩者皆不需提權。

**🍎 macOS**

| 權限 | 用途 | 怎麼給 |
|---|---|---|
| **麥克風** | 錄你的語音 | 首次錄音時 macOS 跳系統提示；授予給 App（或執行 `npm run dev` 的終端機） |
| **輔助使用** | 把貼上按鍵（Cmd+V）送到焦點 App | **系統設定 ▸ 隱私權與安全性 ▸ 輔助使用** — 加入 Vocium 並打勾啟用 |

未授予輔助使用時，轉錄文字仍會複製到剪貼簿，懸浮 ICON 顯示指引文字 —— 你可手動 Cmd+V 貼上。

> **遇到 npm run package 之後無法觸發自動貼上，解決方式** :
每次 `npm run package` 都產生新的 ad-hoc 簽章，macOS 把每次 rebuild 當成不同 App —— 舊的輔助使用綠勾還在，但指向已失效的 binary。若 rebuild 後「轉錄成功但貼上不發生」：
**系統設定 ▸ 隱私權與安全性 ▸ 輔助使用 → 移除舊的 Vocium 列 → 加入新的 `Vocium.app` 並啟用**。
dev loop（`npm run dev`）重用已授權的 entry，故此問題只出現在 packaged 版。

---

## Tray 健康面板

系統列選單即時顯示麥克風裝置、麥克風權限、STT 金鑰、全域快捷鍵、（macOS）輔助使用的狀態。失敗項以 ⚠ 標示且可點——直接開啟對應的系統設定頁或內部設定視窗。若有阻斷性檢查失敗（無麥克風或權限被拒），按快捷鍵不會進入聆聽，UI 顯示原因。

---

## 操作

1. 把焦點放在任一輸入框。（當下無焦點則複製到剪貼簿）
2. 按快捷鍵 或 點擊 Vocium → Vocium 進入 **聆聽中**。
3. **說話。**
4. 再按一次 → 轉錄成功

**切換模式** — 按一次開始，再按一次停止並轉錄。
**按鍵發話** — 按住錄音，鬆手即轉錄。

首次執行需設定 STT API 金鑰——見 [CONFIGURATION.zh-TW.md](docs/CONFIGURATION.zh-TW.md)。

---

## 作為 MCP 工具使用

Node sidecar 本身是一個 **獨立 MCP server**——任何 MCP host（Claude Desktop、Cursor、Agent SDK、腳本）都能重用 Vocium 的語音轉文字與文字注入，不必開桌面 app。

三個 headless 工具：

| 工具 | 輸入 → 輸出 | 作用 |
|---|---|---|
| `transcribe_clip` | `{ audioBase64, mimeType, language? }` → `{ text }` | 用你設定的 provider 轉錄音訊，套用繁／簡偏好。唯讀。 |
| `inject_text` | `{ text }` → `{ ok }` | 把文字打進作業系統焦點視窗（剪貼簿＋貼上）。焦點由呼叫端負責。 |
| `polish_text` | `{ text, style? }` → `{ text }` | LLM 潤飾。`style`：`light`（補標點＋修明顯錯字，保留贅詞）、`full`（另加去贅詞＋通順）、`custom`（自訂 prompt）。 |

- 金鑰從執行 sidecar 那台機器的本機 Vocium config 讀取——**呼叫端不傳也看不到金鑰**。
- 呼叫端提供音訊（Vocium 不會 headless 開麥克風）。
- macOS 上 `inject_text` 需要標準的輔助使用權限（見 [權限](#權限)）。
- 在 MCP host 設定中註冊（先 `npm run build`）。進入點是 **`dist/sidecar/main.js`**：

```json
{
  "mcpServers": {
    "vocium": { "command": "node", "args": ["<path>/vocium/dist/sidecar/main.js"] }
  }
}
```

> MCP Server 另外還有暴露六個 **狀態機工具**（`toggle`、`start_listening`、`stop_listening`、`cancel`、`get_state`、`submit_audio`）供桌面殼層驅動現場錄音流程，以及診斷用的 `probe_inject`。
> 
> **外部整合通常只需要上面三個 headless 工具**

**想用嵌入方式？** 
與其 spawn 行程，不如直接 import factory：`import { buildServer } from '<path>/vocium/dist/sidecar/index.js'`，再 `buildServer().connect(你的 transport)`。
（`index.js` 僅 export factory，直接跑它不會啟動任何東西——`main.js` 才是 stdio 進入點。）
sidecar 與 Tauri 殼層各自獨立 build，殼層只是這同一個 server 的其中一個 MCP client。

---

## 文件

| 文件 | 內容 |
|---|---|
| [docs/CONFIGURATION.zh-TW.md](docs/CONFIGURATION.zh-TW.md) | `vocium-config.json`、各家 BYOK 金鑰設定、AI 潤稿 |
| [docs/ROADMAP.zh-TW.md](docs/ROADMAP.zh-TW.md) | 已完成／規劃中／延後的項目 |
| [docs/CONTRIBUTING.zh-TW.md](docs/CONTRIBUTING.zh-TW.md) | 開發流程、build gates、新增 provider |
| [docs/DESIGN_MOCKUP.html](docs/DESIGN_MOCKUP.html)、[docs/ICON_DESIGN.html](docs/ICON_DESIGN.html)  | 設計圖 |

---

## 授權

MIT
