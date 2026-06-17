## Problem

含有 SVG `<text>` / `<tspan>` 的 inline SVG（例如 MUI X gauge 的數值文字）匯出到 Figma 後，文字顏色變成黑色，即使原始頁面文字是白色或其他顏色。

## Root Cause

capture 正規化只有在元素帶有 `class`、`style` 或顯式 presentation attribute 時才把 computed presentation value 寫進 cloned SVG（`shouldWriteSvgPresentationAttribute` 的 `if (!hasClass && !hasStyle) return false` 守衛）。MUI X gauge 的 `<text>` 與 `<tspan>` 沒有 class/style，因此即使 computed `fill`／`color` 是白色也被跳過，產出的 `vector-N.svg` 的 `<text>` 沒有 `fill` 屬性。SVG 文字未指定 `fill` 時預設為黑色，Figma `createNodeFromSvg` 因此用黑色渲染文字。頁面上看到的白色來自 `color` / `currentColor` / `-webkit-text-fill-color`，這些值 capture 有讀到但沒有轉成 SVG `fill`。

## Proposed Solution

在 capture 正規化階段，對 SVG text-bearing 元素（`text`、`tspan`、`textPath`）一律 inline 明確的 `fill`，繞過 class/style 守衛：

- 優先採用 computed `fill`。
- 當 computed `fill` 缺失、不可用，或等於 SVG 預設黑（`rgb(0, 0, 0)`）而 computed 文字色（`color` / `currentColor` 解析值 / `-webkit-text-fill-color`）為其他可序列化顏色時，改用文字色作為 `fill`。
- 兩個 capture runtime（content script bundle 與 module capture core）同步套用，維持 runtime parity。
- 保留既有 fallback：normalization 失敗時仍回傳原 markup，不中斷 capture。

## Non-Goals

- 不修正 `text-anchor` / `dominant-baseline` 的水平/垂直置中問題；那源自 Figma `createNodeFromSvg` 對 baseline/anchor 的支援限制，屬另一個 scope。
- 不改非 text 元素的既有 `fill` 正規化判斷。
- 不把 SVG rasterize、不改 vector / raster fallback 邊界、不新增 capture schema 欄位。

## Success Criteria

- 一個無 class/style、computed 文字色為白、無 `fill` 屬性的 SVG `<text>`／`<tspan>`，在 capture 後的 `attributes.svgMarkup` 對該 text 元素序列化出 `fill="rgb(255, 255, 255)"`。
- computed `fill` 已是非預設具體色時，沿用該 `fill`，不被文字色覆蓋。
- 既有 SVG normalization 測試（CSS variable fill、gradient stops、raw markup fallback、presentation rendering hints）不退化。
- `corepack pnpm build` 與 `corepack pnpm test` 通過。

## Impact

- Affected specs: `production-ui-import`
- Affected code:
  - Modified:
    - apps/chrome-extension/src/content-script.ts
    - apps/chrome-extension/src/capture-core.ts
    - apps/chrome-extension/test/capture-core.test.mjs
  - New: none
  - Removed: none
