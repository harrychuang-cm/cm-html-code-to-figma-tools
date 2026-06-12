## 1. Chrome Extension Runtime

- [x] 1.1 在 `apps/chrome-extension/src/screenshot.ts` 建立 visible screenshot adapter 與錯誤分類，成功時回傳 screenshot data URL、失敗時回傳 `screenshot-failed`；以 `apps/chrome-extension/test/runtime-flow.test.mjs` 驗證 success 與 failure 分支。
- [x] 1.2 實作 `Add a Chrome Runtime Adapter Around Existing Capture Core` 並滿足 `Chrome extension runtime captures and previews active tab`：`apps/chrome-extension/src/runtime.ts` 串接 active tab query、content runtime DOM capture、screenshot adapter、pending capture state 與 preview payload；以 runtime-flow tests 驗證 ready preview、URL/viewport metadata、fallback/missing/unsupported counts、`missing-active-tab`。
- [x] 1.3 串接 `apps/chrome-extension/src/background.ts` 與 `apps/chrome-extension/src/content.ts` 的 runtime message contract，讓 background 接收 `CAPTURE_ACTIVE_TAB` 並從 content runtime 取得 `capture.json` compatible payload；以 runtime-flow tests 驗證 message/injection path 與 `capture-script-failed`。
- [x] 1.4 實作 `Keep Capture Confirmation Two-Step` 並滿足 `Chrome extension runtime downloads confirmed package`：popup 在 ready preview 前保持 download disabled，confirm 後 background 從 pending capture 建立單一 `.figcapture` 並呼叫 Chrome downloads API 一次；以 popup/runtime tests 驗證 success、`missing-pending-capture`、`package-generation-failed`、`download-failed`。
- [x] 1.5 更新 `apps/chrome-extension/popup.html` 與 `apps/chrome-extension/src/popup.ts`，讓設計師看到 screenshot preview、source URL、viewport、fallback/missing/unsupported counts、error category，並只能在 ready 狀態下載；以 popup DOM test 或 manual assertion 驗證 ready 前不可下載、ready 後可下載。

## 2. Figma Plugin Runtime

- [x] 2.1 實作 `Add Figma UI-Main Message Bridge` 並滿足 `Figma plugin runtime imports package through UI-main bridge`：`apps/figma-plugin/src/message-bridge.ts`、`apps/figma-plugin/src/ui.ts`、`apps/figma-plugin/src/code.ts` 使用 typed `IMPORT_PACKAGE`、`IMPORT_SUCCESS`、`IMPORT_ERROR` 傳遞 filename、bytes、report、error；以 `apps/figma-plugin/test/runtime-import.test.mjs` 驗證 valid import、invalid package no nodes、file transfer error。
- [x] 2.2 實作 `Add a Figma API Adapter for Real Nodes` 並滿足 `Figma API adapter creates real editable nodes`：`apps/figma-plugin/src/figma-adapter.ts` 將 renderer model 轉成 real 或 mocked Figma frame/text/image/rectangle/fallback/auto-layout nodes，處理 image hash、fills、strokes、effects、locked screenshot、font fallback；以 adapter tests 驗證三個 same-size frames、node properties、font fallback report。
- [x] 2.3 串接 importer、renderer、report 到 Figma plugin main runtime，valid package 產生 `Source Screenshot`、`Editable Accurate`、`Auto Layout Experimental` 與 designer-facing report，invalid package 不建立任何 Figma nodes；以 `runtime-import.test.mjs` 與既有 importer/renderer/report tests 驗證。
- [x] 2.4 更新 `apps/figma-plugin/ui.html` 與 UI 狀態，讓設計師選取一個 `.figcapture` 後看到 import progress、success report、error category/message，不需要檢查 raw JSON；以 UI bridge test 或 DOM-level unit test 驗證文字狀態與 disabled/error states。

## 3. Build, Documentation, And Verification

- [x] 3.1 滿足 `Runtime build artifacts are browser-loadable`：更新 `scripts/build.mjs` 與兩個 manifest，讓 `corepack pnpm build` 產生可載入的 `apps/chrome-extension/dist`、`apps/figma-plugin/dist/manifest.json`、runtime JavaScript，且 dist runtime files 不含 unresolved `.ts` import specifiers；以 build command 與 import scan 驗證。
- [x] 3.2 建立 `docs/manual-runtime-test.md`，落實 `Manual Runtime Demo Is the Acceptance Gate` 並滿足 `Manual runtime demo is documented and repeatable`：文件包含 build、Chrome load unpacked、fixture 或 active page capture、download `.figcapture`、Figma load manifest、import、三個 frames/report 驗收、V1 limitations；以 content review 與手動 checklist 驗證。
- [x] 3.3 更新 `test/e2e-smoke.test.mjs` 走 runtime-facing APIs，驗證 deterministic fixture 可以完成 capture、export、import，並產生三個 frames 與 readable report；以 `corepack pnpm test:e2e` 驗證。
- [x] 3.4 跑完整驗證並修正到全部通過：`corepack pnpm build`、`corepack pnpm test`、`corepack pnpm test:e2e`、`spectra validate wire-real-extension-and-figma-plugin-runtime` 均成功。

## 4. Manual Import Feedback Fixes

- [x] 4.1 根據真實 CMoney package 匯入結果，將 Figma runtime、figma-plan metadata、manual docs、e2e、report tests 從三個預設 frames 改為兩個預設 frames：`Source Screenshot` 與 `Editable Accurate`；Auto Layout candidates 保留在 report 中作為 deferred metadata，不再預設輸出空白 `Auto Layout Experimental` frame。
- [x] 4.2 修正 Figma text import 的固定寬度換行問題：Figma adapter 與 classic runtime 對 text layer 設定 `WIDTH_AND_HEIGHT` auto-size，並套用可用的 font size 與 line-height，避免如 `Instagram` 這類文字在 V1 draft 中被錯誤折行。
