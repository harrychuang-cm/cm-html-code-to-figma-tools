## ADDED Requirements

### Requirement: Inline SVG markup is normalized for Figma vector import
The Chrome Extension SHALL normalize inline SVG markup before packaging SVG assets for Figma import. The normalized markup MUST preserve SVG geometry, `defs`, clipping references, gradient references, and text content. The normalized markup MUST replace browser-resolved color expressions from presentation attributes, inline styles, and class-based SVG styles with concrete SVG-compatible values when browser computed styles are available. This includes `currentColor`, CSS custom property references, `fill`, `stroke`, `color`, opacity-related presentation values, text font presentation values, and gradient `stop-color` / `stop-opacity` values. The normalization MUST NOT rasterize SVG content.
The exporter SHALL package normalized inline SVG markup as vector assets even when the SVG is a complex chart with text labels, many visual descendants, or `role="img"`. The exporter MUST keep raster fallback behavior for inline SVG markup that contains high-risk SVG features that cannot be safely handed to Figma vector import.

#### Scenario: CSS variable fills become concrete colors

- **WHEN** a captured inline SVG shape uses a fill value such as `var(--b-theme-primary, #4c6ef5)` and the browser computed fill is available
- **THEN** the packaged SVG asset uses a concrete resolved color for that shape instead of the raw CSS custom property expression

##### Example: chart column color

- **GIVEN** an inline SVG `rect` has `fill="var(--b-theme-primary, var(--bs-primary, #4c6ef5))"` and computed fill `rgb(76, 110, 245)`
- **WHEN** the Chrome Extension packages the SVG asset
- **THEN** the asset markup contains `fill="rgb(76, 110, 245)"` for that rect
- **AND** the asset markup does not contain `fill="var(--b-theme-primary, var(--bs-primary, #4c6ef5))"` for that rect

#### Scenario: Gradient stops preserve resolved colors

- **WHEN** a captured inline SVG gradient stop uses `currentColor`, CSS custom property values, inline style values, or class-based styles for stop color or stop opacity
- **THEN** the packaged SVG asset preserves the gradient structure and writes resolved `stop-color` and `stop-opacity` values into the relevant `stop` elements

##### Example: gradient stop normalization

- **GIVEN** an inline SVG `linearGradient` contains a `stop` with `stop-color="var(--chart-start, #ff6b6b)"`, computed stop color `rgb(255, 107, 107)`, and computed stop opacity `0.72`
- **WHEN** the Chrome Extension packages the SVG asset
- **THEN** the asset markup keeps the `linearGradient` element and its id
- **AND** the stop contains `stop-color="rgb(255, 107, 107)"`
- **AND** the stop contains `stop-opacity="0.72"`

#### Scenario: Unsupported SVG normalization keeps existing fallback path

- **WHEN** inline SVG normalization cannot read computed styles for a descendant or cannot serialize a normalized clone
- **THEN** the capture still packages an SVG asset using the best available markup
- **AND** Figma import continues to use the existing SVG vector import path with existing image or placeholder fallback on import failure

#### Scenario: Normalized complex chart is packaged as vector

- **WHEN** a captured inline SVG chart has `role="img"`, multiple `rect` elements, text labels, and normalized `svgMarkup`
- **THEN** the package contains a SVG vector asset for the chart
- **AND** the captured SVG node references that asset through `assetRef`
- **AND** the package does not create a raster fallback asset for that chart

##### Example: grouped column chart

- **GIVEN** an inline SVG chart contains at least ten column `rect` elements, axis `text` labels, and normalized concrete `fill` colors
- **WHEN** the Chrome Extension packages visual assets
- **THEN** the package contains `assets/vector-1.svg`
- **AND** `diagnostics.fallbackReasons` does not contain `complex svg fallback` for the chart node

#### Scenario: High-risk inline SVG keeps raster fallback

- **WHEN** a captured inline SVG contains `foreignObject`, script-like content, embedded iframe, embedded canvas, embedded video, or event-handler attributes
- **THEN** the package keeps the existing raster fallback behavior for that SVG
- **AND** diagnostics record the fallback reason for that source node

##### Example: foreignObject fallback

- **GIVEN** an inline SVG contains `<foreignObject><div>HTML label</div></foreignObject>`
- **WHEN** the Chrome Extension packages visual assets
- **THEN** the package contains `assets/fallback-1.png`
- **AND** `diagnostics.fallbackReasons` contains `complex svg fallback` for the SVG node
