## 1. Layout Tree Model

- [x] 1.1 實作 `Add Layout Tree Models Before Figma Node Creation`：`createEditableLayoutNodeModels(packageData)` SHALL output nested models that preserve DOM parent-child structure and parent-relative geometry, satisfying `Editable import preserves layout hierarchy`; verify with `apps/figma-plugin/test/layout-tree.test.mjs`.
- [x] 1.2 實作 `Use Conservative Auto Layout Eligibility`：high-confidence flex rows/columns SHALL produce `autoLayout` metadata with inferred axis, spacing, padding, and confidence, satisfying `High-confidence flex containers become Auto Layout`; verify row/column examples in `apps/figma-plugin/test/layout-tree.test.mjs`.
- [x] 1.3 實作 risky skip detection：overlap, fixed/sticky, complex grid, missing bounds, and one-child containers SHALL keep absolute nested frames with skipped reasons, satisfying `Risky layout containers stay absolute`; verify skipped reason cases in `apps/figma-plugin/test/layout-tree.test.mjs`.

## 2. Renderer And Figma Adapter

- [x] 2.1 更新 Editable renderer 使用 nested layout tree：`Editable Accurate` SHALL append nested frames instead of flattening all primitives as direct siblings, satisfying `Editable import preserves layout hierarchy`; verify with `apps/figma-plugin/test/editable-accurate.test.mjs`.
- [x] 2.2 更新 module Figma adapter 的 `createFrameLayer(model)` 並落實 `Keep Fixed Frame Size For Visual Stability`：Auto Layout frame SHALL preserve fixed size, layoutMode, itemSpacing, padding, fills, strokes, clipsContent, and plugin metadata, satisfying `High-confidence flex containers become Auto Layout`; verify with `apps/figma-plugin/test/runtime-import.test.mjs`.
- [x] 2.3 更新 import report：applied/skipped auto layout summary SHALL be derived from Editable Accurate nested conversion rather than an experimental frame, satisfying `Risky layout containers stay absolute`; verify with `apps/figma-plugin/test/import-report.test.mjs`.

## 3. Classic Runtime And Build Output

- [x] 3.1 更新 `code-classic.js` 的實際 Figma runtime 並落實 `Share Behavior Between Module Adapter And Classic Runtime`：manual-loaded plugin SHALL create nested frames and Auto Layout properties without modern JavaScript syntax or non-extensible node writes; verify with `apps/figma-plugin/test/plugin-scaffold.test.mjs`.
- [x] 3.2 確認 `corepack pnpm build` 產出的 `apps/figma-plugin/dist/code.js` 保留 classic script contract and nested Auto Layout behavior; verify with existing build syntax guard and classic runtime VM test.

## 4. Documentation And Verification

- [x] 4.1 更新 manual docs and V1 acceptance docs：文件 SHALL describe nested Auto Layout output, conservative skipped reasons, and remaining limits; verify by content review in `docs/manual-runtime-test.md` and `docs/v1-usage-and-acceptance.md`.
- [x] 4.2 跑完整驗證：`corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL all pass without Critical or Warning findings.
- [x] 4.3 用目前 CMoney `.figcapture` 做本地 VM smoke：imported `Editable Accurate` SHALL contain nested frames and at least one HORIZONTAL or VERTICAL Auto Layout frame; verify with a Node VM check against `apps/figma-plugin/dist/code.js`.

## 5. Fidelity Guardrails From CMoney Import Review

- [x] 5.1 實作 `out-of-bounds-child` 與 `nonvisual-wrapper` layout guard：flex containers SHALL skip Auto Layout when children are outside parent bounds, have large negative parent-relative offsets, or include 0/1px nonvisual wrapper frames; verify with `apps/figma-plugin/test/layout-tree.test.mjs`.
- [x] 5.2 實作 `Editable text preserves visual bounds` / `Preserve Screenshot-First Text Fidelity`：Text layers SHALL keep captured width for wrapping, and text nodes with visible background/border SHALL render a parent visual frame behind the editable text; verify with `apps/figma-plugin/test/runtime-import.test.mjs`.
- [x] 5.3 實作 `Canvas fallback captures current bitmap` / `Capture Canvas As Raster Fallback`：captured canvas elements SHALL package their current bitmap as fallback asset when browser APIs allow it, while preserving transparent fallback on failure; verify with `apps/chrome-extension/test/asset-capture.test.mjs`.
- [x] 5.4 更新 classic runtime、docs and verification：`apps/figma-plugin/dist/code.js` SHALL match module behavior, docs SHALL describe the new guardrails and canvas fallback, and `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL pass.

## 6. Text Resize Mode Refinement From Figma Review

- [x] 6.1 實作 single-line auto width heuristic：captured single-line text SHALL use `WIDTH_AND_HEIGHT`, while multiline/constrained text SHALL keep fixed width with auto height, satisfying `Editable text preserves visual bounds`; verify with `apps/figma-plugin/test/layout-tree.test.mjs` and `apps/figma-plugin/test/runtime-import.test.mjs`.
- [x] 6.2 更新 classic runtime、docs and verification：manual-loaded `apps/figma-plugin/dist/code.js` SHALL use the same text resize mode heuristic, docs SHALL describe auto-width vs fixed-width text behavior, and `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL pass.

## 7. CSS Flex Alignment Mapping From Top Menu Review

- [x] 7.1 實作 `Map CSS Flex Alignment To Figma Auto Layout`：captured `align-items` SHALL map to Figma `counterAxisAlignItems`, captured `justify-content` SHALL map to `primaryAxisAlignItems`, and alignment-controlled axes SHALL not preserve inferred padding that cancels centering; verify with `apps/figma-plugin/test/layout-tree.test.mjs`.
- [x] 7.2 更新 module adapter and classic runtime：`figma-adapter.ts` and manual-loaded `code-classic.js` SHALL apply `primaryAxisAlignItems` and `counterAxisAlignItems` without non-extensible node writes; verify with `apps/figma-plugin/test/runtime-import.test.mjs` and `apps/figma-plugin/test/plugin-scaffold.test.mjs`.
- [x] 7.3 更新 docs and verification：docs SHALL describe CSS flex alignment mapping, and `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL pass.

## 8. CSS White Space Text Normalization From Figma Review

- [x] 8.1 實作 `Normalize Direct Text With CSS White Space Semantics`：Chrome capture SHALL include computed `whiteSpace` and normalize direct text so `white-space: normal`, `nowrap`, missing, or unsupported values collapse template indentation to browser-visible spacing, while `pre`, `pre-wrap`, `break-spaces`, and `pre-line` follow their specified preservation behavior; verify with `apps/chrome-extension/test/capture-core.test.mjs`.
- [x] 8.2 更新 runtime content script and build output：manual-loaded Chrome Extension content script SHALL use the same whitespace normalization without module syntax, and `apps/chrome-extension/dist` SHALL be regenerated by `corepack pnpm build`; verify with `corepack pnpm build` and existing content-script syntax tests.
- [x] 8.3 更新 docs and verification for `Captured text preserves browser whitespace semantics`：manual docs and V1 acceptance docs SHALL describe whitespace normalization and reload requirements, and `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL pass.

## 9. Transparent Button Text Hug Content From Figma Review

- [x] 9.1 實作 `Avoid Invisible Text Backing Frames`：text nodes with transparent background, no visible border, no visible shadow, and border radius only SHALL remain TEXT models with `WIDTH_AND_HEIGHT` auto width instead of fixed-width `Text Background` frames, satisfying `Editable text preserves visual bounds`; verify with `apps/figma-plugin/test/layout-tree.test.mjs`.
- [x] 9.2 更新 classic runtime parity：manual-loaded `code-classic.js` SHALL use the same invisible backing detection so transparent rounded button labels import as auto-width text without modern syntax; verify with `apps/figma-plugin/test/plugin-scaffold.test.mjs` and `corepack pnpm build`.
- [x] 9.3 更新 docs and verification：docs SHALL mention invisible decorative text boxes are not forced into fixed backing frames, and `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL pass.

## 10. Single-Child Header Link Alignment From Figma Review

- [x] 10.1 實作 `Preserve Single-Child Text Alignment`：single-child text containers with supported flex alignment or CSS line-height line box evidence SHALL become fixed-size Auto Layout frames with vertical centering, while one-child containers without alignment evidence SHALL continue to skip as `one-child-container`; verify with `apps/figma-plugin/test/layout-tree.test.mjs`.
- [x] 10.2 更新 classic runtime parity：manual-loaded `code-classic.js` SHALL apply the same single-child alignment conversion without modern syntax or non-extensible node writes; verify with `apps/figma-plugin/test/plugin-scaffold.test.mjs` and `corepack pnpm build`.
- [x] 10.3 更新 docs and verification：docs SHALL describe single-child text alignment preservation, and `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL pass.

## 11. Viewport-Clipped Canvas Fallback From Figma Review

- [x] 11.1 實作 `Visible viewport capture clips exported geometry` / `Clamp Visible Viewport Geometry`：`captureElementTree` and injectable `content-script.ts` SHALL write viewport-intersection rects for visible nodes so long body/root containers no longer produce full-page-height frames in visible viewport packages; verify with `apps/chrome-extension/test/capture-core.test.mjs`.
- [x] 11.2 實作 `Crop Viewport Screenshot For Unserializable Fallbacks` / `Canvas fallback captures current bitmap`：`captureVisualAssets` and `buildConfirmedExportPackage` SHALL preserve serialized canvas bytes when valid, otherwise use an async screenshot crop fallback provider before transparent placeholder; verify with `apps/chrome-extension/test/asset-capture.test.mjs` and `apps/chrome-extension/test/export-flow.test.mjs`.
- [x] 11.3 更新 docs and verification：docs SHALL describe recapture requirements for canvas/chart screenshot fallback and visible viewport clipping, and `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL pass.

## 12. Lazy Image Icon Source From Figma Review

- [x] 12.1 實作 `Resolve Lazy Image Sources Before Placeholder Assets` / `Lazy image sources resolve before placeholders`：`captureVisualAssets` SHALL skip transparent placeholder `currentSrc/src` candidates when `data-src`, `data-original`, `data-lazy-src`, `srcset`, or `data-srcset` contains a real image candidate, while preserving non-placeholder `currentSrc` priority and SVG assetKind detection; verify with `apps/chrome-extension/test/asset-capture.test.mjs`.
- [x] 12.2 更新 docs and verification：docs SHALL describe lazy image source fallback and icon recapture requirements, and `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL pass.

## 13. Equal-Height Single-Child Flex Menu Alignment From Figma Review

- [x] 13.1 實作 `Single-child flex menu item with equal line box maps vertical centering`：single-child text flex containers with supported explicit flex alignment SHALL become fixed-size Auto Layout even when child captured height equals parent height, while non-flex line-height-only containers retain the existing conservative height guard; verify with `apps/figma-plugin/test/layout-tree.test.mjs`.
- [x] 13.2 更新 classic runtime parity and verification：manual-loaded `code-classic.js` SHALL apply the same equal-height flex single-child alignment conversion without modern syntax or non-extensible node writes, and `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL pass.

## 14. Top Bar Menu Text Hug Content From Figma Review

- [x] 14.1 實作 `Top bar menu text uses Hug child sizing`：single-line auto-width text models SHALL carry Figma HUG horizontal and vertical sizing intent, while multiline or visually backed text remains fixed-width auto-height; verify with `apps/figma-plugin/test/layout-tree.test.mjs`.
- [x] 14.2 更新 Figma adapter and classic runtime parity：module adapter and manual-loaded `code-classic.js` SHALL apply text HUG sizing when supported without non-extensible node writes, and `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL pass.

## 15. Container Padding From Figma Review

- [x] 15.1 實作 `Captured box spacing preserves browser padding`：Chrome capture SHALL include `paddingTop`, `paddingRight`, `paddingBottom`, and `paddingLeft` in computed styles for both module and classic content scripts; verify with `apps/chrome-extension/test/capture-core.test.mjs` and content-script build syntax tests.
- [x] 15.2 實作 `Space-between flex container preserves padding`：Figma layout tree SHALL prefer explicit CSS padding when present and SHALL preserve inferred padding for `justify-content: space-between` instead of clearing it as alignment offset; verify with `apps/figma-plugin/test/layout-tree.test.mjs`.
- [x] 15.3 更新 classic runtime parity, docs, and verification：manual-loaded `code-classic.js` SHALL apply the same padding inference behavior, docs SHALL describe padding capture/import behavior, and `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL pass.

## 16. Reverse Flex Visual Order From Figma Review

- [x] 16.1 實作 `Preserve Reverse Flex Visual Order` / `Reverse flex row preserves browser visual order`：applied Auto Layout frames with `flex-direction: row-reverse` or `column-reverse` SHALL reverse child insertion order while keeping skipped/absolute containers in captured DOM order; verify with `apps/figma-plugin/test/layout-tree.test.mjs`.
- [x] 16.2 更新 classic runtime parity, docs, and verification：manual-loaded `code-classic.js` SHALL apply the same reverse flex child ordering, docs SHALL describe reverse flex import behavior, and `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL pass.

## 17. Padded Visible Text Backing From Figma Review

- [x] 17.1 實作 `Padded visible text backing keeps CSS padding`：text nodes with visible backing styles and explicit CSS padding SHALL import as fixed-size Figma Auto Layout backing frames with matching padding and HUG single-line editable text children; verify with `apps/figma-plugin/test/layout-tree.test.mjs`.
- [x] 17.2 更新 classic runtime parity, docs, and verification：manual-loaded `code-classic.js` SHALL apply the same padded text backing behavior without modern syntax or non-extensible node writes, docs SHALL describe importer-only reload behavior, and `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL pass.

## 18. Non-Uniform Flex Spacing From Figma Review

- [x] 18.1 實作 `Skip Non-Uniform Implicit Flex Spacing` / `Non-uniform implicit flex spacing is skipped`：flex containers with strongly non-uniform implicit primary-axis child gaps and no equivalent captured alignment SHALL remain nested absolute frames with skipped reason `non-uniform-spacing`; verify with `apps/figma-plugin/test/layout-tree.test.mjs`.
- [x] 18.2 更新 classic runtime parity, docs, and verification：manual-loaded `code-classic.js` SHALL apply the same `Skip Non-Uniform Implicit Flex Spacing` guard without modern syntax or non-extensible node writes, docs SHALL describe the skipped reason, and `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL pass.

## 19. Mixed Inline Content From Figma Review

- [x] 19.1 實作 `Preserve Mixed Inline Content` / `Mixed inline content preserves direct text and child nodes`：captured elements with both direct text and SVG/img/span children SHALL import as frames that keep all child models and add a synthesized editable direct-text node with sourceNodeId suffix `::text`; verify with `apps/figma-plugin/test/layout-tree.test.mjs`.
- [x] 19.2 更新 classic runtime parity and verification：manual-loaded `code-classic.js` SHALL apply the same mixed inline content behavior without modern syntax or non-extensible node writes, and `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL pass.

## 20. Clipped Single-Line Text From Figma Review

- [x] 20.1 實作 `Preserve Clipped Single-Line Text Bounds`：single-line text with CSS nowrap clipping and estimated full width larger than its captured rect SHALL use fixed/truncate text sizing instead of HUG sizing; verify with `apps/figma-plugin/test/layout-tree.test.mjs`.
- [x] 20.2 更新 classic runtime parity and verification：manual-loaded `code-classic.js` SHALL apply the same clipped single-line text behavior without modern syntax or non-extensible node writes, and `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL pass.

## 21. Visible CSS Pseudo-Elements From Figma Review

- [x] 21.1 實作 `Preserve Visible CSS Pseudo-Elements` / `Visible CSS pseudo-elements import as decoration layers`：Chrome capture SHALL emit visible `::before`/`::after` decoration boxes as synthetic pseudo child nodes with inferred rects and visual styles; verify with `apps/chrome-extension/test/capture-core.test.mjs`.
- [x] 21.2 實作 pseudo decoration import behavior：Figma layout tree and classic runtime SHALL import pseudo decoration nodes as rectangle layers, and containers with absolute-positioned pseudo children SHALL skip Auto Layout with `absolute-position-child`; verify with `apps/figma-plugin/test/layout-tree.test.mjs` and `apps/figma-plugin/test/plugin-scaffold.test.mjs`.
- [x] 21.3 更新 verification：manual-loaded Chrome/Figma runtime output SHALL build cleanly, and `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL pass.

## 22. Pseudo-Element Containing Block From Figma Review

- [x] 22.1 實作 `Absolute pseudo-element uses positioned containing block`：Chrome capture SHALL infer absolute/fixed pseudo-element decoration rects against the nearest positioned containing block instead of always the pseudo owner box; verify with `apps/chrome-extension/test/capture-core.test.mjs`.
- [x] 22.2 更新 classic content runtime and verification：manual-loaded Chrome Extension content script SHALL use the same containing-block pseudo rect inference, and `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL pass.

## 23. SVG Transform And Stroke Fidelity From Figma Review

- [x] 23.1 實作 `SVG image transforms preserve browser rendering`：Chrome capture SHALL include `transform` and `transformOrigin`; Figma import SHALL preserve SVG intrinsic aspect ratio inside the captured image box and apply supported CSS rotation transforms; verify with `apps/chrome-extension/test/capture-core.test.mjs`, `apps/figma-plugin/test/runtime-import.test.mjs`, and `apps/figma-plugin/test/plugin-scaffold.test.mjs`.
- [x] 23.2 實作 `Visible borders and outlines import as editable strokes`：Chrome capture SHALL include computed border styles and outline styles; Figma layout/import SHALL derive editable strokes from uniform four-side borders or outline fallback, and SHALL import one-sided/non-uniform borders as editable decoration rectangles; verify with `apps/chrome-extension/test/capture-core.test.mjs`, `apps/figma-plugin/test/layout-tree.test.mjs`, `apps/figma-plugin/test/runtime-import.test.mjs`, and `apps/figma-plugin/test/plugin-scaffold.test.mjs`.
- [x] 23.3 更新 verification：manual-loaded Chrome/Figma runtime output SHALL build cleanly, and `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL pass.

## 24. Inline Pseudo Icon From Figma Review

- [x] 24.1 實作 `Inline pseudo-element CSS image icons import as assets`：Chrome capture SHALL treat `::before`/`::after` pseudo-elements with visible CSS image URLs as renderable, infer conservative inline start/end rects when no positioned offsets exist, and asset packaging SHALL include those pseudo CSS images; Figma import SHALL preserve `::before` before direct text and `::after` after direct text; verify with `apps/chrome-extension/test/capture-core.test.mjs`, `apps/chrome-extension/test/asset-capture.test.mjs`, and `apps/figma-plugin/test/layout-tree.test.mjs`.
- [x] 24.2 更新 verification：manual-loaded Chrome runtime output SHALL build cleanly, and `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL pass.

## 25. Preserve CSS Z-Index As Layer Stacking From Figma Review

- [x] 25.1 實作 `CSS z-index preserves Figma stacking order` / `Preserve CSS Z-Index As Layer Stacking`：Chrome capture SHALL include computed `zIndex`; Figma layout tree and classic runtime SHALL preserve numeric z-index as `cssZIndex` metadata and append non-Auto Layout siblings in ascending z-index order while leaving Auto Layout flow order unchanged; verify with `apps/chrome-extension/test/capture-core.test.mjs`, `apps/figma-plugin/test/layout-tree.test.mjs`, `apps/figma-plugin/test/runtime-import.test.mjs`, and `apps/figma-plugin/test/plugin-scaffold.test.mjs`.
- [x] 25.2 更新 verification：manual-loaded Chrome/Figma runtime output SHALL build cleanly, and `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL pass.

## 26. Preserve CSS Font Stack Fallbacks From Figma Review

- [x] 26.1 實作 `Captured font stacks choose available Figma fonts` / `Preserve CSS Font Stack Fallbacks`：Chrome capture SHALL include computed `fontStyle`; Figma module adapter and classic runtime SHALL parse the captured CSS `fontFamily` stack, ignore generic CSS family names, try concrete family/style candidates in order, try Regular for the same family when the requested style is missing, and only then use the default fallback font; verify with `apps/chrome-extension/test/capture-core.test.mjs`, `apps/figma-plugin/test/runtime-import.test.mjs`, and `apps/figma-plugin/test/plugin-scaffold.test.mjs`.
- [x] 26.2 實作 font substitution debug report：import report and plugin UI SHALL expose font substitution count and a concise requested-to-used summary while preserving source node, requested stack, attempted fonts, and used font in report data; verify with `apps/figma-plugin/test/import-report.test.mjs` and `apps/figma-plugin/test/runtime-import.test.mjs`.
- [x] 26.3 更新 verification：manual-loaded Chrome/Figma runtime output SHALL build cleanly, and `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL pass.

## 27. Preserve Clipped Multiline Containers From Figma Review

- [x] 27.1 實作 `Preserve Clipped Multiline Containers` / `Clipped overflow containers preserve browser clipping`：Chrome capture SHALL include computed `overflowX`, `overflowY`, `maxWidth`, `maxHeight`, and `textOverflow`; Figma layout tree and classic runtime SHALL map axis-specific or shorthand clipping overflow to fixed-size frames with `clipsContent` enabled; verify with `apps/chrome-extension/test/capture-core.test.mjs`, `apps/figma-plugin/test/layout-tree.test.mjs`, and `apps/figma-plugin/test/plugin-scaffold.test.mjs`.
- [x] 27.2 更新 verification：manual-loaded Chrome/Figma runtime output SHALL build cleanly, and `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL pass.

## 28. Read-More Overlay And Carousel Gradient Fidelity From Figma Review

- [x] 28.1 實作 `Textual pseudo-elements preserve editable content`：Chrome capture SHALL keep visible textual `::before`/`::after` content such as `...` as synthetic pseudo text nodes with inferred rects; Figma layout tree SHALL preserve `::before` ordering before synthesized direct text; verify with `apps/chrome-extension/test/capture-core.test.mjs` and `apps/figma-plugin/test/layout-tree.test.mjs`.
- [x] 28.2 實作 `CSS gradient backgrounds import as visible fills`：Figma layout tree, module adapter, and classic runtime SHALL treat CSS `linear-gradient(...)` backgrounds as visible fills and convert supported gradients to Figma gradient paints so read-more masks and carousel fade overlays are not dropped; verify with `apps/figma-plugin/test/layout-tree.test.mjs`, `apps/figma-plugin/test/runtime-import.test.mjs`, and `apps/figma-plugin/test/plugin-scaffold.test.mjs`.
- [x] 28.3 實作 `Rotated SVG vectors remain inside clipped wrappers`：Figma module adapter and classic runtime SHALL position SVG vector imports by their rotated bounding box before clipping, preserving arrow icons inside fixed wrappers; verify with `apps/figma-plugin/test/runtime-import.test.mjs` and `apps/figma-plugin/test/plugin-scaffold.test.mjs`.
- [x] 28.4 更新 verification：manual-loaded Chrome/Figma runtime output SHALL build cleanly, and `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL pass.

## 29. Pseudo Content URL Asset From Figma Review

- [x] 29.1 實作 `CSS content URL pseudo-elements import as assets`：Chrome capture SHALL treat `content: url(...)` pseudo-elements as image/vector assets instead of editable text, while preserving textual pseudo content such as `"..."`; verify with `apps/chrome-extension/test/capture-core.test.mjs` and `apps/chrome-extension/test/asset-capture.test.mjs`.
- [x] 29.2 更新 verification：manual-loaded Chrome runtime output SHALL build cleanly, and `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL pass.

## 30. Mixed Direct Text Hug Sizing From Figma Review

- [x] 30.1 實作 `Mixed direct nav text keeps hug sizing`：Figma layout tree and classic runtime SHALL keep mixed-content synthesized direct-text labels and direct interactive link/button labels as `WIDTH_AND_HEIGHT` / HUG when the text has no newline and its estimated single-line width fits the available segment, even if the parent link/button line box is taller than the CSS line-height; verify with `apps/figma-plugin/test/layout-tree.test.mjs` and `apps/figma-plugin/test/plugin-scaffold.test.mjs`.
- [x] 30.2 更新 verification：manual-loaded Figma runtime output SHALL build cleanly, and `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL pass.

## 31. Tall Hug Text Vertical Centering From Figma Review

- [x] 31.1 實作 `Tall single-line tab labels center after Hug normalization`：Figma layout tree and classic runtime SHALL reduce qualifying tall single-line HUG direct labels to CSS line-height and vertically center the text rect inside the captured browser line box; verify with `apps/figma-plugin/test/layout-tree.test.mjs` and `apps/figma-plugin/test/plugin-scaffold.test.mjs`.
- [x] 31.2 更新 verification：manual-loaded Figma runtime output SHALL build cleanly, and `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL pass.

## 32. Table Cell Text Vertical Alignment From Figma Review

- [x] 32.1 實作 `Table cell text preserves CSS alignment` / `Preserve Table Cell Text Alignment`：Figma layout tree and classic runtime SHALL import direct `td`/`th` or `display: table-cell` text as fixed-size table-cell frames whose editable text child is vertically aligned according to CSS `vertical-align` and horizontally aligned according to CSS `text-align`; verify with `apps/figma-plugin/test/layout-tree.test.mjs`.
- [x] 32.2 更新 capture metadata and verification：Chrome capture SHALL include computed `verticalAlign`, manual-loaded runtimes SHALL build cleanly, and `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL pass.

## 33. Padded Mixed Tab Separator Alignment From Figma Review

- [x] 33.1 實作 `Mixed direct tab text respects parent padding`：Figma layout tree and classic runtime SHALL derive synthesized direct-text segments from the parent padded content box and ignore absolute decoration children outside that content box when selecting the text segment; verify with `apps/figma-plugin/test/layout-tree.test.mjs`.
- [x] 33.2 實作 `Translated pseudo separator stays vertically centered`：Figma layout tree and classic runtime SHALL apply supported CSS transform translate components to pseudo decoration geometry before parent-relative placement, so `top: 50%` plus `translateY(-50%)` separators stay centered; verify with `apps/figma-plugin/test/layout-tree.test.mjs`, `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import`.

## 34. Chat Panel Shadow And Bubble Text From Figma Review

- [x] 34.1 實作 `CSS box shadows import as Figma effects`：Figma module adapter and manual-loaded classic runtime SHALL convert browser-ordered CSS `box-shadow` values such as `rgba(...) 0px 4px 36px 0px` into matching Figma `DROP_SHADOW` effects; verify with `apps/figma-plugin/test/runtime-import.test.mjs` and `apps/figma-plugin/test/plugin-scaffold.test.mjs`.
- [x] 34.2 實作 `Padded chat bubble text keeps Hug sizing`：Figma layout tree and classic runtime SHALL keep single-line padded visible text backing children in `WIDTH_AND_HEIGHT` / HUG sizing when the explicit CSS width belongs to the outer backing box, preventing chat bubble text from wrapping into timestamps; verify with `apps/figma-plugin/test/layout-tree.test.mjs`, `apps/figma-plugin/test/plugin-scaffold.test.mjs`, the provided CMoney `.figcapture` smoke, `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import`.

## 35. Chat Emoji And Overlay Stacking From Figma Review

- [x] 35.1 實作 `Transparent padded emoji text uses content box`：Figma layout tree and classic runtime SHALL place transparent padded single-line text such as emoji-only chat messages at the padded content rect with `WIDTH_AND_HEIGHT` / HUG sizing, instead of using the outer border box; verify with `apps/figma-plugin/test/layout-tree.test.mjs`, `apps/figma-plugin/test/plugin-scaffold.test.mjs`, and a CMoney-derived fixture using the captured emoji bubble geometry.
- [x] 35.2 實作 `Fixed overlay descendants preserve wrapper stacking`：non-Auto Layout sibling sorting SHALL use descendant fixed/absolute numeric z-index from non-visual wrappers so lower/default-z-index fixed controls like page go-to-top render beneath higher-z-index fixed chat panels, while ordinary relative descendants do not promote static content; verify with `apps/figma-plugin/test/layout-tree.test.mjs`, a CMoney-derived fixture using the captured chat/go-to-top stacking geometry, `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import`.

## 36. Transparent Padded Tab Wrapper From Figma Review

- [x] 36.1 實作 `Transparent padded interactive tabs preserve wrapper frames`：Figma layout tree and classic runtime SHALL keep transparent padded interactive tab/link/button text boxes as fixed-size Auto Layout wrapper frames with nested HUG text in the CSS content box when the captured padding and explicit box size are layout-significant; verify with `apps/figma-plugin/test/layout-tree.test.mjs`, `apps/figma-plugin/test/plugin-scaffold.test.mjs`, and a smoke assertion against `/Users/a04-0214-0320/Downloads/2026-etf-1342x1234 (1).figcapture`.
- [x] 36.2 更新 verification：manual-loaded Figma runtime output SHALL build cleanly, and `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze improve-editable-auto-layout-import --json`, and `spectra validate improve-editable-auto-layout-import` SHALL pass.
