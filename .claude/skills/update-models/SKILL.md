---
name: update-models
description: 更新／核對 Vocium 的靜態模型清單（packages/voice-core/src/stt/models.ts）。觸發詞：更新模型清單、核對模型清單、model list drift、check models、模型下架、刷新 models.ts。先跑 npm run check:models，再依官方 models／pricing／deprecations 頁修正清單、驗證日期、下架對照表、文件與 CHANGELOG，最後開 PR。
---

# update-models — 核對並更新靜態模型清單

Vocium 的模型下拉選單來自唯一的靜態清單 `packages/voice-core/src/stt/models.ts`
（`STT_MODELS`、`POLISH_MODELS`、`DEFAULT_MODEL`、`DEFAULT_POLISH_MODEL`、
每家核對日期 `MODEL_LIST_VERIFIED_AT`、下架對照表 `RETIRED_MODEL_REPLACEMENTS`）。
這個 skill 把「發現漂移 → 查官方文件 → 改清單 → 驗證 → 開 PR」走完一輪。

## 安全規則（先讀）

- **不印、不 commit、不貼任何 API 金鑰。** `check-models.mjs` 只從環境變數讀金鑰，
  報告裡不會出現金鑰；你也不要把 `process.env.*_API_KEY` 的值 echo 出來或寫進檔案。
- 沒有金鑰也能完成整個流程（純公開文件比對）。有金鑰只是多一欄即時 `/models` 比對。
- 改檔前確認在自己的分支（`claude/<主題>`），不要直接改 `main`。

## 步驤

1. **跑漂移檢查**
   ```bash
   npm run build:core
   npm run check:models -- --out /tmp/model-report.md
   ```
   退出碼 1 代表有「嚴重」（id 已從該家 models 頁消失且沒有未到期的停用日）；
   0 代表只有警告（列在 deprecations 頁、或缺席但停用日未到）或無法核對（頁面抓不到／JS 空殼）。
   若某家整段「unverifiable」，先用 WebFetch 手動開該頁確認是暫時性問題還是網址搬家；
   網址搬家就改 `scripts/check-models.mjs` 的 `SOURCES`。

2. **對有嚴重或警告的供應商查官方頁**，用 WebFetch 讀以下頁面確認替代模型與價格定位
   （快／便宜／準／免費額度），不要憑記憶：
   - Groq：https://console.groq.com/docs/models 、 https://console.groq.com/docs/deprecations
   - OpenAI：https://developers.openai.com/api/docs/models 、 /docs/pricing 、 /docs/deprecations
   - Gemini：https://ai.google.dev/gemini-api/docs/models 、 /docs/pricing 、 /docs/deprecations
   - Claude：https://platform.claude.com/docs/en/about-claude/models/overview 、 /docs/en/about-claude/model-deprecations
   有金鑰時可另跑 `GROQ_API_KEY=… npm run check:models`（其餘 `OPENAI_API_KEY`／`GEMINI_API_KEY`／
   `ANTHROPIC_API_KEY`），報告會多一欄「live /models」。

3. **改 `models.ts`**
   - 新增／替換條目時 `label`（繁中）與 `labelEn` 都要帶速度／價格提示，沿用既有寫法：
     `（預設・快・便宜）`／`(default · fast · cheap)`、`（最準・較貴）`、`（舊・2027-02 停用）`。
   - 預設模型（`DEFAULT_*`）要是該家目前建議、且三個 adapter 都能用的 id。
   - **被下架且會硬失敗的 id** 補進 `RETIRED_MODEL_REPLACEMENTS: { 舊id: 替代id }`，
     讓舊設定檔自動換成替代模型；靜默自動轉路由的 id（例如 Gemini 的舊版別名）不需要加。
   - 把該供應商的 `MODEL_LIST_VERIFIED_AT.<provider>` 改成當天（YYYY-MM-DD），沒動的供應商不要改。

4. **同步文件**
   - `docs/CONFIGURATION.md` 與 `docs/CONFIGURATION.zh-TW.md`：預設模型與模型說明段落。
   - `CHANGELOG.md` 的 `[Unreleased]` 加一條 `Changed`，寫明哪家換了什麼、原因（下架日）。
   - 若替代模型改變了 adapter 行為（端點、參數），一併更新 `docs/ARCHITECTURE.md`。

5. **驗證**
   ```bash
   npm run build
   npm test
   npm run check:models
   ```
   `npm test` 全綠、`check:models` 不再有嚴重項目才算完成；把報告摘要貼進 PR 描述。
   推送前照 `docs/CONTRIBUTING.md` 的 grep 檢查 diff 內沒有金鑰。

6. **開 PR**，標題例：`models: refresh <provider> list (<retired id> retired <date>)`，
   描述附上 check:models 的結果表與你查過的官方頁連結；不要自行合併。

## 排程 CI 的關係

`.github/workflows/check-models.yml` 每月 1 日跑同一支腳本（不帶任何金鑰），有嚴重項目會開或更新
標題為 **Model list drift** 的 issue。看到那張 issue 就是本 skill 的起點：先跑步驤 1 重現，再往下走。
