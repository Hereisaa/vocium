# Vocium — 專案筆記

> 工作區 SOP 筆記。路徑：`docs/projects/vocium/SUMMARY.md`

## §1 專案定位

Vocium 是 VoxKey 的 MCP 化重作版本。架構：Tauri 2 殼（Rust，薄，MCP client）spawn Node sidecar（TypeScript ESM，MCP server），核心邏輯（state-machine / config / stt / inject）為純 TS 模組，DI 可單測。設計紅線：同核心同協定多消費者，未來 BrainMesh 為另一 MCP client。

## §2 技術棧

| 層 | 技術 |
|----|------|
| 殼層 | Tauri 2（Rust） |
| 前端 | HTML/CSS/JS（webview） |
| Sidecar | Node 20+ / TypeScript ESM |
| MCP | `@modelcontextprotocol/sdk`（stdio transport） |
| STT | Groq Whisper REST（`whisper-large-v3-turbo`） |
| 測試 | Vitest |

## §3 MVP 完成（2026-05-16）

以 `superpowers:subagent-driven-development` 一日完成 Tasks 1–9。核心：狀態機 / config / STT adapter（Groq + Mock）/ Injector（Windows 實作 + mac/Linux NotImplemented stub）/ MCP server 8 工具 + `state_changed` notification。`vitest 36/36`、`cargo check 0/0`、sidecar headless smoke 通過。

## §4 卡頓修復（2026-05-17）

根因：所有 Tauri command 為同步 `fn` 阻塞主執行緒。修復：全改 `async fn` + `spawn_blocking`；orb 點擊改樂觀進 listening；Windows Injector 改常駐 PowerShell host（冷啟動 4.6s → ~ms）。診斷日誌寫入 `%APPDATA%/vocium/logs/`。`vitest 39/39`。

## §5 控制鈕 + 設定視窗（2026-05-17）

- `config.dragLocked` + `Injector.warmup`（best-effort queue）
- ICON 重塑：單行 pill / 放大 orb36 / SVG sprite 控制鈕 hover（鎖定→縮小→關閉）
- Rust 命令：`quit_app` / `save_drag_locked` / `set_hotkey` / `shutdown_sidecar` / `patch_config` / `get_config` / Tray「設定…」
- Settings 視窗：快捷鍵錄製器（conflict 回退 + focus/dismiss 重置）；存檔即時生效
- `vitest 45/45`、`cargo check 0/0`。實機驗證 UI OK。

## §6 App ICON 定案（2026-05-17）

方案 B+（聲波 V + AI sparkle，teal→inject-violet 漸層）。母版 `app-tauri/src-tauri/icons/icon.svg`；`npm run icons` 由 SVG 產所有尺寸 PNG + `.ico`。兩個實機 UI 修正：Tray 殘舊圖（`include_bytes!` + `image-png` feature）、pill 陰影被矩形切（貼邊小陰影 + 視窗高 96→112）。

## §7 GitHub 推送 + Groq wiring 驗證（2026-05-17）

- 私有 repo `github.com/Hereisaa/vocium`（僅 `projects/vocium` 範圍，`docs/superpowers/` 與 `docs/logs/` git-ignored）。
- 雙語 README（EN + 繁中）。`HEAD=7e445c2`，使用者自錄 `docs/assets/showcase.gif` 為 banner。
- 探針 `scripts/probe-groq.mjs`（`npm run probe:groq`）：`✓ Groq OK in 421ms`，wiring 全鏈路驗證通過。
- 已知：Whisper 中文預設輸出簡體（非 bug；繁簡轉換已於 §10 完成）。

## §8 API Key 欄位 + 無金鑰引導 + 錯誤注入（2026-05-17）

功能：

- **Settings API Key 欄位**：遮罩輸入 + 顯示/隱藏切換 + 清除金鑰；載入顯示 `groqKeySet:bool`（不回顯原始金鑰）；留空＝不變更。
- **無金鑰引導注入**：`sttProvider==='groq'` 且金鑰為空時，pipeline 走正常流（listening→transcribing→injected，無錯誤動畫），注入固定引導訊息 `（尚未設定 API Key，請開啟 Vocium 設定填入 Groq API Key）`；取代原本的 Mock 假文字回退。
- **`describeSttError(e)`**：total 純函式，將 STT 例外分為五類（API Key 無效 / 頻率限制 / 網路異常 / 逾時 / 其他），由 pipeline 注入後播錯誤動畫，不 rethrow。
- **Mock 降為僅測試用**：`sttProvider==='mock'` 或 `opts.sttText` 注入才走 `MockSttAdapter`。
- **`set_groq_key` Tauri 命令**：`patch_config` → 重啟 sidecar → 更新 Tray「STT」標籤；重啟失敗回 `Err`（Settings 顯示錯誤，清空 client 避免 30s 卡住）。
- **`get_config` 新增 `groqKeySet:bool`**：從 config `groqApiKey` 去空白後非空推導，不回傳原始金鑰。

測試：`vitest 59/59`（新增 `describe-error.test.ts` 分類純單元 + pipeline noKey/error/success 路徑測試）。

已知後續（技術債）：`stt_provider` 推導邏輯在 `read_config` / `get_config` / `set_groq_key` 三處重複，且 `is_empty()` 與 `trim().is_empty()` 空白行為微不一致；待抽 `derive_provider()` 共用（見 ROADMAP §技術債）。

## §9 下一階段規劃（Settings 三大功能，2026-05-17 定）

API Key 功能已合入 `main`（`origin/main`=`4fbc44b`），階段性完成。使用者指定下一階段三大功能，**皆做在 Settings 視窗內**，B/C 同屬轉錄後處理鏈；既定 pipeline 順序 **STT → 繁簡轉換 → AI 潤稿 → 注入**（後修正為 STT → AI 潤稿 → 繁簡轉換 → 注入，見 §13 修正區段）（各步可選、可關），皆不動狀態機/MCP/sidecar/Injector。詳見 `docs/ROADMAP.md`「下一階段 — Settings 三大功能」、`docs/SPEC.md` §1.3。

- **A. 中文輸出（繁／簡）**：✅ 已完成 — 二段式繁體（台灣）/簡體雙向強制，詳見 §10。個人自用必要（[[feedback-personal-use-first]]）。
- **B. 多家雲端 + 本地 AI STT 串接**：Settings「STT 來源」provider 選擇。雲端 Groq/OpenAI/Gemini（Claude 無 STT）；本地 whisper.cpp/faster-whisper/LocalAI/Ollama。`SttAdapter` 已隔離，新增為侷限變更。
- **C. AI 潤稿**：轉錄後可選 LLM 潤飾（清贅詞/標點/通順，不改原意）；Settings 開關+供應商/模型/風格；可用任何 LLM（含 Claude）；預設關閉。取代原 ROADMAP「轉錄後處理：標點/贅詞」並 AI 化。

## §10 中文輸出 繁／簡 雙向（2026-05-17）

Settings 二段式「中文輸出（中文字繁／簡）」＝繁體（台灣）/ 簡體（config `zhConvert:'twp'|'cn'`，預設 `twp`）。因 Groq 中文時繁時簡，改為**雙向強制**：`opencc-js` `cn→twp`（→繁台）與 `twp→cn`（→簡），已是目標字體則 passthrough；純本地離線零 API。純模組 `src/core/zh-convert.ts` `convertZh(text,mode)` 雙 lazy 轉換器、total、失敗回原文。pipeline `getZhMode` 在 STT 後注入前套 submitAudio＋transcribeClip（不轉 GUIDANCE_MSG/錯誤；transcribeClip spread 保 durationMs）。方案 A：sidecar 只讀 `readZhMode` 每轉錄重讀（不重啟）。Settings 改由「儲存並套用」按鈕套用（不再 onChange 即存），按鈕加 press+成功脈動動畫；移除快捷鍵/中文輸出提示語（錯誤顯示保留）；二段式 radiogroup 鍵盤可達。Rust `save_zh_mode`（驗 twp/cn，patch_config，不重啟）+ get_config 回 `zhConvert`。測試：zh-convert(7)+config/pipeline 改寫；vitest 79 全綠、cargo 0/0。

## §11 競品分析 + 下一版設計定案（2026-05-18）

研究開源 Handy（cjpais/Handy，21.9k★，全本地 Whisper/Parakeet + Silero VAD）→ `docs/superpowers/COMPETITIVE-Handy.md`（不入版控）。定位裁定：Vocium 以「繁中（台灣）優先 + MCP 原生」利基，不走 Handy 競品路線；借鑑其 PTT / VAD 兩項成熟 UX。

以 `superpowers:brainstorming`（含視覺輔助）完成下一版設計定案，權威設計檔：`docs/superpowers/specs/2026-05-18-vocium-multi-stt-ptt-vad-design.md`（內部 design-of-record，依 `.gitignore` 不入版控）。**範圍**：① 多家雲端 STT（新增 OpenAI/Gemini）② STT 來源切換 UI（下拉＝方案 A，含本地 stub）③ 輸入模式 toggle/PTT ④ 靜音修剪 VAD 開關。**6 項決策**：D1 每家獨立持久化（扁平具名欄位，保留 `groqApiKey` 向後相容）／D2 ICON 恆 toggle，`inputMode` 只影響快捷鍵／D3 VAD 只做靜音修剪（webview，不動狀態機）／D4 本地 stub 不改 active、`sttProvider` 不持久化 `'local'`／D5 Settings 方案 A 下拉／D6 VAD 預設關、Gemini 預設 `gemini-1.5-flash`。`describeSttError`/noKey 路徑一般化沿用；Rust `set_groq_key`→`set_provider_key`/`set_stt_provider`、`get_config` 多 provider 遮罩、Tray 標籤一般化；順手抽 `derive_active` 還技術債（§8 記載之三處重複）。SPEC §1.3 / ROADMAP §B,B2,B3 / 本檔已對齊。

續（同日，視覺定案 + 文件治理）：經視覺輔助 companion 多輪迭代（初版 AI-slop 配色被打槍 → 改嚴格沿用 `app-tauri/ui/styles.css` 真 token、零漸層/glow/sparkle/Inter/裝飾 badge）。再增兩決策：**D7** 模型欄＝下拉精選清單（`src/core/stt/models.ts` 單一常數，發版/PR 維護，零 runtime fetch；理由：各家 /models 無可靠 STT 旗標、需金鑰、增失敗面）＋「自訂…」逃生口（清單落後不卡人）；**D8** Settings IA＝三分頁（一般／語音轉文字／AI 潤稿，分頁器重用 `.seg`，AI 潤稿本版 stub 先預留 IA）。`docs/DESIGN_MOCKUP.html §6` 已重整為 **rev5**（8 張卡涵蓋三分頁全狀態，沿用既有 class＋新增 `.selfield`/`.s-hint`/`.soon`，div 290/290 平衡）。`COMPETITIVE-Handy.md` 已移至 `docs/superpowers/`（gitignored，`git check-ignore` 確認不入版控），全引用路徑已更新。設計檔 §2 表 D1–D8、§6.0/6.1/6.2 齊備。文件全程未 commit（依 [[feedback-git-commits]]）。下一步＝使用者審 spec → `superpowers:writing-plans`。

## §12 多雲端 STT + PTT + VAD 實作收官（2026-05-18）

以 `superpowers:subagent-driven-development`（7 task + 多輪 UI 精修 + probe 工具）完成設計定案 D1–D8 對應的全部實作。

### 交付範圍

| 分類 | 內容 |
|------|------|
| **多雲端 STT** | `OpenAiSttAdapter`（含 `openaiBaseUrl` 自訂端點）、`GeminiSttAdapter`；`resolveActive(cfg)` 單一出口工廠；`describeSttError`/noKey 路徑泛化至三家 |
| **精選模型清單** | `src/core/stt/models.ts` — 單一常數來源（D7）；webview `settings.js` `STT_MODELS` 為刻意鏡像副本（兩處同步維護；詳見 `CONTRIBUTING.md`）；無 runtime fetch |
| **Config** | 新增 `openaiApiKey/openaiModel/openaiBaseUrl`、`geminiApiKey/geminiModel`、`inputMode:'toggle'|'ptt'`、`vadTrim:bool`；`sttProvider:'local'`/未知值防禦正規化（不持久化） |
| **Rust 殼** | 抽 `derive_active(dir)→(provider,keySet)` + `mask_key(key)` helper（消除三處重複、統一 `trim().is_empty()`；D1 技術債還清）；新增命令 `set_provider_key` / `set_stt_provider` / `clear_provider_key` / `save_input_mode` / `save_vad_trim`；`get_config` 回傳 `providers:{groq,openai,gemini:{keySet,mask,model[,baseUrl]}}` + 頂層 `activeProvider/inputMode/vadTrim/sttProvider`（保留 `groqKeySet/groqKeyMask` 向後相容）；`set_groq_key` 保留（向後相容） |
| **PTT 模式** | Rust global-shortcut 同時處理 `Pressed/Released`；toggle=按下觸發、ptt=按住開始/放開停止；ICON 恆 toggle（D2）；`save_input_mode` 即時生效不重啟 sidecar（FR-TRG-4） |
| **VAD 靜音修剪** | `@ricky0123/vad-web` NonRealTimeVAD；webview `submit_audio` 前修剪；best-effort（任何失敗→原始 blob）；assets vendored `app-tauri/ui/vad/`（gitignored，`npm run vad:assets`）（FR-AUD-5） |
| **Settings UI** | 三分頁 IA（一般／語音轉文字／AI 潤稿）重用 `.s-tabs/.s-tab`；語音轉文字分頁含 STT 來源下拉、各家遮罩金鑰欄、模型下拉＋「自訂…」、OpenAI Base URL、本地 stub 提示；AI 潤稿分頁＝「即將推出」stub；Settings 視窗 420×560 |

### 設計決策 D1–D8 對照

| 決策 | 內容 | 狀態 |
|------|------|------|
| D1 | 每家獨立持久化，扁平具名欄位，`groqApiKey` 向後相容 | ✅ 實作 |
| D2 | ICON 恆 toggle，`inputMode` 只影響快捷鍵 | ✅ 實作 |
| D3 | VAD 只做靜音修剪（webview），不動狀態機 | ✅ 實作 |
| D4 | 本地 stub 下拉可見，`sttProvider` 永不持久化 `'local'` | ✅ 實作 |
| D5 | Settings 方案 A 下拉切換 provider | ✅ 實作 |
| D6 | VAD 預設關（opt-in）；Gemini 預設 `gemini-1.5-flash` | ✅ 實作 |
| D7 | 精選模型清單（`models.ts` 單一常數）＋「自訂…」逃生口；無 runtime fetch | ✅ 實作 |
| D8 | Settings IA 三分頁；AI 潤稿分頁 stub 預留 | ✅ 實作 |

### 關鍵模組

- `src/core/stt/models.ts` — 精選模型清單常數（D7 唯一來源）
- `src/core/stt/stt-adapter.ts` — `createSttAdapter` 工廠 + `resolveActive(cfg)`
- `src/core/stt/openai-stt.ts` — OpenAiSttAdapter
- `src/core/stt/gemini-stt.ts` — GeminiSttAdapter
- `app-tauri/src-tauri/src/lib.rs` — `derive_active` / `mask_key` / 新 Tauri 命令 / PTT shortcut
- `app-tauri/ui/settings.js` — 三分頁 Settings UI + `STT_MODELS` 鏡像
- `src/core/audio/trim-silence.ts` — VAD 修剪純模組

### 驗收閘門

- **vitest 106/106 passed**（含 openai-stt / gemini-stt / vad-trim / resolve-active / save_input_mode / save_vad_trim 新增測試）
- **tsc clean**（0 errors）
- **cargo 0 errors / 0 warnings**

### 最終整體審查（opus，2026-05-18）

以 `superpowers:subagent-driven-development` 全 17 task 完成（每 task implementer→spec審→品質審→修→re-review）。最終整體審查結論 **READY TO INTEGRATE**，零 Critical/零 Important。四項高風險交叉關切明確 **PASS**：

- **resolveActive ↔ derive_active 對等**：PASS — groq/openai/gemini/mock × 金鑰/空鑰、'local'/未知 全部兩端收斂一致（TS 先 normalize、Rust unknown→groq、'mock' 兩端一致特判）。
- **VAD best-effort fallback**：PASS — `trimBlobSilence` 全程 try/catch→原始 blob；no-speech / <2% trimmed / get_config 失敗 皆回原始；off 路徑 byte-identical。
- **向後相容**：PASS — 舊 config 僅 `groqApiKey` → `{...DEFAULTS}` 合併 + `normalizeProvider`；`get_config` 保留 `groqKeySet/groqKeyMask`；`set_groq_key` 保留並註冊；既有 Groq 行為零變更。
- **安全 / 金鑰不落 log**：PASS — 全 diff grep 僅 `[set_groq_key] applied; provider now {provider}`（記 provider 名非金鑰）；金鑰僅以 `mask_key` 遮罩回傳 webview，原始金鑰永不過 IPC；config 檔與 *.log gitignored。

Minor follow-up（不阻整合）：①get_config 同檔多次 read_to_string（perf-only，非熱路徑可接受）②`hotkey_ok` 欄位 boot 後未讀（pre-existing）。已順手修正：orb 點擊恆 toggle 之 D2/FR-TRG-4 程式註解、trim-silence「mirror」誤導註解更正、移除確實無引用之 VAD_FRAME_MS/VAD_PAD_FRAMES 死常數。

### 遺留人工驗證（待實機，`npm run dev`）

1. **舊 config 遷移**：既有僅含 `groqApiKey` 的 `%APPDATA%/vocium/vocium-config.json` 啟動 → Groq 聽寫不變、Settings 顯 Groq 遮罩、不崩。
2. **各家真實金鑰**：Groq / OpenAI / Gemini 各貼真鑰選模型存檔→說話→該家轉錄正確；切走再切回金鑰仍持久（遮罩仍在）且生效。
3. **自訂模型逃生口**：選「自訂…」輸入任意 id（先無效驗錯誤浮現，再有效）。
4. **OpenAI Base URL**：自訂 base url 僅 OpenAI 顯示且持久。
5. **清除金鑰**：兩段式「✕ 清除金鑰」→ 清除後該家若為 active 下次聽寫走引導訊息。
6. **'local' 選取**：選本地存檔→暫態「尚未推出」、下拉資訊性停 local、**active provider/config 不變**（重開 Settings 仍為真實 provider）。
7. **Toggle vs PTT（快捷鍵）**：輸入模式=按住說→按住才聽、放開轉錄；=切換→按一下開再按一下停；確認鍵 auto-repeat 不重複觸發。
8. **PTT 模式下 orb 點擊**：確認 orb 仍 click-start/click-stop（預期，D2）。
9. **VAD 可聞效果**：錄含長前後靜音片段，VAD=關 全段轉、VAD=開 靜音被剪；再故意弄壞（暫改名 `app-tauri/ui/vad/silero_vad_legacy.onnx`）確認聽寫**仍以原音訊正常運作**。
10. **快捷鍵錄製**：Settings 內錄新組合，確認錄製時全域鍵暫停、結束後恢復；錄製中關 Settings 不軟鎖。
11. **設定持久化**：改 inputMode/VAD/zh 存檔關閉，由 tray 重開全反映；切 provider 後 tray「STT：…」更新。
12. **sidecar 重啟韌性**：用壞金鑰切 provider，確認 Settings 優雅報錯且下次聽寫不 30s 卡（fast-fail）。

### 收尾 UI 微調 + 文件治理（2026-05-18，合併前）

實作後依使用者回饋做的純視覺收尾（不動功能/狀態機/MCP；SPEC FR 不變，僅 `styles.css`/`settings.html`/`DESIGN_MOCKUP.html`）：

- **分頁改底線頁籤**：`.s-tabs/.s-tab` 由填色 pill 改為 shadcn 風底線頁籤（透明、active 前景字＋低飽和 teal `#6f9c95` 2px 底線），與下方開關明確區隔。
- **開關改溫柔 ToggleGroup**：`.seg-opt.active` 由飽和 `--accent` 實心改為中性抬升 `#2a3340`＋前景字＋細 inset 邊（Tailwind slate 階、低飽和）。
- **金鑰欄**：移除 `.hkrow` 並排 → `.keywrap` 全寬（與 STT 來源/模型下拉同寬）；`#keyClear` 移至欄位右下角、字縮小（11px）；`settings.js` 未動（id 保留、兩段式清除行為不變）。
- **`#provFields` 加 14px 間距**：修「模型 緊貼 Groq API Key」。
- **DESIGN_MOCKUP**：移除 §6c 決策對照區；清除全檔開發/除錯用語（rev/決策代號/FR/程式碼識別字/build 術語），轉為對外乾淨設計展示。
- **合併前安全掃描 PASS**：tracked/staged 全樹零真實 API 金鑰（僅 placeholder/教學字）；`vocium-config.json`/`.env`/`*.log`/`docs/superpowers/`/`.superpowers/`/`app-tauri/ui/vad/` 等均 gitignored。

閘維持：vitest 106/106、tsc clean、cargo 0/0、node --check 雙 JS 有效。

### 下一階段

- § C AI 潤稿（Settings「AI 潤稿」分頁 stub 已預留 IA）
- 本地 STT 實際實作（whisper.cpp / faster-whisper / LocalAI / Ollama）

## §13 AI 潤稿 §C 實作收官（2026-05-19）

以 `superpowers:subagent-driven-development`（13 task TDD）完成設計定案 E1–E8 對應的全部實作，合入 `feat/ai-polish`。

### 功能範圍

轉錄後可選 LLM 潤飾（清贅詞／補標點／通順，不改原意）。GUI auto-path（Settings AI 潤稿分頁）+ `polish_text` MCP tool 雙入口；預設關閉；任何失敗／無金鑰→原文直接注入，聽寫永不被阻斷。

### 決策 E1–E8

| 決策 | 內容 | 狀態 |
|------|------|------|
| E1 | 獨立潤稿金鑰槽（`polishProvider/polishApiKey/polishModel`）＋同來源沿用 STT 金鑰邏輯＋覆寫欄＋Claude 需自有金鑰 | ✅ 實作 |
| E2 | 潤稿只套 `submitAudio`，永不套 `transcribe_clip`（MCP 轉錄工具不動） | ✅ 實作 |
| E3 | 雲端 Groq/OpenAI/Gemini/Claude 實作；本地 stub（顯示用，不持久化 `polishProvider='local'`） | ✅ 實作 |
| E4 | 風格：`light`（輕度）/ `full`（完整）/ `custom`（自訂 prompt）；custom 顯 textarea | ✅ 實作 |
| E5 | `readPolishConfig` live-read closure（鏡像 `save_vad_trim`），sidecar 不重啟即生效 | ✅ 實作 |
| E6 | 預設 `polishEnabled:false`；任何失敗／無金鑰→原文，靜默不報錯，聽寫不中斷 | ✅ 實作 |
| E7 | Pipeline 順序：STT → 繁簡轉換 → AI 潤稿 → 注入 | ✅ 實作 |
| E8 | `polish_text` MCP tool：`style` override 可繞過 GUI 開關；`transcribe_clip` 不動；total | ✅ 實作 |

### 架構摘要

- `src/core/polish/polish.ts` — pure total `polishText(text, cfg, provider)` 函式（鏡像 `convertZh` 合約）
- `src/core/polish/prompts.ts` — 三風格 system prompt 常數
- `src/sidecar/index.ts` — `readPolishConfig` live-read closure（不重啟 sidecar）
- `src/sidecar/pipeline.ts` — `submitAudio` STT→潤稿→繁簡→注入
- `src/sidecar/mcp-tools.ts` — `polish_text` MCP tool（E8）
- `app-tauri/src-tauri/src/lib.rs` — `save_polish` / `clear_polish_key` Tauri 命令（不重啟）
- `app-tauri/ui/settings.html` + `settings.js` — Settings「AI 潤稿」第三分頁

### 驗收閘門（自動化，2026-05-19）

| 項目 | 結果 |
|------|------|
| `npm run build`（tsc） | ✅ clean（0 errors） |
| `npx vitest run` | ✅ **15 test files / 137 tests passed** |
| `cargo check` | ✅ `Finished \`dev\` profile [unoptimized + debuginfo] target(s) in 1.94s`（0 errors / 0 warnings） |
| `node --check settings.js` | ✅ 語法有效（exit 0） |
| settings.html div 平衡 | ✅ 56 opening / 56 closing（OK） |
| `tauri.conf.json` 合法 JSON | ✅ ok |

> 此為 §C 合入當下快照；fix/polish-zh-order 修正後閘門見下方「Pipeline 順序修正」區段（vitest 146/146）。

### 待實機驗收（需真實 LLM 金鑰 + 麥克風 + Windows）

1. Settings →「AI 潤稿」分頁正常渲染（啟用 / 來源 / 金鑰 / 模型 / 風格）；切換來源載入遮罩金鑰；與 STT 同來源時顯示「沿用…」placeholder；Claude 需自有金鑰。
2. 風格＝自訂 顯示 prompt textarea；來源＝本地 顯示 stub 且不寫入（`vocium-config.json` 的 `polishProvider` 永不為 `local`）。
3. 啟用 + Groq（沿用 Groq STT 金鑰）+ 說話 → 注入文字已潤飾（去贅詞／補標點）。關閉 → 原文（僅繁簡）。壞金鑰／斷網 → 仍注入原文（繁簡後），無錯誤動畫，聽寫不中斷。
4. MCP：透過 MCP host 呼叫 `polish_text({text})` 用本機設定回傳潤飾文字；無潤稿金鑰時回傳原文不變；`transcribe_clip` 仍回原文；GUI 啟用開關關閉時 `polish_text` 仍可運作。
5. 設定重開後保留；潤稿設定變更無需重啟 sidecar（改風格，下一句即生效）。

> 備注：本地 LLM 潤稿（whisper.cpp / Ollama-style on-device）仍為 deferred，非 §C 範圍（§C 僅雲端 + 本地 stub）。

### Pipeline 順序修正（2026-05-19，fix/polish-zh-order）

**修正**：`submitAudio` pipeline 的執行順序由原本的 `STT → 繁簡轉換 → AI 潤稿 → 注入`（E7 原案）更正為 **`STT → AI 潤稿 → 繁簡轉換 → 注入`**。

**原因**：潤稿 LLM 會輸出 Simplified（簡體）文字，若繁簡轉換在潤稿之前，使用者設定繁體（twp）時轉換結果會被 LLM 覆寫為簡體，導致繁體設定失效。將繁簡轉換移至最後，成為確定性正規化（deterministic final transform），無論潤稿 LLM 輸出何種字體，繁簡設定恆生效。

**防禦縱深**：潤稿 system prompt 新增 zh-script 指令，依 `zhMode` 偏置中文輸出字體（`twp`→繁體 / `cn`→簡體）。此指令僅作用於中文內容，不會將非中文翻譯為中文，與既有「保留原語言」規則疊加（非取代）。`polish_text` MCP 工具：回傳 LLM 原始字體（僅軟偏置），不套 `convertZh`（呼叫端自行決定是否轉換）。

**保留**：Totality（E6）——潤稿失敗 → 直接以 STT 原文繼續，繁簡轉換仍套用，無錯誤狀態，聽寫不中斷。`transcribe_clip` 不套潤稿（E2 不變）。

**閘門結果（fix/polish-zh-order，2026-05-19）**：

| 項目 | 結果 |
|------|------|
| `npm run build`（tsc） | ✅ clean（0 errors） |
| `npx vitest run` | ✅ **15 test files / 146 tests passed** |
| `cargo check` | ✅ `Finished \`dev\` profile [unoptimized + debuginfo] target(s) in 0.37s`（0 errors / 0 warnings） |
| `node --check settings.js` | ✅ 語法有效（exit 0） |
| settings.html div 平衡 | ✅ 56 opening / 56 closing（OK） |
| `tauri.conf.json` 合法 JSON | ✅ ok |

此修正取代了 E7 原案順序。相關文件已同步更新：README.md / README.zh-TW.md / SPEC.md FR-POL-1 / ROADMAP.md §C pipeline 說明。
