# Vocium ROADMAP

> 路線圖。MVP 聚焦「Windows 可用的本機語音輸入殼層 + Groq 真實 STT + 單一 MCP 協定」。跨平台注入、BrainMesh 整合、打包延後。

## Phase 0 — 規劃（DONE, 2026-05-16）

- [x] SPEC.md 定案
- [x] ROADMAP.md
- [x] DESIGN_MOCKUP.html（懸浮 ICON 各狀態視覺）
- [x] 設計定案（`docs/superpowers/specs/`）
- [x] implementation plan（`docs/superpowers/plans/`，TDD bite-sized）

## Phase 1 — 核心 MVP（Terminal Claude Code 開發目標）

### M1 專案骨架
- [ ] `package.json`（TypeScript + Vitest）、`tsconfig.json`、`vitest.config.ts`、`.gitignore`、`README.md`
- [ ] Tauri 2 殼可啟動空懸浮視窗（頂部置中、無邊框、透明、不搶焦點）

### M2 純核心邏輯（TDD）
- [ ] `core/state-machine.ts` + 測試（全狀態轉移、CANCEL、FAIL/RESET、重入忽略）
- [ ] `core/config.ts` + 測試（預設/壞檔回退/合併、groqApiKey 不入版控）
- [ ] `core/stt/groq-stt.ts` + 測試（注入 fetch：multipart 組裝、200 解析、金鑰缺失/4xx/網路錯誤 reject）
- [ ] `core/stt/mock-stt.ts` + `stt-adapter.ts` 工廠 + 測試（預設 groq、金鑰缺回退 mock、failMode）
- [ ] `core/inject/injector.ts` 介面 + `windows.ts` + `macos.ts`/`linux.ts` stub + 測試（工廠選平台、stub 拋 NotImplemented）

### M3 Sidecar / MCP server
- [ ] `sidecar/mcp-tools.ts`：工具表（toggle/start/stop/cancel/submit_audio/transcribe_clip/inject_text/get_state）接 core
- [ ] `sidecar/index.ts`：MCP server bootstrap（stdio）、state→`state_changed` notification
- [ ] MCP 整合測試（in-memory client：呼叫 8 工具 + 驗 notification + headless transcribe/inject）

### M4 懸浮 ICON UI（webview）
- [ ] 移植 DESIGN_MOCKUP 的 pill/orb/bars 與五狀態 keyframes
- [ ] 接收 `state_changed` → 切 `.s-*` class；點擊 ICON → MCP `toggle`；可水平拖曳微調
- [ ] 麥克風錄音（getUserMedia + MediaRecorder）；收 server `request_start/stop_capture` 起停

### M5 Tauri 殼接線
- [ ] spawn Node sidecar，建立 MCP client；relay state 至 webview
- [ ] 全域快捷鍵 `Ctrl+Shift+Space` 註冊/解除、佔用容錯；`Esc` 取消
- [ ] Tray 選單（顯示/隱藏、STT 模式、開啟設定檔、結束）；tooltip 隨狀態
- [ ] Windows 文字注入（PowerShell Set-Clipboard + SendKeys），延遲與失敗回退

### M6 驗證
- [ ] `npm test` 全綠
- [ ] code-reviewer sub-agent 審查並修正
- [ ] 手動驗收清單（SPEC §6）逐項核對；GUI 互動項標「待實機」
- [ ] README 使用說明、`docs/projects/vocium/SUMMARY.md`（依工作區 SOP）

## Phase 2 — 跨平台與 BrainMesh 整合（後續，非本次）

- [ ] `MacInjector` 實作（CGEvent / AppleScript keystroke + 輔助使用權限引導）
- [ ] `LinuxInjector` 實作（X11 xdotool；Wayland 標已知限制）
- [ ] BrainMesh 端：將 Vocium sidecar 註冊為可 spawn 的 MCP 工具，驗證 `transcribe_clip` / `inject_text`
- [ ] STT 串流/分段以降低延遲；音訊改串流傳遞（取代 base64 一次性）
- [ ] Groq 用量/費用估算顯示；STT provider 切換 UI（groq ↔ mock）

## Phase 3 — 體驗強化

- [ ] idle 滑鼠穿透（hover 區域動態切換）
- [ ] 多麥克風選擇、輸入增益
- [ ] 轉錄後處理：標點、口語贅詞清理（可選）
- [ ] 自訂快捷鍵 UI、開機自啟、i18n（中／英）

## Phase 4 — 發佈

- [ ] Node sidecar 二進位封裝（`pkg`/`nexe`），免使用者裝 Node
- [ ] Tauri 打包（Windows MSI/NSIS；mac/Linux 待 Phase 2 注入完成）
- [ ] 自動更新（可選）、簽章與 SmartScreen 處理
- [ ] 個人自用優先，公開發佈為最後階段

## 風險與緩解

| 風險 | 緩解 |
|------|------|
| Windows 文字注入需 native 模組 | 採 PowerShell Set-Clipboard + SendKeys，零 native build；失敗回退手動貼上 |
| always-on-top 視窗搶焦點導致無法貼回原 app | 視窗 non-activating + 注入前延遲 + clipboard 後援 |
| 全域快捷鍵被其他程式佔用 | 註冊失敗容錯 + Tray 提示，可改鍵 |
| Groq 金鑰外洩 | 僅存本機 config，`.gitignore` 排除；缺金鑰自動回退 mock |
| Groq 費用/網路不穩 | 可一鍵切 `mock`；錯誤走 error 狀態不崩潰 |
| sidecar 需 Node runtime | 開發期假設已裝 Node；Phase 4 以 pkg 封裝二進位 |
| Tauri/MCP SDK API 差異 | 鎖定主版本；MCP 以 in-memory client 整合測試把關 |
| Rust toolchain 門檻 | 文件標明前置需求；BrainMesh 開發環境已具 Rust，一致 |
