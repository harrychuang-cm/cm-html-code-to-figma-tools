## Why

目前匯入 CMoney 頁面時，許多真實圖片、SVG icon、CSS background/mask icon 只會變成 placeholder 或空 frame。這讓設計師無法判斷 production UI 與 Figma 匯入結果的差異，也降低可編輯設計稿的可信度。

## What Changes

- Chrome Extension 在建立 `.figcapture` 時會嘗試收集真實圖片 bytes，而不是只保存遠端 URL reference。
- Content capture 會保存 inline SVG markup，以及 CSS `background-image`、`mask-image`、`-webkit-mask-image` 來源。
- Asset packaging 會把 data URL、可取得的 image bytes、SVG bytes、CSS icon references 放進 `assets/`，並在抓不到時保留 diagnostics。
- Figma Plugin 匯入 SVG assets 時會優先建立可編輯 vector node；不能建立 vector 時才 fallback 為 image/placeholder。
- Manual runtime 和 module runtime 都要維持一致行為。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `production-ui-import`: capture packages include usable image/SVG/icon assets, and Figma import renders those assets instead of empty placeholders whenever asset data is available.

## Impact

- Affected specs: `production-ui-import`
- Affected code:
  - Modified:
    - `apps/chrome-extension/src/content-script.ts`
    - `apps/chrome-extension/src/asset-capture.ts`
    - `apps/chrome-extension/src/capture-package.ts`
    - `apps/chrome-extension/src/runtime.ts`
    - `apps/chrome-extension/test/asset-capture.test.mjs`
    - `apps/chrome-extension/test/runtime-flow.test.mjs`
    - `apps/chrome-extension/test/export-flow.test.mjs`
    - `apps/figma-plugin/src/figma-adapter.ts`
    - `apps/figma-plugin/src/code-classic.js`
    - `apps/figma-plugin/src/renderer.ts`
    - `apps/figma-plugin/test/runtime-import.test.mjs`
    - `apps/figma-plugin/test/plugin-scaffold.test.mjs`
    - `docs/manual-runtime-test.md`
    - `docs/v1-usage-and-acceptance.md`
  - New:
    - `apps/chrome-extension/test/visual-asset-bytes.test.mjs`
  - Removed:
    - none
