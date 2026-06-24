## Why

Some checked checkbox SVGs use `stroke-dasharray` as a draw-animation implementation detail. In Google Calendar the dash length equals the full check path length, so the browser renders it as a solid check. Figma imports the dash array as an editable dashed stroke, causing a visually dashed check even after the icon shape and sizing are correct.

## What Changes

- Before `createNodeFromSvg`, the Figma plugin removes `stroke-dasharray` only when the first dash length covers the full geometry length and `stroke-dashoffset` is absent or zero.
- Real dashed strokes, such as short repeating `4 4` dash arrays, remain unchanged.
- Module and classic plugin runtimes use the same import normalization.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `production-ui-import`: full-length SVG stroke dash arrays used for final-state draw animations should import as solid strokes in Figma.

## Impact

- Affected specs: production-ui-import
- Affected code:
  - Modified: apps/figma-plugin/src/figma-adapter.ts
  - Modified: apps/figma-plugin/src/code-classic.js
  - Modified: apps/figma-plugin/test/runtime-import.test.mjs
  - Modified: apps/figma-plugin/test/plugin-scaffold.test.mjs
  - New: openspec/changes/fix-svg-full-dash-stroke-import/
