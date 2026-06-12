# V1 Usage and Acceptance

## Scope

V1 is a local-first Production UI to Figma import flow for UI designers. The designer opens the production page in Chrome, including logged-in or logged-out states, captures the current visible viewport or the full page, downloads one `.figcapture` file, and imports that file with the Figma Plugin. Visible viewport is the default capture mode; full page is an explicit popup choice.

V1 does not use a backend, cloud capture link, managed credentials, capture history, or team sharing. The designer's existing Chrome session is the source of truth.

The Chrome Extension declares host permissions for local asset fetching. This is required because production pages often load images from CDN and avatar domains different from the page origin. Captured bytes remain local and are only written into the downloaded `.figcapture`.

## Flow

1. Open the target production page in Chrome.
2. Use the Chrome Extension to capture the active tab's visible viewport.
3. Review the capture preview before download.
4. Confirm export to download one `.figcapture` package.
5. Open the Figma Plugin.
6. Select the `.figcapture` file.
7. Review the generated frames and import report in Figma.

## Capture Contract

The Chrome Extension captures only the current visible viewport. It records `viewportWidth`, `viewportHeight`, `devicePixelRatio`, `scrollX`, `scrollY`, source URL, capture timestamp, DOM tree data, computed style data, layout boxes, semantic attributes, source node identifiers, asset references, fallback references, screenshot reference, and diagnostics.

In visible viewport mode, captured layout boxes are clipped to the current viewport intersection. Long root, body, and page containers should not preserve full document height in `.figcapture`.

In full page mode, the runtime first scrolls through the page in viewport-height steps to trigger lazy loading, returns to the top, and captures the DOM once in document coordinates with capture bounds equal to the document size, so below-fold content is preserved without viewport clamping. It then captures one visible-tab screenshot per scroll segment and stitches them into a single full-page `screenshot.png` at document size times device pixel ratio. Elements with computed `position: fixed` or `sticky` appear exactly once: the DOM contains one copy at the top-of-page position, and segments after the first temporarily hide pinned elements before their screenshots, restoring original inline styles afterwards. The original scroll position is restored after capture, including on failure. Full page capture enforces a maximum document height of 20000 CSS pixels and a maximum of 25 segments; truncation records the captured height in the manifest plus a diagnostics warning and does not fail the capture. The manifest adds optional `captureMode`, `documentWidth`, and `documentHeight` fields; packages without them behave as viewport captures. Dynamic pages that change while scrolling (carousels, refreshing ads) can show minor differences between the stitched screenshot and the captured DOM; recapture if needed.

Capture traverses the rendered tree rather than the light DOM tree. Elements hosting an accessible shadow root contribute their shadow subtree; light DOM children appear only where slots project them. `<slot>` elements are replaced by their flattened projected content, falling back to slot default content when nothing is assigned, and assigned text nodes are captured as synthetic text nodes positioned by Range-derived rects. The content script reads closed shadow roots through `chrome.dom.openOrClosedShadowRoot` when available; an inaccessible closed shadow host with no renderable light children is marked and exported as a raster fallback region cropped from the viewport screenshot with the diagnostic reason `closed shadow root fallback`.

Captured direct text is normalized according to computed CSS `white-space`. Normal text flow collapses HTML template indentation and line breaks to browser-visible spacing. Preformatted modes such as `pre`, `pre-wrap`, and `break-spaces` preserve raw whitespace, while `pre-line` preserves line breaks without carrying indentation.

For visual assets, V1 records `img.currentSrc`, `img.src`, lazy image attributes such as `data-src` and srcset, inline SVG markup, parseable CSS `background-image`, `mask-image`, or `-webkit-mask-image` URLs, and serializable canvas bitmap data. During export, the package stores usable data URL bytes, inline SVG bytes, remote asset bytes, and canvas PNG fallback bytes when the local browser runtime can read them. If `currentSrc` or `src` is a transparent placeholder, export falls back to real lazy image candidates before packaging the asset. If a fallback region such as a chart canvas cannot be serialized directly, the extension attempts to crop the same region from the captured visible screenshot. Asset fetch, canvas serialization, or screenshot crop failures are recorded in diagnostics and do not block package export.

The `.figcapture` package contains:

- `manifest.json`
- `capture.json`
- `figma-plan.json`
- `screenshot.png`
- `diagnostics.json`
- `assets/` when image, SVG, CSS icon, or fallback assets exist

## Figma Output

The Figma Plugin creates two same-size frames by default. Viewport packages size both frames to the manifest viewport; full-page packages size both frames and the screenshot layer to `documentWidth` by `documentHeight`, in both the module and classic runtimes. The frames are:

- `Source Screenshot`: locked screenshot reference for visual comparison.
- `Editable Accurate`: visual-first editable output using measured geometry and captured DOM hierarchy. Text becomes editable text where possible: single-line labels, usernames, codes, and short numbers use auto width and Figma Hug sizing when they are inside Auto Layout, while multiline or constrained content keeps captured width for wrapping. Text with visible background, visible border, or shadow keeps a visual backing frame, preserving corner radius when that visible box exists. When a visible text box has explicit CSS padding, the backing frame maps that padding to Figma Auto Layout and the nested single-line text can hug its content. Invisible decoration such as transparent background plus radius does not force a fixed-width backing frame. Image elements become image layers, SVG assets become vector nodes when Figma can parse them, CSS image icons become image/vector assets when captured, visual boxes become shape layers, unsupported regions become raster fallback layers, and renderable containers become nested frames.

High-confidence captured `flex` and `inline-flex` containers become fixed-size Figma Auto Layout frames inside `Editable Accurate`. The importer infers layout axis, item spacing, padding, and supported CSS alignment from captured CSS and child geometry. Captured `align-items` maps to Figma counter-axis alignment, and captured `justify-content` maps to primary-axis alignment, so common web layouts such as centered top navigation menus keep their vertical and horizontal alignment as editable Auto Layout instead of baked-in offsets.

The Chrome Extension captures computed `paddingTop`, `paddingRight`, `paddingBottom`, and `paddingLeft`. Figma import prefers those explicit padding values for Auto Layout frames, with child-geometry inference as a fallback for older captures. Containers using `justify-content: space-between` preserve padding because Figma SPACE_BETWEEN distributes children inside the padded content box.

Captured `flex-direction: row-reverse` and `column-reverse` preserve browser visual order in Figma Auto Layout. The importer reverses child insertion order only for applied Auto Layout frames because Figma does not expose a CSS-style reverse direction flag.

Flex containers with strongly non-uniform implicit child gaps remain nested absolute frames when captured CSS does not provide equivalent alignment semantics. This preserves rows such as a left action cluster plus a right-aligned response count instead of turning the largest empty area into a repeated Figma item spacing value.

Single-child text containers can also become fixed-size Auto Layout frames when captured CSS provides explicit flex alignment or line-height line box evidence. This preserves vertical centering for common header links, tabs, and action labels without enabling Auto Layout for arbitrary one-child wrappers. Explicit flex alignment is preserved even when the captured child line box is the same height as the parent, because Figma Text nodes render from font metrics rather than the browser line box.

Risky containers remain nested absolute frames instead of being forced into Auto Layout. The report records skipped reasons such as `complex-grid`, `fixed-or-sticky-layout`, `overlapping-layout`, `missing-bounds`, `one-child-container`, `out-of-bounds-child`, and `non-uniform-spacing`.

Imported layers use semantic names derived from captured data through a fixed priority chain: HTML semantic tags (`header` becomes `Header`, `nav` becomes `Navigation`, `footer` becomes `Footer`, `button` becomes `Button`, `ul` becomes `List`, and similar), then ARIA roles (`banner`, `navigation`, `contentinfo`, `dialog`, and other landmark or widget roles), then geometric heuristics for `div`-only sites (a top-pinned full-width container becomes `Header`, a bottom-pinned one becomes `Footer`, a visible rounded or shadowed box with multiple children becomes `Card`), then whole-token class name matching (`btn`, `card`, `modal`, `badge`, and similar). Unmatched nodes keep the default technical names such as `Frame / div`. Interactive and heading layers append an `aria-label` or single-line text suffix, for example `Button / 登入`.

Repeated sibling structures under the same parent are detected by a structural signature (tag name, class tokens, first-level child tag sequence) and named with a 1-based index in visual order, for example `Card 1`, `Card 2`, `Card 3`. Non-visual wrapper frames — exactly one renderable child, no visible styling, the same bounds as the child within 1px, no Auto Layout involvement, and no semantic name — are collapsed out of the layer tree while every remaining node keeps its absolute position and size. Semantic naming failures never block import; affected layers fall back to default names.

Frame names include source identity, viewport size, and role, for example:

- `Dashboard / 1440x900 / Source Screenshot`
- `Dashboard / 1440x900 / Editable Accurate`

## Fallback Types

V1 uses image or raster fallback output for surfaces that cannot be represented reliably as editable Figma nodes in the first phase:

- `img`: image layer with asset reference.
- inline `svg`: vector node when SVG markup is available and Figma can parse it.
- CSS `background-image` / `mask-image`: image or vector asset when the first `url(...)` is parseable and readable.
- `canvas`: raster fallback with `canvas fallback` reason, using the current canvas bitmap when serialization is allowed, or a visible screenshot crop of the same viewport rect when direct serialization is blocked and crop APIs are available.
- `iframe`: raster fallback with `iframe fallback` reason.
- `video`: raster fallback with `video fallback` reason.
- complex `svg` without captured markup: raster fallback with `complex svg fallback` reason.

Fallback counts and reasons are visible in diagnostics and import report output.

## Acceptance Checks

Run the workspace checks:

```bash
corepack pnpm build
corepack pnpm test
corepack pnpm test:e2e
```

The e2e smoke must prove that a SaaS/dashboard visible viewport fixture can be captured, exported as `.figcapture`, validated by the Figma Plugin importer, and rendered through a mocked Figma API into exactly two default frames.

The Editable Accurate frame must contain nested frames rather than flattening every primitive layer as a direct sibling. At least one reliable flex region in the fixture should import as a HORIZONTAL or VERTICAL Auto Layout frame. A flex row with `align-items: center` must import with centered counter-axis alignment, and a flex row with centered or spaced `justify-content` must import with the corresponding primary-axis alignment. A single-child text container with line-height evidence must preserve vertical centering instead of placing the text at the top edge.

Padded Auto Layout containers must preserve their padding. In particular, a column with `justify-content: space-between` and 16px insets should import with `primaryAxisAlignItems: SPACE_BETWEEN` and 16px top, right, bottom, and left padding.

Reverse flex containers must preserve browser visual order. A row with `flex-direction: row-reverse` and DOM children `打賞`, `分享`, `留言`, `讚` should import as a horizontal Auto Layout frame whose child order is `讚`, `留言`, `分享`, `打賞`.

Rows with non-uniform implicit spacing must preserve captured absolute positions. A row with child x positions 0, 60.16, and 633 inside a 696px parent should not become a HORIZONTAL Auto Layout frame with a repeated 521px item spacing.

Captured data URL raster images must import as Figma image fills. Captured inline SVG assets must import as editable SVG-derived nodes when `createNodeFromSvg` is available. Captured CSS icon URLs must appear in the archive as assets or in diagnostics as missing assets.

Lazyloaded image icons whose `src/currentSrc` is a transparent placeholder and whose real source is in `data-src` or srcset must package the real source. SVG lazy image candidates must keep SVG asset kind detection so Figma can import them as vector nodes.

Serializable canvas content must appear in the archive as a fallback PNG asset. If canvas serialization is blocked but screenshot crop APIs are available, the fallback asset must use the viewport screenshot crop instead of the transparent placeholder. If both paths are blocked, the package must still import with a visible placeholder and a `canvas fallback` diagnostic.

Shadow DOM content must be captured from the rendered tree. An open shadow root subtree must appear in `capture.json` as ordinary element nodes while unslotted light DOM children do not. Named and default slot projections must appear at the slot position without a node for the `<slot>` element itself, nested slot projection must be flattened, and assigned text nodes must import via Range-derived rects when the Range API is available. An inaccessible closed shadow host must export as a screenshot crop fallback asset with the diagnostic reason `closed shadow root fallback`, and crop failures must record a missing asset without blocking export or import. The pure capture module and the injected content script must produce the same captured tree for the same DOM input, with the pure module accepting an injected open-or-closed shadow root accessor.

Visible viewport captures must not preserve full document-height root/body geometry. A long page body should be clipped to the viewport height in `capture.json`, while offscreen children remain excluded.

Full page captures must preserve below-fold content in document coordinates without viewport clamping. The popup must default to visible viewport mode, and viewport captures must not change in behavior or package contents. Manifest validation must accept `captureMode` values of `viewport` or `full-page` only, and full-page manifests must carry positive `documentWidth` and `documentHeight`. The full-page flow must request page metrics, pre-scroll to the bottom, capture the DOM at the top, capture and stitch one screenshot per segment at scroll-offset positions, hide pinned elements after the first segment, and restore scroll position and pinned visibility on completion or failure. Pages beyond 20000 CSS pixels or 25 segments must truncate with a diagnostics warning instead of failing. Full-page packages must import as document-sized frames with a document-sized screenshot layer in both plugin runtimes.

Single-line captured text must use auto width in Figma so font substitution does not wrap labels, usernames, codes, or short numbers. In Auto Layout rows such as top bar menus, those text nodes should also use Hug sizing rather than fixed or fill width. Long or multiline captured text must keep its captured width so production wrapping is preserved. Text with visible background or border must keep that backing shape while remaining editable. If the visible text box has explicit CSS padding, the backing frame must preserve that padding as Figma Auto Layout padding and keep the nested single-line text Hug-sized. Transparent rounded button labels with no visible border or shadow must remain auto-width text. Direct text captured from normal HTML flow must not preserve framework/template indentation that was collapsed by the browser.

Semantic layer naming must follow the priority chain. A captured `header`, `nav`, or `footer` element must import as `Header`, `Navigation`, or `Footer`, and a `button` with `aria-label` or single-line text `登入` must import as `Button / 登入`. Class token matching must match whole tokens only: class `product-card` imports as `Card` while class `scarden` keeps the default name. Repeated sibling cards with the same structural signature must import as `Card 1`, `Card 2` in visual order. A transparent same-size single-child wrapper must collapse out of the layer tree with the child's absolute rect unchanged, while semantic wrappers such as `nav` and direct children of applied Auto Layout frames must not be collapsed. The classic plugin runtime must produce the same layer names, collapsed tree shape, and semantic statistics as the module runtime for the same `.figcapture` input.

The import report must show created frame count, created node count, fallback count, missing asset count, unsupported style count, applied/skipped auto layout confidence summary, and the semantic naming summary (semantically named layer count, repeated group count, collapsed wrapper count) without requiring raw JSON inspection. Missing semantic statistics must display as zero.

## Future Scope

These capabilities are intentionally outside V1:

- horizontal segmentation for ultra-wide pages
- complete loading of infinite-scroll feeds beyond the capture limits
- multi-viewport batch capture for desktop, tablet, and mobile
- cloud capture links or backend storage
- Figma variables
- Figma components and component variants
- hover, disabled, pressed, or other interactive state variants
- auth or session management inside the product
- production deployment pipeline
- forced Auto Layout conversion for complex CSS grid, sticky overlays, overlapping layouts, one-child wrappers, out-of-bounds child placement, 0/1px nonvisual wrapper structures, or non-uniform implicit spacing rows
- guaranteed remote asset fetch for every third-party CDN or credential-gated image

Capture metadata is preserved so later changes can add full-page capture, multi-viewport capture, variables, components, and state variants without replacing the V1 package boundary.
