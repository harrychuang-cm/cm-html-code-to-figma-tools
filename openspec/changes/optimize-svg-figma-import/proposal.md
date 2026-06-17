## Summary

強化 inline SVG 匯出到 Figma 的穩定性，避免 `currentColor`、CSS custom properties、class-based SVG styles 與 gradient stop 顏色在 `createNodeFromSvg` 匯入時遺失或導致 fallback。

## Motivation

目前 inline SVG 會保存原始 `outerHTML` 並優先以 Figma vector 匯入，但原始 markup 可能含有 browser-only CSS 表達式，例如 `var(--theme-color, #4c6ef5)`、`currentColor`、class selector 或 gradient stop styles。這會讓 chart、icon、badge 等 production SVG 在 Figma 中顏色不準，或因 parser 不支援部分 CSS 而降級成 placeholder。

## Proposed Solution

- Chrome Extension 在 capture inline SVG 時產生 Figma-friendly SVG markup，將可從瀏覽器 computed style 取得的 SVG presentation values inline 到 cloned SVG。
- 優先正規化會影響視覺的屬性：`fill`、`stroke`、opacity、stroke metrics、text font presentation，以及 `stop-color` / `stop-opacity` 等 gradient stop 屬性。
- 保留 SVG geometry、`defs`、clipPath、linear/radial gradient 結構與 `url(#gradient)` reference，僅解析顏色與呈現樣式，不把 SVG rasterize。
- 已正規化且可序列化的 complex inline SVG chart 會優先輸出 `vector-*.svg`，不再因為包含文字、多個 shape 或 `role="img"` 就在 capture 階段強制變成 screenshot fallback。
- Figma Plugin 維持現有 SVG vector import 與失敗 fallback；新增的 capture markup 應降低 fallback 機率並提高視覺一致性。

## Non-Goals

- 不把 SVG chart 拆成可編輯資料模型或原生 Figma chart component。
- 不完整實作 CSS cascade engine；只使用瀏覽器已計算出的 computed style。
- 不將所有 SVG 轉成 raster image。
- 不保證所有高風險 SVG feature 都能 vector import；例如 `foreignObject` 或 script-like content 仍保留 raster fallback。
- 不支援 `foreignObject` 內容語意化；若 Figma 無法解析仍走既有 fallback。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `production-ui-import`: inline SVG assets SHALL be normalized for Figma vector import, including CSS variable/currentColor resolution and gradient stop color preservation when browser computed styles are available.

## Impact

- Affected specs: `production-ui-import`
- Affected code:
  - Modified:
    - apps/chrome-extension/src/asset-capture.ts
    - apps/chrome-extension/src/content-script.ts
    - apps/chrome-extension/src/capture-core.ts
    - apps/chrome-extension/test/asset-capture.test.mjs
    - apps/chrome-extension/test/capture-core.test.mjs
  - New: none
  - Removed: none
