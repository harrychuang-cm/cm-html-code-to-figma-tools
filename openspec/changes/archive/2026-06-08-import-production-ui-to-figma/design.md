## Context

這個產品要解決 UI 設計稿落後 production website 的問題。第一階段使用者是 UI 設計師，他們已經能在 Chrome 中打開未登入或已登入頁面，因此 V1 不處理帳密、session 代管或雲端 capture，而是從設計師目前的 Chrome tab 擷取 visible viewport。

目前 repo 尚未有產品程式碼，因此本 change 會建立三個主要邊界：Chrome Extension capture、shared capture schema、Figma Plugin importer。核心資料邊界是 .figcapture package；Extension 產生它，Figma Plugin 消費它。這個邊界不能只是傳遞截圖，必須保留 DOM tree、computed styles、layout boxes、assets、viewport metadata、diagnostics，以及 derived Figma import plan，讓設計師可以驗證匯入品質，讓工程團隊可以重跑與 debug 轉換規則。

## Goals / Non-Goals

**Goals:**

- 讓設計師從 Chrome current tab capture visible viewport，支援未登入與已登入 UI。
- 產生 local-first .figcapture package，不需要後端或帳號系統。
- 讓 Figma Plugin 匯入 package 後建立三個並排 frames：Source Screenshot、Editable Accurate、Auto Layout Experimental。
- 讓 Editable Accurate 以視覺相似度為最高優先，文字、圖片與基本 shape 盡量維持可編輯。
- 讓 Auto Layout Experimental 在 V1 就驗證可行的 auto layout 推導，但不取代可靠的視覺準確輸出。
- 讓設計師在 capture preview 與 import 結果中看到 fallback、missing assets、unsupported CSS、auto layout confidence 等驗證資訊。

**Non-Goals:**

- V1 不建立後端、cloud capture link、帳號、團隊協作或 capture history。
- V1 不做 full-page segmented capture；只處理 visible viewport。Full-page capture 會是後續階段，需處理 sticky、lazyload、virtualized list、nested scroll containers。
- V1 不產生 Figma variables、components、component variants、hover、disabled、pressed 等 state variants。Capture metadata 必須保留未來擴充所需資訊。
- V1 不嘗試把 canvas、iframe、video 或複雜 SVG 語意化成可編輯向量；這些節點先使用 raster fallback。img element 必須作為 image layer 處理。
- V1 不承諾支援任意 production page 類型的完美輸出；驗收樣本優先為登入後 SaaS/dashboard visible viewport。

## Decisions

### Use CapturePackage as the Canonical Boundary

Extension 不直接輸出 Figma-only JSON 作為唯一真相。V1 的 canonical source 是 .figcapture 裡的 capture.json，內容保留 web-native DOM、computed styles、layout boxes、assets、viewport metadata、screenshot reference metadata，以及 source node identifiers。figma-plan.json 是 derived artifact，用於 debug、replay 與檢查 plugin 將建立哪些 Figma nodes。

替代方案是讓 Chrome Extension 直接輸出 Figma-oriented JSON。這會太早丟失 CSS selector、DOM hierarchy、CSS variable references、state hints、asset source 等後續 variables/components 需要的資訊，也會讓 Figma renderer 規則升級時必須重新 capture production page。

### Keep V1 Local-First with No Backend

V1 使用 Extension download .figcapture，再由 Figma Plugin import。這避免帳號、資料儲存、企業資安、權限分享、session replay 等問題卡住第一階段驗證。

替代方案是 cloud capture link。它能提供更順的體驗，但需要後端、資料保留策略、權限模型與企業隱私說明，不適合放進 V1。

### Capture Visible Viewport Only in V1

V1 只 capture 當下 visible viewport，並記錄 viewportWidth、viewportHeight、devicePixelRatio、scrollX、scrollY、url、captureTimestamp、optional deviceLabel。未來 multi-viewport 與 full-page capture 使用同一個 schema 擴展為 capture array 或 segmented capture。

替代方案是 V1 直接做 full-page capture。它對長產品頁有價值，但 sticky/fixed content、lazy loading、infinite scroll、virtualized table、nested scroll container 都會讓第一階段不穩。

### Generate Three Figma Frames on Import

Figma Plugin 匯入 .figcapture 後預設建立三個同尺寸並排 frames：Source Screenshot、Editable Accurate、Auto Layout Experimental。Source Screenshot 用於比對；Editable Accurate 是推薦使用的可靠輸出；Auto Layout Experimental 用於驗證與整理可行的 auto layout 結構。

替代方案是只建立 screenshot + editable frame。這較簡單，但無法滿足 V1 就探索 auto layout 的需求。另一個替代方案是只輸出 auto layout frame，但它會犧牲視覺相似度。

### Use Visual-First Rendering with Conservative Auto Layout

Editable Accurate 必須使用 measured geometry 作為 baseline，優先還原 x、y、width、height、fills、borders、radius、text、images、shadows 與 raster fallbacks。Auto Layout Experimental 才套用 auto layout inference，並只在 container pattern 清楚時使用，例如 navbar item list、button inner content、sidebar menu、card list、form group、toolbar group。

若 auto layout inference 造成偏移，Editable Accurate 不受影響，Auto Layout Experimental 必須在 diagnostics 或 import report 中標示 confidence 與 risk。CSS grid dashboard、overlap、absolute/fixed overlay、virtualized lists、複雜 responsive tricks 不強制套用 auto layout。

### Make Designer-Facing Validation a First-Class Output

Debug 優先服務設計師，而不是只產生工程 log。Extension capture preview 必須在下載前顯示 screenshot preview 與 validation summary。Figma import 結果必須保留 Source Screenshot frame，並在 import report 或 layer naming 中標示 fallback regions、missing assets、unsupported CSS、auto layout confidence。

替代方案是只輸出 diagnostics.json。這能幫助工程 debug，但設計師無法快速判斷匯入稿是否可信。

## Implementation Contract

**Scope boundaries:**

- In scope: 建立 monorepo scaffold、shared capture schema、Chrome Extension current viewport capture、.figcapture export、Figma Plugin .figcapture import、三個 frame output、designer-facing validation report、V1 dashboard verification fixture。
- Out of scope: backend、cloud sync、full-page segmented capture、multi-viewport batch capture、Figma variables、component variants、interactive state capture、auth/session management、production deployment pipeline。

**Capture interface:**

.figma capture package 使用 zip-compatible single-file artifact，副檔名為 .figcapture。V1 package 必須包含：

- manifest.json：schemaVersion、generatorVersion、sourceUrl、captureTimestamp、viewportWidth、viewportHeight、devicePixelRatio、scrollX、scrollY、optional deviceLabel。
- capture.json：DOM tree snapshot、computed style subset、layout boxes、text content、semantic attributes、class/id/data attributes、asset references、fallback references、source node identifiers。
- figma-plan.json：plugin renderer 產生或匯出前預先產生的 derived import plan，列出 frame/text/rect/image/fallback/group/autolayout candidate nodes、source node mapping、confidence。
- screenshot.png：captured viewport reference image。
- assets/：image element assets 與 raster fallback assets。
- diagnostics.json：warnings、fallback reasons、unsupported CSS list、missing asset list、auto layout candidate confidence。

**Chrome Extension behavior:**

- Designer clicks capture on the active tab.
- Extension captures the currently visible viewport only.
- Extension uses the designer's existing Chrome session and does not request credentials.
- Extension shows preview and validation summary before download.
- Confirmed export downloads one .figcapture package.
- Capture failure must surface a readable error for blocked pages, missing permissions, asset capture failure, or package generation failure.

**Figma Plugin behavior:**

- Designer selects a .figcapture file in the plugin UI.
- Plugin validates manifest.json schemaVersion before import.
- Plugin creates three same-size frames named with source page/title, viewport size, and role: Source Screenshot, Editable Accurate, Auto Layout Experimental.
- Source Screenshot contains the screenshot reference as a locked image layer.
- Editable Accurate recreates text, image, rect/frame, border, fill, radius, shadow, and raster fallback nodes using measured geometry.
- Auto Layout Experimental recreates a second editable version with conservative auto layout candidates where confidence passes the renderer threshold.
- Plugin presents an import report after completion with created node count, fallback count, missing assets, unsupported CSS, and auto layout confidence summary.

**Acceptance criteria:**

- A dashboard fixture visible viewport can be captured from Chrome and exported as .figcapture without network backend dependency.
- The .figcapture archive contains manifest.json, capture.json, figma-plan.json, screenshot.png, diagnostics.json, and assets/ when assets exist.
- The Figma Plugin imports the package and creates exactly three same-size frames for the capture.
- The Source Screenshot frame visually matches screenshot.png.
- The Editable Accurate frame uses editable text nodes for visible text and image nodes for img elements unless a documented fallback reason exists.
- The Auto Layout Experimental frame includes auto layout on eligible simple groups and reports skipped candidates with reasons.
- Designer-facing preview and import report expose fallback and unsupported style counts without requiring inspection of raw JSON.

## Risks / Trade-offs

- [Risk] Browser computed styles do not map one-to-one to Figma node properties → Mitigation: keep capture.json canonical, record unsupported CSS in diagnostics, and use raster fallback for unsupported visual regions.
- [Risk] Auto layout inference creates visually shifted output → Mitigation: keep Editable Accurate as the recommended output and isolate auto layout into Auto Layout Experimental.
- [Risk] Large dashboard pages produce oversized packages or slow imports → Mitigation: V1 limits scope to visible viewport and records package size/import duration in diagnostics.
- [Risk] Authenticated pages contain sensitive data → Mitigation: V1 is local-first with no backend upload; preview and export remain under designer control.
- [Risk] Fonts differ between website and Figma environment → Mitigation: preserve font-family metadata, create editable text where possible, and report missing or substituted fonts.
- [Risk] Image, canvas, iframe, video, and complex SVG fidelity differs from editable output → Mitigation: img becomes image layer; canvas, iframe, video, and complex SVG become raster fallback with visible fallback reasons.

## Migration Plan

This is a new product scaffold, so no runtime migration is required. Rollback is removal of the new workspace packages and Spectra change artifacts before archive. Future cloud capture, full-page capture, variables, and components must be proposed as separate changes or explicit follow-up deltas.

## Open Questions

- Which JavaScript package manager and browser extension build stack will be standardized for the repo during implementation.
- Which Figma Plugin bundler and local development workflow will be used.
- What dashboard fixture will be used as the first visual verification target.
