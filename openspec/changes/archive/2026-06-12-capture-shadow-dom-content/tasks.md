## 1. Capture module(pure module)

- [x] 1.1 在 `apps/chrome-extension/src/capture-core.ts` 實作 renderedChildElements(element, options) 並接入 snapshotDomElement,依 design「以渲染樹取代 light DOM 樹遍歷」:有可取得 shadow root 時遍歷 shadow root 子元素、host 自身 rect/styles/attributes 照常捕捉、未投影的 light 子元素不出現。交付 spec「Shadow DOM content capture」。驗證:`apps/chrome-extension/test/capture-core.test.mjs` 新增 open shadow root 子樹被捕捉、host 的 light 子元素不直接出現兩個案例,`corepack pnpm test` 通過。
- [x] 1.2 在 capture-core.ts 實作 slot 展開,依 design「slot 以投影內容展開」交付 spec「Slot projection capture」:assignedElements flatten 投影、無投影時用預設內容、slot 本身不產生節點、assigned text nodes 以 Range rect 捕捉為 #slotted-text 合成節點且 Range 不可用時略過。驗證:capture-core.test.mjs 新增具名 slot 投影、預設內容、巢狀投影 flatten、slotted text 四個案例。
- [x] 1.3 在 capture-core.ts 支援 options.openOrClosedShadowRoot 注入存取器並實作 closed host 標記,依 design「closed shadow root 先取後備援」交付 spec「Shadow capture runtime parity」的 module 端:注入存取器回傳 closed root 時視同 open 遍歷;無 shadow root、無可渲染 light 子元素且 tagName 含連字號時在 attributes 標記 data-closed-shadow-root。驗證:capture-core.test.mjs 新增注入存取器捕捉 closed 子樹、無法取得時標記 data-closed-shadow-root 兩個案例。

## 2. Content script runtime

- [x] 2.1 在 `apps/chrome-extension/src/content-script.ts` 同形實作 renderedChildElements、slot 展開與 closed host 標記,直接使用 element.shadowRoot 與 try/catch 包裹的 chrome.dom.openOrClosedShadowRoot,交付 spec「Shadow capture runtime parity」:同一 DOM 輸入下與 capture-core.ts 產出相同節點樹。驗證:逐段比對兩實作的遍歷函式行為一致(content review),且 `corepack pnpm build` 後 `apps/chrome-extension/test/runtime-flow.test.mjs` 既有案例不回歸。

## 3. Closed host fallback

- [x] 3.1 在 `apps/chrome-extension/src/asset-capture.ts` 的 fallback 判定加入 data-closed-shadow-root 節點,指派 fallbackRef 並以 closed shadow root fallback 作為 diagnostic reason,沿用既有 createScreenshotCropFallbackProvider 裁圖,裁圖失敗記 missing asset 且不阻斷匯出,依 design「closed host 重用 screenshot crop fallback」交付 spec「Closed shadow root fallback」。驗證:`apps/chrome-extension/test/asset-capture.test.mjs` 新增 closed host 指派 fallbackRef 與 reason 案例、裁圖不可用時仍可匯出且記 missing asset 案例。

## 4. Fixture 與文件

- [x] 4.1 新增 `fixtures/web-components/manual-fixture.html`:含 open shadow root 元件、closed shadow root 元件、具名與預設 slot、slotted text,依 design「雙實作各自測試加同形 fixture」供手動驗收;並更新 `docs/manual-runtime-test.md` 加入該 fixture 的截取與 Figma 匯入驗收步驟、`docs/v1-usage-and-acceptance.md` 的 Capture Contract 與 Acceptance Checks 描述 shadow DOM 行為。驗證:fixture 在 Chrome 開啟可見三種元件渲染;文件內容審閱涵蓋 open/closed/slot 三種行為與 fallback。

## 5. 整體驗收

- [x] 5.1 執行 `corepack pnpm build`、`corepack pnpm test`、`corepack pnpm test:e2e` 全數通過,確認既有 capture/export/import 測試與 e2e smoke 無回歸。驗證:三個指令 exit code 0。
