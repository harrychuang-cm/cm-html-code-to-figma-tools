## Why

UI 設計師目前需要依賴 production website 才能知道最新介面狀態，因為工程調整常常比 Figma 設計稿更新。這個 change 要建立一個 local-first 的 Production UI to Figma 匯入工具，讓設計師能把已登入或未登入的 Chrome current viewport 轉成可在 Figma 中檢查與編輯的設計稿。

## What Changes

- 新增 Chrome Extension capture 流程：設計師在目前 Chrome tab 中 capture visible viewport，支援登入後與未登入 UI，capture 前不需要工具代管帳密。
- 新增 .figcapture package 格式：包含 source capture、Figma import plan、screenshot reference、assets、diagnostics，讓設計師與產品團隊都能 debug 匯入品質。
- 新增 Figma Plugin import 流程：匯入 .figcapture 後產生三個並排 frame：Source Screenshot、Editable Accurate、Auto Layout Experimental。
- 新增 visual-first renderer contract：V1 以視覺相似度為最高優先，Editable Accurate 保留可靠輸出，Auto Layout Experimental 在不犧牲主輸出的情況下驗證 auto layout 推導。
- 新增 import validation experience：設計師可在 capture preview 與 Figma import 結果中查看 fallback、unsupported CSS、missing assets、auto layout confidence 等資訊。

## Capabilities

### New Capabilities

- production-ui-import: 支援從 production website current viewport 擷取 DOM、computed styles、assets、screenshot，並匯入 Figma 成為可檢查與可編輯的 page import frames。

### Modified Capabilities

(none)

## Impact

- Affected specs: production-ui-import
- Affected code:
  - New: package.json
  - New: pnpm-workspace.yaml
  - New: packages/capture-schema/
  - New: apps/chrome-extension/
  - New: apps/figma-plugin/
  - Modified: none
  - Removed: none
