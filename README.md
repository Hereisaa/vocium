<p align="center">
  <img src="app-tauri/src-tauri/icons/128x128.png" width="96" height="96" alt="Vocium" />
</p>

<h1 align="center">Vocium</h1>

<p align="center"><b>按一個鍵、開口說，文字直接落在你正在打字的地方。</b></p>

<p align="center">
  <b>繁體中文</b> · <a href="README.en.md">English</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT" />
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-555" alt="Windows · macOS" />
  <img src="https://img.shields.io/badge/keys-BYOK%20%C2%B7%20%E5%83%85%E5%AD%98%E6%9C%AC%E6%A9%9F-6ad0c8" alt="BYOK" />
  <img src="https://img.shields.io/badge/process-%E5%96%AE%E4%B8%80%E8%A1%8C%E7%A8%8B-8a6cff" alt="single process" />
</p>

<p align="center">
  <img src="docs/assets/showcase.svg" width="940" alt="Vocium 示範：按快捷鍵 → 說話 → AI 轉錄 → 文字落入原本的輸入框" />
</p>

---

## 這是什麼

Vocium 是桌面上的 AI 語音輸入工具。

- 游標停在**任何** App 的輸入框。
- 按快捷鍵，說話。
- 文字自動貼進去。不搶焦點，不開新視窗。

辨識交給你自備金鑰的雲端服務（Groq、OpenAI、Gemini）。沒有伺服器，沒有帳號，金鑰只存在你的電腦。

---

## 特色

| | |
|---|---|
| 🎙️ **兩種說話方式** | 切換模式：按一下開始、再按一下結束。按住說話：按住錄、放開送。快捷鍵可自訂。 |
| 🔑 **自備金鑰（BYOK）** | Groq、OpenAI Whisper、Gemini 三選一。OpenAI 相容端點可接自架服務。 |
| ✨ **AI 潤稿（選用）** | 貼上前先讓 LLM 補標點、去贅詞、順句子。三種風格，可自訂 prompt。 |
| 🀄 **繁簡強制輸出** | 不管辨識出什麼，統一轉成繁體（台灣）或簡體。離線完成。 |
| 📋 **不弄亂剪貼簿** | 貼完會把你原本的剪貼簿內容放回去。 |
| 🩺 **系統匣健康面板** | 麥克風、權限、金鑰、快捷鍵狀態一目了然，壞掉的項目點一下直達設定。 |
| 🧩 **單一行程** | 一個執行檔，沒有背景服務。核心邏輯是純 TypeScript 套件，可在其他專案重用。 |

---

## 三步上手

### 1. 安裝

目前尚未發佈安裝檔，請從原始碼建置。需要 **Node.js ≥ 20** 與 **Rust 工具鏈**。

<details>
<summary>🪟 Windows 工具鏈（PowerShell）</summary>

```powershell
winget install --id OpenJS.NodeJS.LTS
winget install --id Rustlang.Rustup
winget install --id Microsoft.VisualStudio.2022.BuildTools   # 勾「使用 C++ 的桌面開發」
```

WebView2 Runtime 在 Windows 10 2020+ / 11 已內建。安裝後請開新視窗讓 `PATH` 生效。
</details>

<details>
<summary>🍎 macOS 工具鏈（Terminal）</summary>

```bash
xcode-select --install
brew install node
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```
</details>

```bash
git clone https://github.com/Hereisaa/vocium.git
cd vocium
npm install
npm run dev
```

要打包成安裝檔：`npm run package`，產物在 `app-tauri/src-tauri/target/release/bundle/`。

### 2. 填金鑰

右下角系統匣 → **Vocium → 設定… → 語音轉文字**，選一家、貼上金鑰、儲存。

| 供應商 | 取得金鑰 | 備註 |
|---|---|---|
| **Groq**（推薦） | [console.groq.com](https://console.groq.com) | 有免費額度，中文辨識快又準 |
| **OpenAI** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | 可改 Base URL 接相容服務 |
| **Gemini** | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | — |

### 3. 說話

1. 游標放在任何輸入框。
2. 按 **Ctrl+Shift+Space**（預設）。
3. 說話，再按一次。
4. 文字出現。

---

## 權限

| 平台 | 需要 | 怎麼給 |
|---|---|---|
| Windows | 麥克風 | 首次錄音時系統會問，點「允許」。 |
| macOS | 麥克風 | 首次錄音時系統會問。 |
| macOS | 輔助使用 | **系統設定 → 隱私權與安全性 → 輔助使用**，加入 Vocium 並啟用。沒給的話文字仍會複製到剪貼簿，自己按 Cmd+V 即可。 |

> **macOS 重新打包後貼上失效？** 每次 `npm run package` 都是新的簽章，macOS 視為不同 App。到輔助使用清單移除舊的 Vocium、加入新的即可。

---

## 設定

所有設定都在系統匣的「設定…」視窗，分三頁：

- **一般**：介面語言、快捷鍵、麥克風、輸入模式、靜音修剪、繁簡輸出。
- **語音轉文字**：供應商、金鑰、模型。
- **AI 潤稿**：開關、供應商、模型、風格。

設定檔位置與完整欄位說明見 [docs/CONFIGURATION.zh-TW.md](docs/CONFIGURATION.zh-TW.md)。

---

## 運作方式

```
按快捷鍵 → 錄音 → 雲端 STT → AI 潤稿（選用）→ 繁簡轉換 → 貼進焦點視窗
```

- **Rust 殼層**只做作業系統的事：視窗、系統匣、快捷鍵、設定檔、貼上。
- **voice-core** 是純 TypeScript 套件，負責狀態機、辨識、潤稿、繁簡。跑在 App 的 webview 裡。
- 只有真正的辨識結果會被貼上。沒說話、辨識失敗、沒設金鑰，都只在懸浮 ICON 上提示，不會弄髒你的文件。

完整架構、IPC 契約與決策紀錄見 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)（架構的唯一事實來源）。互動式架構圖見 [docs/archify/](docs/archify/)。

---

## 在你的專案重用辨識核心

```ts
import { createSttAdapter, normalizeConfig } from '@vocium/voice-core';

const cfg = normalizeConfig({ sttProvider: 'groq', groqApiKey: process.env.GROQ_KEY });
const stt = createSttAdapter(cfg, { fetch });
const { text } = await stt.transcribe({ audio: bytes, mimeType: 'audio/webm' });
```

套件只依賴 `fetch`，瀏覽器、Node、Bun 都能跑。目前位於 `packages/voice-core/`。

---

## 文件

| 文件 | 內容 |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | 架構 SSOT：邊界、狀態機、IPC、決策紀錄 |
| [CONFIGURATION.zh-TW.md](docs/CONFIGURATION.zh-TW.md) | 設定檔欄位、各家金鑰、潤稿 |
| [ROADMAP.zh-TW.md](docs/ROADMAP.zh-TW.md) | 已完成、規劃中、延後 |
| [CONTRIBUTING.zh-TW.md](docs/CONTRIBUTING.zh-TW.md) | 開發流程、測試關卡、新增供應商 |
| [archify/](docs/archify/) | 互動式架構圖與流程圖 |
| [ICON_DESIGN](https://hereisaa.github.io/vocium/ICON_DESIGN.html) · [DESIGN_MOCKUP](https://hereisaa.github.io/vocium/DESIGN_MOCKUP.html) | 圖示與介面設計 |

---

## 授權

MIT
