## ADDED Requirements

### Requirement: Chrome extension runtime captures and previews active tab
The system SHALL connect the Chrome Extension popup, background runtime, content runtime, and visible screenshot adapter so a designer can capture the active tab current visible viewport with preview before export. The preview payload MUST include screenshot data URL, source URL, viewport width and height, diagnostics summary, and package status.

#### Scenario: Active tab capture preview

- **WHEN** the designer starts capture from the Chrome Extension popup on a loaded dashboard tab
- **THEN** the background runtime resolves the active current-window tab, collects DOM capture data from the content runtime, captures the visible screenshot, stores pending capture state, and the popup displays screenshot preview, URL metadata, viewport metadata, fallback count, missing asset count, unsupported style count, and enables export only when package status is ready

#### Scenario: Missing active tab blocks preview

- **WHEN** the active current-window tab cannot be resolved with a tab id
- **THEN** the runtime returns error category missing-active-tab and the popup keeps export disabled

### Requirement: Chrome extension runtime downloads confirmed package
The system SHALL download one .figcapture package only after the designer confirms a ready preview. The runtime MUST build the package from pending capture data plus screenshot data and call the Chrome downloads API exactly once for a successful confirmation.

#### Scenario: Confirmed export downloads package

- **WHEN** the designer confirms export after a ready preview exists
- **THEN** the background runtime builds one .figcapture package, calls chrome.downloads.download exactly once with a filename ending in .figcapture, and returns the download id and filename

#### Scenario: Confirm export without pending capture

- **WHEN** the background runtime receives confirm export without pending capture state
- **THEN** the runtime returns error category missing-pending-capture and no download is requested

#### Scenario: Package generation failure blocks download

- **WHEN** package generation fails for pending capture state
- **THEN** the runtime returns error category package-generation-failed and no download is requested

### Requirement: Figma plugin runtime imports package through UI-main bridge
The system SHALL connect the Figma Plugin UI and main code with typed messages so selecting one .figcapture transfers the file bytes to main code, validates the package, performs import, and returns a designer-facing report. The bridge MUST surface validation and import errors without requiring raw JSON inspection.

#### Scenario: Valid package import through bridge

- **WHEN** the designer selects a valid .figcapture file in the Figma Plugin UI
- **THEN** the UI posts IMPORT_PACKAGE with filename and bytes, main code validates schemaVersion and package structure, main code creates the import frames, and the UI renders IMPORT_SUCCESS with frame count, node count, fallback count, missing asset count, unsupported style count, and auto layout confidence summary

#### Scenario: Invalid package returns error without nodes

- **WHEN** the selected .figcapture file fails validation
- **THEN** main code posts IMPORT_ERROR with a readable category and message, and no Figma nodes are created

#### Scenario: File transfer failure returns import error

- **WHEN** the UI cannot read or transfer the selected .figcapture bytes to main code
- **THEN** the UI renders an import error message and main code does not start node creation

### Requirement: Figma API adapter creates real editable nodes
The system SHALL map renderer output to real Figma Plugin API operations for frame, text, image, rectangle, and fallback image creation. The adapter MUST create two same-size default frames named Source Screenshot and Editable Accurate, MUST NOT emit an empty or experimental auto layout frame by default, and MUST preserve image hashes, fills, strokes, effects, font loading or fallback, locked screenshot state, and deferred auto layout summary metadata where supported by the Figma Plugin API.

#### Scenario: Valid dashboard package creates real nodes

- **WHEN** main code imports a valid dashboard .figcapture package through the Figma API adapter
- **THEN** the Source Screenshot frame contains a locked screenshot image layer, Editable Accurate contains editable text nodes, image nodes, rectangle or frame nodes, and fallback image nodes from renderer output, no Auto Layout Experimental frame is created by default, and auto layout candidates remain summarized in the report as deferred metadata

#### Scenario: Font fallback remains editable

- **WHEN** a captured text layer references a font that cannot be loaded in Figma
- **THEN** the adapter uses the configured fallback font, creates an editable text node, and records the substituted font in the import report

### Requirement: Runtime build artifacts are browser-loadable
The system SHALL produce loadable runtime artifacts for the Chrome Extension and Figma Plugin during build. The build output MUST include manifest files and JavaScript files that can be loaded by Chrome Extension load unpacked and Figma Plugin development import, and runtime files MUST NOT contain unresolved .ts import specifiers.

#### Scenario: Build output contains loadable runtime manifests

- **WHEN** corepack pnpm build completes successfully
- **THEN** apps/chrome-extension/dist contains a Chrome Extension manifest and runtime JavaScript files, apps/figma-plugin/dist contains a Figma Plugin manifest and runtime JavaScript files, and the generated runtime files do not reference .ts import specifiers

### Requirement: Manual runtime demo is documented and repeatable
The system SHALL provide manual runtime test documentation that lets a reviewer build the workspace, load the Chrome Extension from dist output, capture a page, download a .figcapture package, load the Figma Plugin from dist output, import the package, and verify the resulting frames and report without modifying source code.

#### Scenario: Reviewer completes local manual demo

- **WHEN** a reviewer follows docs/manual-runtime-test.md from a clean checkout with dependencies installed
- **THEN** the reviewer can run the build command, load apps/chrome-extension/dist in Chrome, capture a deterministic local fixture or active product page, download one .figcapture file, load apps/figma-plugin/dist/manifest.json in Figma, import the package, and confirm two imported default frames plus a readable import report

#### Scenario: Documentation lists V1 limitations

- **WHEN** a reviewer reads docs/manual-runtime-test.md before manual testing
- **THEN** the document identifies V1 limits for visible viewport only, no backend, no full-page capture, no multi-viewport batch, no variables, no components, no variants, no interactive states, and diagnostics for blocked assets
