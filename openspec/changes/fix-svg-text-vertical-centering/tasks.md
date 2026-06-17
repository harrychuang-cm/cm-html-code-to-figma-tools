## 1. dominant-baseline 換算為 baseline y

> 對應 requirement `SVG text dominant-baseline resolves to a baseline y offset`；落實 design decision `Resolve dominant-baseline into a baseline y offset`。

- [x] 1.1 在 `apps/chrome-extension/src/content-script.ts` 新增 helper `resolveSvgTextBaseline`，於 `normalizeSvgPresentationNode` 的 attribute 迴圈後呼叫：對 `text`/`tspan`/`textpath` 讀 computed `dominant-baseline`（fallback `alignment-baseline`）與 `font-size`，依係數表（central/middle=0.35、text-before-edge/hanging=0.8、text-after-edge/ideographic=-0.2）算出 `delta = factor × fontSize`，對 baseline 建立元素（text/textpath 或帶自身數值 `y` 的 tspan）把 `y` 設為 `(原 y 或 0)+delta`，繼承型 tspan 只移除屬性，最後移除 `dominant-baseline`/`alignment-baseline`；alphabetic/auto/未知值或 font-size 不可解析時不動作，實現 requirement `SVG text dominant-baseline resolves to a baseline y offset`。完成標準：`<text y="100" dominant-baseline="central">` font-size 45px → `y` 變 `115.75` 且無 `dominant-baseline`。
- [x] 1.2 在 `apps/chrome-extension/src/capture-core.ts` 實作相同的 `resolveSvgTextBaseline` 邏輯（同係數表與套用規則），落實 design decision `Keep both runtimes in sync and fall back safely`：兩 runtime parity 一致，且保留 normalization 失敗回退原 markup。完成標準：capture core runtime 對相同 SVG 產生與 content script 一致的 `y` 與屬性移除結果。
- [x] 1.3 在 `apps/chrome-extension/test/capture-core.test.mjs` 新增測試 `content capture resolves svg dominant-baseline to baseline y`，以 deterministic mocked computed style 覆蓋三情境：(a) central 元素 `y≈115.75` 且 `dominant-baseline` 被移除，(b) 繼承型 tspan 只移除屬性不位移，(c) alphabetic 或 font-size 不可解析時 `y` 不變。完成標準：`corepack pnpm test` 中此測試通過。

## 2. 驗證

> 確認既有 SVG 測試不退化與 fallback 行為。

- [x] 2.1 執行完整驗證：`corepack pnpm build`、`corepack pnpm test`、`spectra analyze fix-svg-text-vertical-centering --json`（無 Critical/Warning）、`spectra validate fix-svg-text-vertical-centering` 皆通過，並確認既有 SVG normalization 測試（CSS variable fill、gradient stops、raw markup fallback、presentation rendering hints、text fill）不退化。
