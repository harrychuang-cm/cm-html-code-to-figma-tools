## 1. Inline SVG presentation 屬性擴充

> 對應 requirement `Inline SVG presentation attributes cover fill and stroke rendering hints`；落實 design decision `Extend SVG_PRESENTATION_PROPERTIES`。

- [x] 1.1 在 `apps/chrome-extension/src/content-script.ts` 的 `SVG_PRESENTATION_PROPERTIES` 新增 `fill-rule`、`clip-rule`、`paint-order`、`vector-effect`、`mix-blend-mode`（各帶正確 `defaultValue`：fill-rule/clip-rule=`nonzero`、paint-order=`normal`、vector-effect=`none`、mix-blend-mode=`normal`），沿用既有 `shouldWriteSvgPresentationAttribute` 寫入判斷，實現 requirement `Inline SVG presentation attributes cover fill and stroke rendering hints`。完成標準：帶 class 設定 `fill-rule: evenodd` 的 path 在 `attributes.svgMarkup` 序列化出 `fill-rule="evenodd"`，computed 為預設值時不寫入。
- [x] 1.2 在 `apps/chrome-extension/src/capture-core.ts` 的對應 `SVG_PRESENTATION_PROPERTIES` 同步新增相同五筆，維持兩 runtime parity。完成標準：capture core runtime 對相同 SVG 產生與 content script 一致的 normalized attributes。
- [x] 1.3 在 `apps/chrome-extension/test/capture-core.test.mjs` 新增測試 `content capture normalizes svg fill-rule and rendering hints`，以 deterministic mocked computed style 驗證 `fill-rule` / `vector-effect` / `mix-blend-mode` / `paint-order` 在非預設時序列化為 concrete attributes、預設值不寫入。完成標準：`corepack pnpm test` 中此測試通過。

## 2. 驗證

> 同時確認 design decision `Preserve fallback behavior`：normalization 在 clone、computed style 或 serialization 不可用時回退 raw `outerHTML`，不中斷 capture。

- [x] 2.1 執行完整 contract 驗證：`corepack pnpm build`、`corepack pnpm test`、`spectra analyze refine-svg-figma-fidelity --json`（無 Critical/Warning）、`spectra validate refine-svg-figma-fidelity` 皆通過，並確認 `content capture normalizes svg fill-rule and rendering hints` 測試覆蓋 presentation 屬性序列化與預設值不寫入兩種情境，且既有 SVG normalization 測試（CSS variable fill、gradient stops、raw markup fallback）不退化。
