## Why

V1 只截取可視 viewport,長頁面(landing page、文章頁、電商列表)被裁到一屏高度,設計師必須手動截多次再拼接,「截取任何網站」的目標對最常見的長頁面場景失效。文件已明確把 full-page segmented capture 列為預留的後續能力,capture schema 也保留了擴充空間。

## What Changes

- popup 新增截取模式選擇:預設 visible viewport(行為不變),可切換 full page。
- full page 模式下,background runtime 編排分段截取:先逐段捲動到頁底觸發 lazy loading,回到頁頂後以文件座標一次截取完整 DOM 幾何,再逐段捲動以 captureVisibleTab 收集分段截圖,完成後還原原始捲動位置。
- 分段截圖以 OffscreenCanvas 拼接成單一全頁 screenshot.png;fixed/sticky 元素在第一段之後的截圖中暫時隱藏,避免在拼接圖中重複出現;DOM 端 fixed/sticky 元素因為只在頁頂截取一次,自然只保留一份。
- manifest 新增選填欄位:captureMode(viewport 或 full-page)、documentWidth、documentHeight;schema 驗證接受並檢查這些欄位,未提供時行為等同既有 viewport 模式。
- 超長頁面套用上限(最大文件高度與最大分段數),超過時截到上限並記錄診斷警告。
- Figma plugin(module 與 classic runtime)在 captureMode 為 full-page 時,以 documentWidth/documentHeight 建立兩個完整頁面高度的 frame,screenshot layer 同尺寸。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `production-ui-import`: 新增 full-page 截取模式 — 分段捲動、lazy loading 預捲、全頁 DOM 幾何、拼接截圖、fixed/sticky 去重、文件尺寸 manifest 欄位與全頁 Figma frame 輸出;visible viewport 維持預設且行為不變。

## Impact

- Affected specs: `production-ui-import`
- Affected code:
  - New:
    - `apps/chrome-extension/src/stitch-screenshot.ts`
    - `apps/chrome-extension/test/stitch-screenshot.test.mjs`
  - Modified:
    - `packages/capture-schema/src/index.ts`
    - `apps/chrome-extension/src/capture-core.ts`
    - `apps/chrome-extension/src/content-script.ts`
    - `apps/chrome-extension/src/content.ts`
    - `apps/chrome-extension/src/runtime.ts`
    - `apps/chrome-extension/src/background.ts`
    - `apps/chrome-extension/src/popup.ts`
    - `apps/chrome-extension/popup.html`
    - `apps/chrome-extension/src/capture-package.ts`
    - `apps/figma-plugin/src/renderer.ts`
    - `apps/figma-plugin/src/code-classic.js`
    - `scripts/build.mjs`
    - `packages/capture-schema/test/schema-validation.test.mjs`
    - `apps/chrome-extension/test/capture-core.test.mjs`
    - `apps/chrome-extension/test/runtime-flow.test.mjs`
    - `apps/chrome-extension/test/popup-preview.test.mjs`
    - `apps/figma-plugin/test/three-frames.test.mjs`
    - `apps/figma-plugin/test/plugin-scaffold.test.mjs`
    - `docs/v1-usage-and-acceptance.md`
    - `docs/manual-runtime-test.md`
