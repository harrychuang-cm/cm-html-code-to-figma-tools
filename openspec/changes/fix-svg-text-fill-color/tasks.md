## 1. SVG text fill 正規化

> 對應 requirement `SVG text elements always inline an explicit fill`。

- [x] 1.1 在 `apps/chrome-extension/src/content-script.ts` 的 SVG 正規化流程，對 text-bearing 元素（`text`、`tspan`、`textPath`）一律 inline 明確 `fill`，繞過 `shouldWriteSvgPresentationAttribute` 的 class/style 守衛：優先用 computed `fill`，當 computed `fill` 缺失/不可用/等於預設黑 `rgb(0, 0, 0)` 時，改用 computed 文字色（`color` / 解析後 `currentColor` / `-webkit-text-fill-color`）。實現 requirement `SVG text elements always inline an explicit fill`。完成標準：無 class/style、文字色白的 `<text>`/`<tspan>` 在 `attributes.svgMarkup` 序列化出 `fill="rgb(255, 255, 255)"`；computed `fill` 已是非預設具體色時保留不覆蓋。
- [x] 1.2 在 `apps/chrome-extension/src/capture-core.ts` 套用相同的 text fill 正規化邏輯，維持兩 runtime parity。完成標準：capture core runtime 對相同 SVG 產生與 content script 一致的 text `fill`。
- [x] 1.3 在 `apps/chrome-extension/test/capture-core.test.mjs` 新增測試 `content capture inlines svg text fill from computed color`，以 deterministic mocked computed style 覆蓋三情境：(a) class-less 白色文字序列化 `fill="rgb(255, 255, 255)"`，(b) 既有非預設 `fill` 不被覆蓋，(c) 預設黑 `fill` 退回文字色。完成標準：`corepack pnpm test` 中此測試通過。

## 2. 驗證

> 確認 fallback 行為（normalization 失敗回退原 markup）與既有 SVG 測試不退化。

- [x] 2.1 執行完整驗證：`corepack pnpm build`、`corepack pnpm test`、`spectra analyze fix-svg-text-fill-color --json`（無 Critical/Warning）、`spectra validate fix-svg-text-fill-color` 皆通過，並確認既有 SVG normalization 測試（CSS variable fill、gradient stops、raw markup fallback、presentation rendering hints）不退化。
