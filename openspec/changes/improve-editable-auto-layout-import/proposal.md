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

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `production-ui-import`: 匯入 `.figcapture` 時，`Editable Accurate` SHALL contain nested Figma frames and conservative Auto Layout for high-confidence DOM layout containers instead of only flat absolute-position layers.
- `production-ui-import`: capture `.figcapture` 時，direct text SHALL preserve browser-visible whitespace semantics instead of raw HTML indentation for normal text flow.

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
