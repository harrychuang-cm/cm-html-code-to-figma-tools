## Context

截取編排現況:popup 送 CAPTURE_ACTIVE_TAB_MESSAGE 給 background service worker,background 的 createChromeCaptureRuntime(`apps/chrome-extension/src/runtime.ts`)依序執行 content script DOM 截取(tabs.sendMessage)與 captureVisibleScreenshot(`apps/chrome-extension/src/screenshot.ts` 的 tabs.captureVisibleTab),再交給 buildConfirmedExportPackage(`apps/chrome-extension/src/capture-package.ts`)組 `.figcapture`。

DOM 截取現況:content script 的 captureVisibleViewportFromDocument 以 viewport 為界做兩件事 — isRectInViewport 可見性過濾(不可見且無子節點即丟棄)與 clampRectToViewport 幾何裁切。getBoundingClientRect 對 offscreen 元素照常可用,viewport-only 是裁切策略造成的,不是 DOM 存取限制。

schema 現況:manifest 驗證(`packages/capture-schema/src/index.ts`)只檢查必填欄位,新增選填欄位不影響既有 package;CURRENT_SCHEMA_VERSION 為 1.0.0。plugin 端 createFrameModels(module)與 createFrames(classic)以 manifest.viewportWidth/viewportHeight 決定 frame 尺寸。

OffscreenCanvas 與 createImageBitmap 在 MV3 service worker 可用,capture-package 的 screenshot crop 已採同樣 API。

## Goals / Non-Goals

**Goals:**

- 設計師可在 popup 選擇 full page 模式,截取整頁 DOM 幾何與拼接截圖,匯入 Figma 得到完整頁面高度的兩個 frame。
- lazy-loaded 內容在截取前被預捲動觸發載入。
- fixed/sticky 元素在 DOM 與拼接截圖中各只出現一份。
- visible viewport 模式維持預設,行為與既有 package 完全不變。
- 超長頁面有明確上限與診斷警告,截取不會無限執行或耗盡記憶體。

**Non-Goals:**

- 不處理水平捲動的超寬頁面(documentWidth 取 viewport 與文件寬較大者,但不做水平分段)。
- 不做 multi-viewport batch capture(desktop/tablet/mobile)。
- 不處理頁內獨立捲動容器(overflow scroller)的展開,維持其可視內容。
- 不做無限捲動頁面的完整載入 — 預捲到上限即停。
- 不改 figma-plan、assets、診斷以外的 schema 結構;不升 schemaVersion(欄位為選填、向後相容)。

## Decisions

### 文件座標一次性 DOM 截取

full page 模式下,content script 先把頁面捲回 (0, 0),此時 getBoundingClientRect 的 viewport 座標即等於文件座標,對整棵樹做一次 snapshotDomElement。capture-core 的 captureElementTree 新增 options.captureBounds(預設等於 viewport):可見性過濾與幾何裁切改用 captureBounds(full page 時為 documentWidth × documentHeight),viewport metadata 照常記錄實際視窗尺寸。替代方案是逐段截 DOM 再合併節點樹,但同一元素會跨段出現,合併去重的複雜度與風險遠高於一次截取,不採用。

### fixed 與 sticky 元素自然去重加截圖隱藏

DOM 端:因為只在頁頂截取一次,position fixed 元素以其釘選位置出現一次,sticky 元素以自然位置出現一次,無需額外去重。截圖端:content script 在第一段截圖完成後,將 computed position 為 fixed 或 sticky 的元素暫時設為 visibility hidden(記錄原始 inline style),最後一段完成後還原;拼接圖因此只在第一段顯示 fixed/sticky 內容。

### background 編排分段流程

runtime.ts 的 captureActiveTab 接受 options.captureMode。full-page 流程:
1. content script 回傳頁面 metrics(documentWidth、documentHeight、viewport)。
2. 預捲動:依 viewport 高度逐段捲到頁底,每段等待 lazy loading settle(雙重 requestAnimationFrame 加 250ms 延遲),到達上限即停。
3. 捲回頁頂,執行文件座標 DOM 截取。
4. 逐段捲動,每段透過 captureVisibleScreenshot 收集 dataUrl 與該段 scrollY;第一段後隱藏 fixed/sticky。
5. 還原 fixed/sticky 可見性與原始捲動位置。
6. 以 stitch 模組拼接全頁截圖,組 package。

content script 新增訊息:FIGCAPTURE_PAGE_METRICS、FIGCAPTURE_SCROLL_TO(回傳實際 scrollY 並等待 settle)、FIGCAPTURE_SET_PINNED_HIDDEN(隱藏/還原 fixed/sticky)、FIGCAPTURE_COLLECT_DOM 增加 mode 參數。任一步驟失敗時還原捲動與可見性,錯誤以既有 runtime error category 機制回報。

### OffscreenCanvas 拼接模組

新增 `apps/chrome-extension/src/stitch-screenshot.ts`:輸入分段 [{ dataUrl, scrollY }]、viewport、documentHeight、devicePixelRatio,輸出單一 PNG dataUrl。畫布尺寸為 documentWidth × documentHeight 乘以 dpr,各段依 scrollY × dpr 繪入;最後一段與前段重疊的部分由繪製順序自然覆蓋(各段都繪在自身 scrollY 位置,內容相同處重疊無害,fixed/sticky 已在來源隱藏)。canvas 工廠與 createImageBitmap 以參數注入,單元測試用假 canvas 驗證繪製座標。Captured viewport screenshot 的既有單段路徑不變。

### 截取上限與診斷

documentHeight 上限 20000 CSS px、分段數上限 25 段(viewport 高 800 時約 20000px),先到先停。被截斷時 manifest 記錄實際截取的 documentHeight,diagnostics.warnings 記錄 full-page capture truncated 訊息。預捲與分段共用同一組上限。

### manifest 選填欄位與全頁 frame 輸出

createManifestFromCapture 新增選填 captureMode、documentWidth、documentHeight(僅 full-page 寫入);schema 驗證:captureMode 存在時必須是 viewport 或 full-page,full-page 時 documentWidth/documentHeight 必須為正數。plugin 端 module createFrameModels 與 classic createFrames 改為:captureMode 為 full-page 時 frame 與 screenshot layer 尺寸用 documentWidth/documentHeight,frame 命名仍為 title / 寬x高 / role(高為文件高);否則維持 viewport 尺寸。Editable Accurate 的節點樹照常以 captured rect 渲染,無需其他 plugin 變更。

## Implementation Contract

- **行為**:popup 選擇 full page 後點擊 capture,頁面自動捲動數次後回到原位;preview 顯示全頁拼接截圖與 full-page 模式;下載的 `.figcapture` 中 capture.json 的 root 高度為文件高、screenshot.png 為全頁拼接圖、manifest 含 captureMode 與文件尺寸;匯入 Figma 得到兩個 documentWidth × documentHeight 的 frame,fixed header 只出現一次。未選擇 full page 時所有行為與檔案內容與現行完全一致。
- **介面**:captureElementTree(root, viewport, { captureBounds });createChromeCaptureRuntime options 與 CAPTURE_ACTIVE_TAB_MESSAGE payload 增加 captureMode;content script 新訊息 FIGCAPTURE_PAGE_METRICS / FIGCAPTURE_SCROLL_TO / FIGCAPTURE_SET_PINNED_HIDDEN;stitchScreenshotSegments(segments, { documentWidth, documentHeight, devicePixelRatio, createCanvas, createBitmap }) 回傳 PNG dataUrl;manifest 選填欄位 captureMode / documentWidth / documentHeight。
- **失敗模式**:分段截圖或捲動失敗時還原捲動位置與 fixed/sticky 可見性,回報既有 screenshot-failed / capture-script-failed category;拼接環境缺 OffscreenCanvas 時 full-page 截取回報 screenshot-failed 並建議改用 viewport 模式;超過上限時截斷並記 diagnostics 警告,不報錯。
- **驗收標準**:
  - `corepack pnpm build`、`corepack pnpm test`、`corepack pnpm test:e2e` 全綠。
  - capture-core 測試:captureBounds 大於 viewport 時,viewport 外、文件內的節點被保留且不被裁切;預設(無 captureBounds)行為與既有案例完全一致。
  - stitch-screenshot 測試:三段 dataUrl 依 scrollY × dpr 繪入正確座標;輸出尺寸為文件尺寸 × dpr。
  - runtime-flow 測試:full-page 流程依序呼叫 metrics、預捲、DOM 截取、分段截圖、還原;任一段失敗時還原捲動;manifest 帶 captureMode 與文件尺寸;viewport 模式既有測試不回歸。
  - popup-preview 測試:模式切換存在且預設 viewport,full-page 時 preview 顯示文件尺寸。
  - schema 測試:合法/非法 captureMode 與文件尺寸的驗證案例。
  - three-frames 與 plugin-scaffold 測試:full-page manifest 產生文件尺寸 frame 與 screenshot layer,module 與 classic 行為一致;viewport package 維持原尺寸。
- **範圍邊界**:in scope = 模式選擇 UI、分段編排、文件座標 DOM 截取、截圖拼接、fixed/sticky 去重、schema 選填欄位、plugin frame 尺寸、上限與診斷、測試與文件;out of scope = 水平分段、multi-viewport、overflow scroller 展開、無限捲動完整載入、Auto Layout 行為變更。

## Risks / Trade-offs

- [動態頁面在捲動過程中變化(carousel 自動輪播、廣告刷新),DOM 與分段截圖不一致] → DOM 在預捲後一次截取,為單一一致快照;截圖僅供比對參考,輕微不一致可接受,文件註明此限制。
- [lazy loading 在預捲後仍未完成,部分圖片截到 placeholder] → 既有 lazy 屬性備援(data-src/srcset)已涵蓋大多數;settle 等待 250ms 為折衷,文件註明可重截。
- [captureVisibleTab 有每秒次數限制(MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND)] → 每段截圖間隔已含 settle 等待(約 250ms 以上),自然低於限制;若仍觸發,該段重試一次後才報錯。
- [sticky 元素在頁中段才釘住,隱藏策略使其在拼接圖中只出現在第一段的自然位置] → 與 DOM 端一致(sticky 以自然位置保留一份),拼接圖與 Editable Accurate 對齊,屬預期取捨。
- [超長頁面記憶體壓力(25 段 × dpr 2 的 bitmap)] → 上限封頂;逐段繪入後立即釋放 bitmap 參考,拼接完成才轉 PNG。
- [popup 在分段截取期間被關閉] → 編排在 background service worker 執行,不依賴 popup 存活;popup 重開後 preview 由 pendingCapture 取回。

