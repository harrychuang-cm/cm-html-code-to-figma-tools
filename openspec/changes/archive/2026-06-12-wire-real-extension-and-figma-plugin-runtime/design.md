## Context

上一個 change 已建立 production-ui-import 的 core baseline：shared .figcapture schema、Chrome-side capture/export pure modules、Figma-side import validation、renderer model、mocked Figma API tests、以及 dashboard e2e smoke。現在缺口不是資料格式或 renderer contract，而是設計師無法在真實 Chrome 與 Figma 中完成手動 demo。

本 change 要把現有 pure modules 接到真實 runtime。Chrome Extension 需要在 active tab 上執行 DOM capture、呼叫 visible tab screenshot API、顯示 preview、並由 downloads API 下載 .figcapture。Figma Plugin 需要讓 UI 選檔，透過 postMessage 把 ArrayBuffer 傳給 main code，main code validate package 並使用 Figma Plugin API 建立真實 nodes。

## Goals / Non-Goals

**Goals:**

- 讓 Chrome load unpacked extension 後，設計師可以在 active tab 按 capture，看到 screenshot preview 與 validation summary，並下載單一 .figcapture。
- 讓 Figma load plugin manifest 後，設計師可以選取 .figcapture，plugin main code 驗證 package 並建立三個真實 Figma frames。
- 將 Chrome APIs、Figma APIs、DOM APIs 與 pure core modules 透過 runtime adapters 隔離，讓既有 unit tests 與 e2e smoke 仍可用 mock path 驗證。
- 補上手動測試文件，讓 reviewer 可以在本機 Chrome/Figma 驗證 demo 路徑。
- 補上 runtime smoke tests，覆蓋 extension message flow、screenshot capture、download、Figma UI-main bridge、Figma node creation adapter。

**Non-Goals:**

- 不新增後端、cloud capture link、帳號、同步或團隊協作。
- 不做 full-page capture、multi-viewport batch capture、responsive preset capture。
- 不做 variables、components、component variants、hover、disabled、pressed state capture。
- 不追求 production-grade Chrome Web Store packaging 或 Figma Community publishing。
- 不解決所有真實網站資源跨域限制；V1 manual runtime 需要把 blocked assets 記錄在 diagnostics。

## Decisions

### Add a Chrome Runtime Adapter Around Existing Capture Core

Chrome runtime adapter 負責 active tab orchestration：query active tab、inject or message content runtime、collect DOM capture、call visible screenshot capture、build preview payload、persist pending capture in extension memory、and call downloads API only after designer confirms export。Pure modules such as capture-core、asset-capture、capture-package remain deterministic and browser-independent where practical。

替代方案是把所有邏輯塞進 popup。這會讓 popup lifecycle 影響 capture state，也會讓 screenshot/download/content-script 權限處理混在 UI code 中。background/runtime adapter 是較清楚的 seam。

### Keep Capture Confirmation Two-Step

Capture 與 download 分成兩個 message：capture request produces preview and diagnostics；confirm export produces .figcapture and downloads it。這符合既有 spec 的 designer-facing validation before export，也讓設計師在下載前知道 fallback、missing assets、unsupported styles。

替代方案是 capture 後直接下載。它較快，但會跳過 preview validation，和已存在 spec 不一致。

### Add Figma UI-Main Message Bridge

Figma Plugin UI 只負責 file input、讀取 ArrayBuffer、顯示 validation/import report；main code 負責 package validation、renderer execution、Figma node creation。UI 與 main 使用 typed postMessage payloads：IMPORT_PACKAGE、IMPORT_SUCCESS、IMPORT_ERROR。

替代方案是在 UI 中完成所有 import planning。Figma node creation 必須在 main context 執行，所以 UI-only import 不可行；把 binary transfer 與 import status 類型化可以避免 silent failure。

### Add a Figma API Adapter for Real Nodes

Figma adapter 將現有 renderer model 對應到 Figma Plugin API：createFrame、createTextLayer、createImageLayer、createRectLayer、createAutoLayoutFrame、appendChild。Adapter 需要處理 image hash、fills/strokes/effects conversion、font loading/fallback、locked screenshot layer、auto layout properties。Mock memory adapter 繼續用於 tests。

替代方案是讓 renderer 直接呼叫 global figma。這會讓 renderer 無法在 Node tests 中驗證，也會把 pure planning 與 side effects 綁死。

### Manual Runtime Demo Is the Acceptance Gate

除了 automated tests，本 change 的完成條件包含 docs/manual-runtime-test.md 中的手動驗收流程：build workspace、load Chrome unpacked extension from dist folder、capture dashboard/local fixture page、download .figcapture、load Figma plugin manifest from dist folder、import package、確認兩個預設 frames 與 report。

替代方案是只用 mocked e2e smoke。Mocked tests 已經存在，但無法證明真實 runtime wiring 可以被設計師操作。

## Implementation Contract

**Scope boundaries:**

- In scope: Chrome Extension runtime orchestration, screenshot adapter, confirmed download, Figma Plugin UI-main bridge, real Figma node adapter, runtime smoke tests, manual test documentation.
- Out of scope: backend, cloud storage, full-page capture, multi-viewport capture, variables, components, variants, interactive states, Chrome Web Store release, Figma Community publishing.

**Chrome runtime behavior:**

- Popup sends CAPTURE_ACTIVE_TAB to background runtime.
- Background runtime queries the active current-window tab and rejects missing tab id with category missing-active-tab.
- Background runtime injects or messages content runtime on the active tab and receives capture.json-compatible DOM capture.
- Background runtime calls visible screenshot capture for the current window and stores screenshot data URL with pending capture state.
- Background runtime returns preview payload to popup with screenshot data URL, diagnostics summary, source URL, viewport size, and package status ready.
- Popup renders preview and enables Download .figcapture only when package status is ready.
- Popup sends CONFIRM_EXPORT after designer confirms.
- Background runtime builds .figcapture from pending capture plus screenshot, calls chrome.downloads.download once, and returns filename/download id.
- Runtime errors surface readable categories: missing-active-tab, capture-script-failed, screenshot-failed, package-generation-failed, download-failed.

**Figma plugin behavior:**

- UI accepts one .figcapture file and reads it as ArrayBuffer.
- UI posts IMPORT_PACKAGE to main code with filename and bytes.
- Main code validates package structure and schemaVersion before creating nodes.
- On invalid package, main code posts IMPORT_ERROR with readable category and message; no Figma nodes are created.
- On valid package, main code creates two same-size default frames using real Figma API adapter.
- Source Screenshot frame contains a locked image layer built from screenshot.png.
- Editable Accurate frame contains real text, image, rectangle/frame, and fallback image nodes derived from renderer models.
- Auto layout candidates remain in the import report as deferred metadata; V1 does not emit a separate Auto Layout Experimental canvas frame by default.
- Main code posts IMPORT_SUCCESS with created frame count, created node count, fallback count, missing asset count, unsupported style count, and auto layout confidence summary.
- UI renders the import report without requiring raw JSON inspection.

**Build/runtime artifact contract:**

- corepack pnpm build produces dist output for apps/chrome-extension and apps/figma-plugin with manifest files and browser/plugin-loadable JavaScript files.
- Chrome manual testing uses apps/chrome-extension/dist as the load unpacked directory.
- Figma manual testing uses apps/figma-plugin/dist/manifest.json as the plugin manifest.
- Build output must not contain unresolved .ts import specifiers in runtime files.

**Acceptance criteria:**

- corepack pnpm build passes.
- corepack pnpm test passes and includes runtime adapter/message bridge tests.
- corepack pnpm test:e2e passes and covers capture/export/import through runtime-facing APIs.
- Manual test documentation contains exact setup, capture, import, expected frames, expected report, and known V1 limitations.
- A reviewer can follow docs/manual-runtime-test.md and complete a local manual demo without modifying source code.

## Risks / Trade-offs

- [Risk] Chrome MV3 extension lifecycles clear in-memory pending capture before confirm export → Mitigation: keep pending capture small, confirm immediately from popup, and surface missing-pending-capture error if state disappears.
- [Risk] chrome.tabs.captureVisibleTab can fail on restricted pages or without sufficient permission → Mitigation: surface screenshot-failed with page URL and keep this out of backend retry logic.
- [Risk] content script asset access differs across websites because of CORS or canvas tainting → Mitigation: preserve missing asset diagnostics and raster fallback reasons rather than silently dropping nodes.
- [Risk] Figma font availability blocks text node creation → Mitigation: add font loader/fallback behavior and report substituted fonts in import report when needed.
- [Risk] Binary transfer between UI and main context fails for large packages → Mitigation: keep V1 visible viewport only, validate file size in UI, and show import-error for transfer failure.
- [Risk] Figma visual conversion differs from renderer mock output → Mitigation: keep renderer model tests and add adapter tests that assert Figma node properties set from model values.

## Migration Plan

No data migration is required. Existing core modules and archived spec remain in place. This change modifies runtime wiring and docs only. Rollback is reverting runtime adapter changes while preserving schema and pure renderer modules from the prior baseline.

## Open Questions

- Whether manual demo uses an included local HTML fixture first or a real logged-in product page first; implementation supports both, but docs can make local fixture the deterministic first path.
- Whether Figma font fallback standardizes on Inter first or uses the first available family from captured styles with a documented fallback.
