## 1. Semantic naming module(module runtime)

- [x] 1.1 建立 `apps/figma-plugin/src/semantic-naming.ts`,依 design「命名優先序採用固定的五層 fallback 鏈」實作 `semanticNameForNode(node, context)`:語意標籤對應表、ARIA role 對應表、幾何啟發式(Header/Footer/Card 條件)、class token 完整比對、未命中回傳 null;互動與標題層附加 `aria-label` 或單行文字後綴(`Button / 登入`,上限 32 字元)。交付 spec「Semantic layer names from captured semantics」的推導行為。驗證:新增 `apps/figma-plugin/test/semantic-naming.test.mjs`,五層 fallback 每層至少一個正向與一個負向案例、子字串不誤判案例、後綴格式案例,`corepack pnpm test` 通過。
- [x] 1.2 在 `semantic-naming.ts` 實作 `annotateRepeatedSiblingGroups(children)`:以 tagName + class tokens + 第一層子節點 tagName 序列作為結構簽名,同父容器下簽名相同且成員 ≥ 2 的群組依視覺順序產生 `Card 1`、`Card 2` 名稱覆寫 map,單一成員不編號。交付 spec「Repeated sibling group naming」,對應 design「重複 sibling 群組以結構簽名偵測並編號」。驗證:`semantic-naming.test.mjs` 新增三個同簽名卡片編號案例與結構不同 sibling 不分組案例。

## 2. Layout tree 與 renderer 整合

- [x] 2.1 `apps/figma-plugin/src/layout-tree.ts` 的 `layerNameForNode` 與 `apps/figma-plugin/src/renderer.ts` flat 路徑的 `layerNameForNode` 改為先呼叫 `semanticNameForNode` 與 sibling group 覆寫,未命中才用既有預設名稱;任何推導例外 fallback 到預設名稱且匯入不失敗。驗證:`apps/figma-plugin/test/layout-tree.test.mjs` 新增 `header`/`nav`/`footer`/`button` fixture 產出 `Header`/`Navigation`/`Footer`/`Button / <text>` 名稱的案例,且既有命名案例不回歸。
- [x] 2.2 在 layout tree 建構後新增 `collapseNonVisualWrappers(rootModel)` 後處理,依 design「壓平 wrapper 採用嚴格白名單條件」實作 spec「Non-visual wrapper collapsing」:單一可渲染子節點、無視覺樣式、rect 差 ≤ 1px、非 Auto Layout 且非其直接子節點、無 semantic 名稱時以子節點取代 wrapper,連鎖遞迴,所有保留節點 absoluteRect 不變並回傳壓平計數。驗證:`layout-tree.test.mjs` 新增透明同尺寸 wrapper 壓平、`nav` 語意 wrapper 保留、Auto Layout 直接子節點不壓平三個案例。

## 3. Import report 統計

- [x] 3.1 `apps/figma-plugin/src/report.ts` 的 `createImportReport` 輸出新增 `semanticNames`、`repeatedGroups`、`collapsedWrappers` 三個計數欄位,缺漏時顯示 0,UI 報告文字同步顯示,對應 design「import report 增加 semantic naming 統計欄位」與 spec「Semantic naming statistics in import report」。驗證:`apps/figma-plugin/test/import-report.test.mjs` 新增含統計與缺漏預設 0 的案例。

## 4. Classic runtime 移植與 parity

- [x] 4.1 依 design「共用 semantic-naming module 並手動移植到 classic runtime」,在 `apps/figma-plugin/src/code-classic.js` 實作等價的 semantic 命名、sibling 編號、wrapper 壓平與 report 統計,交付 spec「Semantic naming runtime parity」:同一 `.figcapture` 輸入下 classic runtime 與 module runtime 產出相同 layer 名稱、相同壓平後樹形與相同統計。驗證:`apps/figma-plugin/test/plugin-scaffold.test.mjs` 新增 parity 案例,使用與 2.1/2.2 相同 fixture 斷言名稱、樹形與統計一致。

## 5. 文件與整體驗收

- [x] 5.1 更新 `docs/v1-usage-and-acceptance.md`:Figma Output 章節描述 semantic layer naming 優先序、重複群組編號、wrapper 壓平行為與 report 新統計;Acceptance Checks 增加對應驗收條件。驗證:文件內容審閱涵蓋上述四點。
- [x] 5.2 執行 `corepack pnpm build`、`corepack pnpm test`、`corepack pnpm test:e2e` 全數通過,確認既有 27 輪 guardrails 測試與 e2e smoke 無回歸。驗證:三個指令 exit code 0。
