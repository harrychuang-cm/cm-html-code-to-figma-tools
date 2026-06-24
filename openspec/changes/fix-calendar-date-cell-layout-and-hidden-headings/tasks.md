## 1. Layout Tree Fixes

- [x] 1.1 實作 Center Single-Child Table Cell Containers / Calendar date table cells import as centered auto layout containers：module layout tree 對 `td` / `th` / `display: table-cell` 單一 child 且幾何置中的節點產生 `HORIZONTAL` auto layout、`CENTER/CENTER` 對齊，child 不再靠座標定位；驗證：`apps/figma-plugin/test/layout-tree.test.mjs` 新增 Google Calendar date cell regression 並通過。
- [x] 1.2 實作 Suppress Visually Hidden Accessibility Headings / Visually hidden accessibility headings are omitted from editable import：module layout tree 對 1x1 absolute/fixed overflow-clipped hidden accessibility heading 回傳 `null`，不建立 TEXT 或 ellipsis；驗證：`apps/figma-plugin/test/layout-tree.test.mjs` 新增 hidden heading regression 並通過。
- [x] 1.3 同步 classic runtime 的 Center Single-Child Table Cell Containers 與 Suppress Visually Hidden Accessibility Headings 行為，確保手動載入 plugin bundle 時 date cell 置中 auto layout、hidden heading 不產生 TEXT；驗證：`apps/figma-plugin/test/plugin-scaffold.test.mjs` 新增 classic runtime regression 並通過。

## 2. Verification

- [x] 2.1 執行整體驗證，確認規格、設計、任務與程式一致；驗證：目標 Node 測試、`corepack pnpm test`、`spectra analyze fix-calendar-date-cell-layout-and-hidden-headings --json`、`spectra validate fix-calendar-date-cell-layout-and-hidden-headings` 通過，並以 `/Users/a04-0214-0320/Downloads/2026-6-1440.figcapture` 檢查 date cell model 為 `CENTER/CENTER` auto layout 且 hidden heading 不再出現在 TEXT model。
