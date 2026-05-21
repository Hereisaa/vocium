# Vocium 開發藍圖

**Windows 與 macOS 桌面語音輸入工具，MCP 原生對外。**

---

## 現況

Vocium 已可在 Windows 11 與 macOS 上完整運作。支援三家雲端 STT 供應商（Groq、OpenAI、Gemini）、可選 AI 潤稿、繁／簡中文轉換、切換式與按住說話（PTT）模式、VAD 靜音修剪、Tray 健康面板，以及獨立的 MCP 伺服器。打包版本無需在使用者機器上安裝 Node.js。

---

## 已完成功能

- **懸浮 ICON** — 常駐覆蓋層；可鎖定／解鎖拖曳、縮小至系統托盤、不搶焦點
- **切換式與按住說話（PTT）** — 可設定全域快捷鍵，即時生效；Settings 內含快捷鍵錄製器
- **多家 STT 供應商** — Groq、OpenAI Whisper、Gemini；自備 API 金鑰，僅存於本機；精選模型清單附自訂逃生口
- **AI 潤稿** — 可選的 LLM 後處理（補標點、清除口語贅詞、流暢化），注入前執行；支援 Groq、OpenAI、Gemini、Claude；三種風格：只補標點符號、完整潤飾、自訂 Prompt；任何失敗皆降級回原始逐字稿
- **中文輸出** — 強制輸出繁體（台灣）或簡體；繁簡轉換在 AI 潤稿後執行以保留語意
- **VAD 靜音修剪** — 可選開啟；送出 STT 前自動裁去開頭與結尾靜音
- **Tray 健康面板** — 五項探測（麥克風裝置、麥克風權限、macOS 輔助使用、STT API 金鑰、全域快捷鍵）；失敗項可點選直達系統設定；錄音前先行 pre-flight 檢查
- **STT 逾時與取消** — 30 秒硬逾時；轉錄中點擊 ICON 可立即取消
- **MCP 原生** — 獨立 MCP 伺服器（`transcribe_clip`、`inject_text`、`polish_text`）；任何 MCP 主機（Claude Desktop、Cursor、腳本）均可無頭呼叫 STT 與文字注入
- **打包建置** — `npm run package` 產生自帶安裝檔（Windows：`.msi`／`.nsis`；macOS：`.app`／`.dmg`）；sidecar 編譯為單一 binary，終端使用者免裝 Node.js
- **macOS 平台支援** — 以 Accessibility 注入（`pbcopy` + `osascript Cmd+V`），缺少權限時 App 內顯示引導，降級處理

---

## 規劃中 / 暫緩項目

- **本地 STT** *(規劃中)* — 透過 whisper.cpp、faster-whisper 或 Ollama 相容後端進行裝置端轉錄；無需 API 金鑰或網路連線；STT 供應商選單已可見「本地」選項（目前顯示「即將推出」）
- **本地 LLM 潤稿** *(規劃中)* — 透過 Ollama 或類似方案進行裝置端 AI 潤稿；沿用相同管線，新增供應商選項
- **串流轉錄** *(規劃中)* — 改以串流方式傳送音訊以降低延遲，取代單次整包上傳
- **用量／費用估算** *(規劃中)* — 於 Tray 顯示大致 API 用量
- **多麥克風選擇 + 輸入增益** *(規劃中)*
- **開機自啟** *(規劃中)*
- **介面語言（i18n）** *(規劃中)* — 中文／英文介面切換
- **程式簽署** *(暫緩)* — Windows SmartScreen + macOS Developer ID / 公證；目前未簽署版本在 macOS 每次重新建置須手動處理 Gatekeeper
- **跨平台 CI + 公開 Releases** *(暫緩)* — 推 tag 自動建置兩平台、Homebrew Cask / Scoop / winget manifest
- **BrainMesh 整合** *(暫緩)* — 將 Vocium sidecar 註冊為 BrainMesh 可呼叫的 MCP 工具
