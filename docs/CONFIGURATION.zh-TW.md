# 設定說明

設定檔位置——首次啟動時自動建立：
`%APPDATA%\vocium\vocium-config.json`（Windows）
`~/Library/Application Support/vocium/vocium-config.json`（macOS）
可透過 **系統匣 → Vocium → 設定…**（三個分頁：一般 / 語音辨識 / AI 潤稿）以視覺介面修改，或直接編輯設定檔。

```jsonc
{
  "hotkey": "Ctrl+Shift+Space",
  "sttProvider": "groq",               // "groq" | "openai" | "gemini" | "mock"
  "groqApiKey": "<your-groq-key>",
  "groqModel": "whisper-large-v3-turbo",
  "openaiApiKey": "<your-openai-key>", // 選填；使用 OpenAI 提供商時填入
  "openaiModel": "whisper-1",
  "openaiBaseUrl": "",                 // 選填；留空即使用 api.openai.com
  "geminiApiKey": "<your-gemini-key>", // 選填；使用 Gemini 提供商時填入
  "geminiModel": "gemini-3.5-flash",
  "inputMode": "toggle",               // "toggle" | "ptt"（按住說話模式）
  "vadTrim": false,                    // 是否啟用靜音自動裁剪
  "maxListenMs": 30000,
  "dragLocked": false
}
```

## API 金鑰（BYOK）

Vocium 不設伺服器、不內建金鑰——每家提供商各有專屬欄位，金鑰僅儲存於您的裝置上。
請至 **系統匣 → Vocium → 設定…** 設定金鑰。

| 提供商 | 取得金鑰 | 備註 |
|---|---|---|
| **Groq**（推薦） | [console.groq.com](https://console.groq.com) | — |
| **OpenAI** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | 可選填自訂 **Base URL**，以對接相容的第三方端點 |
| **Gemini** | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | — |

> **隱私聲明** — 雲端提供商（Groq、OpenAI、Gemini）會將您的音訊傳送至其伺服器進行辨識。如需完全離線使用，請等待**本地 STT** 功能（規劃中）。

## 模型清單與「重新整理模型清單」

「語音轉文字」與「AI 潤稿」分頁的**模型**下拉選單是隨 App 出貨、人工維護的靜態清單，因此可離線使用、不會自己變動；代價是它不認得出貨後才推出的模型。兩個補救管道：

- **自訂…** — 直接手打任何 model id。
- **↻ 重新整理模型清單** — 用已輸入或已儲存的金鑰向供應商抓取即時清單（Groq／OpenAI 相容端點走 `GET …/models`，自訂 Base URL 也適用；Gemini 走 `v1beta/models`；Claude 潤稿走 Anthropic `v1/models`）。靜態清單保留在最前面並標示為**推薦**；抓到的模型排在後面的**線上清單**（STT 取名稱含 `whisper`／`transcribe` 者，或支援 `generateContent` 的 Gemini 模型；潤稿取已知的對話模型家族），規則認不出的一律放在**其他**，不會漏掉供應商回傳的任何一項。抓到的模型沒有速度／價格提示，直接以 id 當顯示名稱。

結果只存在於這次開啟的設定視窗記憶體中，**不會寫入 `vocium-config.json`**，儲存時只記下你選的 model id。沒有可用金鑰時按鈕停用並提示；抓取失敗只在按鈕旁顯示一行錯誤，下拉選單維持原樣。

## AI 潤稿

轉錄完成後、文字注入前的選用 LLM 整修流程。預設關閉；可於**設定 → AI 潤稿**啟用。
潤稿類別如下：

| 類別 | 行為說明 |
|---|---|
| **基礎校正** (`light`) | 補全標點符號、分段，並修正明顯的辨識錯誤。語助詞與填充詞保留不動。 |
| **話語潤飾** (`full`) | 包含 `light` 的所有處理，並額外去除語助詞、使語句更流暢。 |
| **自訂 Prompt** (`custom`) | 使用您自行撰寫的系統提示詞。 |

潤稿金鑰同樣採用 BYOK 模式：`groq`／`openai`／`gemini` 會自動沿用對應 STT 的金鑰，除非另行設定潤稿專用覆蓋值；`claude` 則使用獨立的 `claudeApiKey`。任何失敗情況（無金鑰、網路錯誤、逾時）均自動降級為未潤稿的原始文字——轉錄流程絕不因潤稿失敗而中斷。

> 轉錄結果為空（例如只有靜音）時不會貼上任何東西，直接回到待命；STT 失敗或尚未設定金鑰的提示只顯示在懸浮 ICON 上，不會貼進你的文件。

後處理管線順序：**語音辨識（STT） → AI 潤稿 → 繁／簡轉換 → 文字注入**（每個步驟皆為選用）。
