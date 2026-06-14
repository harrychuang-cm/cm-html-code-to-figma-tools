## Context

Chrome extension（`apps/chrome-extension`）目前的擷取流程為：解析使用中分頁 → 透過 content script 收集 DOM（`CAPTURE_DOM_MESSAGE`）→ `chrome.tabs.captureVisibleTab` 截圖 → `buildConfirmedExportPackage` 打包成單一 capture 的 `.figcapture`（zip 內含 `manifest.json`/`capture.json`/`figma-plan.json`/`screenshot.png`/`diagnostics.json`，定義於 `packages/capture-schema/src/index.ts` 的 `REQUIRED_FIGCAPTURE_FILES`）。Figma plugin（`apps/figma-plugin`）讀取單一 `packageData` 後由 `renderer.ts` 建立 frame。

擷取尺寸完全取決於使用者當下的視窗大小，無法精準鎖定 RWD 斷點，且每個斷點都要手動調整並重複整個流程。

約束：
- manifest v3，目前權限為 `activeTab`/`scripting`/`downloads`，host 為 `<all_urls>`。
- `.figcapture` 為 zip，schema 版本目前 `CURRENT_SCHEMA_VERSION = "1.0.0"`。
- Figma plugin 在沙箱中執行，frame 建立透過 `figma-adapter.ts` 的 adapter 介面。

## Goals / Non-Goals

**Goals:**

- 讓使用者在 popup 一次選取多個預設斷點（1440/1024/768/375px）並支援自訂寬度。
- 以 `chrome.debugger` 裝置模擬精準擷取每個斷點寬度。
- 單一 `.figcapture` 封裝多個斷點的 capture，並維持對舊版單一 capture 封裝的相容讀取。
- Figma import 時為每個斷點建立 frame，依寬度由大到小水平並排於同一頁。

**Non-Goals:**

- 不支援自訂高度斷點；高度延用內容高度或視窗高度。
- 不做斷點間的響應式 auto-layout 連動或 component variant 對應。
- 不改變既有單一斷點的視覺保真度行為。
- 不提供雲端同步斷點清單。

## Decisions

### 以 chrome.debugger 裝置模擬擷取斷點寬度

採用 `chrome.debugger` attach 分頁後送 `Emulation.setDeviceMetricsOverride`（width=斷點寬度、mobile/deviceScaleFactor 視斷點推導）來精準設定 viewport，擷取完成後送 `Emulation.clearDeviceMetricsOverride` 並 detach。

替代方案：`chrome.windows.update` 調整視窗寬度。否決原因為實際 viewport 受瀏覽器邊框與捲軸影響不精準、375px 等窄寬度可能受最小視窗寬度限制、且無法模擬行動裝置 DPR。代價：debugger attach 期間分頁上方會出現「正在偵錯」橫幅，且需新增 `debugger` 權限。

### 多斷點依序擷取並還原

對選取的斷點依「寬到窄」順序逐一執行 emulation→收集 DOM→截圖；每個斷點完成後重設 override。整批結束（含失敗）一律 detach 並還原分頁原狀，避免分頁停留在被模擬狀態。單一斷點失敗時記錄該斷點錯誤並繼續其餘斷點，最終至少一個成功即可產出封裝。

替代方案：所有斷點平行擷取。否決原因為同一分頁無法同時套用多個 device metrics，平行會互相干擾。

### .figcapture 多斷點封裝格式與向後相容

`packages/capture-schema/src/index.ts` 新增多斷點封裝：zip 內以 `captures.json` 索引檔承載 bundle 層級版本（`MULTI_CAPTURE_BUNDLE_VERSION`）與各斷點的 width/label/目錄；每個斷點的檔案（manifest/capture/figma-plan/diagnostics/screenshot/assets）放在 `captures/<index>/` 子目錄下，per-capture manifest 仍維持 `CURRENT_SCHEMA_VERSION = "1.0.0"`（不更動既有單一斷點驗證，以免破壞既有測試與相容讀取）。讀取端同時接受舊版單一 capture 封裝：若 zip 無 `captures.json` 索引檔，回退至 `unpackFigcapture` 並包成單元素陣列再處理。

替代方案：每斷點各自一個 `.figcapture`。否決原因為使用者需多次下載與多次 import，違反「一次建立並排 frame」的目標。

### Figma import 多斷點 frame 水平並排佈局

Figma plugin 讀取 `captures` 後，對每個斷點沿用既有 frame 建立流程，並依寬度由大到小排序，累加 x 位移（前一斷點寬度 + 固定間距）使 frame 水平並排於同一頁；frame 名稱含斷點寬度（例如 `Capture / 1440`）。

替代方案：各斷點建立於獨立 page。否決原因為使用者需求為同頁並排以利 RWD 比對。

## Implementation Contract

**Behavior:**

- popup 顯示 4 個預設斷點 checkbox（1440/1024/768/375）與一個自訂寬度輸入欄；可複選；未選取任何斷點時擷取按鈕停用或回報需至少選一個。
- 自訂寬度只接受正整數（建議範圍 200–3840），無效輸入回報錯誤且不加入清單；重複寬度去重。
- 按下擷取後，依選取斷點逐一以裝置模擬擷取，popup 顯示每個斷點進度；完成後 preview 列出各斷點尺寸與 diagnostics 摘要。
- 下載產生單一 `.figcapture`，內含所有成功斷點。
- Figma import 一次建立全部斷點 frame，依寬度由大到小、由左至右並排於目前 page。

**Interface / data shape:**

- 新增 `apps/chrome-extension/src/breakpoints.ts`：匯出預設斷點常數（1440/1024/768/375）與解析/驗證自訂寬度、去重、回傳排序後斷點清單的函式。
- 新增 `apps/chrome-extension/src/device-emulation.ts`：封裝 `chrome.debugger` attach/`setDeviceMetricsOverride`/`clearDeviceMetricsOverride`/detach，輸入為 tabId 與寬度，輸出為套用/還原的非同步流程。
- `runtime.ts` 的擷取流程接受斷點寬度清單，回傳含多斷點結果的 preview 與 pending 狀態。
- `capture-schema` 新增多斷點封裝的建立、打包（`packFigcapture`）與讀取（`readFigcaptureFiles`）支援；封裝以 `captures` 陣列表示，每項含 `width`、`label`、capture/diagnostics/figma-plan/screenshot；提供向後相容讀取。
- Figma plugin renderer 接受多斷點 packageData，對每斷點建立 frame 並設定 x 位移。

**Failure modes:**

- debugger attach 失敗或被使用者取消 → 回報執行階段錯誤類別，並確保 detach/還原；不留下被模擬的分頁。
- 個別斷點擷取失敗 → 記錄該斷點為失敗並於 diagnostics/preview 標示，其餘斷點繼續；全部失敗才整體回報錯誤。
- 讀取舊版單一 capture 封裝 → 正常包成單斷點處理，不報錯。

**Acceptance criteria:**

- chrome-extension 與 capture-schema、figma-plugin 既有測試（`pnpm test` / 各 `apps/*/test`）通過。
- 新增測試涵蓋：斷點選取/自訂寬度驗證與去重、多斷點封裝的打包與讀取（含向後相容）、Figma 多斷點 frame 並排位移、裝置模擬流程的 attach/clear/detach 呼叫順序。
- manifest 含 `debugger` 權限。

**Scope boundaries:**

- 範圍內：popup 斷點 UI、裝置模擬擷取、多斷點封裝與相容讀取、Figma 多斷點並排 import、相關測試與 manifest 權限。
- 範圍外：高度斷點、響應式 auto-layout 連動、雲端同步、既有單斷點保真度行為的更動。

## Risks / Trade-offs

- [debugger 橫幅干擾使用者] → 擷取為短暫操作，完成即 detach 還原；於 UI 說明擷取期間會短暫出現偵錯提示。
- [多斷點依序擷取耗時較長] → 顯示逐斷點進度；限制自訂寬度數量上限避免過長。
- [schema 版本提升造成舊 plugin 無法讀新封裝] → 提升 schema 版本並於讀取端對未知/缺漏欄位回報明確錯誤；新 plugin 相容舊封裝。
- [窄寬度（375px）下站台可能 lazy-load 或 reflow 未完成] → 設定 override 後給予短暫等待再擷取（沿用既有 full-page 的等待/捲動機制）。

## Migration Plan

- 純新增功能，無資料遷移。schema 版本提升後，新 extension 產生的封裝需新 plugin 讀取；新 plugin 仍可讀舊封裝。
- Rollback：回退程式碼即可恢復單斷點行為；舊封裝不受影響。

## Open Questions

- 自訂寬度的數量上限與允許範圍最終值（暫定 200–3840px、上限數個）待實作時依 UI 體驗微調。
