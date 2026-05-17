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
- 已知：Whisper 中文預設輸出簡體（非 bug，繁簡轉換列 ROADMAP Phase 3）。

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
