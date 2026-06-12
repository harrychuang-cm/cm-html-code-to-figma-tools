## Why

目前匯入後的 `Editable Accurate` frame 中,layer 名稱只有 `Frame / div`、`Text / ...`、`Shape / span` 這類技術性名稱,設計師面對數百層 layer 時無法辨識哪一塊是 header、footer、navigation、button 或 card。capture 端其實已經保存了 `tagName`、`role`、`aria-label`、`id`、`class` 等語意資料,但 Figma plugin 端完全沒有使用,等於白白浪費了已截取的結構資訊。

## What Changes

- 新增 semantic naming module:依優先序由語意資料推導人類可讀的 layer 名稱:
  1. HTML 語意標籤直接對應(`header`→`Header`、`footer`→`Footer`、`nav`→`Navigation`、`aside`→`Sidebar`、`main`→`Main`、`section`→`Section`、`article`→`Article`、`form`→`Form`、`button`→`Button`、`table`→`Table`、`ul`/`ol`→`List`、`li`→`List Item` 等)。
  2. ARIA landmark/widget role 對應(`banner`→`Header`、`navigation`→`Navigation`、`contentinfo`→`Footer`、`dialog`→`Modal`、`button`→`Button`、`tab`→`Tab`、`search`→`Search` 等),並以 `aria-label` 或可見文字作為名稱後綴(例如 `Button / 登入`)。
  3. 幾何啟發式(針對全 `div` 網站):貼齊 viewport 頂部的全寬容器命名為 `Header`、貼齊底部的全寬容器命名為 `Footer`、具背景色加圓角或陰影的容器命名為 `Card`。
  4. class token 比對:常見命名慣例 token(`btn`/`button`、`card`、`nav`、`menu`、`modal`、`badge`、`avatar`、`icon`、`tag`、`footer`、`header`、`sidebar`)對應到可讀名稱。
  5. 以上皆無法判斷時,維持既有的 `Frame / div` 等預設名稱,確保向後相容。
- 重複 sibling 模式偵測:同一個父容器下若有多個結構相似的兄弟節點(相同 tagName、相似 class、相似子樹形狀),統一命名並編號(例如 `Card 1`、`Card 2`、`List Item 1`),讓設計師一眼看出重複版型。
- 壓平無視覺意義的 wrapper:單一可渲染子節點、無背景/邊框/陰影/asset/文字、且自身外框與子節點外框幾乎相同(容差 1px)的 wrapper frame,在 layer 樹中省略,直接讓子節點上提,減少無意義的巢狀深度。已套用 Auto Layout 的 frame 不壓平。
- module runtime(`layout-tree.ts` 與 `renderer.ts` 的命名路徑)與 classic runtime(`code-classic.js`)行為一致。
- import report 增加 semantic naming 統計:被語意命名的 layer 數、重複群組數、被壓平的 wrapper 數,供設計師與開發 debug。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `production-ui-import`: 匯入產生的 Figma layers 必須使用已截取語意資料推導的人類可讀名稱、為重複 sibling 群組統一命名編號、並壓平無視覺意義的 wrapper 層級。

## Impact

- Affected specs: `production-ui-import`
- Affected code:
  - New:
    - `apps/figma-plugin/src/semantic-naming.ts`
    - `apps/figma-plugin/test/semantic-naming.test.mjs`
  - Modified:
    - `apps/figma-plugin/src/layout-tree.ts`
    - `apps/figma-plugin/src/renderer.ts`
    - `apps/figma-plugin/src/report.ts`
    - `apps/figma-plugin/src/code-classic.js`
    - `apps/figma-plugin/test/layout-tree.test.mjs`
    - `apps/figma-plugin/test/editable-accurate.test.mjs`
    - `apps/figma-plugin/test/import-report.test.mjs`
    - `docs/v1-usage-and-acceptance.md`
