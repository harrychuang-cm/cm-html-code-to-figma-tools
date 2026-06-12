## ADDED Requirements

### Requirement: Capture usable visual asset bytes
The Chrome Extension SHALL include usable visual asset bytes in the `.figcapture` package whenever the asset can be read locally during export. The exporter MUST support data URL images, resolved `img` current source URLs through an asset resolver, inline SVG markup, and parseable CSS image URLs from background or mask styles. The exporter MUST record missing asset diagnostics instead of aborting when an asset cannot be read.

#### Scenario: Data URL image is packaged as raster bytes

- **WHEN** a captured `img` node has `src` or `currentSrc` equal to a PNG data URL
- **THEN** the package contains an `assets/image-*` entry with PNG bytes and the node references that asset through `assetRef`

##### Example: inline PNG data URL

- **GIVEN** an image node `dom-img` with `currentSrc` `data:image/png;base64,iVBORw0KGgo=`
- **WHEN** the designer exports the capture
- **THEN** `capture.json` contains `assetRef` for `dom-img` and `assets/image-1.png` starts with PNG signature bytes

#### Scenario: Remote image resolver success is packaged as image bytes

- **WHEN** a captured `img` node has a remote `currentSrc` and the asset resolver returns JPEG, PNG, WebP, or GIF bytes
- **THEN** the package stores those bytes in `assets/image-*` instead of a JSON external reference

#### Scenario: Extension has host permission for remote asset fetch

- **WHEN** the Chrome Extension is installed for V1 capture
- **THEN** its manifest declares host permissions that allow the local background runtime to fetch image and SVG assets referenced by the captured page

#### Scenario: Remote image resolver failure records diagnostics

- **WHEN** a captured visual asset source cannot be fetched or decoded
- **THEN** the package still exports and `diagnostics.missingAssets` includes that source node id with a readable warning

### Requirement: Import SVG assets as editable vectors
The Figma Plugin SHALL import SVG assets as editable vector nodes when SVG bytes are available and the Figma runtime supports SVG node creation. The importer MUST fall back without aborting if SVG creation fails.

#### Scenario: Inline SVG becomes Figma vector

- **WHEN** a package contains an inline SVG asset referenced by a captured node
- **THEN** the imported Editable Accurate frame contains a vector/group node created from the SVG markup at the captured node geometry

##### Example: chevron icon

- **GIVEN** a captured SVG node `dom-chevron` with width 12, height 12, and markup `<svg viewBox="0 0 12 12"><path d="M4 2l4 4-4 4"/></svg>`
- **WHEN** the package is imported
- **THEN** the created node has plugin metadata `assetRef` for `dom-chevron` and is positioned at the captured rect

### Requirement: Capture CSS image icons
The Chrome Extension SHALL capture parseable CSS `background-image`, `mask-image`, and `-webkit-mask-image` URLs as visual assets for non-image DOM nodes. The exporter MUST use the first parseable `url(...)` in V1 and MUST ignore unsupported CSS image values without aborting capture.

#### Scenario: CSS mask icon is packaged

- **WHEN** a captured button icon node has `mask-image: url(data:image/svg+xml;base64,...)`
- **THEN** the package contains a SVG asset for that icon and the captured node references it through `assetRef`

#### Scenario: Unsupported CSS gradient is ignored

- **WHEN** a captured node has `background-image: linear-gradient(...)`
- **THEN** no asset is created for that style and capture continues normally
