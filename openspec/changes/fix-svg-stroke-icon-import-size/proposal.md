## Why

Google Calendar checked checkbox icons are captured as small inline SVGs whose DOM rect is 14x14, but their source SVG only declares `viewBox="0 0 24 24"` and uses a 4px stroked check path. The Figma plugin currently calls `createNodeFromSvg` using the original 24x24 viewBox and then resizes the vector to the rendered 14x14 rect. Figma resize does not scale stroke weight the same way browser SVG rendering does, so the checked stroke becomes too thick/clipped and the imported icon shape is wrong.

## What Changes

- Before calling `createNodeFromSvg`, the Figma plugin writes the computed fitted import size onto the root SVG `width` and `height`.
- The existing aspect-ratio fitting and wrapper placement logic remains unchanged; the SVG is simply created at the intended rendered size before any Figma placement.
- Module runtime and classic plugin runtime receive the same behavior.
- Focused tests cover the checked SVG shape pattern: `viewBox="0 0 24 24"`, 14x14 rendered rect, 4px stroked check path.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `production-ui-import`: SVG vector assets should be imported into Figma at their rendered size so stroke metrics match browser SVG rendering.

## Impact

- Affected specs: production-ui-import
- Affected code:
  - Modified: apps/figma-plugin/src/figma-adapter.ts
  - Modified: apps/figma-plugin/src/code-classic.js
  - Modified: apps/figma-plugin/test/runtime-import.test.mjs
  - Modified: apps/figma-plugin/test/plugin-scaffold.test.mjs
  - New: openspec/changes/fix-svg-stroke-icon-import-size/
