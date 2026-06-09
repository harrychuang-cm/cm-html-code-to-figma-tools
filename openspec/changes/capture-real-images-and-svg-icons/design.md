## Context

目前 `.figcapture` package 的 `img` asset 對遠端圖片多半只存 JSON reference，例如 `{ kind: "external-image-reference", src }`。Figma runtime 只能看到不可解碼的 bytes，因此建立 placeholder。inline SVG 目前只被視為 fallback，沒有保存原始 SVG markup；CSS `background-image` / `mask-image` icon 也沒有被 capture。

這會導致 CMoney 匯入結果出現：

- `Image / img / Placeholder`
- `Fallback / svg`
- 空白 `Frame / button` 或 `Frame / div` icon wrapper

## Goals / Non-Goals

**Goals:**

- 在 V1 local-first 架構下，盡可能把可取得的圖片與 icon bytes 放進 `.figcapture`。
- 讓 Chrome Extension 有足夠 host permissions 在本機讀取 production page 參照的遠端圖片/CDN 圖片。
- 支援 `img src`、`srcset` 選中的 current source、data URL、inline SVG、CSS background/mask data URL。
- Figma Plugin 對 SVG asset 優先建立 vector node，讓 icon 可編輯。
- 對抓不到或不可解碼的資產保留 placeholder 與 diagnostics，不中斷整頁 import。
- Module runtime 與 classic runtime 對 asset rendering 行為一致。

**Non-Goals:**

- 不新增後端 proxy 或雲端資產下載服務。
- 不保證所有跨站遠端圖片都能讀取；受 CORS、canvas taint、Chrome 權限限制時允許 fallback。
- 不在此 change 實作 screenshot cropping fallback。
- 不在此 change 實作 SVG path 語意清理、icon componentization、variables 或 component variants。
- 不處理 pseudo element generated content 的完整 layout reconstruction；V1 只記錄可讀到的 style image URL。

## Decisions

### Capture Visual Asset Sources In Content Script

Content script 會在 DOM snapshot 階段保存資產線索：

- `img.currentSrc || img.src` 放入 `attributes.currentSrc`。
- inline `<svg>` 的 `outerHTML` 放入 `attributes.svgMarkup`。
- `backgroundImage`、`maskImage`、`webkitMaskImage` 加入 computed styles。

這些資料必須在 content script 裡保存，因為 background/mask 和 inline SVG 屬於 DOM/CSS context。

### Add Async Asset Resolver In Background Runtime

Package builder 改成 async，接受 `assetResolver(source)`。Resolver 在 extension/background context 嘗試 `fetch(source.url)`，成功時存 binary bytes；失敗時回傳 structured failure，asset capture 保留 JSON diagnostic bytes。

這保持 local-first，不新增後端。若 Chrome 或網站阻擋讀取資產，designer 仍可 import package 並看到哪些資產 missing。

Chrome MV3 background fetch 需要 host permissions 才能讀取跨來源圖片，例如 CMoney CDN 或 Facebook avatar。V1 使用 `<all_urls>` host permission，因為 production UI 可能從任意 CDN 載入圖片。這仍然是 local-first：資料只在本機 extension 內讀取並寫入本機 `.figcapture`，不會上傳到任何服務。

### Store SVG As First-Class Assets

Inline SVG 和 SVG data URL 以 `assets/vector-N.svg` 保存 UTF-8 bytes。Capture node 仍使用 `assetRef`，並透過 `attributes.assetKind = "svg"` 或副檔名判斷 Figma rendering。

Figma adapter 行為：

- SVG bytes 可解碼時，呼叫 `figma.createNodeFromSvg(svgString)`。
- 若 `createNodeFromSvg` 不可用或 SVG 解析失敗，fallback 到 image rectangle 或 placeholder。
- Plugin metadata 記錄 `assetRef` 和錯誤原因。

### CSS Icons Are Captured As Image Assets When Possible

若一個非 `img` / `svg` node 有 CSS `background-image` 或 mask image URL，asset capture 會建立 image asset 並把 node 視為 image-like visual node。Data URL 可直接存入；遠端 URL 經 resolver 嘗試抓 bytes。

對多重 background V1 只取第一個 `url(...)`。這符合先補常見 icon 的目標，避免在第一階段引入完整 CSS image parser。

## Implementation Contract

**Behavior:**

- `.figcapture` export SHALL include decodable bytes for data URL images and inline SVG assets.
- When `assetResolver` can fetch a remote image/SVG successfully, export SHALL store returned bytes instead of JSON external reference bytes.
- Figma import SHALL create image fills for decodable raster image bytes.
- Figma import SHALL create vector nodes for decodable SVG bytes when `figma.createNodeFromSvg` is available.
- If asset bytes are unavailable or invalid, import SHALL keep placeholder behavior and diagnostics.

**Interface / data shape:**

- `buildConfirmedExportPackage` becomes async and returns the same package shape.
- `captureVisualAssets(capture, options)` may return a Promise when an async `assetResolver` is supplied.
- Capture nodes may include `attributes.currentSrc`, `attributes.svgMarkup`, `attributes.assetKind`, and `styles.backgroundImage` / `styles.maskImage` / `styles.webkitMaskImage`.
- Diagnostics missing assets SHALL include source node id and reason.
- Chrome Extension manifest includes host permissions required for local asset fetch.

**Failure modes:**

- Asset fetch failure records missing asset diagnostics and emits JSON diagnostic bytes for that asset. If host permission is unavailable or blocked by the browser/runtime, import still continues with placeholders.
- SVG vector creation failure records plugin metadata and falls back without aborting import.
- Unsupported CSS image syntax is ignored unless it contains a parseable `url(...)`.

**Acceptance criteria:**

- `corepack pnpm build` passes.
- `corepack pnpm test` passes with coverage for real image bytes, SVG asset packaging, CSS icon asset packaging, and Figma SVG vector rendering.
- `corepack pnpm test:e2e` passes.
- `spectra analyze capture-real-images-and-svg-icons --json` has no findings.
- `spectra validate capture-real-images-and-svg-icons` passes.

**Scope boundaries:**

- In scope: current viewport assets, data URL decode, async fetch hook, inline SVG vectors, CSS image URL assets, graceful fallback.
- Out of scope: backend proxy, full-page capture, screenshot crop asset extraction, component variants, design variables.

## Risks / Trade-offs

- [Risk] Remote image fetch can fail due to CORS or credentials. Mitigation: keep diagnostics and placeholder fallback.
- [Risk] SVG parsing can create unexpected Figma node structures. Mitigation: vector creation is isolated per asset and catches errors.
- [Risk] Async package building can break existing runtime tests. Mitigation: keep confirm flow awaited and update tests around async package builder.
- [Risk] CSS image parsing can become complex. Mitigation: only first `url(...)` is in V1 scope.
