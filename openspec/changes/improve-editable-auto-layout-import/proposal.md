## Why

目前 `Editable Accurate` frame 主要是扁平的絕對座標 layers。設計師可以看到文字與形狀，但無法用 Figma Auto Layout 理解 header、sidebar、content card、right rail、button group、list item 等版型結構，造成匯入後的設計稿可編輯性與版型準確度不足。

這個問題已在真實 CMoney 匯入結果中出現：匯入 frame 有數百個 sibling layers，幾乎沒有父子結構或 Auto Layout，導致檢查與調整都不符合設計師預期。

## What Changes

- 將 Figma renderer 從純 flat layer 輸出改為 DOM tree-aware 輸出，保留父子層級。
- 對高可信 layout container 建立 Figma frame，並在符合條件時啟用 Auto Layout。
- 從 captured CSS 與 child geometry 推導 Auto Layout 屬性：axis、item spacing、padding、fixed frame size、clip content。
- 保留 absolute fallback：重疊、fixed/sticky、複雜 grid、過深或低可信區塊不硬轉 Auto Layout。
- 在 import report 中回報 auto layout applied/skipped count 與 skipped reasons，讓設計師能 debug 哪些區塊沒有轉成功。
- 更新 Figma adapter、classic runtime、tests、manual docs，確保 Figma development plugin 實際輸出 nested Auto Layout frame。
- 第二輪 fidelity guardrails：針對 CMoney 實際匯入 review，避免 0/1px nonvisual wrapper、負座標 wrapper、out-of-bounds child 被 Auto Layout 重排；文字保留 captured width 與背景；canvas 第一階段輸出為 raster fallback 圖片。
- 第三輪 text fidelity guardrail：capture 階段依 CSS `white-space` 語意 normalize direct text，避免 HTML template indentation 被匯入成 Figma 的多餘空白或換行。
- 第四輪 text fidelity guardrail：透明、無邊框、只有 border-radius 的 button label 不建立 fixed-width backing frame，讓單行 action text 在 Figma 使用 auto-width/hug content。
- 第五輪 layout fidelity guardrail：具備 flex alignment 或 line-height line box 證據的單一文字 child container 保留垂直置中，而不是被 one-child guard 固定為 absolute top-left。
- 第六輪 viewport/asset fidelity guardrail：visible viewport 匯出時將超長 root/container geometry clamp 到 viewport，並在 canvas serialization 失敗時用 viewport screenshot 裁切圖補上 raster fallback，避免圖表類 canvas 變成透明 placeholder。
- 第七輪 image asset fidelity guardrail：lazy-loaded `img` 若 `currentSrc/src` 仍是 transparent placeholder，export SHALL prefer real image candidates such as `data-src` or `data-srcset` so SVG icons do not import as placeholders or wrong shapes.
- 第八輪 layout fidelity guardrail：single-child flex menu item 若有 `align-items:center`，即使 child captured line box 與 parent 等高，也 SHALL preserve Figma vertical centering，避免無 dropdown arrow 的 top menu label 置上。
- 第九輪 text sizing guardrail：top bar menu 與其他單行 label 的 editable text SHALL map auto-width text to Figma Auto Layout child HUG sizing，避免 menu label 被固定寬度或 fill sizing 影響排版。
- 第十輪 padding fidelity guardrail：captured CSS padding SHALL be preserved in `.figcapture` and Figma Auto Layout frames; `justify-content: space-between` SHALL not zero inferred or explicit padding because Figma SPACE_BETWEEN supports padding.
- 第十一輪 flex ordering guardrail：captured `flex-direction: row-reverse` and `column-reverse` SHALL preserve browser visual child order in Figma Auto Layout by reversing Auto Layout child insertion order.
- 第十二輪 visible text backing guardrail：text nodes with visible backgrounds and explicit CSS padding SHALL import as fixed-size padded Auto Layout backing frames with editable HUG text, so pill labels and badges preserve browser padding without forcing the text layer to fill the whole box.
- 第十三輪 flex spacing guardrail：flex containers with strongly non-uniform implicit child gaps, such as start-cluster plus right-aligned actions, SHALL stay absolute instead of mapping the largest gap to every Figma Auto Layout item.
- 第十四輪 mixed inline content guardrail：elements that combine direct text with child SVG/img/span nodes SHALL import as frames containing all inline children plus a synthesized editable direct-text node, so icons and adjacent text such as cart, points, and counters are not dropped.
- 第十五輪 clipped text sizing guardrail：single-line text that is fixed-width and clipped by CSS overflow/ellipsis SHALL stay fixed-width in Figma instead of using HUG sizing, preventing truncated header names and labels from expanding beyond their captured container.
- 第十六輪 pseudo-element decoration guardrail：visible CSS `::before` and `::after` decoration boxes SHALL be captured as synthetic child nodes and imported as editable shape layers, so CSS-only active tab underlines and similar UI indicators are not missing in Figma.
- 第十七輪 pseudo-positioning guardrail：absolute/fixed pseudo-element decoration rects SHALL be inferred against the nearest positioned containing block instead of always using the pseudo owner box, so CSS-only tab underlines and badges keep browser-accurate x/y placement.
- 第十八輪 SVG image fidelity guardrail：captured CSS `transform` / `transform-origin` SHALL be preserved for visual assets, and SVG image imports SHALL keep intrinsic aspect ratio inside the captured image box while applying CSS rotation transforms.
- 第十九輪 stroke fidelity guardrail：button and control borders/outlines SHALL be captured from computed CSS `border-*` and `outline-*` styles; uniform four-side borders and outlines SHALL import as editable Figma strokes, while one-sided or non-uniform borders SHALL import as editable decoration rectangles so active-tab underlines do not become four-sided boxes.
- 第二十輪 pseudo icon fidelity guardrail：inline `::before`/`::after` CSS image icons SHALL be captured as synthetic pseudo nodes with inferred inline positions and packaged as assets, so verification badges and similar CSS-only icons import into Figma.
- 第二十一輪 stacking fidelity guardrail：captured numeric CSS `z-index` SHALL be preserved in `.figcapture`, non-Auto Layout Figma siblings SHALL be appended in CSS stacking order, and imported nodes SHALL keep `cssZIndex` plugin metadata for debug because Figma has no native CSS z-index property.
- 第二十二輪 font fidelity guardrail：captured CSS `font-family` stacks and `font-style` SHALL be used when loading Figma fonts, trying available stack candidates before the default fallback and reporting substitution details for debug.
- 第二十三輪 overflow fidelity guardrail：captured `overflow-x`, `overflow-y`, `max-width`, `max-height`, and `text-overflow` SHALL preserve clipped read-more/multiline containers as fixed-size Figma frames with `clipsContent` enabled.
- 第二十四輪 overlay fidelity guardrail：textual CSS pseudo-elements, CSS `linear-gradient(...)` overlays, and rotated SVG vectors SHALL be preserved so read-more ellipsis/masks and carousel arrow/fade overlays import without overlap or missing icons.
- 第二十五輪 pseudo asset fidelity guardrail：CSS pseudo-elements whose `content` is `url(...)` SHALL be captured and packaged as image/vector assets rather than editable text, so data URL SVG strings do not appear as text layers in Figma.
- 第二十六輪 interactive text sizing guardrail：synthesized direct text inside mixed-content links/buttons/tabs and direct interactive link/button labels SHALL stay auto-width/HUG when the label fits on one line, even when pseudo separators or tall line boxes make the parent taller than the CSS line-height.
- 第二十七輪 table fidelity guardrail：direct `td`/`th` and `display: table-cell` text SHALL import as fixed-size table-cell frames whose editable text child preserves CSS vertical and horizontal alignment instead of becoming a full-height top-aligned text layer.
- 第二十八輪 tab separator fidelity guardrail：mixed-content direct text SHALL respect parent CSS padding when finding its free text segment, and pseudo decoration rectangles SHALL apply captured CSS transform translation so separators using `top:50%; transform:translateY(-50%)` stay vertically centered.
- 第二十九輪 chat panel fidelity guardrail：browser-ordered CSS `box-shadow` values SHALL import as Figma `DROP_SHADOW` effects in module and classic runtimes, and padded single-line chat/message bubbles SHALL keep HUG editable text inside fixed-size padded backing frames instead of treating the inner content box as clipped fixed-width text.
- 第三十輪 chat overlay fidelity guardrail：transparent padded emoji/message text SHALL place editable text inside the padded content box, and zero-height static wrappers that contain fixed-position overlays SHALL use descendant fixed numeric z-index for non-Auto Layout stacking so page go-to-top controls remain beneath higher-z-index chat panels.
- 第三十一輪 tab bar fidelity guardrail：transparent padded interactive tab/link text boxes SHALL preserve their captured outer box as fixed-size Auto Layout wrapper frames with the editable text inside the CSS content box, so parent Auto Layout does not discard the link padding and height.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `production-ui-import`: 匯入 `.figcapture` 時，`Editable Accurate` SHALL contain nested Figma frames and conservative Auto Layout for high-confidence DOM layout containers instead of only flat absolute-position layers.
- `production-ui-import`: capture `.figcapture` 時，direct text SHALL preserve browser-visible whitespace semantics instead of raw HTML indentation for normal text flow.
- `production-ui-import`: capture and import SHALL preserve numeric CSS z-index through Figma layer order and plugin metadata for non-Auto Layout stacked content.
- `production-ui-import`: Figma text import SHALL use captured CSS font-family stacks and font style when choosing local Figma fonts, with substitution details visible in the import report.
- `production-ui-import`: capture and import SHALL preserve CSS overflow/max-size clipping so read-more or limited-height text containers do not reveal hidden DOM content in Figma.
- `production-ui-import`: capture/import SHALL preserve textual CSS pseudo-elements, pseudo `content: url(...)` image assets, supported CSS linear-gradient backgrounds, and rotated SVG vector placement for overlay controls.
- `production-ui-import`: mixed direct-text labels and direct interactive labels in tabs, links, and buttons SHALL preserve single-line HUG sizing when they fit their captured text segment.
- `production-ui-import`: direct table-cell text SHALL preserve fixed cell geometry while vertically aligning editable text from CSS `vertical-align` and horizontally aligning it from CSS `text-align` or common utility alignment classes for legacy captures.
- `production-ui-import`: mixed direct-text labels SHALL preserve parent padding as tab/link gaps, and pseudo decoration layers SHALL apply captured CSS transform translation when imported.
- `production-ui-import`: CSS box shadows SHALL import as Figma effects, and padded single-line visible text backing SHALL keep editable HUG text when the explicit CSS width belongs to the outer backing box.
- `production-ui-import`: transparent padded text boxes SHALL preserve padding in editable text placement, and non-visual wrappers containing fixed-position overlays SHALL preserve browser stacking against higher-z-index fixed chat panels.
- `production-ui-import`: transparent padded interactive tabs/links SHALL preserve the browser anchor/button hit-area frame when the padding and explicit box size are layout-significant inside a parent Auto Layout row.

## Impact

- Affected specs: production-ui-import
- Affected code:
  - Modified:
    - apps/figma-plugin/src/renderer.ts
    - apps/figma-plugin/src/figma-adapter.ts
    - apps/figma-plugin/src/code-classic.js
    - apps/figma-plugin/src/report.ts
    - apps/chrome-extension/src/asset-capture.ts
    - apps/chrome-extension/src/capture-core.ts
    - apps/chrome-extension/src/capture-package.ts
    - apps/chrome-extension/src/content-script.ts
    - apps/chrome-extension/src/runtime.ts
    - apps/figma-plugin/test/auto-layout.test.mjs
    - apps/figma-plugin/test/editable-accurate.test.mjs
    - apps/figma-plugin/test/runtime-import.test.mjs
    - apps/figma-plugin/test/plugin-scaffold.test.mjs
    - apps/chrome-extension/test/capture-core.test.mjs
    - apps/chrome-extension/test/asset-capture.test.mjs
    - apps/chrome-extension/test/export-flow.test.mjs
    - test/e2e-smoke.test.mjs
    - docs/manual-runtime-test.md
    - docs/v1-usage-and-acceptance.md
  - New:
    - apps/figma-plugin/src/layout-tree.ts
    - apps/figma-plugin/test/layout-tree.test.mjs
  - Removed: none
