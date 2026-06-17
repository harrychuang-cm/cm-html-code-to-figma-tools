## Context

目前 capture inline SVG 時直接保存 `element.outerHTML` 到 `attributes.svgMarkup`，asset packaging 會把它寫入 `assets/vector-N.svg`，Figma Plugin 再用 `createNodeFromSvg` 建立 vector。這條路徑能保留 SVG 可編輯性，但 production SVG 常包含 browser CSS，例如 `var(...)`、`currentColor`、class selector、inline style，以及 `linearGradient` / `radialGradient` 裡的 stop 樣式。Figma 的 SVG parser 不一定能解析這些 browser-only CSS 表達式，因此需要在瀏覽器 capture 階段把已計算出的呈現樣式寫進 SVG markup。

## Goals / Non-Goals

**Goals:**

- 在 Chrome Extension capture 階段產生 Figma-friendly inline SVG markup。
- 將瀏覽器 computed style 中可讀到的 SVG presentation values 寫回 cloned SVG descendant attributes。
- 讓 CSS custom properties、`currentColor`、class-based styles、inline styles 的顏色與 opacity 在 Figma import 時更穩定。
- 特別保留 `linearGradient` / `radialGradient` 結構與 `stop-color`、`stop-opacity` 細節。
- 已正規化且可序列化的 complex inline SVG chart 應輸出 vector asset，而不是 capture 階段的 screenshot fallback。
- 在 normalization 失敗時維持既有 SVG asset packaging 與 Figma fallback 行為。

**Non-Goals:**

- 不將 SVG rasterize 成圖片。
- 不把 SVG chart 轉成原生 Figma chart component 或資料模型。
- 不實作完整 CSS parser 或 cascade engine；只使用 browser `getComputedStyle` 已提供的結果。
- 不讓 `foreignObject`、script-like content 等高風險 SVG feature 強制走 vector；這些內容仍可保留 raster fallback。
- 不語意化 `foreignObject` 內容；Figma parser 無法處理時仍依既有 fallback。

## Decisions

### Normalize Inline SVG Markup During Capture

在 `snapshotDomElement` 遇到 `tagName === "svg"` 時，不再只讀 `element.outerHTML`。新增 helper 會 clone SVG，依序走訪 original 與 clone 的 descendants，使用同一個 `windowRef.getComputedStyle(originalNode)` 取得已解析值，再把支援的 presentation values 寫到 clone 的 attributes。

這個位置比 Figma Plugin 更合適，因為只有 browser capture context 能可靠解析 CSS variables、class selector、inheritance 與 `currentColor`。

### Inline Only Figma-Relevant Presentation Values

Normalization 只處理 Figma SVG import 會用到的 presentation attributes：`fill`、`stroke`、`color`、`opacity`、`fill-opacity`、`stroke-opacity`、stroke metrics、text font presentation，以及 gradient stop 的 `stop-color` / `stop-opacity`。值為空、`normal`、不可序列化，或會破壞 geometry 的 property 不寫入。

對 `fill` / `stroke` 若 computed value 是 `url(#...)` 則保留 reference；對 stop element 則將 computed `stop-color` 與 `stop-opacity` 寫成 concrete attributes，讓 gradient definition 本身保持可解析。

### Preserve SVG Structure And Fall Back Gracefully

Helper MUST preserve root attributes、`defs`、clipPath、mask、gradient ids、geometry attributes、text content 與 child order。若 clone、computed style 或 XML serialization 在 mock runtime 或特殊 DOM 中失敗，helper 回傳原始 `outerHTML`，capture 仍能產生 SVG asset，Figma import 仍走既有 vector import 和 placeholder fallback。

### Prefer Vector Assets For Normalized Complex SVG Charts

`captureVisualAssets` 不應再因為 inline SVG 有 `role="img"`、含有 SVG text，或 visual node 數量超過舊 threshold 就直接建立 `fallback-*.png`。只要 node 有可用 `attributes.svgMarkup`，且 markup 不包含高風險 SVG feature，asset packaging SHALL 建立 `assets/vector-N.svg` 並設定 `assetKind: "svg"`。

高風險 feature 的判斷應保持保守，例如 `foreignObject`、`script`、embedded iframe/canvas/video 或 event-handler attributes。這些內容可能無法被 Figma `createNodeFromSvg` 穩定解析，仍可沿用 raster fallback 與 `complex svg fallback` diagnostics。這個策略讓常見 SVG chart 可編輯，同時保留安全的 fallback 邊界。

## Implementation Contract

**Behavior:**

- Captured inline SVG assets SHALL prefer normalized markup over raw `outerHTML` when clone and computed styles are available.
- A SVG descendant with `fill="var(--b-theme-primary, var(--bs-primary, #4c6ef5))"` and computed fill `rgb(76, 110, 245)` SHALL serialize with `fill="rgb(76, 110, 245)"`.
- Gradient `stop` elements SHALL serialize resolved `stop-color` and `stop-opacity` values when computed values are available, while keeping gradient ids and references intact.
- Normalization SHALL NOT rasterize SVG content and SHALL NOT remove geometry, `defs`, clipping, gradient, or text content needed by Figma `createNodeFromSvg`.
- A normalized inline SVG chart with many visual nodes, text labels, and `role="img"` SHALL package as `assets/vector-N.svg` instead of `assets/fallback-N.png` when no high-risk SVG feature is present.
- Inline SVG containing high-risk SVG features SHALL keep the existing raster fallback behavior and diagnostics.

**Interface / data shape:**

- `attributes.svgMarkup` remains a UTF-8 SVG string consumed by `captureVisualAssets` and stored as `assets/vector-N.svg`.
- No `.figcapture` schema field is added or removed.
- The helper can live in both capture runtimes that snapshot DOM nodes: module capture core and Chrome content script bundle.

**Failure modes:**

- If `cloneNode`, descendant traversal, `getComputedStyle`, or XML serialization fails, capture SHALL keep the best available SVG string and continue.
- If Figma SVG import still fails after normalization, the existing SVG import fallback records metadata and returns placeholder/image fallback without aborting the page import.

**Acceptance criteria:**

- `corepack pnpm build` passes.
- `corepack pnpm test` passes.
- A focused capture-core test proves CSS variable fills are serialized as concrete colors in `attributes.svgMarkup`.
- A focused capture-core test proves `linearGradient` ids remain present and `stop-color` / `stop-opacity` are serialized as resolved values.
- A focused asset-capture test proves a complex normalized SVG chart creates `assets/vector-1.svg` and no fallback diagnostics.
- A focused asset-capture test proves a high-risk `foreignObject` SVG still creates a raster fallback.
- `spectra analyze optimize-svg-figma-import --json` has no Critical or Warning findings.
- `spectra validate optimize-svg-figma-import` passes.

**Scope boundaries:**

- In scope: inline SVG markup captured from DOM, computed presentation values, gradient stop details, complex SVG chart vector packaging, graceful fallback.
- Out of scope: raster image SVG URLs fetched from remote assets, data-driven chart reconstruction, full CSS parsing, visual pixel audit against every SVG library.

## Risks / Trade-offs

- [Risk] Inlining too many default SVG values can make markup larger. Mitigation: restrict normalization to presentation attributes relevant to Figma import and skip empty or unsupported values.
- [Risk] Browser computed styles can vary by environment. Mitigation: tests use deterministic mocked computed styles for normalization rules, while runtime keeps fallback to raw markup.
- [Risk] Some SVG features remain unsupported by Figma even after normalization. Mitigation: existing import fallback and metadata stay unchanged.
