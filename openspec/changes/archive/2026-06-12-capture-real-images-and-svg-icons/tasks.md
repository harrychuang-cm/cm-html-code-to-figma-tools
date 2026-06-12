## 1. Capture Visual Asset Sources

- [x] 1.1 實作 `Capture Visual Asset Sources In Content Script` 並滿足 `Capture usable visual asset bytes`：`img.currentSrc`, inline `svgMarkup`, `backgroundImage`, `maskImage`, and `webkitMaskImage` SHALL be captured; verify with content/runtime tests.
- [x] 1.2 實作 `CSS Icons Are Captured As Image Assets When Possible` 並滿足 `Capture CSS image icons`：data URL, remote raster URL, remote SVG URL, inline SVG markup, and unsupported CSS values SHALL be classified deterministically; verify with `apps/chrome-extension/test/asset-capture.test.mjs`.

## 2. Package Real Asset Bytes

- [x] 2.1 實作 `Add Async Asset Resolver In Background Runtime` 並滿足 `Capture usable visual asset bytes`：successful remote assets SHALL store returned bytes; failures SHALL record missing asset diagnostics without aborting; verify with new asset byte tests.
- [x] 2.1a 補上 remote asset fetch host permissions 並滿足 `Extension has host permission for remote asset fetch`：Chrome manifest/runtime contract SHALL declare local host permissions for CDN/avatar/image fetches while preserving local-first/no-upload guarantees; verify with `apps/chrome-extension/test/manifest.test.mjs`.
- [x] 2.2 將 package builder/runtime 改為 async：capture preview and confirm export SHALL await package generation and preserve existing popup/download behavior; verify with `apps/chrome-extension/test/runtime-flow.test.mjs` and `apps/chrome-extension/test/export-flow.test.mjs`.
- [x] 2.3 確認 archive contents：real raster, inline SVG, CSS icon assets SHALL appear under `assets/`; verify with `.figcapture` archive tests.

## 3. Figma Import Rendering

- [x] 3.1 實作 `Store SVG As First-Class Assets` 的 module Figma adapter 行為並滿足 `Import SVG assets as editable vectors`：SVG bytes SHALL render through `createNodeFromSvg` when available, with geometry and plugin metadata; verify with `apps/figma-plugin/test/runtime-import.test.mjs`.
- [x] 3.2 實作 `Store SVG As First-Class Assets` 的 classic runtime 行為並滿足 `Import SVG assets as editable vectors`：manual-loaded plugin SHALL render SVG vector assets without modern syntax and keep placeholder fallback on error; verify with `apps/figma-plugin/test/plugin-scaffold.test.mjs`.
- [x] 3.3 更新 renderer/model path：image-like CSS asset nodes and SVG asset nodes SHALL reach the adapter as image/vector models inside nested layout; verify with editable/runtime tests.

## 4. Documentation And Verification

- [x] 4.1 更新 manual docs and V1 acceptance docs：文件 SHALL explain image/SVG/CSS icon support, reload Chrome extension requirement, and remaining fallback limits.
- [x] 4.2 跑完整驗證：`corepack pnpm build`, `corepack pnpm test`, `corepack pnpm test:e2e`, `spectra analyze capture-real-images-and-svg-icons --json`, and `spectra validate capture-real-images-and-svg-icons` SHALL pass without findings.
- [x] 4.3 用 CMoney capture path 做 smoke guidance：document that this change requires reloading Chrome extension and generating a new `.figcapture` before Figma can show newly captured assets.
