# Manual Runtime Test

This checklist verifies the V1 runtime path: Chrome Extension capture of the current visible viewport or the full page, local `.figcapture` download, and Figma Plugin import into editable frames.

## Prerequisites

- Dependencies installed with `corepack pnpm install`.
- Google Chrome with extension developer mode available.
- Figma Desktop or Figma in a browser session that supports importing development plugins.
- This repository checked out locally.

## Build

From the repository root:

```bash
corepack pnpm build
```

Expected build artifacts:

- `apps/chrome-extension/dist/manifest.json`
- `apps/chrome-extension/dist/background.js`
- `apps/chrome-extension/dist/popup.html`
- `apps/chrome-extension/dist/vendor/capture-schema.js`
- `apps/figma-plugin/dist/manifest.json`
- `apps/figma-plugin/dist/code.js`
- `apps/figma-plugin/dist/ui.html`
- `apps/figma-plugin/dist/vendor/capture-schema.js`

After rebuilding, reload both development runtimes before testing this asset flow:

- Chrome: open `chrome://extensions` and click reload for `Production UI to Figma Capture`, or load `apps/chrome-extension/dist` again.
- Figma: rerun the development plugin from `apps/figma-plugin/dist/manifest.json`.

Existing `.figcapture` files do not gain missing image/SVG data, lazy image source fixes, text normalization, visible viewport clipping, or screenshot-cropped canvas fallback retroactively. Generate a new capture after reloading the Chrome Extension when validating image/SVG capture, lazyloaded icons, CSS `white-space` text normalization, long-page geometry, or chart/canvas fallback output.

Importer-only fixes, such as Figma Auto Layout alignment mapping or padded text backing conversion, can be tested by reloading only the Figma Plugin and re-importing an existing `.figcapture` when that capture already includes the relevant computed style data.

The Chrome Extension declares broad host permissions so the local background runtime can fetch images from the production page's CDN, avatar hosts, and other asset domains. The extension remains local-first: fetched bytes are written only into the downloaded `.figcapture`.

## Start A Deterministic Local Page

From the repository root:

```bash
python3 -m http.server 4177
```

Open this URL in Chrome:

```text
http://127.0.0.1:4177/fixtures/dashboard/manual-fixture.html
```

Set the browser viewport to a desktop-sized window before capturing. This page includes text, cards, an image, visual assets, a canvas bitmap fallback, and below-fold content.

## Load The Chrome Extension

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select `apps/chrome-extension/dist`.
5. Keep the fixture page tab active.
6. Open the extension popup and click `Capture viewport`.

Expected popup result:

- Screenshot preview is visible.
- Source URL shows the fixture URL.
- Viewport width and height are visible.
- Fallback, missing asset, unsupported style, and package status counts are visible.
- `Download .figcapture` is disabled before a ready preview and enabled after the preview is ready.

Click `Download .figcapture`.

Expected download result:

- One file downloads with a `.figcapture` extension.
- If renamed as `.zip`, it contains `manifest.json`, `capture.json`, `figma-plan.json`, `diagnostics.json`, `screenshot.png`, and `assets/` when image, SVG, CSS icon, or fallback assets exist.
- Data URL images, resolved image bytes, lazy image sources from `data-src` / srcset when `src` is a transparent placeholder, inline SVG markup, parseable CSS `background-image` / `mask-image` URLs, serializable canvas bitmaps, and screenshot crops for unserializable fallback regions are stored as assets when available.
- Visible viewport packages clip captured geometry to the current viewport. Long root/body/page containers should not appear in `capture.json` with full document height during V1 visible viewport capture.
- Direct text follows captured CSS `white-space` semantics: normal text collapses HTML template indentation to browser-visible spacing, while preformatted text preserves intended whitespace.
- If an asset cannot be read, `diagnostics.json` records a missing asset warning and the node remains visible as a placeholder during import.

## Load The Figma Plugin

1. Open Figma.
2. Create or open a design file.
3. Use `Plugins` -> `Development` -> `Import plugin from manifest`.
4. Select `apps/figma-plugin/dist/manifest.json`.
5. Run the `Production UI Import` development plugin.
6. Select the downloaded `.figcapture` file.

Expected Figma result:

- The plugin UI moves through reading/importing states without raw JSON inspection.
- On success, the plugin UI shows frame count, node count, fallback count, missing asset count, unsupported style count, font substitution count, and auto layout summary.
- The canvas contains two same-size frames:
  - `Source Screenshot`
  - `Editable Accurate`
- `Source Screenshot` contains a locked screenshot image layer.
- `Editable Accurate` contains nested container frames that preserve the captured DOM parent-child structure.
- Editable text nodes, image layers, SVG vector layers, CSS icon assets, rectangle layers, and fallback image layers are nested inside their nearest rendered parent frame instead of being flattened as direct siblings.
- Editable text nodes choose resize behavior from captured geometry: single-line labels, usernames, codes, and short numbers use auto width and Figma Hug sizing when they are inside Auto Layout; multiline or constrained text keeps captured width for wrapping. Text nodes with visible backgrounds, visible borders, or shadow keep a visual backing frame behind the editable text. If that visible text box has explicit CSS padding, the backing frame should become fixed-size Auto Layout with matching padding and a Hug-sized editable text child. Invisible decorative styles such as transparent background plus border radius do not force a fixed-width backing frame, so action labels can hug their content.
- Captured padding is preserved for Auto Layout containers. Padded panels using `justify-content: space-between` should keep their Figma padding instead of collapsing top and bottom padding to zero.
- Text imported from normal HTML flow should not contain source indentation that was not visible in the browser, for example a volume row should import as `成交量 44,279 張` rather than preserving template newlines and spaces.
- Inline SVG assets import through Figma SVG node creation when supported, so common icons can be edited as vector nodes.
- Lazyloaded SVG icons should not import as 1x1 transparent placeholder images when the DOM includes a real source in `data-src` or srcset.
- High-confidence `flex` or `inline-flex` containers become Figma Auto Layout frames with fixed size, inferred axis, item spacing, padding, and CSS-derived alignment. Captured `align-items` maps to Figma counter-axis alignment, and captured `justify-content` maps to primary-axis alignment, so vertically centered menu bars remain centered without extra padding.
- Flex rows or columns with strongly non-uniform implicit gaps, such as a left action cluster plus a right-aligned count created by auto margins, should remain ordinary nested frames so their captured x/y positions stay visually correct.
- Captured `flex-direction: row-reverse` and `column-reverse` preserve browser visual order by reversing Figma Auto Layout child insertion order. Absolute fallback frames still keep captured DOM order and x/y geometry.
- Single-child text containers with explicit flex alignment or line-height line box evidence become fixed-size Auto Layout frames that preserve vertical centering. Flex menu labels keep this alignment even when the captured child line box is the same height as the parent. Ordinary one-child wrappers without alignment evidence remain absolute.
- Canvas elements import as raster fallback image layers using the current canvas bitmap when the browser can serialize it. If direct canvas serialization is blocked but the visible screenshot crop APIs are available, chart-like canvas regions import as cropped viewport screenshot assets instead of transparent placeholders.
- Risky containers remain ordinary nested frames with absolute child positions. Current skipped reasons include `complex-grid`, `fixed-or-sticky-layout`, `overlapping-layout`, `missing-bounds`, `one-child-container`, `out-of-bounds-child`, and `non-uniform-spacing`.
- Auto layout applied/skipped counts are summarized in the report and are not emitted as a separate default frame in V1.

## Full Page Capture Check

Open the dashboard fixture again (it includes below-fold content), select `Full page` in the popup mode chooser, and click capture.

Expected capture result:

- The page scrolls to the bottom and back automatically, then returns to its original scroll position.
- The popup preview shows `full-page` as the capture mode plus the document width and height, and the screenshot preview shows the entire page, not just the first viewport.
- The downloaded `.figcapture` manifest contains `captureMode: "full-page"` with `documentWidth` and `documentHeight`; `capture.json` includes below-fold nodes with document-coordinate geometry.
- Fixed or sticky headers appear once at the top of the stitched screenshot instead of repeating per segment.
- Importing into Figma creates two frames sized to the document dimensions, with below-fold content present in `Editable Accurate`.
- Capturing with `Visible viewport` selected still behaves exactly as before.
- Pages taller than 20000 CSS pixels (or beyond 25 segments) are truncated, and `diagnostics.json` records a `full-page capture truncated` warning.

## Web Components Fixture Check

Open this URL in Chrome (with the same local server running):

```text
http://127.0.0.1:4177/fixtures/web-components/manual-fixture.html
```

The page renders three blocks: an open shadow root widget, a slotted card (named slot, default slot, and slotted plain text), and a closed shadow root widget. Capture the viewport and import the `.figcapture` into Figma.

Expected capture and import result:

- The open shadow root panel imports as editable layers: heading text, paragraph text, and the blue button are visible and editable inside the host frame.
- The slotted card shows the projected title `投影的卡片標題` at the named slot position and the projected plain text `投影的純文字內容` in the body. No layer named after the `slot` element itself appears.
- Removing the `slot="title"` element from the fixture and re-capturing shows the default `預設標題` content instead.
- The closed shadow root block imports as editable layers when Chrome exposes `chrome.dom.openOrClosedShadowRoot` to the content script (the normal case in Chrome). In browsers or contexts without that API, the block imports instead as a raster fallback layer cropped from the viewport screenshot, `diagnostics.json` records the reason `closed shadow root fallback`, and when the crop APIs are also unavailable the import still succeeds with a missing asset diagnostic.

## Error Checks

- Capturing a restricted Chrome page reports a readable runtime category instead of downloading.
- Confirming export without a ready preview reports `missing-pending-capture`.
- Importing an invalid package reports an `IMPORT_ERROR` category and creates no Figma nodes.

## V1 Limits

- No backend or cloud capture link.
- Full page capture is limited to 20000 CSS pixels of document height and 25 segments; longer pages truncate with a diagnostics warning.
- Dynamic content that changes while scrolling (carousels, refreshing ads) can differ slightly between the stitched screenshot and the captured DOM.
- No horizontal segmentation for ultra-wide pages.
- No multi-viewport batch capture.
- No Figma variables.
- No Figma components.
- No component variants.
- No hover, disabled, pressed, or other interactive state capture.
- Complex CSS grid, sticky overlays, overlapping layouts, one-child containers, containers with out-of-bounds or 0/1px nonvisual wrapper children, and flex rows with non-uniform implicit spacing are intentionally not forced into Auto Layout.
- Canvas can still fall back to a transparent placeholder when both direct serialization and screenshot crop APIs are blocked or unsupported.
- Remote image and icon fetches can still fail because of browser, CORS, credential, or host response limits.
- Blocked or invalid assets remain visible through diagnostics and placeholders instead of being silently dropped.
