## 1. Icon Font Asset Packaging

- [x] 1.1 實作 Material icon font ligatures import as visual SVG assets 的 Package Recognized Material Icon Ligatures As SVG Assets 行為：`captureVisualAssets` 對支援的 `Google Material Icons` / `Material Symbols` ligature 節點產生 `assets/icon-font-*.svg`，並在 node 上設定 `assetRef`、`attributes.assetKind = "svg"`、`attributes.assetRole = "icon-font"`、`attributes.iconFontLigature`；驗證：`apps/chrome-extension/test/asset-capture.test.mjs` 新增 `search`、`add`、`arrow_drop_down` 表格案例並通過。
- [x] 1.2 實作 Material icon font ligatures import as visual SVG assets 的未知 ligature fallback：icon font family/class 但不在支援 map 的文字節點不產生 icon-font asset、不中斷 export，並保留既有 editable text 路徑；驗證：`apps/chrome-extension/test/asset-capture.test.mjs` 新增 unsupported ligature 測試並通過。

## 2. Figma Import Routing

- [x] 2.1 實作 Material icon font ligatures import as visual SVG assets 的 Route Icon Font Assets Before Editable Text 行為：module layout tree 對 `assetRole: "icon-font"` 且有 `assetRef` 的節點建立 IMAGE/SVG model，而不是 TEXT model，即使原 node 保留 `textContent`；驗證：`apps/figma-plugin/test/layout-tree.test.mjs` 新增 icon-font asset model 測試並通過。
- [x] 2.2 讓 Figma runtime 對 icon-font asset 節點走既有 SVG vector/image 匯入，不載入文字字型、不建立 ligature TEXT；驗證：`apps/figma-plugin/test/runtime-import.test.mjs` 新增 async import 測試並通過。
- [x] 2.3 同步 classic runtime 的 Route Icon Font Assets Before Editable Text 行為，避免 plugin bundle fallback 路徑把 icon-font asset 匯成文字；驗證：`apps/figma-plugin/test/plugin-scaffold.test.mjs` 或等效 classic runtime 測試覆蓋 icon-font asset 不建立 TEXT。
- [x] 2.4 實作 Material icon font ligatures import as visual SVG assets 的 Repair Legacy Material Icon Text During Import 行為：將 Material icon ligature 偵測與 SVG 產生器移到 shared capture-schema helper，讓 extension asset packaging 與 Figma plugin layout modeling 共用同一份支援 map；驗證：`apps/chrome-extension/test/asset-capture.test.mjs` 既有 icon-font asset 測試通過，且 `apps/figma-plugin/test/layout-tree.test.mjs` 覆蓋 legacy `search` node 無 `assetRef` 時仍建成 IMAGE model with inline SVG bytes。
- [x] 2.5 實作 Material icon font ligatures import as visual SVG assets 的 legacy `.figcapture` import runtime 行為：module runtime 與 classic runtime 對 legacy Material icon text node 合成 SVG bytes 後匯入 VECTOR/IMAGE，不建立 `search` / `add` / `arrow_drop_down` TEXT、不載入 icon 文字字型；驗證：`apps/figma-plugin/test/runtime-import.test.mjs` 與 `apps/figma-plugin/test/plugin-scaffold.test.mjs` 新增 legacy 無 `assetRef` 測試並通過。

## 3. Verification

- [x] 3.1 執行整體驗證，確認 Material icon font ligatures import as visual SVG assets 的規格、設計、任務與程式一致；驗證：目標 Node 測試、`corepack pnpm test` 可執行範圍、`spectra analyze fix-material-icon-ligature-import --json`、`spectra validate fix-material-icon-ligature-import` 通過，並以 `/Users/a04-0214-0320/Downloads/2026-6-1440.figcapture` 檢查至少 `search` / `add` / `arrow_drop_down` 不再規劃為 ligature TEXT。
- [x] 3.2 重新執行整體驗證，確認 legacy `.figcapture` import repair 與既有 asset packaging 修正一致；驗證：目標 Node 測試、`corepack pnpm test`、`spectra analyze fix-material-icon-ligature-import --json`、`spectra validate fix-material-icon-ligature-import` 通過，並以 `/Users/a04-0214-0320/Downloads/2026-6-1440.figcapture` 檢查 legacy `search` / `add` / `arrow_drop_down` 不再規劃為 ligature TEXT。
