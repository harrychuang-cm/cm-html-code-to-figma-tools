## 1. Workspace 與 CapturePackage contract

- [x] 1.1 建立 TypeScript monorepo scaffold，讓 package.json、pnpm-workspace.yaml、apps/chrome-extension、apps/figma-plugin、packages/capture-schema 形成可 build/test 的工作區；完成後以 pnpm install、pnpm build、pnpm test 驗證 workspace script 可執行。
- [x] 1.2 實作 Use CapturePackage as the Canonical Boundary 的 shared schema，讓 manifest.json、capture.json、figma-plan.json、diagnostics.json、assets references 都有 TypeScript types 與 runtime validators；完成後以 packages/capture-schema 的 valid/invalid fixture tests 驗證 schemaVersion、viewport metadata、DOM tree、computed styles、layout boxes、source node identifiers 都會被檢查。
- [x] 1.3 實作 .figcapture pack/unpack helpers，交付 Export a debuggable .figcapture package 與 Reject invalid capture packages with readable errors 的 archive contract；完成後以 unit tests 驗證 required files 存在時可 unpack，缺 manifest.json 或 unsupported schemaVersion 時回傳可讀錯誤類別。

## 2. Chrome Extension capture 與 export

- [x] 2.1 建立 Chrome Extension shell，落實 Keep V1 Local-First with No Backend，讓 popup 只對 active tab 執行 local capture 並且沒有 upload endpoint 或帳密輸入；完成後以 extension manifest review 與 automated test 驗證 permissions 僅涵蓋 activeTab/scripting/downloads 與必要 host access。
- [x] 2.2 實作 Capture current visible viewport from Chrome 與 Capture Visible Viewport Only in V1 的 content script，讓 authenticated dashboard 與 unauthenticated page 都能擷取 current viewport 的 DOM tree、computed styles、layout boxes、viewportWidth、viewportHeight、devicePixelRatio、scrollX、scrollY、source URL、capture timestamp；完成後以 fixture page browser test 驗證 viewport 外元素不進入 V1 capture，並驗證 Preserve capture metadata for future import stages 的欄位完整。
- [x] 2.3 實作 screenshot、img asset、raster fallback capture，讓 img element 產生 image asset，canvas、iframe、video、complex SVG 產生 fallback asset 與 fallback reason；完成後以 fixture page test 驗證 assets/ 內容、fallback references、diagnostics fallback count 與 source node mapping 一致。
- [x] 2.4 實作 Make Designer-Facing Validation a First-Class Output 與 Show designer-facing capture validation before export 的 popup preview，讓設計師在下載前看到 screenshot preview、fallback count、missing asset count、unsupported style count、package generation status；完成後以 popup UI test 或 Playwright manual assertion 驗證 summary 數字來自 diagnostics.json。
- [x] 2.5 實作 confirmed export flow，讓設計師確認後下載單一 .figcapture package；完成後以 browser integration test 驗證下載檔包含 manifest.json、capture.json、figma-plan.json、screenshot.png、diagnostics.json，且有 image/fallback 時包含 assets/。

## 3. Figma Plugin import 與 renderer

- [x] 3.1 建立 Figma Plugin import UI，讓設計師選取 .figcapture 並在 import 前 validate package structure 與 schemaVersion；完成後以 mocked plugin test 驗證 Reject invalid capture packages with readable errors 會對 missing manifest、missing screenshot、unsupported schemaVersion 顯示不同錯誤。
- [x] 3.2 實作 Generate Three Figma Frames on Import 與 Import .figcapture into three Figma frames，讓 valid package 產生同尺寸並排的 Source Screenshot、Editable Accurate、Auto Layout Experimental frames，名稱包含 source identity、viewport size、role；完成後以 mocked Figma API test 驗證 frame count 正好為 3、尺寸一致、Source Screenshot 含 locked screenshot image layer。
- [x] 3.3 實作 Editable Accurate renderer，落實 Recreate visible UI with visual-first editable layers 與 Use Visual-First Rendering with Conservative Auto Layout 的可靠輸出分支，讓 visible text 變成 editable text nodes、img 變成 image layers、basic boxes 變成 rect/frame layers、unsupported regions 變成 raster fallback layers；完成後以 renderer fixture test 驗證 dashboard viewport 的 node types、geometry、fills、borders、radius、shadow 與 fallback reasons。
- [x] 3.4 實作 Auto Layout Experimental renderer pass，交付 Generate conservative auto layout experimental output，讓 button inner content、navigation item lists、sidebar menus、card lists、form groups、toolbar groups 在 confidence 達標時使用 auto layout，overlap、complex CSS grid、fixed overlay、virtualized list 被跳過並記錄 reason；完成後以 candidate fixture tests 驗證 applied confidence 與 skipped reason。
- [x] 3.5 實作 Provide import report for designer verification，讓 Figma Plugin 匯入完成後顯示 created frame count、created node count、fallback count、missing asset count、unsupported style count、auto layout confidence summary；完成後以 plugin UI test 驗證 report 數字與 diagnostics.json 及 renderer output 一致。

## 4. End-to-end verification 與 handoff

- [x] 4.1 建立 SaaS/dashboard visible viewport fixture 與 end-to-end smoke flow，驗證 Chrome Extension capture、.figcapture export、Figma Plugin import 三段串接；完成後以 pnpm test:e2e 或等效 smoke command 驗證可產生 package 並透過 mocked Figma API 建立三個 frames。
- [x] 4.2 建立 V1 使用與驗收文件，明確記錄 local-first flow、visible viewport only、三 frame output、fallback 類型、未納入 V1 的 full-page capture、multi-viewport、variables、components、state variants；完成後以 content review 確認文件與 proposal.md、design.md、specs/production-ui-import/spec.md 範圍一致。
