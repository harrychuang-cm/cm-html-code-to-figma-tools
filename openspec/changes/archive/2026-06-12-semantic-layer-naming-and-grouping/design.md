## Context

匯入流程目前有三個 layer 命名點:

- `apps/figma-plugin/src/layout-tree.ts` 的 `layerNameForNode`(module runtime 的 Editable Accurate 樹狀輸出,被 `renderer.ts` 的 tree 路徑使用)。
- `apps/figma-plugin/src/renderer.ts` 內部的 `layerNameForNode`(舊 flat model 路徑 `createAccurateNodeModels`)。
- `apps/figma-plugin/src/code-classic.js`(實際出貨的 classic plugin runtime,build 時 `scripts/build.mjs` 會用它覆蓋 `dist/code.js`,內部重複實作了 layout-tree 邏輯)。

三處都只輸出 `Frame / div`、`Text / ...` 這類技術名稱。capture 端(`apps/chrome-extension/src/capture-core.ts`)已將 `id`、`class`、`role`、`aria-label`、`alt`、`data-*` 屬性與 `tagName` 寫入 `.figcapture`,plugin 端目前僅一處用 `role` 判斷 interactive text sizing。capture schema 不需要改動。

classic runtime 沒有 module import,由 `apps/figma-plugin/test/plugin-scaffold.test.mjs` 直接載入原始碼測試;module runtime 由 `layout-tree.test.mjs`、`editable-accurate.test.mjs`、`runtime-import.test.mjs` 覆蓋。

## Goals / Non-Goals

**Goals:**

- 匯入後的 layer 名稱讓設計師可辨識 Header、Footer、Navigation、Button、Card 等 UI 區塊。
- 重複的 sibling 版型(卡片、列表項)有一致的名稱與編號。
- 減少無視覺意義的 wrapper 巢狀深度。
- module runtime 與 classic runtime 命名行為一致。
- import report 揭露 semantic naming 統計,可驗證與 debug。

**Non-Goals:**

- 不改動 Chrome Extension 與 capture schema(語意資料已存在)。
- 不建立 Figma components 或 component variants(留待後續 change)。
- 不做機器學習或外部服務的語意推斷,只用確定性規則。
- 不改變 Auto Layout 推導與 27 輪 fidelity guardrails 的行為;壓平 wrapper 不得影響任何節點的最終絕對位置與尺寸。
- 不處理 Shadow DOM、全頁截取等通用性議題(獨立 change)。

## Decisions

### 共用 semantic-naming module 並手動移植到 classic runtime

新增純函式 module `apps/figma-plugin/src/semantic-naming.ts`,由 `layout-tree.ts` 與 `renderer.ts` 共用。classic runtime 依既有慣例(layout-tree 邏輯已是手動移植)在 `code-classic.js` 內部實作等價函式,並在 `plugin-scaffold.test.mjs` 加入與 module 端相同輸入輸出的 parity 測試案例。替代方案是讓 build script 把 module 轉譯進 classic bundle,但這會改變既有 build 慣例、引入額外風險,不在本次範圍。

### 命名優先序採用固定的五層 fallback 鏈

`semanticNameForNode(node, context)` 依序嘗試,第一個命中即回傳:

1. **語意標籤對應表**:`header`、`footer`、`nav`、`aside`、`main`、`section`、`article`、`form`、`button`、`table`、`thead`、`tbody`、`tr`、`ul`、`ol`、`li`、`a`、`input`、`select`、`textarea`、`label`、`h1`-`h6`、`dialog`、`figure`、`img`、`video`。
2. **ARIA role 對應表**:landmark roles(`banner`、`navigation`、`contentinfo`、`complementary`、`main`、`search`、`form`、`region`)與 widget roles(`button`、`tab`、`tablist`、`dialog`、`menu`、`menuitem`、`menubar`、`listbox`、`list`、`listitem`、`checkbox`、`radio`、`switch`、`textbox`、`toolbar`、`tooltip`、`alert`、`progressbar`)。
3. **幾何啟發式**(僅限 FRAME 類型且無前兩層命中):貼齊 viewport 頂部(y ≤ 2px)、寬度 ≥ viewport 寬度 90%、高度 ≤ viewport 高度 25% 的容器命名 `Header`;貼齊 viewport 底部的對稱條件命名 `Footer`;具可見背景色且 border-radius ≥ 4px 或可見 box-shadow、且含至少 2 個可渲染子節點的容器命名 `Card`。
4. **class token 對應表**:以 `-`、`_`、空白、camelCase 邊界切分 class 字串為 tokens,完整 token 比對(`btn`/`button`→`Button`、`card`→`Card`、`nav`/`navbar`/`menu`→`Navigation`、`modal`/`dialog`/`popup`→`Modal`、`badge`/`tag`/`chip`→`Badge`、`avatar`→`Avatar`、`icon`→`Icon`、`header`→`Header`、`footer`→`Footer`、`sidebar`/`aside`→`Sidebar`、`tab`→`Tab`、`tooltip`→`Tooltip`、`banner`/`hero`→`Hero`、`form`→`Form`、`search`→`Search`、`list`→`List`、`item`→`List Item`、`title`/`heading`→`Heading`、`logo`→`Logo`)。子字串不算命中(`scarden` 不會命中 `card`),避免誤判。
5. **既有預設名稱**:回傳 null,呼叫端維持現行 `Frame / div`、`Text / ...`、`Shape / span` 命名,保證向後相容。

互動元素(Button、Tab、Link、Heading)若有 `aria-label` 或單行可見文字,名稱加上後綴,格式 `Button / 登入`(與既有 `Text / ...` 格式一致,後綴上限 32 字元)。

### 重複 sibling 群組以結構簽名偵測並編號

對每個容器的直接子節點計算結構簽名:`tagName` + 排序後的 class tokens(取交集穩定的 token)+ 子樹第一層的 tagName 序列。同一父容器下簽名相同的節點數 ≥ 2 即視為重複群組:群組成員以「該群組的 semantic 名稱或簽名推導名稱 + 空格 + 1-based 序號」命名(`Card 1`、`Card 2`、`List Item 3`)。編號依視覺順序(已套用 row-reverse 修正後的插入順序)。不同群組互不影響,單一成員不編號。

### 壓平 wrapper 採用嚴格白名單條件

layout tree 建構完成後的後處理步驟 `collapseNonVisualWrappers(model)`:當一個 FRAME model 同時滿足以下全部條件時,以其唯一子節點取代它(子節點絕對座標不變):

- 恰好一個子節點,且自身無直接文字、無 assetRef/fallbackRef。
- 無可見背景、邊框、陰影、漸層、opacity < 1、transform、clipsContent。
- 自身 rect 與子節點 rect 在 x、y、width、height 上差距皆 ≤ 1px。
- 自身未套用 Auto Layout,且不是 Auto Layout 父容器的直接子節點(避免破壞 sibling spacing 推導)。
- 自身沒有 semantic 名稱命中(語意容器如 `nav` 即使透明也保留)。

壓平是純 layer 結構簡化,所有保留節點的 absoluteRect 不變。連鎖 wrapper(A 包 B 包 C)遞迴壓平。

### import report 增加 semantic naming 統計欄位

`createImportReport` 輸出新增 `semanticNames`(被語意命名的 layer 數)、`repeatedGroups`(偵測到的重複群組數)、`collapsedWrappers`(被壓平的 wrapper 數)。UI 報告文字同步顯示這三個數字。

## Implementation Contract

- **行為**:設計師匯入 `.figcapture` 後,Editable Accurate frame 內的 layers 對語意可判斷的節點顯示 `Header`、`Navigation`、`Button / 登入`、`Card 1` 等名稱;無法判斷的節點維持現行名稱;無視覺意義的 wrapper 不出現在 layer 樹中;import report 顯示三個新統計數字。
- **介面**:`semantic-naming.ts` 匯出 `semanticNameForNode(node, context)`(回傳 `string | null`,context 含 viewport 尺寸)、`annotateRepeatedSiblingGroups(children)`(回傳名稱覆寫 map)、被 `layout-tree.ts` 的 `layerNameForNode` 與 `renderer.ts` 的 flat 命名函式呼叫;`collapseNonVisualWrappers(rootModel)` 在 layout tree 建構後執行並回傳壓平計數。classic runtime 提供同名等價函式。
- **失敗模式**:semantic 推導任何一步丟出例外或回傳非字串時,呼叫端 fallback 到現行預設名稱,匯入不得失敗;統計欄位缺漏時 report 顯示 0。
- **驗收標準**:
  - `corepack pnpm test` 全綠。
  - `semantic-naming.test.mjs`:五層 fallback 鏈每層至少一個正向與一個負向案例;class token 子字串不誤判;`aria-label` 後綴格式正確。
  - `layout-tree.test.mjs` 新增案例:`header`/`nav`/`footer` fixture 產出對應名稱;重複卡片列產出 `Card 1`、`Card 2`;透明同尺寸 wrapper 被壓平且子節點 absoluteRect 不變;Auto Layout 子節點不被壓平。
  - `plugin-scaffold.test.mjs` 新增 classic runtime parity 案例:同一 fixture 在 classic runtime 產出相同 layer 名稱與壓平結果。
  - `import-report.test.mjs`:report 含三個新統計欄位。
  - 既有測試(含 e2e smoke)不得回歸。
- **範圍邊界**:in scope = Figma plugin 的命名、sibling 編號、wrapper 壓平、report 統計與對應文件;out of scope = capture schema、Chrome Extension、Auto Layout 推導行為、Figma components、節點幾何改動。

## Risks / Trade-offs

- [幾何啟發式在非典型版型誤判(例如貼頂的廣告橫幅被命名 Header)] → 啟發式僅在語意標籤與 ARIA role 都未命中時生效,且條件保守(全寬 + 貼邊 + 高度上限);誤判只影響名稱不影響幾何,設計師可改名。
- [class token 對應在 CSS Modules/hash class(如 `css-1x2y3z`)無效] → 屬預期行為,fallback 鏈會落到下一層;hash token 不會誤命中因為採完整 token 比對。
- [壓平 wrapper 改變 layer 樹形狀,可能使既有測試的節點路徑斷言失效] → 壓平條件嚴格(同尺寸、無視覺、非 Auto Layout 相關),既有測試若因此失敗,逐案確認是預期的結構簡化後更新斷言。
- [classic runtime 手動移植與 module 版漂移] → parity 測試用相同 fixture 鎖定兩邊輸出;report 統計數字也比對。
- [重複群組簽名過於寬鬆把不同卡片誤編成同組] → 簽名含子樹第一層 tagName 序列,結構不同即不同組;誤判僅影響名稱編號,無幾何風險。

