## Why

目前 Chrome Extension 的 DOM snapshot(`capture-core.ts` 與 `content-script.ts` 的 snapshotDomElement)只遍歷 `element.children`,完全不處理 Shadow DOM。使用 Web Components 的網站(YouTube、Salesforce 系產品、許多 design system 元件)在截取時整塊內容消失,匯入 Figma 後變成空白區域,使「截取任何網站」的通用目標在現代網站上直接失效。

## What Changes

- DOM snapshot 改為遍歷「渲染樹」:元素若有可取得的 shadow root,改為遍歷 shadow root 的子元素(light DOM 子元素僅透過 slot 投影才會渲染)。
- `<slot>` 元素以其投影內容取代:有 assigned elements 時遍歷投影元素,無投影時遍歷 slot 的預設內容;assigned text nodes 以 Range API 取得渲染位置,捕捉為合成文字節點。
- closed shadow root 在 content script 透過 chrome.dom.openOrClosedShadowRoot 取得;API 不可用或仍無法取得時,該 host 標記為 raster fallback 區域,重用既有的 screenshot crop 機制(與 canvas fallback 同路徑),並記錄 closed shadow root fallback 診斷。
- `capture-core.ts`(純模組,單元測試)與 `content-script.ts`(真實 runtime)兩個實作行為一致。
- 新增使用 Web Components(open/closed shadow root、slot 投影)的手動測試 fixture 頁面,並更新手動測試文件。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `production-ui-import`: 截取必須涵蓋 shadow DOM 渲染內容 — open shadow root 子樹、slot 投影內容、可取得的 closed shadow root;無法取得的 closed shadow host 必須以 screenshot crop raster fallback 呈現並記錄診斷。

## Impact

- Affected specs: `production-ui-import`
- Affected code:
  - New:
    - `fixtures/web-components/manual-fixture.html`
  - Modified:
    - `apps/chrome-extension/src/capture-core.ts`
    - `apps/chrome-extension/src/content-script.ts`
    - `apps/chrome-extension/src/asset-capture.ts`
    - `apps/chrome-extension/test/capture-core.test.mjs`
    - `apps/chrome-extension/test/asset-capture.test.mjs`
    - `docs/v1-usage-and-acceptance.md`
    - `docs/manual-runtime-test.md`
