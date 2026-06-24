## Why

Google Material Icons ligature 節點在瀏覽器中以 icon font 渲染，但匯入 Figma 時會被當成普通文字並 fallback 成 Inter，導致 `search`、`add`、`arrow_drop_down` 等 icon 名稱直接顯示在畫面上。這會破壞 Google Calendar 等產品 UI 的 Editable Accurate 視覺還原，也讓設計稿需要大量手動替換 icon。

## What Changes

- Chrome Extension 在 asset packaging 階段辨識 Google Material Icons / Material Symbols ligature 文字節點，將支援的 ligature name 封裝為 SVG asset，而不是保留成普通文字。
- Figma Plugin 既有 SVG asset 匯入流程應將這些 icon font ligature 節點建立為 image/vector layer，而不是 editable text layer。
- Figma Plugin 在匯入舊 `.figcapture` 時，若 capture node 尚未帶有 `assetRole: "icon-font"` 但仍保留 Material icon font family/class 與支援的 ligature 文字，應在 import 端合成 SVG asset 並匯入為 vector layer。
- 不支援或未知的 icon ligature 仍保留普通文字匯入路徑，避免產生錯誤圖示或中斷 import。
- 測試覆蓋 `search`、`add`、`arrow_drop_down` 這類 Google Calendar 實際出現的 icon ligature。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `production-ui-import`: icon font ligature nodes should import as visual SVG/vector assets when their icon family and ligature name are recognized.

## Impact

- Affected specs: production-ui-import
- Affected code:
  - Modified: apps/chrome-extension/src/asset-capture.ts
  - Modified: apps/figma-plugin/src/layout-tree.ts
  - Modified: apps/figma-plugin/src/renderer.ts
  - Modified: apps/figma-plugin/src/code-classic.js
  - Modified: packages/capture-schema/src/index.ts
  - Modified: packages/capture-schema/src/index.d.ts
  - Modified: scripts/build.mjs
  - Modified: apps/chrome-extension/test/asset-capture.test.mjs
  - Modified: apps/figma-plugin/test/layout-tree.test.mjs
  - Modified: apps/figma-plugin/test/runtime-import.test.mjs
  - New: apps/figma-plugin/src/icon-font.ts
  - Removed: (none)
