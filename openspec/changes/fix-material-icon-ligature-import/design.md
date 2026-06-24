## Context

目前 capture/import pipeline 已能處理 inline SVG、CSS image/mask asset、pseudo `content: url(...)`，也能用 captured CSS font stack 載入 Figma 字型。Google Calendar 的部分 icon 不是 SVG/image，而是 `<i class="google-material-icons">search</i>` 這類 Material Icons ligature text。這些節點在 `.figcapture` 中保留為 `textContent` 搭配 `fontFamily: "Google Material Icons"`，Figma 若沒有該 icon font 或 runtime fallback 成 Inter，就會顯示 `search`、`add`、`arrow_drop_down` 等字串。

## Goals / Non-Goals

**Goals:**

- 將可識別且支援的 Google Material Icons / Material Symbols ligature 文字節點封裝為 SVG asset。
- 讓 Editable Accurate frame 對這類節點走既有 image/vector 匯入路徑，而非 editable text path。
- 讓 Figma Plugin 重新匯入 legacy `.figcapture` 時，即使 capture node 還沒有 `assetRole: "icon-font"` / `assetRef`，仍能依 Material icon font family/class 與支援 ligature 合成 SVG vector。
- 保留未知 ligature 的既有文字 fallback，不因 icon map 不完整而中斷 capture/import。
- 覆蓋 Google Calendar 目前出現的核心 icon：`search`、`add`、`arrow_drop_down`，並包含 `keyboard_arrow_up`、`date_range`、`link`、`more_vert` 供同一 capture 使用。

**Non-Goals:**

- 不新增外部 icon 套件或網路下載流程。
- 不嘗試完整支援所有 Material Symbols 變體軸、outlined/rounded/sharp 字重差異。
- 不把一般文字或未知 icon ligature 強制轉圖。
- 不改變現有 SVG asset import、font stack fallback、pseudo image asset 的行為。

## Decisions

### Package Recognized Material Icon Ligatures As SVG Assets

在 `apps/chrome-extension/src/asset-capture.ts` 的 asset packaging 階段加入 Material icon source 掃描。偵測條件同時看 computed `fontFamily` 與 class tokens，接受 `Google Material Icons`、`Material Icons`、`Material Symbols`、`material-icons`、`google-material-icons` 等可辨識來源。只有當 trimmed `textContent` 存在於本地支援 map 時才產生 SVG bytes。

本地 SVG map 放在 shared capture-schema runtime helper，避免引入網路或套件依賴，並讓 extension 與 plugin 共用同一份 ligature path map。SVG 使用 captured CSS `color` 或 `-webkit-text-fill-color` 帶入實際填色；尺寸使用 24x24 Material Icons viewBox。asset 名稱使用 `assets/icon-font-<n>.svg`，節點 metadata 寫入 `assetKind: "svg"`、`assetRole: "icon-font"`、`iconFontLigature: <name>`。

替代方案是只要求 Figma 載入 Material Icons font。否決原因是 font availability 不穩定，而且仍會把 icon 當文字節點，對設計 handoff 和 codegen 都較脆弱。

### Route Icon Font Assets Before Editable Text

Figma layout tree 目前先處理 `node.textContent`，所以同時有 `textContent` 和 `assetRef` 的 icon node 仍會變成 TEXT。新增判斷：當 `attributes.assetRole === "icon-font"` 且有 `assetRef` 時，該節點應視為 IMAGE/SVG asset，優先於文字分支。這個分流要同時覆蓋 module runtime model 與 classic runtime，避免 build 後 runtime 差異。

替代方案是在 asset packaging 階段清空 `textContent`。否決原因是 `.figcapture` 失去原始 ligature debug 資訊，也讓未知/回退情境更難診斷。

### Repair Legacy Material Icon Text During Import

既有 `.figcapture` 檔案可能已經被保存或交給 Figma Plugin 匯入，但當時 capture 階段尚未產生 `assets/icon-font-*.svg`。為了讓這些 legacy package 也能被正式修正，Figma Plugin 在建立 editable layout model 時會呼叫同一份 shared Material icon helper：若 node 沒有 icon-font `assetRef`，但其 `textContent`、`fontFamily` 或 class token 符合支援的 Material icon ligature，layout model 會合成 SVG bytes、設定 synthetic `assetRef`、`assetKind: "svg"`、`assetRole: "icon-font"`，然後走既有 image/vector import。

替代方案是要求使用者重新 capture。否決原因是使用者已經有舊 `.figcapture` 與 Figma frame；匯入端 repair 可保留 package 相容性，並讓同一份檔案用新版 plugin 重新匯入即可修正。

## Implementation Contract

Behavior:

- 對支援的 Google Material icon ligature，export 後 capture node 保留原 `textContent`，並新增 `assetRef` 指向 SVG bytes。
- 產生的 node attributes MUST include `assetKind: "svg"`、`assetRole: "icon-font"`、`iconFontLigature: <trimmed ligature text>`。
- Figma Editable Accurate import MUST create an image/vector layer for `assetRole: "icon-font"` nodes, not a TEXT layer with the ligature string.
- Figma Editable Accurate import MUST synthesize SVG bytes for legacy recognized Material icon text nodes that lack `assetRef`, then create an image/vector layer instead of a TEXT layer.
- Unknown ligatures MUST keep the existing text behavior and MUST NOT create a placeholder asset.

Interface / data shape:

- Shared helper module in `packages/capture-schema/src/index.ts` exports a detector and SVG byte builder used by `captureVisualAssets` and Figma import layout modeling.
- Existing package format remains compatible: icon font support uses existing `assetRef`, `assets/*`, and `attributes.assetKind` / `attributes.assetRole`; no schema version change.
- Figma plugin checks the existing captured node attributes, shared Material icon detection result, and model `assetRole` to route icon-font assets through `createImageLayer`.
- Legacy synthesized icon models carry `bytes` directly on the model and a synthetic `assetRef` rooted under `assets/` for metadata; they do not mutate the package assets map or require a schema version change.

Failure modes:

- If the ligature name is unsupported, no asset is created and no diagnostic is required.
- If SVG import fails in Figma, the existing SVG image fallback path records the import failure and creates the normal placeholder/crop fallback.
- Capture and import MUST continue when icon recognition finds no match.
- If a legacy recognized icon is synthesized during import, failures use the same SVG import fallback path as packaged SVG assets.

Acceptance criteria:

- `apps/chrome-extension/test/asset-capture.test.mjs` includes a recognized Material icon ligature test and an unsupported ligature test.
- `apps/figma-plugin/test/layout-tree.test.mjs` verifies icon-font asset nodes model as IMAGE rather than TEXT.
- `apps/figma-plugin/test/runtime-import.test.mjs` verifies async runtime import creates vector/image output for an icon-font asset and does not load text fonts for that node.
- `apps/figma-plugin/test/layout-tree.test.mjs`, `apps/figma-plugin/test/runtime-import.test.mjs`, and `apps/figma-plugin/test/plugin-scaffold.test.mjs` verify legacy Material icon text nodes without `assetRef` import as vector/image output and do not create ligature TEXT.
- `corepack pnpm test --filter` is not used because this workspace uses the root test runner; verification command is `corepack pnpm test` or targeted Node test commands for the modified test files.
- `spectra analyze fix-material-icon-ligature-import --json` and `spectra validate fix-material-icon-ligature-import` pass.

Scope boundaries:

- In scope: Material Icons / Material Symbols ligature nodes where the icon name is in the local map, including newly exported packages and legacy packages without icon-font assets.
- Out of scope: downloading icon definitions, complete Material Symbols coverage, arbitrary icon fonts such as Font Awesome, changing `.figcapture` schema version, and replacing already-captured SVG/image assets.

## Risks / Trade-offs

- [Risk] Local map can be incomplete → Mitigation: unknown ligatures remain editable text and the map can grow incrementally with tests.
- [Risk] Filled Material Icons paths may not match every Material Symbols visual variant exactly → Mitigation: current target is avoiding visible ligature strings with high-fidelity common icons; exact variant axes remain out of scope.
- [Risk] Duplicating detection between extension and importer can drift → Mitigation: Material icon detection and SVG generation live in a shared capture-schema helper consumed by both extension and plugin runtime.
