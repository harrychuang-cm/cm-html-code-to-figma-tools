## 1. Breakpoint 選取與驗證

- [x] 1.1 在 `apps/chrome-extension/src/breakpoints.ts` 實作預設斷點常數（1440/1024/768/375）與函式：解析並驗證自訂寬度（僅接受正整數，建議範圍 200–3840）、去重、回傳依寬到窄排序的斷點清單。行為：無效寬度被拒、重複寬度去重、輸出排序正確。驗證：`apps/chrome-extension/test` 新增 `breakpoints.test.mjs` 覆蓋有效/無效/重複/排序案例並通過。
- [x] 1.2 在 `apps/chrome-extension/popup.html` 與 `popup.css` 新增斷點選取區：四個預設寬度 checkbox（可複選）、自訂寬度輸入與「加入」控制、已選清單顯示。行為：預設斷點可勾選、自訂寬度可加入清單。驗證：`apps/chrome-extension/test/popup-preview.test.mjs`（或新增 popup DOM 測試）斷言斷點控制項存在並通過。（對應需求：Select multiple breakpoint widths for capture）

## 2. 裝置模擬擷取

- [x] 2.1 在 `apps/chrome-extension/src/device-emulation.ts` 封裝 `chrome.debugger` 流程：attach、`Emulation.setDeviceMetricsOverride`（指定 width）、`Emulation.clearDeviceMetricsOverride`、detach。行為：套用指定寬度的 device metrics，並能清除還原。驗證：新增 `device-emulation.test.mjs` 以 mock chrome.debugger 斷言 attach→setDeviceMetricsOverride→clear→detach 的呼叫順序與參數並通過。（對應設計：以 chrome.debugger 裝置模擬擷取斷點寬度；對應需求：Capture each breakpoint with device emulation）
- [x] 2.2 在 `apps/chrome-extension/manifest.json` 新增 `debugger` 權限。行為：extension 具備 debugger 權限可進行裝置模擬。驗證：`apps/chrome-extension/test/manifest.test.mjs` 斷言 permissions 含 `debugger` 並通過。
- [x] 2.3 修改 `apps/chrome-extension/src/runtime.ts` 的擷取流程接受斷點寬度清單，依寬到窄逐一以 `device-emulation` 套用寬度→收集 DOM→截圖→清除 override，整批結束（含失敗）一律 detach 並還原分頁。行為：多斷點依序擷取、單斷點失敗不中斷其餘、結束還原分頁。驗證：`apps/chrome-extension/test/runtime-flow.test.mjs` 擴充多斷點與單斷點失敗案例並通過。（對應設計：多斷點依序擷取並還原）

## 3. 多斷點封裝與相容讀取

- [x] 3.1 在 `packages/capture-schema/src/index.ts` 新增多斷點封裝格式：以 zip 內 `captures.json` 索引檔承載 bundle 版本（新增 `MULTI_CAPTURE_BUNDLE_VERSION` 常數）與各斷點 `width`/`label`/目錄，斷點檔案置於 `captures/<index>/` 子目錄；新增 `packMultiCaptureFigcapture`/`unpackMultiCaptureFigcapture`，per-capture manifest 維持 `CURRENT_SCHEMA_VERSION`（不更動既有單一斷點驗證，以免破壞既有測試與相容讀取）。讀取端對缺漏/未知欄位回報明確錯誤。行為：可打包與讀回多斷點封裝。驗證：`packages/capture-schema` 測試新增多斷點打包/讀取案例並通過。（對應設計：.figcapture 多斷點封裝格式與向後相容；對應需求：Package multiple breakpoints in a single capture file）
- [x] 3.2 在 `packages/capture-schema/src/index.ts` 的 `unpackMultiCaptureFigcapture` 加入向後相容：zip 無 `captures.json` 索引檔的舊版封裝回退至 `unpackFigcapture` 並包成單元素陣列。行為：舊封裝讀取不報錯並以單斷點處理。驗證：新增舊版單一 capture 封裝讀取測試並通過。
- [x] 3.3 修改 `apps/chrome-extension/src/capture-package.ts` 的 `buildConfirmedExportPackage` 改為彙整多個斷點結果為單一多斷點封裝，檔名反映多斷點。行為：confirm export 產生單一含全部成功斷點的 `.figcapture`。驗證：`apps/chrome-extension/test/export-flow.test.mjs` 擴充多斷點封裝斷言並通過。

## 4. Popup 流程與進度

- [x] 4.1 修改 `apps/chrome-extension/src/popup.ts` 傳遞選取斷點清單給 runtime、顯示逐斷點擷取進度、preview 列出各斷點尺寸與 diagnostics 摘要、未選斷點時停用擷取。行為：popup 串接多斷點擷取並呈現進度與預覽。驗證：`apps/chrome-extension/test/popup-preview.test.mjs` 擴充多斷點 preview 斷言並通過。

## 5. Figma 多斷點並排 import

- [x] 5.1 修改 `apps/figma-plugin/src/importer.ts` 與 `apps/figma-plugin/src/code.ts` 讀取多斷點 packageData（含相容單斷點），逐斷點交付 renderer。行為：import 能處理多斷點與舊版單斷點封裝。驗證：`apps/figma-plugin/test/runtime-import.test.mjs` 擴充多斷點與相容案例並通過。
- [x] 5.2 修改 `apps/figma-plugin/src/renderer.ts` 為每斷點建立 frame，依寬到窄排序並累加 x 位移（前一斷點寬度 + 固定間距）並排於同一頁，frame 名稱含斷點寬度。行為：多斷點 frame 由左至右並排不重疊、命名含寬度。驗證：`apps/figma-plugin/test/three-frames.test.mjs`（或新增佈局測試）斷言 frame x 位移、排序與命名並通過。（對應設計：figma import 多斷點 frame 水平並排佈局；對應需求：Import breakpoints as side-by-side frames）

## 6. 整合驗證

- [x] 6.1 執行整體測試套件確認多斷點功能與既有行為皆通過。行為：多斷點擷取/封裝/import 與既有單斷點行為皆正常。驗證：根目錄 `pnpm test` 全數通過。
