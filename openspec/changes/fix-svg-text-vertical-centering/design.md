## Context

inline SVG 擷取時，`content-script.ts` 與 `capture-core.ts` 各有一份 `normalizeSvgPresentationNode`，clone SVG 後依 `SVG_PRESENTATION_PROPERTIES` 走訪 descendants，把 computed presentation value 寫回 cloned attributes，最後 packaging 成 `assets/vector-N.svg`，由 Figma plugin 的 `createSvgImageLayer` 透過 `createNodeFromSvg` 建向量。

問題：MUI X gauge 之類的中央數值用 `dominant-baseline="central"` 對齊垂直中心，擷取端正確保留，但 Figma `createNodeFromSvg` 不支援 `dominant-baseline`，改用 alphabetic baseline 擺放 → 文字偏上。先前的 `fix-svg-text-fill-color` 已解決文字變黑；本變更解決上下未置中。

## Goals / Non-Goals

**Goals:**

- 在兩個 capture runtime 對 text-bearing 元素（`text`、`tspan`、`textPath`）把非 alphabetic 的 `dominant-baseline` 換算成 baseline 位移寫回幾何並移除該屬性，使 Figma 以 baseline 擺放時文字幾何中心對齊原 `y`。
- 避免繼承型 tspan 造成重複位移。
- font-size 不可解析或值為 alphabetic/auto 時不動作；normalization 失敗回退原 markup。

**Non-Goals:**

- 不處理 `text-anchor`（水平已正常）。
- 不追求逐像素一致；用 font-size 係數近似。
- 不改 Figma plugin、不 rasterize、不改 schema、不改 fallback 邊界。

## Decisions

### Resolve dominant-baseline into a baseline y offset

新增 helper `resolveSvgTextBaseline(originalNode, cloneNode, computed)`，在 `normalizeSvgPresentationNode` 既有 attribute 迴圈之後呼叫：

1. 僅處理 tagName 為 `text` / `tspan` / `textpath` 的元素。
2. 讀 computed `dominant-baseline`（fallback `alignment-baseline`）。值正規化為小寫。
3. 若值屬於需位移集合，依下表取得 em 係數（正值＝基線往下移）：
   - `central` / `middle` → `0.35`
   - `text-before-edge` / `hanging` → `0.8`
   - `text-after-edge` / `ideographic` → `-0.2`
   其餘（`auto` / `alphabetic` / `baseline` / 空值 / 未知）→ 不動作並保留屬性原樣。
4. 讀 computed `font-size`（px）。無法解析為正數 → 不動作。
5. 位移量 `delta = factor × fontSize`。
6. 套用對象：
   - `text` / `textpath`，或帶自身數值 `y` 屬性的 `tspan`：把 cloned 元素的 `y` 設為 `(原 y 或 0) + delta`。
   - 無自身 `y` 的 `tspan`：不調整位置，只移除屬性（由祖先已位移的基線帶動，避免重複位移）。
7. 移除 cloned 元素的 `dominant-baseline`（及 `alignment-baseline`，若存在）屬性。

### Keep both runtimes in sync and fall back safely

content script 與 capture core 兩份 helper 邏輯一致（係數表、套用規則相同）。任何 clone / computed style / serialization 失敗，沿用既有 catch 回退 raw `outerHTML`，本變更不改該路徑。

## Implementation Contract

**Behavior:**

- `<text y="100" dominant-baseline="central">` 且 computed font-size `45px` → cloned `text` 的 `y` 變為 `115.75`（100 + 0.35×45），且無 `dominant-baseline`。
- 其下無自身 `y` 的 `<tspan dominant-baseline="central">` → 移除 `dominant-baseline`，不新增/變更 `dy` 或 `y`。
- `dominant-baseline="alphabetic"` 或 `auto`、或 font-size 不可解析 → `y` 與屬性皆不變。
- `<text y="50" dominant-baseline="text-before-edge">` font-size `20px` → `y` 變為 `66`（50 + 0.8×20）。

**Interface / data shape:**

- 新增 helper 不改 `attributes.svgMarkup` 的整體格式，只調整 text 元素的 `y` 數值與移除 baseline 屬性。
- 不新增/移除 capture schema 欄位，不新增 IPC。

**Failure modes:**

- font-size 不可解析或 dominant-baseline 非位移值 → 無動作、保留原樣。
- clone / serialization 失敗 → 回退 raw `outerHTML`。

**Acceptance criteria:**

- `corepack pnpm build` 通過。
- `corepack pnpm test` 通過。
- `apps/chrome-extension/test/capture-core.test.mjs` 新增測試證明：central 位移後 `y≈115.75` 且 `dominant-baseline` 被移除；繼承型 tspan 只移除屬性不位移；alphabetic/不可解析時不變。
- 既有 SVG normalization 測試不退化。
- `spectra analyze fix-svg-text-vertical-centering --json` 無 Critical / Warning。
- `spectra validate fix-svg-text-vertical-centering` 通過。

**Scope boundaries:**

- In scope：擷取端 `dominant-baseline` → baseline y 位移（兩 runtime）、繼承型 tspan 去重複、安全 fallback、聚焦測試。
- Out of scope：`text-anchor`、Figma plugin、raster/vector fallback 邊界、capture schema、逐像素對齊。

## Risks / Trade-offs

- [Risk] 係數近似造成 1～2px 誤差。Mitigation：採通用 cap-height 比例，誤差遠小於現況偏移；必要時後續可改用擷取 rect 嚴格計算。
- [Risk] 巢狀 text/tspan 重複位移。Mitigation：只有 baseline 建立元素（text/textPath/帶自身 y 的 tspan）位移，繼承型 tspan 僅去屬性。
- [Risk] 兩 runtime 邏輯漂移。Mitigation：兩份 helper 同步實作，並由既有 runtime parity 測試守護。
