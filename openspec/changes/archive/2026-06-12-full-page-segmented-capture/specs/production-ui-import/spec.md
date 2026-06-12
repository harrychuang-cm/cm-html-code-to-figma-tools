## ADDED Requirements

### Requirement: Full-page capture mode selection
The Chrome Extension popup SHALL offer a capture mode choice between visible viewport and full page. Visible viewport SHALL remain the default. When visible viewport is selected, capture behavior, package contents, and Figma output SHALL be identical to the existing viewport-only flow.

#### Scenario: Default mode is visible viewport
- **WHEN** the designer opens the popup and captures without changing the mode
- **THEN** the produced package matches the existing visible viewport behavior with no full-page manifest fields

#### Scenario: Full page mode can be selected
- **WHEN** the designer selects full page mode and captures
- **THEN** the runtime performs segmented full-page capture and the preview shows the full-page mode and document size

### Requirement: Full-page DOM capture in document coordinates
In full page mode the capture SHALL scroll to the top of the page and capture the DOM tree once, using document coordinates. The capture SHALL accept capture bounds independent of the viewport: visibility filtering and geometry clamping SHALL use the document bounds while viewport metadata still records the actual window size. Below-fold content within the document bounds SHALL be preserved without viewport clamping.

#### Scenario: Below-fold content is preserved
- **WHEN** a node lies fully below the first viewport but within the document height
- **THEN** the captured tree contains the node with its document-coordinate rect unclamped

#### Scenario: Viewport mode clipping is unchanged
- **WHEN** capture runs without capture bounds overrides
- **THEN** visibility filtering and clamping behave exactly as the existing viewport capture

### Requirement: Lazy loading pre-scroll
In full page mode the runtime SHALL scroll through the page to the bottom in viewport-height steps before DOM capture, waiting for rendering to settle after each step, so lazy-loaded content is triggered. After capture completes the runtime SHALL restore the original scroll position.

#### Scenario: Pre-scroll precedes DOM capture
- **WHEN** a full page capture runs
- **THEN** the runtime requests page metrics, scrolls through segments to the bottom, returns to the top, and only then captures the DOM

#### Scenario: Scroll position is restored on failure
- **WHEN** any segmented capture step fails
- **THEN** the page scroll position and any hidden pinned elements are restored and the error reports an existing runtime error category

### Requirement: Segmented screenshot stitching
In full page mode the runtime SHALL capture one visible-tab screenshot per scroll segment and stitch the segments into a single full-page `screenshot.png` sized to the document dimensions multiplied by the device pixel ratio, drawing each segment at its scroll offset. The stitch function SHALL accept injected canvas and bitmap factories. When the stitching environment lacks the required canvas APIs, full page capture SHALL fail with the `screenshot-failed` category.

#### Scenario: Segments are drawn at scroll offsets
- **WHEN** three segments with scroll offsets 0, 800, and 1600 are stitched at device pixel ratio 2
- **THEN** the output canvas is the document size at 2x and each segment draws at y offsets 0, 1600, and 3200

#### Scenario: Missing canvas APIs fail cleanly
- **WHEN** the stitching environment lacks the required canvas APIs
- **THEN** full page capture reports the `screenshot-failed` category without downloading a package

### Requirement: Pinned element deduplication
Fixed and sticky positioned elements SHALL appear exactly once in full-page output. The DOM capture at the top of the page SHALL contain one copy at the top-of-page position. For screenshot segments after the first, the content script SHALL temporarily hide elements whose computed position is fixed or sticky and SHALL restore their original inline styles after the last segment.

#### Scenario: Fixed header appears once
- **WHEN** a page with a fixed header is captured in full page mode
- **THEN** the captured DOM contains one header node and segments after the first hide the header before their screenshots

#### Scenario: Hidden elements are restored
- **WHEN** the segmented screenshot pass completes or fails
- **THEN** every element hidden for deduplication has its original inline style restored

### Requirement: Full-page capture limits
Full page capture SHALL enforce a maximum captured document height of 20000 CSS pixels and a maximum of 25 segments, stopping at whichever limit is reached first. When truncated, the manifest SHALL record the actually captured document height and diagnostics warnings SHALL record a full-page capture truncated message. Truncation SHALL NOT fail the capture.

#### Scenario: Overlong page is truncated with diagnostics
- **WHEN** a page taller than 20000 CSS pixels is captured in full page mode
- **THEN** the package exports with a 20000-pixel document height and a truncation warning in diagnostics

### Requirement: Full-page manifest fields
The manifest SHALL support optional fields `captureMode`, `documentWidth`, and `documentHeight`. Validation SHALL accept packages without these fields. When `captureMode` is present it MUST be `viewport` or `full-page`; when it is `full-page`, `documentWidth` and `documentHeight` MUST be positive numbers. Existing viewport packages SHALL remain valid without changes.

#### Scenario: Viewport packages remain valid
- **WHEN** an existing package without capture mode fields is validated
- **THEN** validation passes unchanged

#### Scenario: Invalid capture mode is rejected
- **WHEN** a manifest declares `captureMode` of `partial`
- **THEN** validation reports a manifest error

### Requirement: Full-page Figma frames
When the manifest declares full-page capture, the Figma Plugin SHALL create the `Source Screenshot` and `Editable Accurate` frames sized to `documentWidth` by `documentHeight`, with the screenshot layer at the same size. The module runtime and classic runtime SHALL size frames identically. Packages without full-page fields SHALL keep viewport-sized frames.

#### Scenario: Full-page frames use document size
- **WHEN** a package with `captureMode: full-page`, document width 1440, and document height 5200 is imported
- **THEN** both frames and the screenshot layer are 1440 by 5200 in both the module and classic runtimes

#### Scenario: Viewport packages keep viewport frames
- **WHEN** a package without full-page fields is imported
- **THEN** frames use the manifest viewport width and height as today
