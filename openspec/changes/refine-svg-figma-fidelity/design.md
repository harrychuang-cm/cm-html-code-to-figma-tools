## Context

inline SVG capture 目前流程：`content-script.ts` 的 `serializeSvgMarkupForFigma` clone SVG，依 `SVG_PRESENTATION_PROPERTIES` 走訪 descendants，用 `getComputedStyle` 取值並寫回 cloned attributes；`capture-core.ts` 內有相同的 capture runtime helper。packaging 把 markup 寫成 `assets/vector-N.svg`，Figma plugin 的 `createSvgImageLayer` 以 `createNodeFromSvg` 建 vector。

既有缺口：`SVG_PRESENTATION_PROPERTIES` 未涵蓋 `fill-rule`、`clip-rule`、`paint-order`、`vector-effect`、`mix-blend-mode`。當這些值來自 class selector 或 CSS（非 inline attribute）時，Figma `createNodeFromSvg` 收不到，導致 even-odd 填色、non-scaling-stroke、混合模式呈現不準。

**CSS transform 已不在本變更範圍（實作期發現）：** 本變更原本也規劃擴充 `createSvgImageLayer` 還原 CSS `transform` 的 scale/shear。實作前確認後撤除，理由：capture 以 `normalizeRect(element.getBoundingClientRect())`（`capture-core.ts`）記錄 rect，而 `getBoundingClientRect` 回傳的是 **transform 套用後**的 bounding box，因此 **scale 已包含在 captured rect 內**，`fittedSvgRect` 由 rect 推得的尺寸已反映 scale（例：intrinsic 10x10、rect 20x20 → fitted 已是 20x20）。若再把 scaleX/scaleY 乘進 fitted 會造成 **scale 二重套用**。rotation 也已由既有 `rotationFromTransform` + `rotatedFittedSvgRect` 處理。唯一真正殘留缺口是 skew/shear，但其經由 `<img>` / CSS background SVG 出現的情境極罕見，且 Figma 端需 `relativeTransform` 表達、複雜度與風險高於效益，故本變更不處理 transform，維持既有行為。

## Goals / Non-Goals

**Goals:**

- 在兩個 capture runtime（content script bundle 與 module capture core）都把 `fill-rule`、`clip-rule`、`paint-order`、`vector-effect`、`mix-blend-mode` 五個 presentation 屬性的 computed value inline 到 cloned SVG。
- 維持既有失敗 fallback：normalization 在 clone / computed style / serialization 不可用時回退 raw markup。

**Non-Goals:**

- 不新增 capture schema 欄位；`attributes.svgMarkup` 維持原樣。
- 不把 SVG rasterize，也不改 vector / raster fallback 的判斷邊界。
- 不改 `createSvgImageLayer` 的 transform 處理（scale 已含於 captured rect、rotation 已處理；skew 罕見且不在本變更範圍）。
- 不改外部 `<img src="*.svg">` 與 CSS background SVG 的既有 vector 路徑（已可運作）。

## Decisions

### Extend SVG_PRESENTATION_PROPERTIES

在兩個 runtime 的 `SVG_PRESENTATION_PROPERTIES` 清單新增五筆，每筆沿用既有 `{ cssName, domName, attrName, defaultValue }` 結構：

- `fill-rule` → `defaultValue: "nonzero"`
- `clip-rule` → `defaultValue: "nonzero"`
- `paint-order` → `defaultValue: "normal"`
- `vector-effect` → `defaultValue: "none"`
- `mix-blend-mode` → `defaultValue: "normal"`

沿用既有 `shouldWriteSvgPresentationAttribute` / `isUsableSvgPresentationValue` / `isDefaultSvgPresentationValue` 邏輯：只有當該節點原本帶 class/style 或顯式 attribute、且 computed value 非預設、可序列化時才寫入。content script 與 capture core 兩份清單必須一致，避免 runtime parity 漂移。

### Preserve fallback behavior

normalization：clone / computed style / serialization 任一失敗時，`serializeSvgMarkupForFigma` 維持回傳 raw `outerHTML`（既有行為），新增屬性不改變此 catch 路徑。

## Implementation Contract

**Behavior:**

- 一個 descendant 帶 class 設定 `fill-rule: evenodd` 且 computed value 為 `evenodd` 時，captured `attributes.svgMarkup` 對該節點序列化出 `fill-rule="evenodd"`。
- `vector-effect: non-scaling-stroke`、`mix-blend-mode: multiply`、`paint-order: stroke`、`clip-rule: evenodd` 在 computed 且非預設時，同樣序列化為 concrete attributes；值為預設（如 `fill-rule: nonzero`、`mix-blend-mode: normal`）或節點未帶 class/style 時不寫入。

**Interface / data shape:**

- `SVG_PRESENTATION_PROPERTIES` 仍為 `{ cssName, domName, attrName, defaultValue, tagNames? }` 物件陣列，content script 與 capture core 兩份一致。
- 不改 `attributes.svgMarkup` 的格式與 capture schema。

**Failure modes:**

- normalization 序列化失敗 → 回傳 raw `outerHTML`，capture 仍產生 SVG asset。

**Acceptance criteria:**

- `corepack pnpm build` 通過。
- `corepack pnpm test` 通過。
- `apps/chrome-extension/test/capture-core.test.mjs` 新增測試證明 `fill-rule` / `clip-rule` / `paint-order` / `vector-effect` / `mix-blend-mode` 在 computed 非預設時序列化為 concrete attributes，且預設值不寫入。
- 既有 SVG normalization 測試（CSS variable fill、gradient stops、raw markup fallback）不退化。
- `spectra analyze refine-svg-figma-fidelity --json` 無 Critical / Warning。
- `spectra validate refine-svg-figma-fidelity` 通過。

**Scope boundaries:**

- In scope：inline SVG presentation 屬性擴充（兩 runtime）、對應 fallback、聚焦測試。
- Out of scope：capture schema 欄位、raster/vector fallback 邊界、CSS transform（scale/rotation/skew）處理、外部 SVG 路徑、其他非 SVG layer 行為。

## Risks / Trade-offs

- [Risk] 新增 presentation 屬性使 markup 變大。Mitigation：沿用既有「非預設且帶 class/style 才寫入」判斷，避免 inline 預設值。
- [Risk] 兩 runtime 清單不同步造成 parity 漂移。Mitigation：兩份清單以相同五筆同步更新，並由既有 runtime parity 測試守護。
