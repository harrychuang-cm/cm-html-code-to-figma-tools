## Context

DOM snapshot 有兩個平行實作:`apps/chrome-extension/src/capture-core.ts` 的 `snapshotDomElement`(純模組,被 `capture-core.test.mjs` 以假 DOM 物件測試,也被 `apps/chrome-extension/src/content.ts` 使用)與 `apps/chrome-extension/src/content-script.ts` 內的同名函式(實際注入頁面的 runtime)。兩者目前都只走 `element.children`,Shadow DOM 子樹完全不會出現在 `.figcapture` 中。

fallback 機制現況:`apps/chrome-extension/src/asset-capture.ts` 以 `FALLBACK_TAGS`(canvas、iframe、video)判定 raster fallback 區域並指派 `fallbackRef`;`apps/chrome-extension/src/capture-package.ts` 的 `createScreenshotCropFallbackProvider` 能以節點 rect 從 viewport 截圖裁出 PNG。closed shadow host 可重用這條路徑。

chrome.dom.openOrClosedShadowRoot 在 Chrome 88+ 的 content script 可用,不需額外 manifest 權限;`capture-core.ts` 是純模組,無法呼叫 chrome API,只能讀取呼叫端附加在元素上的資料。

## Goals / Non-Goals

**Goals:**

- open shadow root 子樹完整出現在 capture 與 Figma 匯入結果中,幾何與樣式正確。
- slot 投影內容依瀏覽器實際渲染位置截取(slot 本身不產生 box)。
- 可取得的 closed shadow root 視同 open 處理;無法取得時該 host 以 screenshot crop raster fallback 呈現並記錄診斷,匯入不失敗。
- `capture-core.ts` 與 `content-script.ts` 行為一致,均有測試。

**Non-Goals:**

- 不處理 iframe 內容(維持既有 raster fallback,獨立議題)。
- 不處理 adopted stylesheets 的特殊序列化(getComputedStyle 已涵蓋計算後樣式)。
- 不改 Figma plugin(capture 產出的節點樹形狀不變,plugin 端無感)。
- 不做全頁分段截取(下一個 change)。
- 不改 capture schema 欄位(shadow 內容以一般 element 節點表示)。

## Decisions

### 以渲染樹取代 light DOM 樹遍歷

`snapshotDomElement` 取得子節點時改用 renderedChildElements(element):元素有可取得的 shadow root 時回傳 shadow root 的子元素,否則回傳 `element.children`。host 的 light DOM 子元素不直接遍歷 — 它們只會在 slot 投影時出現,避免同一內容重複截取或截到未渲染內容。host 自身的 rect、樣式、屬性照常捕捉。替代方案是同時保留 light 與 shadow 兩棵子樹再由 plugin 端去重,但這會破壞「capture 即渲染結果」的既有 contract 且增加 plugin 複雜度,不採用。

### slot 以投影內容展開

遍歷遇到 `<slot>` 時不為 slot 本身建立節點(slot 預設 display: contents,無渲染 box),改為在該位置展開:有 assignedElements({ flatten: true }) 時遍歷投影元素;無投影時遍歷 slot 的預設子元素。assigned nodes 中的文字節點以 document.createRange().selectNode(textNode) 的 getBoundingClientRect 取得渲染 rect,捕捉為 nodeType 為 text 的合成節點(tagName 使用 #slotted-text),樣式取自 slot 元素的 computed style(flattened tree 的繼承點)。Range API 不可用(單元測試假 DOM)時略過該文字節點。

### closed shadow root 先取後備援

content script 端 renderedChildElements 依序嘗試:element.shadowRoot → chrome.dom.openOrClosedShadowRoot(element)(以 try/catch 包裹,API 不存在或丟例外時回傳 null)。兩者皆無但元素為自訂元素(tagName 含連字號)且無 light 子元素可渲染時,在節點 attributes 標記 data-closed-shadow-root 為 true。`capture-core.ts` 為純模組,只認元素物件上既有的 shadowRoot 屬性與 openOrClosedShadowRoot 注入函式(由呼叫端以 options 傳入),不直接依賴 chrome API。

### closed host 重用 screenshot crop fallback

`asset-capture.ts` 的 fallback 判定除 FALLBACK_TAGS 外,新增:節點 attributes 含 data-closed-shadow-root 時視為 fallback 區域,fallback reason 為 closed shadow root fallback,沿用既有 createScreenshotCropFallbackProvider 以節點 rect 從截圖裁圖;裁圖失敗時依既有行為記錄 missing asset 診斷且不阻斷匯出。

### 雙實作各自測試加同形 fixture

`capture-core.test.mjs` 以假 DOM 物件(帶 shadowRoot、assignedElements、預設 slot 內容、注入的 openOrClosedShadowRoot)驗證遍歷邏輯;`asset-capture.test.mjs` 驗證 closed host 的 fallback 指派與 reason。`content-script.ts` 與 `capture-core.ts` 的 renderedChildElements/slot 展開邏輯逐行同形維護(既有慣例),並新增 `fixtures/web-components/manual-fixture.html`(open root 元件、closed root 元件、具名與預設 slot、slotted text)供手動驗收,步驟寫入 `docs/manual-runtime-test.md`。

## Implementation Contract

- **行為**:對含 Web Components 的頁面執行截取後,open shadow root 與可取得的 closed shadow root 內的元素以一般 element 節點出現在 capture.json,rect 與 computed styles 來自瀏覽器實際渲染;slot 位置出現的是投影內容而非 slot 節點;無法取得的 closed shadow host 在 .figcapture 中帶 fallbackRef,匯入 Figma 後顯示該區域的截圖裁圖;diagnostics 記錄 closed shadow root fallback 原因。
- **介面**:`capture-core.ts` 匯出的 captureVisibleViewportFromDocument 與 captureElementTree 簽名不變,新增可選 options.openOrClosedShadowRoot(element 到 shadow root 或 null 的函式);內部新增 renderedChildElements(element, options)。content script 端等價實作直接使用 chrome.dom。capture schema 與 figma-plan 結構不變。
- **失敗模式**:openOrClosedShadowRoot 呼叫丟例外視同無 shadow root;Range API 不可用時略過 slotted text 不丟例外;screenshot crop 失敗時記錄 missing asset 診斷,匯出與匯入皆不失敗。
- **驗收標準**:
  - `corepack pnpm build`、`corepack pnpm test`、`corepack pnpm test:e2e` 全綠。
  - `capture-core.test.mjs` 新增:open shadow root 子樹被捕捉(host 的 light 子元素不直接出現)、具名/預設 slot 投影內容在 slot 位置出現且 slot 節點本身不出現、slot 預設內容在無投影時出現、注入 openOrClosedShadowRoot 時 closed root 子樹被捕捉、無法取得時 host 帶 data-closed-shadow-root 標記。
  - `asset-capture.test.mjs` 新增:data-closed-shadow-root 節點被指派 fallbackRef 且 reason 為 closed shadow root fallback。
  - 手動驗收:依 docs/manual-runtime-test.md 對 fixtures/web-components/manual-fixture.html 截取,Figma 匯入結果包含 shadow 內容的可編輯 layers 與 closed 區域的裁圖 fallback。
- **範圍邊界**:in scope = extension 端 DOM 遍歷、slot 展開、closed root 取得與 fallback 標記、asset-capture fallback 判定、測試與文件;out of scope = iframe 內容、全頁截取、capture schema 變更、Figma plugin 變更。

## Risks / Trade-offs

- [chrome.dom.openOrClosedShadowRoot 在部分 Chromium 衍生瀏覽器不可用] → try/catch 包裹,行為退化為 closed host 走 screenshot crop fallback,功能不中斷。
- [slot flatten 後與巢狀 slot 的邊界案例(slot 投影到另一個 slot)] → assignedElements({ flatten: true }) 由瀏覽器處理巢狀鏈,直接回傳最終投影元素;單元測試含一個巢狀投影案例鎖定行為。
- [自訂元素誤判(有連字號但無 shadow root 的元素被標記 closed)] → 標記條件要求「無 shadow root 且無可渲染 light 子元素且為自訂元素」,一般有內容的自訂元素照常遍歷 light 子樹,不受影響。
- [shadow 內樣式依賴 :host/::slotted 等選擇器] → getComputedStyle 回傳的是計算後的最終值,選擇器來源不影響截取結果。
- [雙實作漂移] → 與既有 snapshotDomElement 維護慣例相同,兩邊測試各自鎖定相同行為;fixture 頁面提供端到端人工比對。

