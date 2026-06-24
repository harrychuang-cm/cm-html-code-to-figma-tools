## Design

The capture package already records the checked SVG with the correct rendered rect:

- Parent checkbox color box: 18x18
- Child SVG check: 14x14 at offset 2,2
- SVG markup: `viewBox="0 0 24 24"` with a stroked check path and `stroke-width="4px"`

The mismatch happens inside Figma import. Creating a Figma vector from the 24x24 SVG and then resizing it to 14x14 leaves stroke metrics too large. The fix is to preserve the browser-rendered geometry by making the SVG import size explicit before Figma parses it:

1. Resolve `currentColor` as before.
2. Compute `intrinsic` and `fitted` from the original SVG and model rect as before.
3. Set root SVG `width` and `height` to `fitted.width` and `fitted.height`.
4. Call `createNodeFromSvg` with that sized SVG.
5. Keep existing wrapper, rotation, and metadata behavior unchanged.

This avoids raster fallback and keeps the icon editable as a vector.
