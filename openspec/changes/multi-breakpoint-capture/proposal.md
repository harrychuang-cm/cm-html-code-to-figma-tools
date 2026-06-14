## Why

目前 Chrome extension 一次只能擷取使用中分頁的當前視窗尺寸，設計師若要比對 RWD 不同斷點（桌機、平板、手機）必須手動調整瀏覽器寬度、重複擷取、重複 import，流程繁瑣且尺寸不精準。本變更讓設計師一次選取多個斷點寬度，自動以裝置模擬精準擷取，並在 Figma 一次建立並排的多斷點 frame。

## What Changes

- Chrome extension popup 新增「斷點尺寸」選擇區：提供 **1440 / 1024 / 768 / 375 px** 預設寬度，使用 checkbox **可複選**。
- popup 新增**自訂寬度輸入**：使用者可輸入任意正整數寬度並加入待擷取清單；至少需選取一個斷點才能擷取。
- 擷取流程改用 `chrome.debugger` 的 `Emulation.setDeviceMetricsOverride` 對每個選取寬度精準模擬 viewport，依序擷取 DOM + 截圖，完成後清除 override 還原分頁。需在 manifest 新增 `debugger` 權限。
- `.figcapture` 封裝格式擴充為**多斷點**：單一檔案內含多個 capture（每個斷點各自的 capture/screenshot/diagnostics/figma-plan）。保留對舊版單一 capture 封裝的相容讀取。
- Figma plugin import 時，為每個斷點建立 frame 並**水平並排在同一頁**（依寬度由大到小，由左至右），frame 以斷點寬度命名。

## Non-Goals

- 不支援自訂視窗「高度」斷點選擇；高度延用各斷點實際內容高度（full-page）或視窗高度（viewport）。
- 不做斷點之間的 Figma component/variant 自動對應或 auto-layout 響應式連動。
- 不改變既有單一斷點擷取所產生的視覺保真度行為，只新增多斷點包裝與佈局。
- 不提供雲端同步或跨裝置儲存選取的斷點清單（僅以本機 extension 設定保存）。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `production-ui-import`: 新增多斷點寬度選取與自訂寬度輸入需求；擷取機制新增裝置模擬精準擷取；封裝格式新增多斷點封裝；import 新增多斷點 frame 並排佈局。

## Impact

- Affected specs: `production-ui-import`
- Affected code:
  - New:
    - `apps/chrome-extension/src/breakpoints.ts`
    - `apps/chrome-extension/src/device-emulation.ts`
  - Modified:
    - `apps/chrome-extension/popup.html`
    - `apps/chrome-extension/popup.css`
    - `apps/chrome-extension/src/popup.ts`
    - `apps/chrome-extension/src/runtime.ts`
    - `apps/chrome-extension/src/capture-package.ts`
    - `apps/chrome-extension/manifest.json`
    - `packages/capture-schema/src/index.ts`
    - `apps/figma-plugin/src/renderer.ts`
    - `apps/figma-plugin/src/code.ts`
    - `apps/figma-plugin/src/importer.ts`
  - Removed: (none)
