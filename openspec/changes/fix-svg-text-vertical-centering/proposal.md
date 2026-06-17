## Problem

含有 SVG `<text>` / `<tspan>` 的 inline SVG（例如 MUI X gauge 的中央數值）匯出到 Figma 後，文字在垂直方向沒有置中、明顯偏上；水平方向則正常。

## Root Cause

這類文字靠 `dominant-baseline="central"`（或 `middle` 等非 baseline 值）把文字幾何中心對齊到指定的 `y`，擷取端有正確保留此屬性。但 Figma `createNodeFromSvg` 不支援 `dominant-baseline`，會改用預設的 alphabetic baseline，把 `y` 當成基線位置，導致字形落在 `y` 上方、垂直未置中。水平之所以正常，是因為 Figma 有支援 `text-anchor="middle"`。

## Proposed Solution

在擷取正規化階段，對 text-bearing 元素（`text`、`tspan`、`textPath`）讀取 computed `dominant-baseline`，把非 alphabetic 的垂直對齊換算成 baseline 位移後寫回幾何，並移除 `dominant-baseline` 屬性，讓 Figma 用 baseline 擺放時文字幾何中心對齊原本的 `y`：

- 位移量 = 係數 × computed `font-size`（px）。係數依 `dominant-baseline` 值決定：`central` / `middle` ≈ `+0.35`、`text-before-edge` / `hanging` ≈ `+0.8`、`text-after-edge` / `ideographic` ≈ `-0.2`（正值代表基線往下移）。
- baseline 建立元素（`text` / `textPath`，或帶自身數值 `y` 的 `tspan`）：把該 `y` 加上位移量。
- 繼承型 `tspan`（無自身 `y`）：只移除 `dominant-baseline`，由祖先已位移的基線帶動，避免重複位移。
- computed `font-size` 無法解析、或 `dominant-baseline` 為 `auto` / `alphabetic` / 空值時不動作。
- 兩個 capture runtime（content script bundle 與 module capture core）同步，並保留既有 normalization 失敗時回退原 markup 的行為。

## Non-Goals

- 不處理 `text-anchor`（水平已正常）。
- 不追求與瀏覽器逐像素一致；採 font-size 係數近似，容許 1～2px 誤差。
- 不把 SVG rasterize、不改 vector / raster fallback 邊界、不新增 capture schema 欄位。
- 不修改 Figma plugin 端（問題源自 `createNodeFromSvg`，無法在 plugin 端設定向量內文字屬性）。

## Success Criteria

- 一個 `<text y="100" dominant-baseline="central">`、computed font-size `45px` 的元素，擷取後 `svgMarkup` 不再含 `dominant-baseline`，且該 `text` 的 `y` 變為約 `116`（100 + 0.35×45），使 Figma 以 baseline 擺放時文字中心回到約 `y=100`。
- 繼承型 `tspan`（無自身 `y`）擷取後移除 `dominant-baseline` 且不額外位移其 `dy`。
- `dominant-baseline` 為 `alphabetic` / `auto` 或 font-size 不可解析時，`y` 與 markup 不變。
- 既有 SVG normalization 測試（CSS variable fill、gradient stops、raw markup fallback、presentation hints、text fill）不退化。
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
