## Why

Transparent horizontal text rows such as calendar date headers can be captured with a DOM rect that spans a much taller parent cell even though their actual content is only one short row. Importing those wrappers as fixed-height Figma auto-layout frames creates overly tall label containers with top-aligned mixed-height text, and each similar HTML/CSS pattern would otherwise require another one-off correction. Some date surfaces also render inside readable `about:blank` or same-origin iframes; treating every iframe as a raster fallback turns otherwise editable calendar content into a screenshot.

## What Changes

- Detect transparent horizontal flex rows and inferred non-flex horizontal text flows through reusable structure, style, and geometry signals: single-line text-only children, no visual box styling, leading-edge child bounds, and content height much smaller than the captured parent height.
- Import those rows with `counterAxisSizingMode: AUTO` so the Figma frame hugs content height.
- Force `counterAxisAlignItems: CENTER` so mixed-height text labels are vertically centered.
- Preserve fixed counter-axis sizing for normal visual containers, clipped cards, nav rows, and real full-height layout wrappers.
- Avoid node-specific, text-specific, class-specific, URL-specific, or source-app-specific overrides so future similar HTML/CSS captures use the same rule.
- Capture accessible iframe document children with parent-page coordinates so readable embedded content remains editable.
- Keep raster iframe fallback only when the iframe subtree is unavailable or empty.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `production-ui-import`: transparent leading text rows, including inferred non-flex horizontal flows, should hug their counter-axis content and vertically center mixed-height text labels; accessible iframe subtrees should remain editable instead of becoming screenshots.

## Impact

- Affected specs: production-ui-import
- Affected code:
  - Modified: apps/figma-plugin/src/layout-tree.ts
  - Modified: apps/figma-plugin/src/renderer.ts
  - Modified: apps/figma-plugin/src/figma-adapter.ts
  - Modified: apps/figma-plugin/src/code-classic.js
  - Modified: apps/figma-plugin/test/layout-tree.test.mjs
  - Modified: apps/figma-plugin/test/runtime-import.test.mjs
  - Modified: apps/figma-plugin/test/plugin-scaffold.test.mjs
  - Modified: apps/chrome-extension/src/capture-core.ts
  - Modified: apps/chrome-extension/src/asset-capture.ts
  - Modified: apps/chrome-extension/test/capture-core.test.mjs
  - Modified: apps/chrome-extension/test/asset-capture.test.mjs
  - New: openspec/changes/fix-calendar-date-header-hug-height/
