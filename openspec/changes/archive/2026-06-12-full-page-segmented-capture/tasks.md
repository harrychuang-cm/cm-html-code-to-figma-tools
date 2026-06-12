## 1. Schema 與 capture core

- [x] 1.1 在 `packages/capture-schema/src/index.ts` 新增 manifest 選填欄位驗證,交付 spec「Full-page manifest fields」:無欄位的既有 package 驗證不變;captureMode 存在時必須是 viewport 或 full-page;full-page 時 documentWidth/documentHeight 必須為正數,違反時回報 manifest 錯誤。驗證:`packages/capture-schema/test/schema-validation.test.mjs` 新增合法 full-page manifest、非法 captureMode(partial)、full-page 缺文件尺寸三個案例,`corepack pnpm test` 通過。
- [x] 1.2 在 `apps/chrome-extension/src/capture-core.ts` 的 captureElementTree 與 createManifestFromCapture 加入 options.captureBounds 與選填 manifest 欄位輸出,依 design「文件座標一次性 DOM 截取」交付 spec「Full-page DOM capture in document coordinates」:可見性過濾與裁切改用 captureBounds(預設等於 viewport,行為不變),full-page 時 manifest 寫入 captureMode/documentWidth/documentHeight。驗證:`apps/chrome-extension/test/capture-core.test.mjs` 新增 captureBounds 大於 viewport 時 below-fold 節點保留且不被裁切案例,以及無 captureBounds 時與既有行為一致案例。

## 2. 截圖拼接模組

- [x] 2.1 新增 `apps/chrome-extension/src/stitch-screenshot.ts` 的 stitchScreenshotSegments(segments, options):依 design「OffscreenCanvas 拼接模組」交付 spec「Segmented screenshot stitching」— 畫布為文件尺寸 × dpr、各段繪於 scrollY × dpr、canvas/bitmap 工廠可注入、缺 API 時丟出 screenshot-failed category 錯誤;並在 `scripts/build.mjs` 的 import 改寫表登記新檔。驗證:新增 `apps/chrome-extension/test/stitch-screenshot.test.mjs`,含 scrollY 0/800/1600 在 dpr 2 繪於 0/1600/3200 的座標案例與缺 canvas API 報錯案例。

## 3. Content script 與 runtime 編排

- [x] 3.1 在 `apps/chrome-extension/src/content-script.ts` 與 `apps/chrome-extension/src/content.ts` 新增訊息處理:FIGCAPTURE_PAGE_METRICS 回傳文件與 viewport 尺寸、FIGCAPTURE_SCROLL_TO 捲動到指定 y 並等待 settle(雙重 requestAnimationFrame 加 250ms)後回傳實際 scrollY、FIGCAPTURE_SET_PINNED_HIDDEN 隱藏/還原 computed position 為 fixed 或 sticky 的元素並保留原始 inline style、FIGCAPTURE_COLLECT_DOM 支援 full-page mode(捲回頁頂以 captureBounds 截取)。依 design「fixed 與 sticky 元素自然去重加截圖隱藏」交付 spec「Pinned element deduplication」的隱藏/還原行為。驗證:`apps/chrome-extension/test/runtime-flow.test.mjs` 以假 chrome API 驗證各訊息回應形狀與 pinned 還原案例。
- [x] 3.2 在 `apps/chrome-extension/src/runtime.ts` 實作 full-page 編排,依 design「background 編排分段流程」交付 spec「Lazy loading pre-scroll」與「Full-page capture limits」:captureActiveTab 接受 captureMode;依序 metrics → 預捲到底(每段 settle)→ 捲回頁頂 DOM 截取 → 逐段截圖(第一段後隱藏 pinned)→ 還原可見性與原始捲動位置 → stitch → 組 package;依 design「截取上限與診斷」套用 20000 CSS px 與 25 段上限,截斷記 diagnostics 警告;任一步失敗還原捲動與可見性並回報既有 error category;`apps/chrome-extension/src/background.ts` 與 `apps/chrome-extension/src/screenshot.ts` 傳遞 captureMode 與分段截圖選項,單段截圖失敗重試一次。驗證:runtime-flow.test.mjs 新增 full-page 順序案例、失敗還原案例、截斷警告案例,viewport 模式既有案例不回歸。

## 4. Popup UI

- [x] 4.1 在 `apps/chrome-extension/popup.html` 與 `apps/chrome-extension/src/popup.ts` 新增截取模式切換,交付 spec「Full-page capture mode selection」:預設 visible viewport、切換後 CAPTURE_ACTIVE_TAB_MESSAGE 帶 captureMode、preview 顯示模式與文件尺寸。驗證:`apps/chrome-extension/test/popup-preview.test.mjs` 新增預設模式、full-page 訊息 payload、preview 文件尺寸三個案例。

## 5. Figma plugin 全頁 frame

- [x] 5.1 在 `apps/figma-plugin/src/renderer.ts` 的 createFrameModels 與 `apps/figma-plugin/src/code-classic.js` 的 createFrames,依 design「manifest 選填欄位與全頁 frame 輸出」交付 spec「Full-page Figma frames」:captureMode 為 full-page 時 frame 與 screenshot layer 用 documentWidth/documentHeight,否則維持 viewport 尺寸,module 與 classic 行為一致。驗證:`apps/figma-plugin/test/three-frames.test.mjs` 新增 full-page frame 尺寸案例、`apps/figma-plugin/test/plugin-scaffold.test.mjs` 新增 classic runtime 同尺寸 parity 案例,viewport package 既有案例不回歸。

## 6. 文件與整體驗收

- [x] 6.1 更新 `docs/v1-usage-and-acceptance.md`(Scope、Capture Contract、Figma Output、Acceptance Checks 描述 full-page 模式、上限、pinned 去重與動態頁面限制)與 `docs/manual-runtime-test.md`(full-page 手動驗收步驟,使用 dashboard fixture 的 below-fold 內容)。驗證:文件內容審閱涵蓋模式選擇、分段流程、上限與 fallback 行為。
- [x] 6.2 執行 `corepack pnpm build`、`corepack pnpm test`、`corepack pnpm test:e2e` 全數通過,確認 viewport 模式零回歸。驗證:三個指令 exit code 0。
