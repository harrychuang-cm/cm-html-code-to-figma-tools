## Context

目前 Figma 匯入結果的 `Editable Accurate` frame 仍接近 HTML absolute export：每個文字、形狀、圖片都直接掛在 frame 底下。真實 CMoney 匯入結果顯示同一個 frame 內有 494 個 sibling layers，header nav、sidebar menu、post card、right rail list 都沒有 Figma Auto Layout 或父子結構。

現有程式已具備幾個基礎：

- `capture.json` 保留 DOM tree、computed styles、rect、sourceNodeId。
- `renderer.ts` 可以建立 Source Screenshot 與 Editable Accurate frames。
- `figma-adapter.ts` 和 `code-classic.js` 可建立 Figma frame/text/image/rectangle nodes。
- `auto-layout.ts` 已有候選偵測，但先前只用於 report 或實驗 frame，沒有改變 Editable Accurate 的實際 layer tree。

## Goals / Non-Goals

**Goals:**

- 讓 `Editable Accurate` 從 flat sibling layers 變成 nested frames。
- 讓高可信 flex containers 成為 Figma Auto Layout frames。
- 從 captured CSS 與 child geometry 推導 axis、itemSpacing、padding、fixed size。
- 對具備 CSS 對齊或 line-height line box 證據的單一文字 child container，也保留垂直對齊語意。
- 對低可信容器保持 nested absolute frame，不硬轉 Auto Layout。
- 在 tests 和 report 中可驗證 applied/skipped auto layout 結果。
- 針對實際 CMoney 匯入錯位，避免 0/1px nonvisual wrapper、負座標 wrapper、out-of-bounds child 觸發 Auto Layout 重排。
- 讓 editable text 保留 captured width 以維持 wrapping，並讓有背景或 border 的文字節點保留可見底色。
- capture direct text 時依 CSS `white-space` 語意處理 HTML 縮排，避免 Figma 文字出現 production web 沒有顯示的空白。
- 避免透明、無邊框、只有 border-radius 的文字容器被誤判成可見 backing frame，導致單行 button label 固定寬度後斷行。
- 將 canvas 第一階段匯入為 raster fallback image，而不是透明 placeholder。
- visible viewport 匯出時將超出 viewport 的 root/body/container rect clamp 到 viewport intersection，避免 V1 匯入產生完整長頁高度的 editable frame。
- 當 canvas serialization 不可用或失敗時，用已 capture 的 viewport screenshot 依 DOM rect 裁切成 fallback PNG，保留圖表類 canvas 的視覺參考。
- Lazy-loaded `img` elements SHALL resolve the actual image candidate when `currentSrc` or `src` still points to a transparent placeholder, using captured `data-src`, `data-srcset`, or equivalent lazy source attributes before recording missing or placeholder assets.
- Single-child flex menu items with explicit `align-items:center` SHALL preserve vertical centering even when the child captured rect is the same height as the parent line box.
- Single-line navigation labels and other auto-width text SHALL be emitted as Figma HUG-sized text children when imported into Auto Layout containers, while wrapped or visually backed text remains fixed-width auto-height.
- CSS padding SHALL be captured and mapped to Figma Auto Layout padding when available; `space-between` alignment SHALL preserve padding instead of treating it as alignment offset.
- CSS reverse flex directions SHALL preserve visual order. Because Figma Auto Layout has axis modes but no CSS `row-reverse` or `column-reverse` direction property, the importer SHALL reverse child insertion order only for Auto Layout frames whose captured `flex-direction` ends in `-reverse`.
- Text nodes with visible backing styles and explicit CSS padding SHALL map that padding to a fixed-size Figma Auto Layout backing frame, with the editable text child using HUG sizing when the text is single-line.
- Flex containers with strongly non-uniform implicit child gaps SHALL remain absolute unless CSS alignment provides an equivalent Figma Auto Layout representation.

**Non-Goals:**

- 不在此 change 實作 full-page capture。
- 不在此 change 實作 multi-viewport responsive constraints。
- 不在此 change 實作 variables、components、component variants。
- 不在此 change 實作 full-page screenshot stitching 或跨 viewport lazyload/sticky 處理。
- 不在此 change 將 canvas/SVG 圖表轉成可編輯 vector；V1 仍以 raster fallback 保留視覺。
- 不嘗試讓所有 CSS grid 都轉為 Figma Auto Layout；complex grid 先 skip。

## Decisions

### Add Layout Tree Models Before Figma Node Creation

新增 `layout-tree.ts` 作為 renderer 前置模型層。它輸入 `CapturePackage`，輸出 nested layout node models：

- `FRAME`: renderable or layout-preserving container。
- `TEXT`: editable text leaf。
- `IMAGE` / `FALLBACK_IMAGE`: image or raster fallback leaf。
- `RECTANGLE`: visual box leaf。

這比直接在 adapter 內讀 DOM 更穩定，因為 model 可被 Node tests 驗證，也能同時供 module runtime 與 classic runtime 對齊。

替代方案是維持 flat renderer，然後在 Figma API 後處理 grouping。這會讓 child relative geometry、font loading、image fallback 和 report 統計更難驗證。

### Use Conservative Auto Layout Eligibility

Auto Layout 只套用於高可信 container：

- `display` 為 `flex` 或 `inline-flex`。
- 至少兩個 renderable child models。
- parent 與 children 都有正寬高 bounds。
- children 在 inferred primary axis 上不重疊。
- parent 不是 `position: fixed` 或 `position: sticky`。
- parent 不是 complex grid。
- children 不得超出 parent bounds 或依賴 large negative parent-relative offsets。
- children 不得包含 0/1px nonvisual wrapper 作為可見內容的定位代理。
- child gaps 不得呈現強烈非均勻 implicit spacing，除非 CSS `justify-content` 等 alignment 能直接映射到 Figma。像「前兩個 action 靠左、最後一個靠右」常由 `margin-left:auto` 或相似 CSS 造成；若 capture payload 沒有可映射的 alignment 語意，強行套單一 `itemSpacing` 會把最大空白套到每個 child。

不符合條件的 container 仍會建立 frame，但 `layoutMode` 保持 `NONE`，child 以 parent-relative x/y 放置。

### Preserve Single-Child Text Alignment

部分網站 header、tab、button、list item 會用單一 inline/link text child 加上 CSS line-height 或 flex alignment 達成垂直置中。這類 container 只有一個 child，先前因 `one-child-container` guard 直接跳過 Auto Layout，導致 Figma text 以 y=0 absolute 放置，看起來靠上。

Importer SHALL allow a conservative single-child alignment conversion when all of these are true:

- container has exactly one renderable child。
- child is a single-line `TEXT` model。
- parent and child have usable bounds and child is inside the parent bounds。
- parent is not fixed/sticky/grid and does not contain nonvisual wrapper positioning。
- there is explicit CSS flex alignment (`display:flex|inline-flex` with supported `align-items` / `justify-content`) OR line-height evidence (`line-height` approximately equals the parent visual height, or a one-line text child sits in a taller line box).

For these cases, create a fixed-size Auto Layout frame with `layoutMode: HORIZONTAL`, `counterAxisAlignItems: CENTER`, inferred left/right padding from the captured child x offset, and zero top/bottom padding so Figma centers the text vertically. This is intentionally narrower than enabling Auto Layout for all one-child containers; ordinary wrappers without alignment evidence continue to skip with `one-child-container`.

When explicit flex alignment exists, the conversion should not require the child captured box to be visibly shorter than the parent. Web anchors often capture as a 28px line box inside a 28px flex item, but Figma Text nodes render from font metrics rather than the browser line box. Preserving `align-items:center` in Figma is therefore the safer representation for single-child flex menu labels with no dropdown arrow. The stricter child-shorter-than-parent guard still applies to non-flex line-height-only evidence.

### Map CSS Flex Alignment To Figma Auto Layout

Auto Layout 不只需要 axis、gap、padding，也需要保留 CSS flex alignment。`align-items` 會映射到 Figma `counterAxisAlignItems`，例如 `center` → `CENTER`，讓 horizontal top menu 文字和 icon 在 28px bar 裡垂直置中。`justify-content` 會映射到 Figma `primaryAxisAlignItems`，例如 `center` → `CENTER`、`flex-end` → `MAX`、`space-between` → `SPACE_BETWEEN`。

當 CSS alignment 已明確描述對齊方式時，該軸上的 offset 不應被誤推為 padding。否則像 top menu 的 child y=0 會被轉成 `paddingTop=0/paddingBottom=8`，抵消 Figma center alignment，導致 menu 置上。

`justify-content: space-between` is different from `center` or `flex-end`: both CSS and Figma distribute remaining space inside the content box, and padding still defines the content box inset. Therefore SPACE_BETWEEN SHALL preserve explicit CSS padding, and it MAY preserve inferred padding from child geometry when explicit padding was not captured. Center/end alignment may still clear inferred-only offsets on the controlled axis to avoid mistaking alignment space for padding.

Chrome capture SHALL include `paddingTop`, `paddingRight`, `paddingBottom`, and `paddingLeft` in computed styles. The importer SHALL prefer these explicit values over geometry inference for Auto Layout padding. Geometry inference remains a fallback for older `.figcapture` files that do not include padding styles.

### Preserve Reverse Flex Visual Order

CSS `flex-direction: row-reverse` keeps DOM order but lays items out in the reverse visual direction. Figma Auto Layout does not expose an equivalent reverse-direction flag. For high-confidence Auto Layout frames, importer SHALL keep the parent axis as `HORIZONTAL` or `VERTICAL` and reverse the child insertion order when captured `flexDirection` is `row-reverse` or `column-reverse`.

This is a visual-order transform only for applied Auto Layout frames. It SHALL NOT reorder children for absolute fallback frames, skipped risky containers, or non-flex containers, because those frames still rely on captured x/y geometry.

### Skip Non-Uniform Implicit Flex Spacing

Some production rows visually combine a left cluster and a right-aligned action by using auto margins or equivalent spacing, while computed `gap` and `justify-content` remain `normal`. Figma Auto Layout only supports a single item spacing value for ordinary rows. If importer maps the largest measured empty area to `itemSpacing`, every child is separated by that large value and the row becomes visibly wrong.

The importer SHALL detect strongly non-uniform implicit gaps on the primary axis. When there are at least three children, no equivalent distributed alignment is available, and the largest gap is far larger than the expected CSS or measured base gap, the container SHALL stay as a nested non-auto-layout frame with skipped reason `non-uniform-spacing`. Child frames keep parent-relative x/y geometry, preserving the browser screenshot. This guard is generic and applies to any flex row or column that cannot be represented by one Figma Auto Layout gap.

### Preserve Mixed Inline Content

HTML elements can render direct text and child elements in the same inline or flex row. Examples include an anchor with an inline SVG icon plus direct label text, or a points link with an SVG icon, direct text `P點:`, and a child span containing the numeric count. Treating `textContent` as an unconditional leaf model drops the child SVG/span nodes and loses visible UI.

The importer SHALL treat nodes with both direct `textContent` and renderable children as mixed-content containers, not text leaves. It SHALL create a frame for the original element, keep all existing child models, and synthesize one editable text child for the element's direct text. The synthesized text uses a stable debug source id suffix `::text`, inherits the element text styles, and derives its bounds from the remaining free segment in the parent box after child bounds are accounted for.

Child order SHALL follow browser visual order on the relevant flex axis. If direct text sits between an icon and a later child span, the synthesized text model must be inserted between those models. This preserves generic inline UI such as icon + label, label + badge, icon + label + counter, and top bar member menu rows without site-specific selectors.

### Preserve Visible CSS Pseudo-Elements

Production UIs often draw active tab underlines, badges, separators, and small decorative indicators with CSS `::before` or `::after`. These nodes do not exist in the DOM tree, so a DOM-only capture loses the visible decoration even when the reference screenshot clearly shows it.

Chrome capture SHALL inspect `getComputedStyle(element, "::before")` and `getComputedStyle(element, "::after")` for every visible element. When a pseudo-element has `content`, is displayed, has a nonzero inferred box, and carries visible background, border, or shadow style, capture SHALL append a synthetic child node with `nodeType: "pseudo"`, `tagName: "::before"` or `"::after"`, `attributes["data-pseudo"]`, computed styles, and an absolute viewport rect inferred from computed `left`/`right`/`top`/`bottom`/`width`/`height`.

Absolute and fixed pseudo-element rect inference SHALL use the nearest positioned containing block that the capture traversal has seen, not blindly the pseudo owner element's own border box. This matches browser behavior for common structures where a static active label owns `::after`, but a positioned ancestor such as the tab item supplies the containing block. If no positioned containing block is available, capture falls back to the pseudo owner box as the conservative base; static pseudo-elements also continue to use the owner element box.

The importer SHALL treat these synthetic pseudo nodes like normal visual boxes, usually producing rectangle layers. If a pseudo-element is `position:absolute`, its parent SHALL NOT be converted into Auto Layout flow that would treat the decoration as an ordinary item; the parent remains a nested absolute frame with skipped reason `absolute-position-child`.

### Preserve Screenshot-First Text Fidelity

Editable text 仍應是 Figma Text node，但 resize mode 需要依 captured layout 分流。多行文字、明確換行文字、寬欄內容使用 fixed-width auto-height behavior，讓右側話題和段落 wrapping 與截圖更接近。單行短文字、navigation label、username、股票代碼與短數字使用 auto-width behavior，避免 Figma 字型差異把原本單行文字擠成兩行。

For auto-width text, the importer SHALL set both the text resize mode and the Auto Layout child sizing intent. `WIDTH_AND_HEIGHT` text maps to horizontal and vertical HUG sizing so top bar menu labels size to their content when they sit beside dropdown arrows or inside single-child menu items. Fixed-width auto-height text maps to fixed horizontal sizing and hug vertical sizing so paragraph wrapping and visible text boxes remain stable.

### Preserve Clipped Single-Line Text Bounds

Some production UI intentionally clips a single-line text node with CSS, commonly `white-space: nowrap`, fixed width, and `overflow: hidden` or `text-overflow: ellipsis`. Header account names and compact labels may store the full string in DOM but only render a clipped width on screen. If the importer treats these nodes as auto-width/HUG text, Figma expands the full string and pushes neighboring icons or menu items beyond the captured viewport.

The importer SHALL detect single-line text whose estimated text width exceeds the captured rect while CSS indicates inline clipping. These nodes SHALL keep fixed horizontal sizing and use Figma truncate/fixed text behavior when available. This guard is generic: it is based on computed CSS and captured bounds, not on project-specific class names.

當 captured text node 本身有 visible background、visible border 或 shadow 時，layout model 將建立一個 visual parent frame，裡面放置 parent-relative text，並在需要時保留 corner radius。這保留像股票價格 tag 的綠底白字，同時維持文字可編輯。

When that visible text node also has explicit CSS padding, the backing frame SHALL use fixed-size Auto Layout with the captured padding. The nested editable text can then use auto-width/HUG sizing for single-line badge or pill labels, instead of being forced to fill the full backing box. Single-line HUG text may use centered axes to preserve compact pill balance; multiline or fixed-width text should stay top-left within the padded content box. This is a generic CSS box mapping: the visual frame owns background, radius, border, shadow, and padding; the nested text owns editable characters and font metrics.

### Avoid Invisible Text Backing Frames

Text backing frame 只應該用於視覺上真的存在的 box，例如可見 background、可見 border，或可見 shadow。`border-radius` 本身不是可見樣式；如果 button 只有透明背景、無可見 border、但有 `border-radius: 4px`，它在 Figma 中不應生成 `Text Background` frame，也不應把文字強制固定寬度。

這個決策讓單行 action label，例如 `9則回答`，保持 editable text 並使用 auto-width/hug content。若未來要保留 button hit area，應由父層 layout/container 表達，不應用 invisible text backing frame 壓縮 label。

### Normalize Direct Text With CSS White Space Semantics

DOM `textContent` 會保留 HTML template indentation，例如 Vue template 裡的換行與多個空白。一般瀏覽器文字流在 `white-space: normal` 或 `nowrap` 下會把這些空白 collapse 成單一空白；如果 capture 直接使用 raw textContent，Figma text node 會保留換行和縮排，造成 production web 沒有的空白。

capture runtime SHALL 將 `whiteSpace` 加入 captured computed styles，並在產生 direct text 時依 CSS white-space 語意 normalize：

- `normal`、`nowrap`、missing、unknown：連續 whitespace collapse 成單一空白並 trim。
- `pre`、`pre-wrap`、`break-spaces`：保留原始文字內容。
- `pre-line`：保留換行分隔，但每一行內連續 horizontal whitespace collapse 成單一空白，並移除 indentation-only leading/trailing whitespace。

這個 normalize 應發生在 Chrome Extension capture payload 產生時，讓 `.figcapture` 儲存的是接近瀏覽器可見文字的內容。Figma Plugin 仍照 payload 建立 editable text，不需要用 site-specific 規則修字串。

### Capture Canvas As Raster Fallback

Canvas 目前仍屬不可編輯內容，但 V1 應把目前畫面以 PNG fallback asset 包進 `.figcapture`。Browser capture 在可用時透過 canvas serialization 取得 bytes；若 canvas tainted 或 API 失敗，才退回透明 fallback 並保留 `canvas fallback` diagnostic。

### Crop Viewport Screenshot For Unserializable Fallbacks

真實 CMoney package 顯示右側 `chartTrend__chart` canvas 因 serialization 失敗，`assets/fallback-1.png` 變成 1x1 透明 PNG，導致 Figma 匯入後圖表區空白。V1 已有 `screenshot.png`，因此 Chrome Extension 在建立 package 時可用同一張 visible screenshot 依 captured node rect 裁切出 PNG fallback。

這個行為應該是通用的 fallback provider，不應依賴 selector 或 CMoney class name：

- 適用於需要 raster fallback 的 `canvas`、`iframe`、`video` 或複雜 SVG。
- 優先使用 element 自身的 serialized bitmap bytes；只有失敗、缺值或產生 1x1 transparent placeholder 時，才改用 screenshot crop。
- crop 使用 viewport CSS rect 與實際 screenshot bitmap size 推導 scale，支援 DPR 2/3 的截圖。
- 若瀏覽器環境沒有 `createImageBitmap` / `OffscreenCanvas` / `convertToBlob`，或裁切失敗，仍回到透明 placeholder 並保留原 diagnostic。

這會讓不可編輯的股票圖表、第三方 widget、iframe preview 在 Figma 中至少與 reference screenshot 視覺一致；未來若要將 canvas/SVG 轉 vector，應在新的 change 中處理。

### Resolve Lazy Image Sources Before Placeholder Assets

Real production pages commonly render lazy images with a temporary transparent GIF in `src/currentSrc` and the real image in `data-src` or `data-srcset`. If export chooses `currentSrc || src` blindly, an SVG icon can become a 1x1 placeholder or the wrong visual asset in Figma even though the DOM already carries the correct source.

Image source selection SHALL be generic:

- Prefer a non-placeholder `currentSrc` when available because it reflects browser source selection for loaded responsive images.
- Otherwise prefer a non-placeholder `src`.
- If those are missing or transparent placeholder data URLs, fall back to `data-src`, `data-original`, `data-lazy-src`, and the first URL in `data-srcset` / `srcset`.
- Preserve SVG detection from the selected candidate so SVG icons still import through Figma SVG vector creation.
- If every candidate is missing, keep the existing missing asset diagnostic.

This is intentionally not tied to CMoney class names; it handles the common lazy image pattern in any production site.

### Clamp Visible Viewport Geometry

目前 capture scope 是 visible viewport only，但 DOM root/body/主要 layout container 可能保留完整 document height，例如 CMoney body 高度 7190px。這會讓 Figma `Editable Accurate` 裡出現超長 parent frame，並讓 Auto Layout eligibility 被 full-page container 干擾。

For visible viewport capture, normalized element rects SHALL be clamped to the viewport intersection before writing `.figcapture`. This keeps V1 geometry aligned with `screenshot.png`. Full-page capture is out of scope and should later opt out of this clamp or use a page-segment model that handles sticky and lazyload explicitly.

### Keep Fixed Frame Size For Visual Stability

Auto Layout frame 使用 captured width/height 作為 fixed size。padding 與 itemSpacing 用來描述內部 layout，但不讓 frame 自動 resize，避免匯入後整頁視覺跳動。

這個決策犧牲部分 responsive behavior，但符合 V1 目標：先讓 production viewport 匯入結果可檢查、可局部編輯。

### Share Behavior Between Module Adapter And Classic Runtime

`figma-adapter.ts` 會支援 `createFrameLayer(model)` 並套用 Auto Layout 屬性。`code-classic.js` 必須同步支援 nested frame rendering，因為 Figma development plugin 實際載入的是 classic script。

Classic runtime 不使用 modern syntax，不直接寫入 Figma node 自訂欄位；debug metadata 仍透過 `setPluginData`。

## Implementation Contract

**Behavior:**

- 匯入 valid `.figcapture` 後，Figma canvas 仍建立 `Source Screenshot` 和 `Editable Accurate` 兩個預設 frames。
- `Editable Accurate` 的直接 children SHALL include nested container frames rather than every primitive layer as a direct sibling.
- Captured flex containers that pass eligibility SHALL become Figma Auto Layout frames inside `Editable Accurate`.
- Single-child text containers with explicit CSS alignment or line-height alignment evidence SHALL preserve vertical centering through fixed-size Auto Layout.
- Risky containers SHALL remain nested non-auto-layout frames and SHALL be counted in skipped auto layout report data.
- Auto Layout eligibility SHALL skip containers whose children depend on out-of-bounds placement, large negative offsets, or 0/1px nonvisual wrapper frames.
- Auto Layout eligibility SHALL skip flex containers whose primary-axis child gaps are strongly non-uniform and not represented by captured CSS alignment, recording `non-uniform-spacing`.
- Auto Layout frames SHALL map supported CSS `align-items` and `justify-content` values to Figma axis alignment properties instead of representing all alignment as inferred padding.
- Nodes that combine direct text and renderable children SHALL import as mixed-content frames that preserve all child SVG/img/span models and add an editable direct-text model instead of dropping either side of the inline content.
- Visible CSS `::before` and `::after` pseudo-elements SHALL be captured as synthetic visual child nodes and imported as rectangle layers when their computed styles describe a visible decoration box.
- Absolute/fixed pseudo-element decoration rects SHALL be inferred against the nearest positioned containing block, preserving browser-accurate x/y placement when the pseudo owner itself is static.
- Containers with absolute-positioned child decoration SHALL stay out of Auto Layout flow, recording `absolute-position-child`, so pseudo underlines keep captured x/y geometry.
- Captured direct text SHALL normalize raw DOM whitespace according to captured CSS `white-space` semantics before it is written to `.figcapture`.
- Visible viewport capture SHALL clamp captured element rects to the current viewport intersection so root/body/long page containers do not create full-page-height frames in a visible-viewport package.
- Text nodes SHALL use auto width when captured geometry indicates single-line content and fixed width when captured geometry indicates multiline or constrained content. Text nodes with visible visual styles SHALL include a visual backing layer. Text nodes with only invisible decorative styles, such as transparent background plus border radius and no visible border or shadow, SHALL NOT receive a backing frame.
- Single-line text nodes that are clipped by CSS overflow/ellipsis and whose full text would exceed the captured width SHALL keep fixed width/truncate behavior instead of HUG sizing.
- Text backing frames with explicit CSS padding SHALL apply that padding through Figma Auto Layout and keep single-line nested text in HUG sizing.
- Canvas fallback assets SHALL use captured bitmap bytes when available and SHALL fall back to a screenshot crop of the same viewport rect when direct canvas serialization is unavailable but screenshot crop APIs are available.
- Image assets SHALL skip transparent placeholder `currentSrc` / `src` values when a real lazy image candidate is available in captured image attributes.

**Interface / data shape:**

- `layout-tree.ts` exports `createEditableLayoutNodeModels(packageData)` returning an array of node models with `type`, `name`, `sourceNodeId`, `rect`, `absoluteRect`, `style`, `children`, and optional `autoLayout`.
- Captured node `styles` include `whiteSpace` when available from computed styles; captured node `textContent` contains normalized direct text for that `whiteSpace` mode.
- Captured node `rect` values in visible-viewport packages represent the viewport-clipped box for that node.
- Captured image assets resolve from the selected image candidate, which may be `currentSrc`, `src`, `data-src`, `data-original`, `data-lazy-src`, or the first candidate in `srcset` / `data-srcset`.
- `autoLayout` includes `layoutMode`, `itemSpacing`, `paddingLeft`, `paddingRight`, `paddingTop`, `paddingBottom`, `confidence`, and `skippedReason` when relevant.
- `autoLayout` may include `primaryAxisAlignItems` and `counterAxisAlignItems` when supported CSS flex alignment values are captured.
- Figma adapter adds `createFrameLayer(model)` and accepts fixed-size Auto Layout properties.
- Import report continues to expose `autoLayoutConfidenceSummary`, now based on Editable Accurate nested conversion rather than an experimental third frame.

**Failure modes:**

- If a container cannot be safely converted to Auto Layout, import continues with `layoutMode` unset and the report records a skipped reason.
- If Figma rejects an Auto Layout property, import keeps the frame and continues node creation.
- If classic runtime cannot set plugin metadata, import continues silently.
- If `whiteSpace` is missing or unsupported, capture uses the `normal` whitespace behavior so template indentation does not leak into common text.
- If a canvas cannot be serialized and screenshot crop APIs are unavailable or fail, capture continues with the existing transparent fallback and diagnostic warning.
- If an image has no non-placeholder source candidates, capture continues with the existing missing asset diagnostic.

**Acceptance criteria:**

- `corepack pnpm build` passes.
- `corepack pnpm test` passes with coverage for layout-tree model inference, renderer nesting, adapter Auto Layout properties, and classic runtime import.
- Tests cover CMoney-style nonvisual wrappers, out-of-bounds Auto Layout skips, fixed-width text, text background preservation, and canvas bitmap fallback assets.
- Tests cover single-child line-height and flex-aligned text containers staying vertically centered instead of absolute top-aligned.
- Tests cover single-child flex menu labels with equal parent/child captured heights still mapping to centered Auto Layout.
- Tests cover mixed direct text and child SVG/span content preserving the visible icon, synthesized direct text, and following child text in visual order.
- Tests cover fixed-width clipped single-line text using fixed/truncate behavior instead of HUG sizing.
- Tests cover visible CSS pseudo-element decoration capture, rectangle import, and absolute-positioned pseudo children skipping Auto Layout flow.
- Tests cover raw template indentation normalization for `white-space: normal`, preservation for `pre` / `pre-wrap` / `break-spaces`, and line-preserving collapse for `pre-line`.
- Tests cover transparent rounded button labels staying as auto-width text without a `Text Background` frame.
- Tests cover visible viewport rect clamping for a long body/root and screenshot-cropped fallback bytes replacing the transparent placeholder when direct canvas serialization is unavailable.
- Tests cover lazy images whose `currentSrc/src` is a transparent placeholder while `data-src` contains a real SVG icon.
- `corepack pnpm test:e2e` passes and verifies default frames still import.
- `spectra validate improve-editable-auto-layout-import` passes.
- Manual recapture/import of the current CMoney page produces `Editable Accurate` with nested frames, at least header/sidebar/list flex containers using Auto Layout, and a non-empty raster fallback for the right-side market chart canvas.

**Scope boundaries:**

- In scope: DOM tree preserving renderer, conservative flex Auto Layout, mixed inline content preservation, visible CSS pseudo-element decoration capture/import, clipped single-line text fixed sizing, reverse flex visual child order, non-uniform implicit spacing skip guard, CSS padding capture and Auto Layout padding mapping, single-child text alignment including equal-height flex line boxes, text visual backing, invisible text backing avoidance, Figma HUG sizing for auto-width single-line text, CSS `white-space` text normalization, visible viewport rect clamping, canvas bitmap fallback with screenshot crop fallback, lazy image source selection, report counts, tests, docs.
- Out of scope: full-page screenshot stitching, canvas/SVG vectorization, variable generation, components, variants, responsive multi-viewport behavior.

## Risks / Trade-offs

- [Risk] Auto Layout can move children and reduce screenshot fidelity. → Mitigation: only enable for high-confidence flex containers and keep fixed frame size.
- [Risk] Nested frames can increase layer count and import time. → Mitigation: skip non-renderable one-child wrappers unless they are needed to preserve layout.
- [Risk] Classic runtime can drift from module renderer. → Mitigation: add classic runtime regression tests that inspect nested frame and layoutMode output.
- [Risk] Complex product pages contain grid, sticky, and virtualized regions. → Mitigation: keep absolute fallback with skipped reasons rather than forcing conversion.
