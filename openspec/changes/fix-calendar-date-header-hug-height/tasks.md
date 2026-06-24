## 1. Date Header Hug Height

- [x] 1.1 Implement `Transparent leading text rows hug counter-axis content` in module layout-tree inference.
- [x] 1.2 Pass optional auto-layout sizing modes through the module Figma adapter and renderer.
- [x] 1.3 Implement the same `Transparent leading text rows hug counter-axis content` behavior in the classic runtime.

## 2. Verification

- [x] 2.1 Add layout-tree coverage for a `7 (廿二)` date header row.
- [x] 2.2 Add adapter coverage for `counterAxisSizingMode: AUTO`.
- [x] 2.3 Add classic runtime coverage for imported date header rows.
- [x] 2.4 Run build, focused tests, full tests, Spectra validation, and a code search confirming the reusable rule does not hard-code Figma node ids, sample labels, DOM class names, URLs, or source app names.
- [x] 2.5 Add regression coverage for the same transparent leading text row pattern with different text content and generic source ids, then verify it still imports with `counterAxisSizingMode: AUTO` and `counterAxisAlignItems: CENTER`.
- [x] 2.6 Extend `Transparent leading text rows hug counter-axis content` to inferred non-flex horizontal text flows and verify with module and classic runtime regression coverage.

## 3. Accessible Iframe Capture

- [x] 3.1 Implement `Accessible iframe subtrees remain editable` in DOM capture so readable iframe children are captured with parent-page coordinates; verify with `node --test apps/chrome-extension/test/capture-core.test.mjs`.
- [x] 3.2 Make iframe raster fallback conditional on the absence of captured iframe children while preserving fallback for inaccessible or empty iframes; verify with `node --test apps/chrome-extension/test/asset-capture.test.mjs`.
