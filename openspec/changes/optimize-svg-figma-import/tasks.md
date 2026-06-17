## 1. SVG Normalization Capture

- [x] 1.1 實作 `Normalize Inline SVG Markup During Capture`，讓 `Inline SVG markup is normalized for Figma vector import` 在 Chrome capture 時把 `var(...)`、`currentColor`、class-based/inline SVG presentation values 解析成 concrete SVG attributes；以 `apps/chrome-extension/test/capture-core.test.mjs` 新增 `content capture normalizes inline SVG presentation styles for Figma import` 驗證 `attributes.svgMarkup` 不保留原始 CSS variable fill。
- [x] 1.2 實作 `Inline Only Figma-Relevant Presentation Values` 的 gradient 細節，讓 `Inline SVG markup is normalized for Figma vector import` 保留 `linearGradient` / `radialGradient` ids 與 `url(#...)` references，並把 `stop-color` / `stop-opacity` 寫成 resolved values；以 `apps/chrome-extension/test/capture-core.test.mjs` 新增 `content capture preserves SVG gradient stops while normalizing presentation styles` 驗證。
- [x] 1.3 實作 `Preserve SVG Structure And Fall Back Gracefully`，讓 SVG clone、computed style 或 serialization 不可用時仍回傳 raw `outerHTML` 並持續 packaging；以 `apps/chrome-extension/test/capture-core.test.mjs` 新增 `content capture falls back to raw inline SVG markup when normalization cannot serialize` 驗證。

## 2. Verification

- [x] 2.1 驗證 `Inline SVG markup is normalized for Figma vector import` 的完整 contract：`corepack pnpm build`、`corepack pnpm test`、`spectra analyze optimize-svg-figma-import --json`、`spectra validate optimize-svg-figma-import` 皆通過，並確認新增測試覆蓋 CSS variable fill、gradient stops、fallback 三種情境。

## 3. Complex SVG Vector Packaging

- [x] 3.1 實作 `Prefer Vector Assets For Normalized Complex SVG Charts`，讓 `Inline SVG markup is normalized for Figma vector import` 對已正規化、無高風險 feature 的 complex inline SVG chart 建立 `assets/vector-1.svg` 與 `assetKind: "svg"`，不再建立 `assets/fallback-1.png`；以 `apps/chrome-extension/test/asset-capture.test.mjs` 更新 `asset capture uses screenshot fallback for complex inline svg charts` 為 vector package 驗證，並新增 high-risk SVG fallback 測試保留 `foreignObject` raster fallback。

## 4. Final Verification

- [x] 4.1 驗證更新後的 `Inline SVG markup is normalized for Figma vector import` 完整 contract：`corepack pnpm build`、`corepack pnpm test`、`spectra analyze optimize-svg-figma-import --json`、`spectra validate optimize-svg-figma-import` 皆通過，並確認 asset-capture 測試覆蓋 complex chart vector asset 與 high-risk fallback。
