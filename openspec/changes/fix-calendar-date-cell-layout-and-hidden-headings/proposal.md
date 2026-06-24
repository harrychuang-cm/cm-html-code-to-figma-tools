## Why

Google Calendar 匯入後，小月曆日期 cell 的上一層 `td` 容器仍是普通 frame，日期按鈕用座標定位；同一畫面中的 1x1 hidden accessibility heading 也被建立成 Figma TEXT，導致畫面上出現 `...`。這兩者都降低 Editable Accurate frame 的可編輯性與視覺乾淨度。

## What Changes

- Figma layout tree 會辨識 table-cell 單一 child 在水平與垂直方向置中的幾何證據，並將該 table-cell frame 建成 auto layout `CENTER/CENTER`。
- Figma layout tree 會 suppress 1x1、absolute、overflow-clipped 且文字遠大於可視盒子的 hidden accessibility text，避免 Figma 顯示 ellipsis。
- Classic runtime 同步 module layout tree 的 table-cell auto layout 與 hidden heading suppress 行為。
- 新增 regression tests 覆蓋 Google Calendar date cell 與 hidden heading 案例。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `production-ui-import`: imported editable layouts SHALL center single-child date table cells with auto layout and SHALL omit visually hidden 1px accessibility headings.

## Impact

- Affected specs: production-ui-import
- Affected code:
  - Modified: apps/figma-plugin/src/layout-tree.ts
  - Modified: apps/figma-plugin/src/code-classic.js
  - Modified: apps/figma-plugin/test/layout-tree.test.mjs
  - Modified: apps/figma-plugin/test/plugin-scaffold.test.mjs
  - Removed: (none)
