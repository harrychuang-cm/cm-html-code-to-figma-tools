## Why

目前 inline SVG 匯出到 Figma 已能 inline computed presentation values 並走 vector import，但 capture 階段沒有 inline 部分影響填色與描邊呈現的 SVG presentation 屬性。這讓依賴 `fill-rule` / `clip-rule` / `paint-order` / `vector-effect` / `mix-blend-mode` 的 production icon、chart 在 Figma 中填色規則、描邊呈現或混合模式不一致。

## What Changes

- Chrome Extension 在正規化 inline SVG 時，將 `fill-rule`、`clip-rule`、`paint-order`、`vector-effect`、`mix-blend-mode` 的 computed style inline 到 cloned SVG attributes，補齊現有 `SVG_PRESENTATION_PROPERTIES` 清單未涵蓋的呈現屬性。
- 正規化僅在 computed value 可序列化且非預設值時寫入，沿用既有 `shouldWriteSvgPresentationAttribute` 判斷與 fallback，不破壞 geometry。
- 兩個 capture runtime（content script bundle 與 module capture core）的清單同步更新，維持 runtime parity。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `production-ui-import`: inline SVG presentation normalization SHALL also inline fill-rule, clip-rule, paint-order, vector-effect, and mix-blend-mode computed values.

## Impact

- Affected specs: `production-ui-import`
- Affected code:
  - Modified:
    - apps/chrome-extension/src/content-script.ts
    - apps/chrome-extension/src/capture-core.ts
    - apps/chrome-extension/test/capture-core.test.mjs
  - New: none
  - Removed: none
