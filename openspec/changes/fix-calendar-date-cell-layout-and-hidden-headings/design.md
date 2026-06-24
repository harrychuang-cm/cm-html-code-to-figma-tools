## Context

Google Calendar 的小月曆日期 cell 是 table-cell，內部只有一個 24x24 date button。Browser layout 透過 table-cell/text alignment 與幾何置中呈現，但 importer 目前只對 button 本身建立 auto layout，`td` 容器仍保留座標定位。Google Calendar 也會建立 1x1、absolute、overflow-hidden 的 heading 給輔助技術讀取；這些 heading 不該在設計稿中可見，但 Figma 的文字渲染會把它們呈現成 ellipsis。

## Goals / Non-Goals

**Goals:**

- 對 table-cell 中單一 child 且該 child 幾何置中的情境，產生 `HORIZONTAL` auto layout 並設定主軸與交叉軸為 `CENTER`。
- 對 1x1、absolute/fixed、overflow-clipped、文字估算寬度大於可視盒子的 hidden accessibility text，不建立 TEXT model。
- module layout tree 與 classic runtime 行為一致。
- 保留既有 direct table-cell text 的對齊與 padding 邏輯。

**Non-Goals:**

- 不重寫 table layout inference。
- 不刪除一般可見 heading、可見小字或 read-more `...` pseudo-element。
- 不修改 capture schema 或 Chrome extension capture 行為。

## Decisions

### Center Single-Child Table Cell Containers

在 `inferAutoLayout` 的 single-child path 增加 table-cell alignment evidence。當 node 是 `td` / `th` / `display: table-cell`，且 child 的中心點與 parent 中心點在容許誤差內，layout tree 會回傳 auto layout：`layoutMode: HORIZONTAL`、`primaryAxisAlignItems: CENTER`、`counterAxisAlignItems: CENTER`、padding 由既有 `resolvePadding` / `alignmentAwarePadding` 推導。

替代方案是只依 CSS `text-align: center` 與 `vertical-align: middle`。否決原因是 browser-captured geometry 已經是最可靠結果，而且 Google Calendar 節點不一定顯式帶完整 vertical-align。

### Suppress Visually Hidden Accessibility Headings

在 TEXT model 建立前，新增 hidden accessibility text 判斷：node 必須是 absolute/fixed、rect 與 explicit CSS width/height 都小於等於 2px、overflow clipping 生效，且文字估算寬度明顯大於可視 rect。命中時回傳 `null`，避免建立會在 Figma 顯示 ellipsis 的 TEXT layer。

替代方案是依 tag name `h1`~`h6` 或 class name 特例化。否決原因是此 pattern 是通用 visually-hidden 技術，應以幾何與 clipping 行為判斷，而不是綁 Google Calendar class。

## Implementation Contract

Behavior:

- A table-cell node with exactly one renderable child centered in both axes MUST import as a FRAME with applied auto layout and `CENTER/CENTER` alignment.
- The centered child MUST remain a normal child in flow, not an absolute-positioned child, after auto layout ordering.
- A 1x1 hidden accessibility heading with overflow clipping MUST NOT create a Figma TEXT layer and MUST NOT appear as `...`.
- Read-more ellipsis pseudo-elements and normal visible clipped text MUST keep existing behavior.

Interface / data shape:

- No `.figcapture` schema changes.
- Layout models continue using existing `autoLayout` and `children` fields.
- Hidden accessibility text suppression returns `null` from model creation, matching existing suppress behavior for tiny clipped text.

Failure modes:

- If the table-cell child is not centered or has unusable bounds, importer MUST keep the existing non-auto-layout behavior.
- If hidden text does not meet the 1x1 absolute clipped pattern, importer MUST keep the existing text path.

Acceptance criteria:

- `apps/figma-plugin/test/layout-tree.test.mjs` verifies a Google Calendar-style `td` with one 24x24 date button imports as `CENTER/CENTER` auto layout.
- `apps/figma-plugin/test/layout-tree.test.mjs` verifies a Google Calendar-style 1x1 hidden heading is omitted.
- `apps/figma-plugin/test/plugin-scaffold.test.mjs` verifies classic runtime omits the hidden heading and keeps date cell auto layout.
- `corepack pnpm test`, `spectra analyze fix-calendar-date-cell-layout-and-hidden-headings --json`, and `spectra validate fix-calendar-date-cell-layout-and-hidden-headings` pass.

Scope boundaries:

- In scope: Figma import layout inference and classic runtime parity for table-cell single-child alignment and hidden accessibility text suppression.
- Out of scope: changing visual capture, modifying table row/column sizing, suppressing semantic headings that occupy normal visible boxes.

## Risks / Trade-offs

- [Risk] Over-suppressing legitimately tiny text → Mitigation: require absolute/fixed positioning, explicit tiny width and height, overflow clipping, and text much wider than the visible rect.
- [Risk] Applying auto layout to a table-cell whose child is not semantically centered → Mitigation: require actual captured center alignment in both axes instead of CSS class or tag alone.
