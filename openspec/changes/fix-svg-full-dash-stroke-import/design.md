## Design

The problematic checked SVG path is a simple polyline path:

`M1.73,12.91 8.1,19.28 22.79,4.59`

Its geometric length is approximately `29.78`, matching the source `stroke-dasharray="29.7833px"`. Because no `stroke-dashoffset` is applied, the dash covers the full check path and renders as a solid line in the browser.

The import normalizer scans `path`, `line`, `polyline`, and `polygon` tags for `stroke-dasharray`. It removes the attribute only when:

- the first dash length is positive,
- `stroke-dashoffset` is missing or close to zero,
- geometry length can be computed for the tag,
- first dash length is within tolerance of the full geometry length.

If the geometry cannot be computed, or if the dash is shorter than the geometry, the dash array is preserved.
