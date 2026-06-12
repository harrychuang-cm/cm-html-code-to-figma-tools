## Why

目前 V1 baseline 已驗證 capture schema、.figcapture export/import、renderer 與 mocked Figma API，但設計師還不能用真實 Chrome Extension 與 Figma Plugin 完成手動 demo。這個 change 要把已驗證的核心模組接到真實 runtime，讓 current viewport capture 到 Figma frame import 的第一條人工操作路徑可用。

## What Changes

- 將 Chrome Extension popup、background、content script 串起來，讓設計師點擊 capture 後真的對 active tab 執行 DOM capture、visible screenshot capture、preview validation，並在確認後下載單一 .figcapture。
- 將 Figma Plugin UI 與 main code 串起來，讓設計師選取 .figcapture 後完成 validation、import report、以及真實 Figma frame/text/image/shape/fallback node 建立。
- 補上 runtime adapter 層，隔離 Chrome APIs、DOM APIs、Figma Plugin APIs 與現有 pure core modules，保留現有 unit/e2e tests 的 deterministic mock path。
- 補上手動測試流程文件，涵蓋 Chrome load unpacked extension、Figma load plugin manifest、dashboard fixture 或本機測試頁、以及成功/失敗驗收條件。
- 補上 runtime smoke tests，驗證 extension message flow、screenshot capture adapter、download adapter、Figma postMessage bridge、Figma API adapter 都使用真實 contract。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- production-ui-import: 增加真實 Chrome Extension runtime 與 Figma Plugin runtime 的可操作匯入要求，讓既有 current viewport to Figma frame 流程可手動驗收。

## Impact

- Affected specs: production-ui-import
- Affected code:
  - New: apps/chrome-extension/src/runtime.ts
  - New: apps/chrome-extension/src/screenshot.ts
  - New: apps/chrome-extension/src/content-script.ts
  - New: apps/chrome-extension/test/runtime-flow.test.mjs
  - New: apps/figma-plugin/src/figma-adapter.ts
  - New: apps/figma-plugin/src/message-bridge.ts
  - New: apps/figma-plugin/test/runtime-import.test.mjs
  - New: docs/manual-runtime-test.md
  - New: fixtures/dashboard/manual-fixture.html
  - Modified: apps/chrome-extension/manifest.json
  - Modified: apps/chrome-extension/src/background.ts
  - Modified: apps/chrome-extension/src/content.ts
  - Modified: apps/chrome-extension/src/popup.ts
  - Modified: apps/chrome-extension/popup.html
  - Modified: apps/figma-plugin/manifest.json
  - Modified: apps/figma-plugin/src/code.ts
  - Modified: apps/figma-plugin/src/ui.ts
  - Modified: apps/figma-plugin/ui.html
  - Modified: scripts/build.mjs
  - Modified: test/e2e-smoke.test.mjs
  - Removed: none
