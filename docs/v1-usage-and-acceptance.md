# V1 Usage and Acceptance

## Scope

V1 is a local-first Production UI to Figma import flow for UI designers. The designer opens the production page in Chrome, including logged-in or logged-out states, captures the current visible viewport, downloads one `.figcapture` file, and imports that file with the Figma Plugin.

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

Because V1 is visible viewport only, captured layout boxes are clipped to the current viewport intersection. Long root, body, and page containers should not preserve full document height in `.figcapture`; full-page capture will use a separate segmented model later.

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

The Figma Plugin creates two same-size frames by default:

- `Source Screenshot`: locked screenshot reference for visual comparison.
- `Editable Accurate`: visual-first editable output using measured geometry and captured DOM hierarchy. Text becomes editable text where possible: single-line labels, usernames, codes, and short numbers use auto width and Figma Hug sizing when they are inside Auto Layout, while multiline or constrained content keeps captured width for wrapping. Text with visible background, visible border, or shadow keeps a visual backing frame, preserving corner radius when that visible box exists. When a visible text box has explicit CSS padding, the backing frame maps that padding to Figma Auto Layout and the nested single-line text can hug its content. Invisible decoration such as transparent background plus radius does not force a fixed-width backing frame. Image elements become image layers, SVG assets become vector nodes when Figma can parse them, CSS image icons become image/vector assets when captured, visual boxes become shape layers, unsupported regions become raster fallback layers, and renderable containers become nested frames.

High-confidence captured `flex` and `inline-flex` containers become fixed-size Figma Auto Layout frames inside `Editable Accurate`. The importer infers layout axis, item spacing, padding, and supported CSS alignment from captured CSS and child geometry. Captured `align-items` maps to Figma counter-axis alignment, and captured `justify-content` maps to primary-axis alignment, so common web layouts such as centered top navigation menus keep their vertical and horizontal alignment as editable Auto Layout instead of baked-in offsets.

The Chrome Extension captures computed `paddingTop`, `paddingRight`, `paddingBottom`, and `paddingLeft`. Figma import prefers those explicit padding values for Auto Layout frames, with child-geometry inference as a fallback for older captures. Containers using `justify-content: space-between` preserve padding because Figma SPACE_BETWEEN distributes children inside the padded content box.

Captured `flex-direction: row-reverse` and `column-reverse` preserve browser visual order in Figma Auto Layout. The importer reverses child insertion order only for applied Auto Layout frames because Figma does not expose a CSS-style reverse direction flag.

Flex containers with strongly non-uniform implicit child gaps remain nested absolute frames when captured CSS does not provide equivalent alignment semantics. This preserves rows such as a left action cluster plus a right-aligned response count instead of turning the largest empty area into a repeated Figma item spacing value.

Single-child text containers can also become fixed-size Auto Layout frames when captured CSS provides explicit flex alignment or line-height line box evidence. This preserves vertical centering for common header links, tabs, and action labels without enabling Auto Layout for arbitrary one-child wrappers. Explicit flex alignment is preserved even when the captured child line box is the same height as the parent, because Figma Text nodes render from font metrics rather than the browser line box.

Risky containers remain nested absolute frames instead of being forced into Auto Layout. The report records skipped reasons such as `complex-grid`, `fixed-or-sticky-layout`, `overlapping-layout`, `missing-bounds`, `one-child-container`, `out-of-bounds-child`, and `non-uniform-spacing`.

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

Visible viewport captures must not preserve full document-height root/body geometry. A long page body should be clipped to the viewport height in `capture.json`, while offscreen children remain excluded.

Single-line captured text must use auto width in Figma so font substitution does not wrap labels, usernames, codes, or short numbers. In Auto Layout rows such as top bar menus, those text nodes should also use Hug sizing rather than fixed or fill width. Long or multiline captured text must keep its captured width so production wrapping is preserved. Text with visible background or border must keep that backing shape while remaining editable. If the visible text box has explicit CSS padding, the backing frame must preserve that padding as Figma Auto Layout padding and keep the nested single-line text Hug-sized. Transparent rounded button labels with no visible border or shadow must remain auto-width text. Direct text captured from normal HTML flow must not preserve framework/template indentation that was collapsed by the browser.

The import report must show created frame count, created node count, fallback count, missing asset count, unsupported style count, and applied/skipped auto layout confidence summary without requiring raw JSON inspection.

## Future Scope

These capabilities are intentionally outside V1:

- full-page segmented capture
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
